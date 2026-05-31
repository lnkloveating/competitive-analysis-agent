import type { ReactNode } from "react";
import { Sidebar, type NavItem } from "./Sidebar";
import { TopBar } from "./TopBar";
import type { DemoStep } from "../../utils/demoSteps";
import type { AuthUser } from "../../api/authApi";

type AppLayoutProps = {
  children: ReactNode;
  navItems: NavItem[];
  activePage: string;
  taskId?: string;
  displayTaskId?: string;
  onNavigate: (key: string) => void;
  onLogout?: () => void;
  currentUser?: AuthUser | null;
  demoSteps: DemoStep[];
  demoRunning: boolean;
  demoPaused: boolean;
  demoStepIndex: number;
  demoStatusLabel: string;
  currentDemoKey?: string;
  visitedKeys: Set<string>;
  onPauseDemo: () => void;
  onResumeDemo: () => void;
  onStopDemo: () => void;
};

export function AppLayout({
  children,
  navItems,
  activePage,
  taskId,
  displayTaskId,
  onNavigate,
  onLogout,
  currentUser,
  demoSteps,
  demoRunning,
  demoPaused,
  demoStepIndex,
  demoStatusLabel,
  currentDemoKey,
  visitedKeys,
  onPauseDemo,
  onResumeDemo,
  onStopDemo,
}: AppLayoutProps) {
  const currentStep = demoSteps[demoStepIndex];

  return (
    <div className="app-background min-h-screen bg-slate-50 text-slate-900">
      <div className="relative z-10 flex min-h-screen flex-col md:flex-row">
        <Sidebar
          items={navItems}
          activeKey={activePage}
          taskId={taskId}
          displayTaskId={displayTaskId}
          onNavigate={onNavigate}
          demoActive={demoRunning && !demoPaused}
          currentDemoKey={currentDemoKey}
          visitedKeys={visitedKeys}
        />
        <div className="flex min-h-screen flex-1 flex-col">
          <TopBar
            taskId={taskId}
            displayTaskId={displayTaskId}
            onLogout={onLogout}
            currentUser={currentUser}
            demoStatusLabel={demoStatusLabel}
            demoRunning={demoRunning}
            demoPaused={demoPaused}
          />

          {demoRunning ? (
            <div className="border-b border-cyan-200/70 bg-gradient-to-r from-cyan-50/90 to-white/80 px-5 py-3 backdrop-blur-sm lg:px-8">
              <div className="mx-auto flex max-w-[1440px] flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex items-center gap-3">
                  <span className="relative flex h-2.5 w-2.5">
                    {!demoPaused ? (
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-cyan-400 opacity-75" />
                    ) : null}
                    <span
                      className={`relative inline-flex h-2.5 w-2.5 rounded-full ${
                        demoPaused ? "bg-amber-400" : "bg-cyan-500"
                      }`}
                    />
                  </span>
                  <p className="text-sm font-semibold text-slate-700">
                    {demoPaused ? "演示已暂停，可继续" : "自动演示中"}
                    <span className="ml-2 font-normal text-slate-500">
                      第 {demoStepIndex + 1} / {demoSteps.length} 步 ·{" "}
                      {currentStep?.label}
                    </span>
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  {demoPaused ? (
                    <button
                      className="rounded-full border border-cyan-300 bg-cyan-500 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-cyan-400"
                      onClick={onResumeDemo}
                      type="button"
                    >
                      继续演示
                    </button>
                  ) : (
                    <button
                      className="rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:border-cyan-300 hover:text-cyan-700"
                      onClick={onPauseDemo}
                      type="button"
                    >
                      暂停演示
                    </button>
                  )}
                  <button
                    className="rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:border-rose-300 hover:text-rose-600"
                    onClick={onStopDemo}
                    type="button"
                  >
                    结束演示
                  </button>
                </div>
              </div>

              {/* 演示流程进度条 */}
              <div className="mx-auto mt-3 flex max-w-[1440px] items-center gap-1.5">
                {demoSteps.map((step, index) => {
                  const isDone = index < demoStepIndex;
                  const isCurrent = index === demoStepIndex;

                  return (
                    <div key={step.key} className="flex flex-1 items-center gap-1.5">
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-200">
                        <div
                          className={`h-full rounded-full ${
                            isDone
                              ? "w-full bg-cyan-400"
                              : isCurrent
                                ? "w-full demo-bar-flow"
                                : "w-0"
                          }`}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}

          <main className="flex-1 overflow-y-auto px-5 py-6 md:px-8 lg:px-10">
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
