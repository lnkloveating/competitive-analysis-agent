type LoadingStateProps = {
  label?: string;
};

export function LoadingState({ label = "加载中..." }: LoadingStateProps) {
  return (
    <div className="flex min-h-32 items-center justify-center rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-600 shadow-sm">
      <span className="mr-3 h-2.5 w-2.5 rounded-full bg-cyan-500 shadow-[0_0_18px_rgba(6,182,212,0.45)]" />
      {label}
    </div>
  );
}
