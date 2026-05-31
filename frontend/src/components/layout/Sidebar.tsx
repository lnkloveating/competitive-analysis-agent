export type NavItem = {
  key: string;
  label: string;
};

type SidebarProps = {
  items: NavItem[];
  activeKey: string;
  taskId?: string;
  displayTaskId?: string;
  onNavigate: (key: string) => void;
  demoActive?: boolean;
  currentDemoKey?: string;
  visitedKeys?: Set<string>;
};

export function Sidebar({
  items,
  activeKey,
  taskId,
  displayTaskId,
  onNavigate,
  demoActive = false,
  currentDemoKey,
  visitedKeys,
}: SidebarProps) {
  return (
    <aside className="flex w-full flex-col border-b border-slate-200/80 bg-white/90 px-4 py-4 shadow-[12px_0_40px_rgba(15,23,42,0.08)] backdrop-blur-xl md:h-screen md:w-72 md:border-b-0 md:border-r">
      <div className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-700">
          Agent Console
        </p>
        <h1 className="mt-2 text-xl font-semibold text-slate-950">
          竞品分析控制台
        </h1>
      </div>

      <nav className="grid gap-1 md:block md:space-y-1">
        {items.map((item, index) => {
          const isActive = item.key === activeKey;
          const isCurrentDemo = demoActive && item.key === currentDemoKey;
          const isVisited = visitedKeys?.has(item.key) ?? false;

          return (
            <button
              key={item.key}
              className={`group flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition duration-200 ${
                isActive
                  ? "bg-cyan-50 text-cyan-800 ring-1 ring-cyan-200"
                  : "text-slate-600 hover:bg-slate-50 hover:text-slate-950"
              }`}
              type="button"
              onClick={() => onNavigate(item.key)}
            >
              <span
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[11px] font-semibold transition ${
                  isCurrentDemo
                    ? "nav-dot-pulse border-cyan-400 bg-cyan-500 text-white"
                    : isActive
                      ? "border-cyan-300 bg-cyan-100 text-cyan-700"
                      : isVisited
                        ? "border-emerald-300 bg-emerald-50 text-emerald-600"
                        : "border-slate-300 bg-white text-slate-400"
                }`}
              >
                {isVisited && !isActive && !isCurrentDemo ? "✓" : index + 1}
              </span>
              <span className="min-w-0 flex-1 truncate">{item.label}</span>
            </button>
          );
        })}
      </nav>

      <div
        className="mt-6 rounded-xl border border-slate-200 bg-slate-50 p-3 md:mt-auto"
        title={taskId ? `真实任务 ID：${taskId}` : undefined}
      >
        <p className="text-xs uppercase tracking-[0.18em] text-slate-400">
          当前任务
        </p>
        <p className="mt-2 break-all text-sm font-medium text-slate-700">
          {displayTaskId || "暂无任务"}
        </p>
      </div>
    </aside>
  );
}
