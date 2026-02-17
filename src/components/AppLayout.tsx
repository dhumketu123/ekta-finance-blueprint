import { ReactNode } from "react";
import { AppSidebar } from "./AppSidebar";
import TopHeader from "./TopHeader";

interface AppLayoutProps {
  children: ReactNode;
}

const AppLayout = ({ children }: AppLayoutProps) => {
  return (
    <div className="flex min-h-screen bg-background">
      <AppSidebar />
      <TopHeader />
      <main className="flex-1 ml-64 mt-16 p-6 lg:p-8">
        {children}
      </main>
    </div>
  );
};

export default AppLayout;
