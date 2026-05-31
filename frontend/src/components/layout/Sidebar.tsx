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
};

export function Sidebar({
  items,
  activeKey,
  taskId,
  displayTaskId,
  onNavigate,
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
        {items.map((item) => {
          const isActive = item.key === activeKey;

          return (
            <button
              key={item.key}
              className={`w-full rounded-lg px-3 py-2.5 text-left text-sm transition duration-200 ${
                isActive
                  ? "bg-cyan-50 text-cyan-800 ring-1 ring-cyan-200"
                  : "text-slate-600 hover:bg-slate-50 hover:text-slate-950"
              }`}
              type="button"
              onClick={() => onNavigate(item.key)}
            >
              {item.label}
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
