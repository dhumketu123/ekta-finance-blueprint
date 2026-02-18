import { useRef, useState, useCallback } from "react";
import { Camera, Loader2, User } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";

const MAX_BEFORE_COMPRESS = 2 * 1024 * 1024; // 2MB hard reject
const TARGET_SIZE = 380 * 1024;               // 380KB ideal target
const HARD_CAP = 450 * 1024;                  // 450KB hard cap
const ACCEPTED = ["image/jpeg", "image/png"];

async function compressToWebP(file: File): Promise<Blob | null> {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const MAX_W = 1000;
      let w = img.naturalWidth;
      let h = img.naturalHeight;
      if (w > MAX_W) { h = Math.round((h * MAX_W) / w); w = MAX_W; }

      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      canvas.getContext("2d")!.drawImage(img, 0, 0, w, h);

      const tryQuality = (q: number) =>
        new Promise<Blob>((res) => canvas.toBlob((b) => res(b!), "image/webp", q));

      (async () => {
        // Binary search between 0.5–0.95 for ideal size
        let lo = 0.5, hi = 0.95, best: Blob | null = null;
        for (let i = 0; i < 7; i++) {
          const mid = (lo + hi) / 2;
          const blob = await tryQuality(mid);
          best = blob;
          if (blob.size <= TARGET_SIZE) lo = mid;
          else hi = mid;
        }
        // Final check: if still above hard cap, do one more aggressive pass
        if (best && best.size > HARD_CAP) {
          const fallback = await tryQuality(0.4);
          best = fallback.size <= HARD_CAP ? fallback : null;
        }
        resolve(best);
      })();
    };
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

interface Props {
  clientId: string;
  currentPhotoUrl?: string | null;
  canEdit?: boolean;
}

export default function ClientPhotoUpload({ clientId, currentPhotoUrl, canEdit = false }: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [localUrl, setLocalUrl] = useState<string | null>(null);

  const handleFile = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (e.target) e.target.value = "";

    if (!ACCEPTED.includes(file.type)) {
      toast({ title: "অসমর্থিত ফরম্যাট", description: "শুধুমাত্র JPG বা PNG ছবি আপলোড করুন", variant: "destructive" });
      return;
    }
    if (file.size > MAX_BEFORE_COMPRESS) {
      toast({ title: "ছবি অনেক বড়", description: "সর্বোচ্চ ২MB এর ফাইল আপলোড করুন", variant: "destructive" });
      return;
    }

    setUploading(true);
    try {
      const blob = await compressToWebP(file);
      if (!blob) {
        toast({ title: "কম্প্রেশন ব্যর্থ", description: "ছোট ছবি ব্যবহার করে আবার চেষ্টা করুন", variant: "destructive" });
        return;
      }

      const path = `${clientId}.webp`;
      const { error: upErr } = await supabase.storage
        .from("client-photos")
        .upload(path, blob, { upsert: true, contentType: "image/webp" });
      if (upErr) throw upErr;

      const { data: urlData } = supabase.storage.from("client-photos").getPublicUrl(path);
      const publicUrl = `${urlData.publicUrl}?t=${Date.now()}`;

      const { error: dbErr } = await supabase
        .from("clients")
        .update({ photo_url: publicUrl } as any)
        .eq("id", clientId);
      if (dbErr) throw dbErr;

      setLocalUrl(publicUrl);
      await queryClient.invalidateQueries({ queryKey: ["clients", clientId] });
      toast({ title: "✅ ছবি আপলোড সফল!" });
    } catch (err: any) {
      toast({ title: "আপলোড ব্যর্থ", description: err.message, variant: "destructive" });
    } finally {
      setUploading(false);
    }
  }, [clientId, queryClient, toast]);

  const photoUrl = localUrl ?? currentPhotoUrl;

  return (
    <div className="relative group">
      {photoUrl ? (
        <img
          src={photoUrl}
          alt="Client photo"
          loading="lazy"
          className="w-full h-full object-cover rounded-full"
        />
      ) : (
        <div className="w-full h-full rounded-full bg-primary/10 flex items-center justify-center">
          <User className="w-1/2 h-1/2 text-primary/60" />
        </div>
      )}

      {uploading && (
        <div className="absolute inset-0 rounded-full bg-black/50 flex items-center justify-center">
          <Loader2 className="w-5 h-5 text-white animate-spin" />
        </div>
      )}

      {canEdit && !uploading && (
        <>
          <button
            onClick={() => inputRef.current?.click()}
            className="absolute inset-0 rounded-full bg-black/0 group-hover:bg-black/40 transition-all duration-200 flex items-center justify-center opacity-0 group-hover:opacity-100"
            aria-label="ছবি পরিবর্তন করুন"
          >
            <Camera className="w-5 h-5 text-white drop-shadow" />
          </button>
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPTED.join(",")}
            onChange={handleFile}
            className="hidden"
            aria-hidden
          />
        </>
      )}
    </div>
  );
}
