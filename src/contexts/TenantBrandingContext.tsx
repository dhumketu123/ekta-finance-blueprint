import React, { createContext, useContext, useEffect } from "react";
import { useTenantConfig, type TenantConfig } from "@/hooks/useTenantConfig";

interface TenantBrandingContextType {
  config: TenantConfig;
  isLoading: boolean;
}

const TenantBrandingContext = createContext<TenantBrandingContextType | null>(null);

/** Convert hex to HSL string (H S% L%) for CSS variables */
function hexToHsl(hex: string): string | null {
  try {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    if (!result) return null;
    let r = parseInt(result[1], 16) / 255;
    let g = parseInt(result[2], 16) / 255;
    let b = parseInt(result[3], 16) / 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h = 0, s = 0;
    const l = (max + min) / 2;
    if (max !== min) {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch (max) {
        case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
        case g: h = ((b - r) / d + 2) / 6; break;
        case b: h = ((r - g) / d + 4) / 6; break;
      }
    }
    return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
  } catch {
    return null;
  }
}

export const TenantBrandingProvider = ({ children }: { children: React.ReactNode }) => {
  const { config, isLoading } = useTenantConfig();

  // Apply dynamic CSS variables when config changes
  useEffect(() => {
    if (!config || isLoading) return;

    const root = document.documentElement;

    // Only override if tenant has custom colors (not defaults)
    if (config.primary_color && config.primary_color !== "#004c4d") {
      const hsl = hexToHsl(config.primary_color);
      if (hsl) root.style.setProperty("--primary", hsl);
    }

    if (config.secondary_color && config.secondary_color !== "#ffd900") {
      const hsl = hexToHsl(config.secondary_color);
      if (hsl) root.style.setProperty("--accent", hsl);
    }

    // Cleanup on unmount — restore defaults
    return () => {
      root.style.removeProperty("--primary");
      root.style.removeProperty("--accent");
    };
  }, [config, isLoading]);

  return (
    <TenantBrandingContext.Provider value={{ config, isLoading }}>
      {children}
    </TenantBrandingContext.Provider>
  );
};

export const useTenantBranding = () => {
  const ctx = useContext(TenantBrandingContext);
  if (!ctx) throw new Error("useTenantBranding must be used within TenantBrandingProvider");
  return ctx;
};
