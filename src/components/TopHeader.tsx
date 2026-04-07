import { Globe, Wifi, WifiOff, Menu, Sun, Moon, User, KeyRound, LogOut, Camera } from "lucide-react";
import NotificationBell from "@/components/notifications/NotificationBell";
import ProfileAvatarUpload from "@/components/ProfileAvatarUpload";
import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/contexts/LanguageContext";
import { useSidebarState } from "@/contexts/SidebarContext";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const TopHeader = () => {
  const { lang, setLang, t } = useLanguage();
  const { toggle } = useSidebarState();
  const { user, role, signOut } = useAuth();
  const navigate = useNavigate();
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isDark, setIsDark] = useState(() => document.documentElement.classList.contains("dark"));
  const [scrolled, setScrolled] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

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
  const displayName = lang === "bn" ? (profile?.name_bn || profile?.name_en) : (profile?.name_en || profile?.name_bn);
  const initials = (profile?.name_en?.charAt(0) || user?.email?.charAt(0) || "U").toUpperCase();
  const roleLabel = role ? (role === "admin" ? (lang === "bn" ? "অ্যাডমিন" : "Admin") : role === "field_officer" ? (lang === "bn" ? "মাঠকর্মী" : "Field Officer") : role === "owner" ? (lang === "bn" ? "মালিক" : "Owner") : role === "investor" ? (lang === "bn" ? "বিনিয়োগকারী" : "Investor") : role === "treasurer" ? (lang === "bn" ? "কোষাধ্যক্ষ" : "Treasurer") : role) : "";

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
    const goOnline = () => setIsOnline(true);
    const goOffline = () => setIsOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 10);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const handleLogout = async () => {
    await signOut();
    navigate("/auth");
  };

  return (
    <header className={`fixed top-0 left-0 right-0 md:left-[260px] h-16 bg-primary z-30 flex items-center justify-between px-4 border-b border-primary/80 transition-shadow duration-300 ${scrolled ? "shadow-lg shadow-primary/25" : "shadow-md"}`}>
      {/* Left: Three-dot menu + Tagline */}
      <div className="flex items-center gap-3 min-w-0">
        <button
          onClick={(e) => { e.stopPropagation(); toggle(); }}
          className="p-2 rounded-xl text-primary-foreground/90 hover:bg-primary-foreground/15 hover:text-primary-foreground active:scale-95 transition-all duration-200"
          aria-label="Toggle menu"
        >
          <Menu className="w-5 h-5" />
        </button>
        <p className="text-xs font-medium text-primary-foreground/80 truncate hidden sm:block">
          {t("header.tagline")}
        </p>
      </div>

      {/* Right: Controls */}
      <div className="flex items-center gap-2 flex-shrink-0">
        {/* Online/Offline */}
        <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full transition-colors duration-300 ${isOnline ? "bg-green-500/15" : "bg-destructive/15"}`}>
          {isOnline ? (
            <Wifi className="w-3.5 h-3.5 text-green-400 animate-pulse" />
          ) : (
            <WifiOff className="w-3.5 h-3.5 text-destructive animate-pulse" />
          )}
          <span className={`text-[10px] font-semibold hidden sm:inline ${isOnline ? "text-green-300" : "text-destructive"}`}>
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
        <NotificationBell />

        {/* Profile Dropdown */}
        <div className="pl-2 border-l border-primary-foreground/20">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center gap-2 rounded-lg px-1.5 py-1 hover:bg-primary-foreground/10 transition-colors focus:outline-none">
                <Avatar className="w-9 h-9 ring-2 ring-primary-foreground/20">
                  {avatarUrl ? <AvatarImage src={avatarUrl} alt="Profile" className="object-cover" /> : null}
                  <AvatarFallback className="bg-accent text-accent-foreground text-xs font-bold">
                    {initials}
                  </AvatarFallback>
                </Avatar>
                <div className="hidden md:block text-left">
                  <p className="text-xs font-medium text-primary-foreground leading-tight truncate max-w-[100px]">
                    {displayName || user?.email?.split("@")[0] || t("header.admin")}
                  </p>
                  {roleLabel && (
                    <p className="text-[10px] text-primary-foreground/60 leading-tight">{roleLabel}</p>
                  )}
                </div>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56 z-50 bg-popover">
              <DropdownMenuLabel className="font-normal">
                <div className="flex items-center gap-3 py-1">
                  <Avatar className="w-10 h-10">
                    {avatarUrl ? <AvatarImage src={avatarUrl} alt="Profile" className="object-cover" /> : null}
                    <AvatarFallback className="bg-accent text-accent-foreground text-sm font-bold">
                      {initials}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate">
                      {displayName || user?.email?.split("@")[0]}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
                    {roleLabel && (
                      <span className="inline-block mt-0.5 text-[10px] font-medium bg-primary/10 text-primary px-1.5 py-0.5 rounded-full">
                        {roleLabel}
                      </span>
                    )}
                  </div>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => fileRef.current?.click()}
                className="cursor-pointer gap-2"
              >
                <Camera className="w-4 h-4" />
                {lang === "bn" ? "ছবি পরিবর্তন করুন" : "Change Photo"}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => navigate("/settings")}
                className="cursor-pointer gap-2"
              >
                <User className="w-4 h-4" />
                {lang === "bn" ? "প্রোফাইল সেটিংস" : "Profile Settings"}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => navigate("/reset-password")}
                className="cursor-pointer gap-2"
              >
                <KeyRound className="w-4 h-4" />
                {lang === "bn" ? "পাসওয়ার্ড পরিবর্তন" : "Change Password"}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={handleLogout}
                className="cursor-pointer gap-2 text-destructive focus:text-destructive focus:bg-destructive/10"
              >
                <LogOut className="w-4 h-4" />
                {lang === "bn" ? "লগআউট" : "Logout"}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Hidden file input + upload dialog from ProfileAvatarUpload */}
          <ProfileAvatarUpload ref={fileRef} />
        </div>
      </div>
    </header>
  );
};

export default TopHeader;
