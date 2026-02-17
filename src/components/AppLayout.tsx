import { ReactNode } from "react";
import { AppSidebar } from "./AppSidebar";
import TopHeader from "./TopHeader";
import { SidebarStateProvider } from "@/contexts/SidebarContext";

interface AppLayoutProps {
  children: ReactNode;
}

const AppLayout = ({ children }: AppLayoutProps) => {
  return (
    <SidebarStateProvider>
      <div className="flex min-h-screen w-full bg-background overflow-x-hidden">
        <AppSidebar />
        <TopHeader />
        <main className="w-full min-w-0 mt-16 animate-page-enter">
          <div className="max-w-[1400px] mx-auto px-4 py-6 md:px-6 lg:px-8">
            {children}
          </div>
        </main>
      </div>
    </SidebarStateProvider>
  );
};

export default AppLayout;
