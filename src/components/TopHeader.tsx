import { Bell, Globe, Wifi, WifiOff, ChevronDown, User } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/contexts/LanguageContext";

const TopHeader = () => {
  const { lang, setLang, t } = useLanguage();
  const [isOnline] = useState(true);

  return (
    <header className="fixed top-0 left-64 right-0 h-16 bg-primary z-40 flex items-center justify-between px-6 shadow-md border-b border-primary/80">
      {/* Left: Tagline - hidden on small screens to prevent overflow */}
      <div className="flex items-center gap-3 min-w-0">
        <p className="text-xs font-medium text-primary-foreground/80 truncate">
          {t("header.tagline")}
        </p>
      </div>

      {/* Right: Controls */}
      <div className="flex items-center gap-2 flex-shrink-0">
        {/* Online/Offline */}
        <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-primary-foreground/10">
          {isOnline ? (
            <Wifi className="w-3.5 h-3.5 text-accent" />
          ) : (
            <WifiOff className="w-3.5 h-3.5 text-destructive" />
          )}
          <span className="text-[10px] font-medium text-primary-foreground hidden sm:inline">
            {isOnline ? t("header.online") : t("header.offline")}
          </span>
        </div>

        {/* Language Toggle */}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setLang(lang === "bn" ? "en" : "bn")}
          className="h-8 gap-1 text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground px-2"
        >
          <Globe className="w-3.5 h-3.5" />
          <span className="text-xs font-medium">{lang === "bn" ? "EN" : "বাংলা"}</span>
        </Button>

        {/* Notification Bell */}
        <Button
          variant="ghost"
          size="icon"
          className="relative h-9 w-9 text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground"
        >
          <Bell className="w-4.5 h-4.5" />
          <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-accent text-accent-foreground text-[9px] font-bold flex items-center justify-center">
            3
          </span>
        </Button>

        {/* Profile */}
        <div className="flex items-center gap-2 pl-2 border-l border-primary-foreground/20 cursor-pointer hover:opacity-80 transition-opacity">
          <div className="w-8 h-8 rounded-full bg-accent flex items-center justify-center">
            <User className="w-4 h-4 text-accent-foreground" />
          </div>
          <div className="hidden md:block">
            <p className="text-xs font-medium text-primary-foreground leading-tight">{t("header.admin")}</p>
          </div>
          <ChevronDown className="w-3.5 h-3.5 text-primary-foreground/60" />
        </div>
      </div>
    </header>
  );
};

export default TopHeader;
