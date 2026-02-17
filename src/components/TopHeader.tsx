import { Bell, Globe, Wifi, WifiOff, ChevronDown, User, MoreVertical, Sun, Moon } from "lucide-react";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/contexts/LanguageContext";
import { useSidebarState } from "@/contexts/SidebarContext";

const TopHeader = () => {
  const { lang, setLang, t } = useLanguage();
  const { toggle } = useSidebarState();
  const [isOnline] = useState(true);
  const [isDark, setIsDark] = useState(() => document.documentElement.classList.contains("dark"));
  const [scrolled, setScrolled] = useState(false);

  const toggleTheme = () => {
    const next = !isDark;
    setIsDark(next);
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem("theme", next ? "dark" : "light");
  };

  useEffect(() => {
    const saved = localStorage.getItem("theme");
    if (saved === "dark") {
      setIsDark(true);
      document.documentElement.classList.add("dark");
    }
  }, []);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 10);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header className={`fixed top-0 left-0 right-0 h-16 bg-primary z-30 flex items-center justify-between px-4 border-b border-primary/80 transition-shadow duration-300 ${scrolled ? "shadow-lg shadow-primary/25" : "shadow-md"}`}>
      {/* Left: Three-dot menu + Tagline */}
      <div className="flex items-center gap-3 min-w-0">
        <button
          onClick={(e) => { e.stopPropagation(); toggle(); }}
          className="p-2 rounded-lg text-primary-foreground/80 hover:bg-primary-foreground/10 hover:text-primary-foreground transition-colors"
          aria-label="Toggle menu"
        >
          <MoreVertical className="w-5 h-5" />
        </button>
        <p className="text-xs font-medium text-primary-foreground/80 truncate hidden sm:block">
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

        {/* Theme Toggle */}
        <Button
          variant="ghost"
          size="icon"
          onClick={toggleTheme}
          className="h-9 w-9 text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground"
          aria-label="Toggle theme"
        >
          {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </Button>

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
