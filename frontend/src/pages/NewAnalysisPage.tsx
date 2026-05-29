import { useState } from "react";
import { analysisApi } from "../api/analysisApi";
import { StatusBadge } from "../components/common/StatusBadge";
import type { StartAnalysisRequest } from "../types/analysis";

type NewAnalysisPageProps = {
  selectedIndustryKey?: string | null;
  onTaskCreated: (taskId: string) => void;
  onNavigate: (key: string) => void;
};

const defaultCompetitors = ["罗技", "雷蛇", "海盗船"];
const defaultDimensions = [
  "性能参数",
  "轻量化设计",
  "无线与续航",
  "软件生态",
  "用户口碑",
  "价格定位",
  "电竞品牌影响力",
];

export function NewAnalysisPage({
  selectedIndustryKey,
  onTaskCreated,
  onNavigate,
}: NewAnalysisPageProps) {
  const [targetPlatform, setTargetPlatform] = useState("罗技");
  const [targetUser, setTargetUser] = useState("产品经理");
  const [timeRange, setTimeRange] = useState("近两年");
  const [isStarting, setIsStarting] = useState(false);
  const [createdTaskId, setCreatedTaskId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const industryKey =
    selectedIndustryKey === "gaming_mouse" ? selectedIndustryKey : "gaming_mouse";

  const payload: StartAnalysisRequest = {
    target_platform: targetPlatform.trim() || "罗技",
    competitors: defaultCompetitors,
    analysis_scene: "电竞鼠标竞品分析",
    target_user: targetUser.trim() || "产品经理",
    time_range: timeRange.trim() || "近两年",
    focus_dimensions: defaultDimensions,
    industry_key: industryKey,
  };

  async function handleStartAnalysis() {
    if (isStarting) {
      return;
    }

    setIsStarting(true);
    setError(null);
    setCreatedTaskId(null);

    try {
      const response = await analysisApi.startAnalysis(payload);

      if (!response?.task_id) {
        throw new Error("Backend did not return task_id");
      }

      setCreatedTaskId(response.task_id);
      onTaskCreated(response.task_id);

      window.setTimeout(() => {
        onNavigate("workflow");
      }, 700);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to initialize agent analysis",
      );
    } finally {
      setIsStarting(false);
    }
  }

  return (
    <section className="mx-auto max-w-6xl">
      <div className="mb-6">
        <p className="text-sm font-medium text-cyan-300">New Analysis</p>
        <h2 className="mt-2 text-3xl font-semibold text-white">
          Configure Agent Analysis
        </h2>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-400">
          电竞鼠标 Demo 将使用真实 FastAPI 任务创建接口启动，多 Agent 工作流会在后端执行。
        </p>
      </div>

      <div className="rounded-lg border border-cyan-300/25 bg-slate-950/80 p-6 shadow-[0_0_40px_rgba(34,211,238,0.12)]">
        <div className="flex flex-col gap-4 border-b border-slate-800 pb-5 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="text-sm text-slate-400">当前行业</p>
            <h3 className="mt-1 text-2xl font-semibold text-white">
              电竞外设 / 电竞鼠标
            </h3>
          </div>
          <div className="flex flex-wrap gap-2">
            <StatusBadge label={industryKey} tone="info" />
            <StatusBadge label="Backend Start Enabled" tone="success" />
          </div>
        </div>

        <div className="mt-6 grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
          <div className="space-y-4">
            <label className="block rounded-lg border border-slate-800 bg-slate-900/55 p-4">
              <span className="text-sm font-medium text-slate-300">
                目标平台
              </span>
              <input
                className="mt-3 w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none transition focus:border-cyan-300"
                onChange={(event) => setTargetPlatform(event.target.value)}
                value={targetPlatform}
              />
            </label>

            <label className="block rounded-lg border border-slate-800 bg-slate-900/55 p-4">
              <span className="text-sm font-medium text-slate-300">
                目标用户
              </span>
              <input
                className="mt-3 w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none transition focus:border-cyan-300"
                onChange={(event) => setTargetUser(event.target.value)}
                value={targetUser}
              />
            </label>

            <label className="block rounded-lg border border-slate-800 bg-slate-900/55 p-4">
              <span className="text-sm font-medium text-slate-300">
                时间范围
              </span>
              <input
                className="mt-3 w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none transition focus:border-cyan-300"
                onChange={(event) => setTimeRange(event.target.value)}
                value={timeRange}
              />
            </label>
          </div>

          <div className="rounded-lg border border-slate-800 bg-slate-900/45 p-5">
            <div>
              <p className="text-sm font-medium text-slate-300">竞品</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {defaultCompetitors.map((competitor) => (
                  <span
                    className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200"
                    key={competitor}
                  >
                    {competitor}
                  </span>
                ))}
              </div>
            </div>

            <div className="mt-6">
              <p className="text-sm font-medium text-slate-300">分析维度</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {defaultDimensions.map((dimension) => (
                  <span
                    className="rounded-md border border-cyan-300/25 bg-cyan-300/10 px-3 py-2 text-sm text-cyan-100"
                    key={dimension}
                  >
                    {dimension}
                  </span>
                ))}
              </div>
            </div>

            <div className="mt-6 rounded-lg border border-slate-800 bg-slate-950/70 p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-500">
                Request Payload
              </p>
              <p className="mt-2 text-sm text-slate-300">
                POST /api/analysis/start
              </p>
              <p className="mt-1 text-sm text-cyan-200">
                industry_key = {payload.industry_key}
              </p>
            </div>
          </div>
        </div>

        {isStarting ? (
          <p className="mt-5 rounded-md border border-cyan-300/25 bg-cyan-300/10 px-4 py-3 text-sm text-cyan-100">
            Initializing digital research team...
          </p>
        ) : null}

        {createdTaskId ? (
          <p className="mt-5 rounded-md border border-emerald-400/30 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-100">
            Task created: {createdTaskId}
          </p>
        ) : null}

        {error ? (
          <p className="mt-5 rounded-md border border-rose-500/35 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
            {error}
          </p>
        ) : null}

        <div className="mt-7">
          <button
            className="rounded-md bg-cyan-300 px-5 py-3 text-sm font-semibold text-slate-950 shadow-[0_0_28px_rgba(34,211,238,0.28)] transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400 disabled:shadow-none"
            disabled={isStarting}
            onClick={handleStartAnalysis}
            type="button"
          >
            {isStarting ? "Starting..." : "Start Agent Analysis"}
          </button>
        </div>
      </div>
    </section>
  );
}
