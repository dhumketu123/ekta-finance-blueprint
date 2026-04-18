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
  const roleLabel = role
    ? role === "admin" ? (lang === "bn" ? "অ্যাডমিন" : "Admin")
    : role === "field_officer" ? (lang === "bn" ? "মাঠকর্মী" : "Field Officer")
    : role === "owner" ? (lang === "bn" ? "মালিক" : "Owner")
    : role === "investor" ? (lang === "bn" ? "বিনিয়োগকারী" : "Investor")
    : role === "treasurer" ? (lang === "bn" ? "কোষাধ্যক্ষ" : "Treasurer")
    : role === "manager" ? (lang === "bn" ? "ম্যানেজার" : "Manager")
    : role === "alumni" ? (lang === "bn" ? "প্রাক্তন" : "Alumni")
    : role
    : "";

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
    <header
      className="fixed top-0 left-0 right-0 md:left-[260px] h-14 bg-primary/95 backdrop-blur-xl z-50 border-b border-primary-foreground/10 shadow-sm"
      style={{
        paddingTop: 'env(safe-area-inset-top)',
        boxSizing: 'border-box',
        overflow: 'visible',
      }}
    >
      {/* Inner row — strict no-wrap, clips text only */}
      <div className="flex items-center justify-between w-full h-full px-3 gap-2 whitespace-nowrap overflow-hidden">
        {/* LEFT: Menu + Brand + Online */}
        <div className="flex items-center gap-2 min-w-0">
          <button
            onClick={(e) => { e.stopPropagation(); toggle(); }}
            className="w-10 h-10 min-w-[40px] min-h-[40px] flex items-center justify-center rounded-[10px] text-primary-foreground/90 hover:bg-primary-foreground/10 active:scale-95 transition-all duration-150 shrink-0"
            aria-label="Toggle menu"
          >
            <Menu className="w-5 h-5" />
          </button>
          <div className="hidden sm:flex items-center gap-1.5 text-primary-foreground font-semibold text-sm truncate min-w-0">
            <span>🏦</span>
            <span className="truncate">{lang === "bn" ? "একতা ফাইন্যান্স" : "Ekta Finance"}</span>
          </div>
          <div className={`flex items-center gap-1 px-1.5 py-0.5 rounded-full shrink-0 ${isOnline ? "bg-green-500/15" : "bg-destructive/15"}`}>
            {isOnline ? (
              <Wifi className="w-3 h-3 text-green-400" />
            ) : (
              <WifiOff className="w-3 h-3 text-destructive" />
            )}
          </div>
        </div>

        {/* RIGHT: Controls */}
        <div className="flex items-center gap-1.5 shrink-0">
          {/* Language */}
          <button
            onClick={() => setLang(lang === "bn" ? "en" : "bn")}
            className="w-10 h-10 min-w-[40px] min-h-[40px] flex items-center justify-center rounded-[10px] text-primary-foreground hover:bg-primary-foreground/10 active:scale-95 transition-all duration-150"
            aria-label="Switch language"
          >
            <Globe className="w-4 h-4" />
          </button>

          {/* Theme */}
          <button
            onClick={toggleTheme}
            className="w-10 h-10 min-w-[40px] min-h-[40px] flex items-center justify-center rounded-[10px] text-primary-foreground hover:bg-primary-foreground/10 active:scale-95 transition-all duration-150"
            aria-label="Toggle theme"
          >
            {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>

          {/* Notification — overflow visible for badge */}
          <div className="relative" style={{ overflow: 'visible' }}>
            <NotificationBell />
          </div>

          {/* Profile Avatar Dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="ml-0.5 rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-foreground/30 shrink-0 active:scale-95 transition-transform duration-150">
                <Avatar className="w-8 h-8 ring-2 ring-primary-foreground/20">
                  {avatarUrl ? <AvatarImage src={avatarUrl} alt="Profile" className="object-cover" /> : null}
                  <AvatarFallback className="bg-accent text-accent-foreground text-xs font-bold">
                    {initials}
                  </AvatarFallback>
                </Avatar>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56 z-[9999] bg-popover">
              <DropdownMenuLabel className="font-normal">
                <div className="flex items-center gap-3 py-1">
                  <Avatar className="w-10 h-10 shrink-0">
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
              <DropdownMenuItem onClick={() => fileRef.current?.click()} className="cursor-pointer gap-2">
                <Camera className="w-4 h-4" />
                {lang === "bn" ? "ছবি পরিবর্তন করুন" : "Change Photo"}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigate("/settings")} className="cursor-pointer gap-2">
                <User className="w-4 h-4" />
                {lang === "bn" ? "প্রোফাইল সেটিংস" : "Profile Settings"}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigate("/reset-password")} className="cursor-pointer gap-2">
                <KeyRound className="w-4 h-4" />
                {lang === "bn" ? "পাসওয়ার্ড পরিবর্তন" : "Change Password"}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleLogout} className="cursor-pointer gap-2 text-destructive focus:text-destructive focus:bg-destructive/10">
                <LogOut className="w-4 h-4" />
                {lang === "bn" ? "লগআউট" : "Logout"}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <ProfileAvatarUpload ref={fileRef} />
        </div>
      </div>
    </header>
  );
};

export default TopHeader;
