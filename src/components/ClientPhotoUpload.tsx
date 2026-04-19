import { useRef, useState, useCallback, useEffect } from "react";
import { Camera, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { useClientAvatarUrl } from "@/hooks/useClientAvatarUrl";
import { useTenantId } from "@/hooks/useTenantId";

/* ── Dev-only guardrail ───────────────────────────────────────────────── */
if (import.meta.env.DEV) {
  // eslint-disable-next-line no-console
  console.warn(
    "[AvatarSystem] Bucket 'client-photos' must remain PRIVATE. Uses signed URLs. Do not switch to getPublicUrl()."
  );
}

/* ── Upload constraints ───────────────────────────────────────────────── */
const MAX_INPUT_BYTES = 10 * 1024 * 1024; // 10MB
const MAX_DIMENSION = 2048;
const WEBP_QUALITY = 0.85;
const ACCEPTED_MIME = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];

async function convertToWebP(file: File): Promise<Blob | null> {
  return new Promise((resolve) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      let { naturalWidth: w, naturalHeight: h } = img;

      // Maintain aspect ratio; never upscale small images
      if (w > MAX_DIMENSION || h > MAX_DIMENSION) {
        const ratio = Math.min(MAX_DIMENSION / w, MAX_DIMENSION / h);
        w = Math.round(w * ratio);
        h = Math.round(h * ratio);
      }

      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) return resolve(null);
      ctx.drawImage(img, 0, 0, w, h);
      canvas.toBlob((b) => resolve(b), "image/webp", WEBP_QUALITY);
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(null);
    };
    img.src = objectUrl;
  });
}

function getInitial(name?: string | null): string {
  if (!name) return "👤";
  const trimmed = name.trim();
  if (!trimmed) return "👤";
  // Bengali, English, emoji-safe: take first grapheme
  return Array.from(trimmed)[0]?.toUpperCase() ?? "👤";
}

interface Props {
  clientId: string;
  currentPhotoUrl?: string | null;
  clientName?: string | null;
  canEdit?: boolean;
}

export default function ClientPhotoUpload({
  clientId,
  currentPhotoUrl,
  clientName,
  canEdit = false,
}: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { tenantId } = useTenantId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  // Local override allows instant re-render with the new path after upload,
  // without waiting for the parent query to refetch.
  const [pathOverride, setPathOverride] = useState<string | null>(null);
  const effectivePath = pathOverride ?? currentPhotoUrl ?? null;
  const signedUrl = useClientAvatarUrl(effectivePath);

  // When the parent prop catches up (refetch completes), clear local override
  useEffect(() => {
    if (pathOverride && currentPhotoUrl === pathOverride) {
      setPathOverride(null);
    }
  }, [currentPhotoUrl, pathOverride]);

  const handleFile = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (e.target) e.target.value = "";
      if (!file) return;

      if (!ACCEPTED_MIME.includes(file.type)) {
        toast({
          title: "অসমর্থিত ফরম্যাট",
          description: "শুধু JPG, PNG বা WebP ছবি আপলোড করুন",
          variant: "destructive",
        });
        return;
      }
      if (file.size > MAX_INPUT_BYTES) {
        toast({
          title: "ছবি অনেক বড়",
          description: "সর্বোচ্চ ১০MB এর ফাইল আপলোড করুন",
          variant: "destructive",
        });
        return;
      }

      setUploading(true);
      try {
        const blob = await convertToWebP(file);
        if (!blob) {
          toast({
            title: "কম্প্রেশন ব্যর্থ",
            description: "ছোট ছবি ব্যবহার করে আবার চেষ্টা করুন",
            variant: "destructive",
          });
          return;
        }

        // Path-only storage; tenant prefix when known, flat fallback otherwise
        const path = tenantId
          ? `${tenantId}/${clientId}.webp`
          : `${clientId}.webp`;

        const { error: upErr } = await supabase.storage
          .from("client-photos")
          .upload(path, blob, { upsert: true, contentType: "image/webp" });
        if (upErr) throw upErr;

        // Store ONLY the path (no full URL, no cache buster)
        const { error: dbErr } = await supabase
          .from("clients")
          .update({ photo_url: path } as never)
          .eq("id", clientId);
        if (dbErr) {
          // Cleanup safety: remove orphaned storage object if DB update fails
          try {
            const { error: delErr } = await supabase.storage
              .from("client-photos")
              .remove([path]);
            if (delErr) {
              console.warn("[orphan-cleanup-failed]", {
                path,
                error: delErr.message,
              });
              // Best-effort audit trail (non-blocking)
              await supabase.from("audit_logs").insert({
                action_type: "orphan_cleanup_failed",
                entity_type: "storage",
                details: { path, error: delErr.message },
              } as never).then(({ error }) => {
                if (error) console.warn("[orphan-cleanup-audit-failed]", error.message);
              });
            }
          } catch (e) {
            console.warn("[orphan-cleanup-exception]", e);
          }
          throw dbErr;
        }

        setPathOverride(path);
        await queryClient.invalidateQueries({ queryKey: ["clients", clientId] });
        toast({ title: "✅ ছবি আপলোড সফল!" });
      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : "An unknown error occurred";
        toast({ title: "আপলোড ব্যর্থ", description: errMsg, variant: "destructive" });
      } finally {
        setUploading(false);
      }
    },
    [clientId, queryClient, toast, tenantId]
  );

  const initial = getInitial(clientName);

  return (
    <div className="relative group w-full h-full">
      <Avatar className="w-full h-full ring-4 ring-background shadow-xl">
        <AvatarImage
          src={signedUrl ?? undefined}
          alt={clientName ?? "Client photo"}
          className="object-cover"
        />
        <AvatarFallback className="bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 text-primary-foreground text-2xl font-semibold">
          {initial}
        </AvatarFallback>
      </Avatar>

      {uploading && (
        <div className="absolute inset-0 bg-black/50 flex items-center justify-center backdrop-blur-sm rounded-full">
          <Loader2 className="w-5 h-5 text-white animate-spin" />
        </div>
      )}

      {canEdit && !uploading && (
        <>
          <button
            onClick={() => inputRef.current?.click()}
            className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-all duration-200 flex items-center justify-center opacity-0 group-hover:opacity-100 cursor-pointer rounded-full"
            aria-label="ছবি পরিবর্তন করুন"
            type="button"
          >
            <Camera className="w-5 h-5 text-white drop-shadow-lg" />
          </button>
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPTED_MIME.join(",")}
            onChange={handleFile}
            className="hidden"
            aria-hidden="true"
          />
        </>
      )}
    </div>
  );
}
