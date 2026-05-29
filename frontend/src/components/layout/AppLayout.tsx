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
    <div className="min-h-screen bg-surface-950 text-slate-100">
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.16),transparent_34%),radial-gradient(circle_at_bottom_right,rgba(16,185,129,0.1),transparent_30%)]" />
      <div className="flex min-h-screen flex-col md:flex-row">
        <Sidebar
          items={navItems}
          activeKey={activePage}
          taskId={taskId}
          onNavigate={onNavigate}
        />
        <div className="flex min-h-screen flex-1 flex-col">
          <TopBar taskId={taskId} />
          <main className="flex-1 overflow-y-auto px-5 py-6 md:px-8">
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
