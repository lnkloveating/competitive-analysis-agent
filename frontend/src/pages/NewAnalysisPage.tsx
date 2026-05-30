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
        throw new Error("后端未返回 task_id");
      }

      setCreatedTaskId(response.task_id);
      onTaskCreated(response.task_id);

      window.setTimeout(() => {
        onNavigate("workflow");
      }, 700);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "分析任务创建失败，请稍后重试",
      );
    } finally {
      setIsStarting(false);
    }
  }

  return (
    <section className="mx-auto max-w-[1280px] space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-sm font-medium text-cyan-300">新建分析</p>
          <h2 className="mt-2 text-3xl font-semibold text-white">
            配置 Agent 分析任务
          </h2>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-400">
            使用当前后端任务创建接口启动多 Agent 工作流，系统将围绕电竞鼠标赛道完成证据采集、结论生成、质量审查与报告输出。
          </p>
        </div>
        <div className="flex flex-wrap gap-2 lg:justify-end">
          <StatusBadge label="POST /api/analysis/start" tone="info" />
          <StatusBadge label="后端任务创建已启用" tone="success" />
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <section className="rounded-2xl border border-white/10 bg-slate-950/70 p-5 shadow-[0_24px_70px_rgba(2,6,23,0.24)]">
          <div className="flex items-start justify-between gap-3 border-b border-white/10 pb-5">
            <div>
              <p className="text-sm font-medium text-cyan-300">当前分析范围</p>
              <h3 className="mt-2 text-2xl font-semibold text-white">
                电竞外设 / 电竞鼠标
              </h3>
            </div>
            <StatusBadge label={industryKey} tone="info" />
          </div>

          <dl className="mt-5 grid gap-3">
            <div className="rounded-xl border border-white/10 bg-slate-900/45 p-4">
              <dt className="text-xs uppercase tracking-[0.16em] text-slate-500">
                行业
              </dt>
              <dd className="mt-2 text-sm font-medium text-slate-100">
                电竞外设
              </dd>
            </div>
            <div className="rounded-xl border border-white/10 bg-slate-900/45 p-4">
              <dt className="text-xs uppercase tracking-[0.16em] text-slate-500">
                品类
              </dt>
              <dd className="mt-2 text-sm font-medium text-slate-100">
                电竞鼠标
              </dd>
            </div>
            <div className="rounded-xl border border-white/10 bg-slate-900/45 p-4">
              <dt className="text-xs uppercase tracking-[0.16em] text-slate-500">
                分析对象
              </dt>
              <dd className="mt-3 flex flex-wrap gap-2">
                {defaultCompetitors.map((competitor) => (
                  <StatusBadge key={competitor} label={competitor} tone="neutral" />
                ))}
              </dd>
            </div>
          </dl>
        </section>

        <section className="rounded-2xl border border-white/10 bg-slate-950/70 p-5 shadow-[0_24px_70px_rgba(2,6,23,0.24)]">
          <div>
            <p className="text-sm font-medium text-cyan-300">分析配置</p>
            <h3 className="mt-2 text-2xl font-semibold text-white">
              定义目标品牌与使用场景
            </h3>
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-3">
            <label className="block rounded-xl border border-white/10 bg-slate-900/45 p-4">
              <span className="text-sm font-medium text-slate-300">
                目标品牌 / 重点品牌
              </span>
              <input
                className="mt-3 w-full rounded-lg border border-white/10 bg-slate-950/80 px-3 py-2 text-sm text-slate-100 outline-none transition focus:border-cyan-300/70"
                onChange={(event) => setTargetPlatform(event.target.value)}
                value={targetPlatform}
              />
            </label>

            <label className="block rounded-xl border border-white/10 bg-slate-900/45 p-4">
              <span className="text-sm font-medium text-slate-300">
                目标用户
              </span>
              <input
                className="mt-3 w-full rounded-lg border border-white/10 bg-slate-950/80 px-3 py-2 text-sm text-slate-100 outline-none transition focus:border-cyan-300/70"
                onChange={(event) => setTargetUser(event.target.value)}
                value={targetUser}
              />
            </label>

            <label className="block rounded-xl border border-white/10 bg-slate-900/45 p-4">
              <span className="text-sm font-medium text-slate-300">
                时间范围
              </span>
              <input
                className="mt-3 w-full rounded-lg border border-white/10 bg-slate-950/80 px-3 py-2 text-sm text-slate-100 outline-none transition focus:border-cyan-300/70"
                onChange={(event) => setTimeRange(event.target.value)}
                value={timeRange}
              />
            </label>
          </div>

          <div className="mt-5 rounded-xl border border-white/10 bg-slate-900/35 p-4">
            <p className="text-sm font-medium text-slate-300">分析维度</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {defaultDimensions.map((dimension) => (
                <span
                  className="rounded-lg border border-cyan-300/20 bg-cyan-300/10 px-3 py-2 text-sm text-cyan-100"
                  key={dimension}
                >
                  {dimension}
                </span>
              ))}
            </div>
          </div>
        </section>
      </div>

      <section className="rounded-2xl border border-white/10 bg-slate-950/70 p-5 shadow-[0_24px_70px_rgba(2,6,23,0.24)]">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-sm font-medium text-cyan-300">请求预览</p>
            <h3 className="mt-2 text-xl font-semibold text-white">
              任务创建参数
            </h3>
          </div>
          <StatusBadge label="不改变后端 API" tone="success" />
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-3">
          <div className="rounded-xl border border-white/10 bg-slate-900/45 p-4">
            <p className="text-xs uppercase tracking-[0.16em] text-slate-500">
              请求方法
            </p>
            <p className="mt-2 font-mono text-sm text-cyan-200">
              POST /api/analysis/start
            </p>
          </div>
          <div className="rounded-xl border border-white/10 bg-slate-900/45 p-4">
            <p className="text-xs uppercase tracking-[0.16em] text-slate-500">
              industry_key
            </p>
            <p className="mt-2 font-mono text-sm text-cyan-200">
              {payload.industry_key}
            </p>
          </div>
          <div className="rounded-xl border border-white/10 bg-slate-900/45 p-4">
            <p className="text-xs uppercase tracking-[0.16em] text-slate-500">
              focus_dimensions
            </p>
            <p className="mt-2 text-sm text-slate-200">
              {payload.focus_dimensions.length} 项
            </p>
          </div>
        </div>

        {isStarting ? (
          <p className="mt-5 rounded-lg border border-cyan-300/25 bg-cyan-300/10 px-4 py-3 text-sm text-cyan-100">
            正在创建分析任务并启动 Agent 工作流...
          </p>
        ) : null}

        {createdTaskId ? (
          <p className="mt-5 rounded-lg border border-emerald-400/30 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-100">
            任务已创建: {createdTaskId}
          </p>
        ) : null}

        {error ? (
          <p className="mt-5 rounded-lg border border-rose-500/35 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
            {error}
          </p>
        ) : null}

        <div className="mt-7 flex justify-end">
          <button
            className="rounded-lg bg-cyan-300 px-6 py-3 text-sm font-semibold text-slate-950 shadow-[0_0_28px_rgba(34,211,238,0.24)] transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400 disabled:shadow-none"
            disabled={isStarting}
            onClick={handleStartAnalysis}
            type="button"
          >
            {isStarting ? "启动中..." : "开始分析"}
          </button>
        </div>
      </section>
    </section>
  );
}
