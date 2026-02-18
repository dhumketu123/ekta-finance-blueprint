import { useRef, useState, useCallback } from "react";
import { Camera, Loader2, User } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";

const MAX_BEFORE_COMPRESS = 1 * 1024 * 1024; // 1MB hard reject
const MAX_AFTER = 300 * 1024;                  // 300KB target
const ACCEPTED = ["image/jpeg", "image/png", "image/webp", "image/gif"];

async function compressToWebP(file: File): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const MAX_W = 800;
      let w = img.naturalWidth;
      let h = img.naturalHeight;
      if (w > MAX_W) { h = Math.round((h * MAX_W) / w); w = MAX_W; }

      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      canvas.getContext("2d")!.drawImage(img, 0, 0, w, h);

      // Binary search quality
      let lo = 0.4, hi = 0.92, best: Blob | null = null;
      const tryQuality = (q: number) =>
        new Promise<Blob>((res) => canvas.toBlob((b) => res(b!), "image/webp", q));

      (async () => {
        for (let i = 0; i < 6; i++) {
          const mid = (lo + hi) / 2;
          const blob = await tryQuality(mid);
          best = blob;
          if (blob.size <= MAX_AFTER) lo = mid;
          else hi = mid;
        }
        resolve(best!);
      })();
    };
    img.onerror = reject;
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
      toast({ title: "ফরম্যাট সঠিক নয়", description: "JPG, PNG বা WebP ব্যবহার করুন", variant: "destructive" });
      return;
    }
    if (file.size > MAX_BEFORE_COMPRESS) {
      toast({ title: "ছবি অনেক বড়", description: "সর্বোচ্চ ১MB এর ফাইল আপলোড করুন", variant: "destructive" });
      return;
    }

    setUploading(true);
    try {
      const blob = await compressToWebP(file);
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
