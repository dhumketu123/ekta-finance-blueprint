import { useState } from "react";

const SidebarBrand = () => {
  const [logo, setLogo] = useState<string | null>(null);

  const handleUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setLogo(reader.result as string);
    reader.readAsDataURL(file);
  };

  return (
    <div
      className="flex items-center gap-2 px-3 py-4"
      style={{ borderBottom: "1px solid hsl(var(--sidebar-border))" }}
    >
      <input
        type="file"
        accept="image/*"
        onChange={handleUpload}
        className="hidden"
        id="logo-upload"
      />
      <label htmlFor="logo-upload" className="cursor-pointer shrink-0">
        {logo ? (
          <img src={logo} alt="Brand Logo" className="h-8 w-8 object-contain rounded" />
        ) : (
          <div className="h-8 w-8 rounded" style={{ backgroundColor: "hsl(var(--sidebar-accent))" }} />
        )}
      </label>
      <span
        className="font-bold text-lg truncate"
        style={{ color: "hsl(var(--sidebar-primary-foreground))", fontFamily: "var(--font-bangla)" }}
      >
        একতা ফাইন্যান্স
      </span>
    </div>
  );
};

export default SidebarBrand;
