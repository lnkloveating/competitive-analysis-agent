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
    <aside className="flex w-full flex-col border-b border-slate-800 bg-surface-950/95 px-4 py-4 md:h-screen md:w-72 md:border-b-0 md:border-r">
      <div className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-300">
          Agent Console
        </p>
        <h1 className="mt-2 text-xl font-semibold text-white">
          Competitive Analysis
        </h1>
      </div>

      <nav className="grid gap-1 md:block md:space-y-1">
        {items.map((item) => {
          const isActive = item.key === activeKey;

          return (
            <button
              key={item.key}
              className={`w-full rounded-md px-3 py-2.5 text-left text-sm transition ${
                isActive
                  ? "bg-cyan-400/10 text-cyan-100 ring-1 ring-cyan-400/30"
                  : "text-slate-400 hover:bg-slate-800/80 hover:text-slate-100"
              }`}
              type="button"
              onClick={() => onNavigate(item.key)}
            >
              {item.label}
            </button>
          );
        })}
      </nav>

      <div className="mt-6 rounded-lg border border-slate-800 bg-slate-900/50 p-3 md:mt-auto">
        <p className="text-xs uppercase tracking-[0.18em] text-slate-500">
          Active Task
        </p>
        <p className="mt-2 break-all text-sm text-slate-200">
          {taskId || "No task selected"}
        </p>
      </div>
    </aside>
  );
}
