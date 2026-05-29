import { useEffect, useState } from "react";
import { API_BASE_URL } from "../../api/client";
import { analysisApi } from "../../api/analysisApi";
import { StatusBadge } from "../common/StatusBadge";

type TopBarProps = {
  taskId?: string;
};

export function TopBar({ taskId }: TopBarProps) {
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
      ? "API Online"
      : apiStatus === "offline"
        ? "API Offline"
        : "Checking API";

  return (
    <header className="flex flex-col gap-3 border-b border-slate-800 bg-surface-900/85 px-5 py-4 backdrop-blur md:flex-row md:items-center md:justify-between">
      <div>
        <p className="text-sm text-slate-400">AI driven competitor analysis</p>
        <p className="mt-1 text-xs text-slate-500">{API_BASE_URL}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge label={statusLabel} tone={statusTone} />
        <StatusBadge
          label={taskId ? `Task ${taskId}` : "No Active Task"}
          tone={taskId ? "info" : "neutral"}
        />
      </div>
    </header>
  );
}
