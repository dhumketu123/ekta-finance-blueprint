import { useState, useEffect } from "react";

const LOGO_STORAGE_KEY = "ekta-sidebar-logo";

const SidebarBrand = () => {
  const [logo, setLogo] = useState<string | null>(() => {
    try {
      return localStorage.getItem(LOGO_STORAGE_KEY);
    } catch {
      return null;
    }
  });

  useEffect(() => {
    try {
      if (logo) {
        localStorage.setItem(LOGO_STORAGE_KEY, logo);
      } else {
        localStorage.removeItem(LOGO_STORAGE_KEY);
      }
    } catch {}
  }, [logo]);

  const handleUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setLogo(reader.result as string);
    reader.readAsDataURL(file);
  };

  return (
    <div
      className="flex items-center gap-3 px-4 py-4"
      style={{ borderBottom: "1px solid hsl(var(--sidebar-border))" }}
    >
      <input
        type="file"
        accept="image/*"
        onChange={handleUpload}
        className="hidden"
        id="logo-upload"
      />
      <label htmlFor="logo-upload" className="cursor-pointer shrink-0 flex items-center justify-center">
        {logo ? (
          <img
            src={logo}
            alt="Brand Logo"
            className="rounded object-contain"
            style={{ maxWidth: "200px", maxHeight: "50px", height: "auto", width: "auto" }}
          />
        ) : (
          <div
            className="h-10 w-10 rounded-lg flex items-center justify-center"
            style={{ backgroundColor: "hsl(var(--sidebar-accent))" }}
          >
            <span
              className="text-lg font-bold"
              style={{ color: "hsl(var(--sidebar-primary-foreground))" }}
            >
              E
            </span>
          </div>
        )}
      </label>
      <span
        className="font-semibold truncate"
        style={{
          color: "hsl(var(--sidebar-primary-foreground))",
          fontFamily: "'Inter', var(--font-bangla), sans-serif",
          fontSize: "1.25rem",
          letterSpacing: "0.5px",
        }}
      >
        একতা ফাইন্যান্স
      </span>
    </div>
  );
};

export default SidebarBrand;
