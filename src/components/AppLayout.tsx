import { ReactNode, lazy, Suspense, useEffect } from "react";
import AppSidebarNew from "./sidebar/AppSidebarNew";
import TopHeader from "./TopHeader";
import BottomNav from "./BottomNav";
import { SidebarStateProvider } from "@/contexts/SidebarContext";
import SubscriptionLockOverlay from "./SubscriptionLockOverlay";

const AiChatAssistant = lazy(() => import("./AiChatAssistant"));

interface AppLayoutProps {
  children: ReactNode;
}

const AppLayout = ({ children }: AppLayoutProps) => {
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => {
      document.documentElement.style.setProperty("--app-height", `${vv.height}px`);
    };
    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, []);

  return (
    <SidebarStateProvider>
      <div
        className="flex flex-col w-full bg-background overflow-hidden"
        style={{ height: "var(--app-height, 100dvh)" }}
      >
        <AppSidebarNew />
        <TopHeader />
        <SubscriptionLockOverlay />
        <main
          className="flex-1 min-h-0 min-w-0 mt-16 md:ml-[260px] overflow-y-auto overflow-x-clip animate-page-enter"
          style={{
            WebkitOverflowScrolling: "touch",
            overscrollBehavior: "contain",
          }}
        >
          <div className="max-w-[1400px] mx-auto px-4 py-6 md:px-6 md:py-8 lg:px-8 space-y-6 md:space-y-8 pb-40 md:pb-8">
            {children}
          </div>
        </main>
        <BottomNav />
        <Suspense fallback={null}>
          <AiChatAssistant />
        </Suspense>
      </div>
    </SidebarStateProvider>
  );
};

export default AppLayout;
