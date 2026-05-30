export type NavItem = {
  key: string;
  label: string;
};

type SidebarProps = {
  items: NavItem[];
  activeKey: string;
  taskId?: string;
  onNavigate: (key: string) => void;
};

export function Sidebar({
  items,
  activeKey,
  taskId,
  onNavigate,
}: SidebarProps) {
  return (
    <aside className="flex w-full flex-col border-b border-white/10 bg-surface-950/85 px-4 py-4 shadow-[12px_0_40px_rgba(2,6,23,0.25)] backdrop-blur-xl md:h-screen md:w-72 md:border-b-0 md:border-r">
      <div className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-300/90">
          Agent Console
        </p>
        <h1 className="mt-2 text-xl font-semibold text-white">
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
                  ? "bg-cyan-400/10 text-cyan-100 ring-1 ring-cyan-300/25"
                  : "text-slate-400 hover:bg-white/[0.04] hover:text-slate-100"
              }`}
              type="button"
              onClick={() => onNavigate(item.key)}
            >
              {item.label}
            </button>
          );
        })}
      </nav>

      <div className="mt-6 rounded-xl border border-white/10 bg-slate-900/45 p-3 md:mt-auto">
        <p className="text-xs uppercase tracking-[0.18em] text-slate-500">
          当前任务
        </p>
        <p className="mt-2 break-all text-sm text-slate-200">
          {taskId || "暂无任务"}
        </p>
      </div>
    </aside>
  );
}
