import { useState, useRef, useCallback } from "react";
import { Camera, Loader2, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useQueryClient } from "@tanstack/react-query";

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp"];

const ProfileAvatarUpload = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewFile, setPreviewFile] = useState<File | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const { data: profile } = useQuery({
    queryKey: ["profile-avatar", user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data } = await supabase
        .from("profiles")
        .select("avatar_url, name_en, name_bn")
        .eq("id", user.id)
        .maybeSingle();
      return data;
    },
    enabled: !!user?.id,
  });

  const avatarUrl = profile?.avatar_url;
  const initials = (profile?.name_en?.charAt(0) || user?.email?.charAt(0) || "U").toUpperCase();

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!ACCEPTED_TYPES.includes(file.type)) {
      toast({ title: "Invalid format", description: "Please use JPG, PNG, or WebP", variant: "destructive" });
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      toast({ title: "File too large", description: "Maximum 5MB allowed", variant: "destructive" });
      return;
    }

    setPreviewFile(file);
    setPreviewUrl(URL.createObjectURL(file));
    setDialogOpen(true);
    // Reset input
    if (fileRef.current) fileRef.current.value = "";
  }, [toast]);

  const handleUpload = async () => {
    if (!previewFile || !user?.id) return;
    setUploading(true);

    try {
      const ext = previewFile.name.split(".").pop() || "jpg";
      const filePath = `${user.id}/avatar.${ext}`;

      // Upload to storage (upsert)
      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(filePath, previewFile, { upsert: true, contentType: previewFile.type });

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: urlData } = supabase.storage.from("avatars").getPublicUrl(filePath);
      const publicUrl = `${urlData.publicUrl}?t=${Date.now()}`;

      // Update profile
      const { error: updateError } = await supabase
        .from("profiles")
        .update({ avatar_url: publicUrl })
        .eq("id", user.id);

      if (updateError) throw updateError;

      await queryClient.invalidateQueries({ queryKey: ["profile-avatar"] });
      toast({ title: "✅ Profile photo updated!" });
      setDialogOpen(false);
    } catch (err: any) {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
    } finally {
      setUploading(false);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
      setPreviewFile(null);
    }
  };

  const handleCancel = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setPreviewFile(null);
    setDialogOpen(false);
  };

  return (
    <>
      <div
        className="relative group cursor-pointer"
        onClick={() => fileRef.current?.click()}
        role="button"
        tabIndex={0}
        aria-label="Upload profile photo"
      >
        <Avatar className="w-9 h-9 ring-2 ring-primary-foreground/20 group-hover:ring-accent transition-all duration-200">
          {avatarUrl ? (
            <AvatarImage src={avatarUrl} alt="Profile" className="object-cover" />
          ) : null}
          <AvatarFallback className="bg-accent text-accent-foreground text-xs font-bold">
            {initials}
          </AvatarFallback>
        </Avatar>
        <div className="absolute inset-0 rounded-full bg-black/0 group-hover:bg-black/30 flex items-center justify-center transition-all duration-200">
          <Camera className="w-3.5 h-3.5 text-white opacity-0 group-hover:opacity-100 transition-opacity duration-200" />
        </div>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept={ACCEPTED_TYPES.join(",")}
        onChange={handleFileSelect}
        className="hidden"
        aria-hidden="true"
      />

      <Dialog open={dialogOpen} onOpenChange={(o) => !o && handleCancel()}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-center">Update Profile Photo</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col items-center gap-4 py-4">
            {previewUrl && (
              <div className="relative">
                <img
                  src={previewUrl}
                  alt="Preview"
                  className="w-32 h-32 rounded-full object-cover ring-4 ring-primary/20 shadow-lg"
                />
                <button
                  onClick={handleCancel}
                  className="absolute -top-1 -right-1 w-6 h-6 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center shadow-md hover:scale-110 transition-transform"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
            <div className="flex gap-2 w-full">
              <Button variant="outline" onClick={handleCancel} className="flex-1" disabled={uploading}>
                Cancel
              </Button>
              <Button onClick={handleUpload} className="flex-1" disabled={uploading}>
                {uploading ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
                {uploading ? "Uploading..." : "Save"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default ProfileAvatarUpload;
