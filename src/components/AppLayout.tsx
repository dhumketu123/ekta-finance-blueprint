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
      <div className="flex min-h-screen bg-background">
        <AppSidebar />
        <TopHeader />
        <main className="flex-1 mt-16 p-6 lg:p-8">
          {children}
        </main>
      </div>
    </SidebarStateProvider>
  );
};

export default AppLayout;
