import type { ReactNode } from "react";
import { Sidebar, type NavItem } from "./Sidebar";
import { TopBar } from "./TopBar";

type AppLayoutProps = {
  children: ReactNode;
  navItems: NavItem[];
  activePage: string;
  taskId?: string;
  onNavigate: (key: string) => void;
};

export function AppLayout({
  children,
  navItems,
  activePage,
  taskId,
  onNavigate,
}: AppLayoutProps) {
  return (
    <div className="app-background min-h-screen bg-surface-950 text-slate-100">
      <div className="relative z-10 flex min-h-screen flex-col md:flex-row">
        <Sidebar
          items={navItems}
          activeKey={activePage}
          taskId={taskId}
          onNavigate={onNavigate}
        />
        <div className="flex min-h-screen flex-1 flex-col">
          <TopBar taskId={taskId} />
          <main className="flex-1 overflow-y-auto px-5 py-6 md:px-8 lg:px-10">
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
