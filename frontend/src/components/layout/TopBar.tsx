import { useEffect, useState } from "react";
import { analysisApi } from "../../api/analysisApi";
import type { AuthUser } from "../../api/authApi";
import { StatusBadge } from "../common/StatusBadge";

type TopBarProps = {
  taskId?: string;
  displayTaskId?: string;
  onLogout?: () => void;
  currentUser?: AuthUser | null;
  demoStatusLabel?: string;
  demoRunning?: boolean;
  demoPaused?: boolean;
};

export function TopBar({
  taskId,
  displayTaskId,
  onLogout,
  currentUser,
  demoStatusLabel,
  demoRunning,
  demoPaused,
}: TopBarProps) {
  const [apiStatus, setApiStatus] = useState<"checking" | "online" | "offline">(
    "checking",
  );

  useEffect(() => {
    let ignore = false;

    analysisApi
      .health()
      .then(() => {
        if (!ignore) {
          setApiStatus("online");
        }
      })
      .catch(() => {
        if (!ignore) {
          setApiStatus("offline");
        }
      });

    return () => {
      ignore = true;
    };
  }, []);

  const statusTone =
    apiStatus === "online"
      ? "success"
      : apiStatus === "offline"
        ? "danger"
        : "warning";

  const statusLabel =
    apiStatus === "online"
      ? "API 在线"
      : apiStatus === "offline"
        ? "API 离线"
        : "检查 API";

  return (
    <header className="flex flex-col gap-3 border-b border-slate-200/80 bg-white/85 px-5 py-4 shadow-sm backdrop-blur-xl md:flex-row md:items-center md:justify-between lg:px-8">
      <div>
        <p className="text-sm font-medium text-slate-700">
          AI 驱动的竞品分析系统
        </p>
        <p className="mt-1 text-xs text-slate-400">系统服务状态</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge label={statusLabel} tone={statusTone} />
        <span title={taskId ? `真实任务 ID：${taskId}` : undefined}>
          <StatusBadge
            label={displayTaskId ? `当前任务：${displayTaskId}` : "暂无任务"}
            tone={displayTaskId ? "info" : "neutral"}
          />
        </span>
        {demoStatusLabel ? (
          <StatusBadge
            label={`自动演示：${demoStatusLabel}`}
            tone={
              demoRunning ? (demoPaused ? "warning" : "success") : "neutral"
            }
          />
        ) : null}
        {currentUser ? (
          <StatusBadge label={`${currentUser.username}`} tone="neutral" />
        ) : null}
        {onLogout ? (
          <button
            className="rounded-full border border-slate-200 px-3 py-1 text-xs font-medium text-slate-600 transition hover:border-rose-300 hover:text-rose-600"
            onClick={onLogout}
            type="button"
            title="退出登录并返回登录页"
          >
            退出登录
          </button>
        ) : null}
      </div>
    </header>
  );
}
