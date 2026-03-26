import { useState, useEffect, useRef } from "react";
import { useLanguage } from "@/contexts/LanguageContext";
import { useTenantConfig, useUpdateTenantConfig } from "@/hooks/useTenantConfig";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Loader2, Save, Upload, Palette, X } from "lucide-react";

export default function TenantBrandingSettings() {
  const { lang } = useLanguage();
  const bn = lang === "bn";
  const { user } = useAuth();
  const { config, isLoading } = useTenantConfig();
  const updateMut = useUpdateTenantConfig();

  const [form, setForm] = useState({
    display_name: "",
    display_name_bn: "",
    primary_color: "#004c4d",
    secondary_color: "#ffd900",
    accent_color: "#059669",
    footer_text: "",
    sms_sender_name: "",
  });
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (config) {
      setForm({
        display_name: config.display_name || "",
        display_name_bn: config.display_name_bn || "",
        primary_color: config.primary_color || "#004c4d",
        secondary_color: config.secondary_color || "#ffd900",
        accent_color: config.accent_color || "#059669",
        footer_text: config.footer_text || "",
        sms_sender_name: config.sms_sender_name || "",
      });
      setLogoPreview(config.logo_url || null);
    }
  }, [config]);

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user?.id) return;

    if (file.size > 2 * 1024 * 1024) {
      toast.error(bn ? "ফাইল ২MB এর বেশি হতে পারবে না" : "File must be under 2MB");
      return;
    }

    setUploading(true);
    try {
      const ext = file.name.split(".").pop()?.toLowerCase() || "png";
      const path = `logos/${user.id}/logo.${ext}`;

      const { error: uploadErr } = await supabase.storage
        .from("tenant-assets")
        .upload(path, file, { upsert: true });
      if (uploadErr) throw uploadErr;

      const { data: urlData } = supabase.storage
        .from("tenant-assets")
        .getPublicUrl(path);

      const logoUrl = `${urlData.publicUrl}?t=${Date.now()}`;
      setLogoPreview(logoUrl);

      // Save immediately
      await updateMut.mutateAsync({ logo_url: logoUrl });
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : "An unknown error occurred";
      toast.error(errMsg || "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const handleSave = () => {
    updateMut.mutate({
      display_name: form.display_name,
      display_name_bn: form.display_name_bn,
      primary_color: form.primary_color,
      secondary_color: form.secondary_color,
      accent_color: form.accent_color,
      footer_text: form.footer_text,
      sms_sender_name: form.sms_sender_name,
    });
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Logo Upload */}
      <div>
        <Label className="text-xs font-medium text-muted-foreground">
          {bn ? "সমিতির লোগো" : "Organization Logo"}
        </Label>
        <div className="flex items-center gap-4 mt-2">
          {logoPreview ? (
            <div className="relative">
              <img
                src={logoPreview}
                alt="Logo"
                className="h-12 max-w-[200px] object-contain rounded-lg border border-border p-1 bg-background"
              />
              <button
                onClick={() => { setLogoPreview(null); updateMut.mutate({ logo_url: "" }); }}
                className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center text-[10px]"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ) : (
            <div className="h-12 w-32 rounded-lg border-2 border-dashed border-border flex items-center justify-center">
              <span className="text-[10px] text-muted-foreground">{bn ? "লোগো নেই" : "No logo"}</span>
            </div>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="gap-1.5 text-xs"
          >
            {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
            {bn ? "আপলোড" : "Upload"}
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/svg+xml,image/jpeg,image/webp"
            onChange={handleLogoUpload}
            className="hidden"
          />
        </div>
        <p className="text-[10px] text-muted-foreground mt-1">PNG/SVG, max 200×50px, ≤2MB</p>
      </div>

      {/* Display Names */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <Label className="text-xs font-medium text-muted-foreground">
            {bn ? "সমিতির নাম (ইংরেজি)" : "Organization Name (English)"}
          </Label>
          <Input
            value={form.display_name}
            onChange={(e) => setForm({ ...form, display_name: e.target.value })}
            className="mt-1.5"
            placeholder="Ekta Finance"
          />
        </div>
        <div>
          <Label className="text-xs font-medium text-muted-foreground">
            {bn ? "সমিতির নাম (বাংলা)" : "Organization Name (Bangla)"}
          </Label>
          <Input
            value={form.display_name_bn}
            onChange={(e) => setForm({ ...form, display_name_bn: e.target.value })}
            className="mt-1.5"
            placeholder="একতা ফাইন্যান্স"
          />
        </div>
      </div>

      {/* Colors */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Palette className="w-4 h-4 text-primary" />
          <Label className="text-xs font-semibold">{bn ? "ব্র্যান্ড কালার" : "Brand Colors"}</Label>
        </div>
        <div className="grid grid-cols-3 gap-3">
          {[
            { key: "primary_color" as const, label: bn ? "প্রাথমিক" : "Primary" },
            { key: "secondary_color" as const, label: bn ? "সেকেন্ডারি" : "Secondary" },
            { key: "accent_color" as const, label: bn ? "অ্যাক্সেন্ট" : "Accent" },
          ].map((c) => (
            <div key={c.key} className="text-center">
              <label className="text-[10px] text-muted-foreground block mb-1">{c.label}</label>
              <div className="relative mx-auto">
                <input
                  type="color"
                  value={form[c.key]}
                  onChange={(e) => setForm({ ...form, [c.key]: e.target.value })}
                  className="w-10 h-10 rounded-lg border border-border cursor-pointer"
                />
              </div>
              <span className="text-[9px] font-mono text-muted-foreground mt-0.5 block">{form[c.key]}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Live Preview */}
      <div className="rounded-lg border border-border overflow-hidden">
        <div
          className="h-10 flex items-center px-4 gap-2"
          style={{ backgroundColor: form.primary_color }}
        >
          {logoPreview && (
            <img src={logoPreview} alt="" className="h-6 object-contain" />
          )}
          <span className="text-xs font-semibold text-white">
            {bn ? form.display_name_bn || form.display_name : form.display_name}
          </span>
        </div>
        <div className="p-3 bg-background flex gap-2">
          <div className="h-6 px-3 rounded text-[10px] font-semibold text-white flex items-center" style={{ backgroundColor: form.primary_color }}>
            {bn ? "প্রাথমিক" : "Primary"}
          </div>
          <div className="h-6 px-3 rounded text-[10px] font-bold flex items-center" style={{ backgroundColor: form.secondary_color, color: "#1a1a1a" }}>
            {bn ? "সেকেন্ডারি" : "Secondary"}
          </div>
          <div className="h-6 px-3 rounded text-[10px] font-semibold text-white flex items-center" style={{ backgroundColor: form.accent_color }}>
            {bn ? "অ্যাক্সেন্ট" : "Accent"}
          </div>
        </div>
      </div>

      {/* Footer & SMS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <Label className="text-xs font-medium text-muted-foreground">{bn ? "ফুটার টেক্সট" : "Footer Text"}</Label>
          <Input
            value={form.footer_text}
            onChange={(e) => setForm({ ...form, footer_text: e.target.value })}
            className="mt-1.5"
            placeholder="© 2026 Ekta Finance"
          />
        </div>
        <div>
          <Label className="text-xs font-medium text-muted-foreground">{bn ? "SMS প্রেরক নাম" : "SMS Sender Name"}</Label>
          <Input
            value={form.sms_sender_name}
            onChange={(e) => setForm({ ...form, sms_sender_name: e.target.value })}
            className="mt-1.5"
            placeholder="EktaFin"
            maxLength={11}
          />
        </div>
      </div>

      <Button onClick={handleSave} disabled={updateMut.isPending} size="sm" className="w-full gap-1.5 text-xs">
        {updateMut.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
        {bn ? "ব্র্যান্ডিং সংরক্ষণ করুন" : "Save Branding"}
      </Button>
    </div>
  );
}
