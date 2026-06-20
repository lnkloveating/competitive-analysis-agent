import { useEffect, useState } from "react";
import { analysisApi } from "../api/analysisApi";
import { AgentOrbit3D } from "../components/common/AgentOrbit3D";
import { ProductOrbit } from "../components/common/ProductOrbit";
import { EmptyState } from "../components/common/EmptyState";
import { LoadingState } from "../components/common/LoadingState";
import type { Industry } from "../types/analysis";

type HomeSelection = {
  selectedDomain?: string | null;
  selectedCategory?: string | null;
  selectedIndustryKey?: string | null;
};

type HomePageProps = {
  taskId?: string;
  displayTaskId?: string;
  selectedDomain?: string | null;
  selectedCategory?: string | null;
  selectedIndustryKey?: string | null;
  onNavigate: (key: string) => void;
  onSelectionChange: (selection: HomeSelection) => void;
};

type SelectOption = {
  key: string;
  label: string;
  description: string;
  available: boolean;
};

const industries: SelectOption[] = [
  {
    key: "gaming_mouse",
    label: "电竞外设",
    description: "官方型号、硬件事实、模具/点击系统、评价测评与实时价格分析",
    available: true,
  },
];

type OrbitProductDef = {
  key: string;
  label: string;
  description: string;
  available: boolean;
  glyph: string;
};

type OrbitModeDef = {
  key: string;
  label: string;
  en: string;
  tagline: string;
  items: OrbitProductDef[];
};

// 电竞品类：只展示当前后端支持的可分析品类。
const orbitModes: OrbitModeDef[] = [
  {
    key: "gaming",
    label: "电竞",
    en: "GAMING",
    tagline: "高性能 · 低延迟 · 竞技级输入体验",
    items: [
      {
        key: "gaming_mouse",
        label: "电竞鼠标",
        description: "当前可分析场景：电竞鼠标",
        available: true,
        glyph: "mouse",
      },
    ],
  },
];

const allProducts: OrbitProductDef[] = orbitModes
  .flatMap((mode) => mode.items)
  .filter((product) => product.key === "gaming_mouse");
const runnableProductKeys = new Set(["gaming_mouse"]);

function getRunnableIndustryKey(categoryKey: string) {
  return runnableProductKeys.has(categoryKey) ? categoryKey : null;
}

function normalizeIndustries(payload: unknown): Industry[] {
  const rawItems = Array.isArray(payload)
    ? payload
    : Array.isArray((payload as { industries?: unknown })?.industries)
      ? (payload as { industries: unknown[] }).industries
      : [];

  return rawItems
    .filter((item): item is Record<string, unknown> => {
      return Boolean(item && typeof item === "object");
    })
    .map((item) => {
      const key =
        typeof item.industry_key === "string"
          ? item.industry_key
          : typeof item.key === "string"
            ? item.key
            : undefined;

      const representativeProducts =
        item.representative_products &&
        typeof item.representative_products === "object" &&
        !Array.isArray(item.representative_products)
          ? Object.entries(
              item.representative_products as Record<string, unknown>,
            ).reduce<Record<string, string[]>>((acc, [brand, products]) => {
              acc[brand] = Array.isArray(products)
                ? products.filter(
                    (product): product is string => typeof product === "string",
                  )
                : [];
              return acc;
            }, {})
          : undefined;

      return {
        industry_key: key,
        key,
        name:
          typeof item.name === "string" ? item.name : key || "未知行业",
        competitors: Array.isArray(item.competitors)
          ? item.competitors.filter(
              (competitor): competitor is string =>
                typeof competitor === "string",
            )
          : [],
        dimensions: Array.isArray(item.dimensions)
          ? item.dimensions.filter(
              (dimension): dimension is string => typeof dimension === "string",
            )
          : [],
        description:
          typeof item.description === "string" ? item.description : undefined,
        representative_products: representativeProducts,
      };
    });
}

type PillTone = "success" | "warning" | "danger" | "info" | "neutral";

const pillToneClasses: Record<PillTone, string> = {
  success: "border-[#34d399]/40 bg-[#34d399]/12 text-[#6ee7b7]",
  warning: "border-[#fbbf24]/40 bg-[#fbbf24]/12 text-[#fcd34d]",
  danger: "border-[#fb7185]/40 bg-[#fb7185]/12 text-[#fda4af]",
  info: "border-[#38bdf8]/40 bg-[#38bdf8]/12 text-[#7dd3fc]",
  neutral: "border-[#ffffff22] bg-white/5 text-[#9fb2d4]",
};

// 深色科技风的状态胶囊。
function Pill({ label, tone = "neutral" }: { label: string; tone?: PillTone }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium ${pillToneClasses[tone]}`}
    >
      {label}
    </span>
  );
}

const capabilityCards = [
  {
    key: "workflow",
    title: "多 Agent 协作",
    desc: "Research、Collector、Evidence、Analysis、Verification、Quality、Report 七个 Agent 联动执行。",
    detail: "7 个 Agent 按 LangGraph DAG 顺序协作，可在 Agent 工作流查看执行路径与打回关系。",
    tone: "from-[#22d3ee]/20",
    border: "border-[#38bdf8]/30",
  },
  {
    key: "evidence",
    title: "证据可追溯",
    desc: "每条结论都绑定 Evidence ID 和 Claim ID，支持来源回溯。",
    detail: "在 Workflow 与最终报告中查看 used_claim_ids、used_evidence_ids 和 pending 数据。",
    tone: "from-[#34d399]/20",
    border: "border-[#34d399]/30",
  },
  {
    key: "quality",
    title: "质量门控审查",
    desc: "VerificationAgent 与 QualityAgent 联合检查证据支撑、覆盖率和风险水位。",
    detail: "未通过会自动打回对应 Agent；达到上限后生成 partial_report，不把缺失数据伪造成完整结论。",
    tone: "from-[#818cf8]/20",
    border: "border-[#818cf8]/30",
  },
];

const analysisFlowSteps = [
  {
    key: "overview",
    code: "01",
    label: "总览",
    subtitle: "SYSTEM OVERVIEW",
    desc: "展示当前系统能力、专业 schema 和多 Agent 分析入口。",
    input: "系统状态",
    process: "读取电竞鼠标专业配置",
    output: "可进入产品输入",
    positionClass: "mission-node-1",
  },
  {
    key: "product-compare",
    code: "02",
    label: "产品输入",
    subtitle: "PRODUCT ENTRY",
    desc: "输入两款电竞鼠标或外设名称，创建 Agent 分析任务。",
    input: "产品 A / 产品 B",
    process: "创建任务，不提前输出分析结论",
    output: "TASK ID",
    positionClass: "mission-node-2",
  },
  {
    key: "workflow",
    code: "03",
    label: "Agent 工作流",
    subtitle: "AGENT DAG",
    desc: "展示七个 Agent 的运行顺序、MCP pending 状态、证据结构化和质量门控。",
    input: "任务配置",
    process: "7 个 Agent 协同执行",
    output: "Trace / Evidence / Quality",
    positionClass: "mission-node-3",
  },
  {
    key: "report",
    code: "04",
    label: "最终报告",
    subtitle: "FINAL REPORT",
    desc: "展示专业电竞鼠标 schema 报告、证据引用、pending 数据与最终建议。",
    input: "通过质量门控的结构化结果",
    process: "ReportAgent 生成专业报告",
    output: "GamingMouseFinalReport",
    positionClass: "mission-node-4",
  },
];

const HOME_CAPABILITIES_EXPANDED_KEY = "homeCapabilitiesExpanded";

function getStoredCapabilitiesExpanded() {
  if (typeof window === "undefined") {
    return true;
  }

  return window.sessionStorage.getItem(HOME_CAPABILITIES_EXPANDED_KEY) !== "false";
}

export function HomePage({
  taskId,
  displayTaskId,
  selectedDomain,
  selectedCategory,
  selectedIndustryKey,
  onNavigate,
  onSelectionChange,
}: HomePageProps) {
  const [backendIndustries, setBackendIndustries] = useState<Industry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [taskStatus, setTaskStatus] = useState<string | null>(null);
  const [capabilitiesExpanded, setCapabilitiesExpanded] = useState(
    getStoredCapabilitiesExpanded,
  );
  const [previewFlowIndex, setPreviewFlowIndex] = useState(0);

  useEffect(() => {
    let ignore = false;

    analysisApi
      .getIndustries()
      .then((payload) => {
        if (!ignore) {
          setBackendIndustries(normalizeIndustries(payload));
          setError(null);
        }
      })
      .catch((err: Error) => {
        if (!ignore) {
          setError(err.message);
        }
      })
      .finally(() => {
        if (!ignore) {
          setIsLoading(false);
        }
      });

    return () => {
      ignore = true;
    };
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.sessionStorage.setItem(
        HOME_CAPABILITIES_EXPANDED_KEY,
        String(capabilitiesExpanded),
      );
    }
  }, [capabilitiesExpanded]);

  useEffect(() => {
    const timerId = window.setInterval(() => {
      setPreviewFlowIndex((current) => (current + 1) % analysisFlowSteps.length);
    }, 1800);

    return () => window.clearInterval(timerId);
  }, []);

  // 轻量读取当前任务状态，用于驱动协作动画的待命/分析中/完成态（不影响主流程）。
  useEffect(() => {
    if (!taskId) {
      setTaskStatus(null);
      return;
    }

    const activeTaskId = taskId;
    let cancelled = false;
    let timerId: number | undefined;

    async function pollStatus() {
      try {
        const result = await analysisApi.getStatus(activeTaskId);
        if (cancelled) {
          return;
        }
        const status = (result?.status ?? "").toLowerCase();
        setTaskStatus(status);
        if ((status === "completed" || status === "failed") && timerId) {
          window.clearInterval(timerId);
          timerId = undefined;
        }
      } catch {
        if (!cancelled) {
          setTaskStatus(null);
        }
      }
    }

    pollStatus();
    timerId = window.setInterval(pollStatus, 3000);

    return () => {
      cancelled = true;
      if (timerId) {
        window.clearInterval(timerId);
      }
    };
  }, [taskId]);

  const orbitPhase: "standby" | "running" | "completed" = !taskId
    ? "standby"
    : taskStatus === "completed"
      ? "completed"
      : "running";

  const industryValue = selectedDomain ?? "gaming_mouse";
  const categoryValue = selectedCategory ?? "gaming_mouse";
  const selectedIndustry =
    industries.find((industry) => industry.key === industryValue) ?? industries[0];
  const selectedCategoryOption =
    allProducts.find((product) => product.key === categoryValue) ?? allProducts[0];
  const selectedMode =
    orbitModes.find((mode) =>
      mode.items.some((item) => item.key === categoryValue),
    ) ?? orbitModes[0];
  const selectedBackendIndustry = backendIndustries.find((industry) => {
    return (industry.industry_key || industry.key) === selectedCategoryOption.key;
  });
  const hasSelectedBackendIndustry = Boolean(selectedBackendIndustry);
  const connectedRunnableCount = backendIndustries.filter((industry) =>
    getRunnableIndustryKey(industry.industry_key || industry.key || ""),
  ).length;
  const canEnterConfig =
    selectedIndustry.key === "gaming_mouse" &&
    selectedCategoryOption.available &&
    Boolean(getRunnableIndustryKey(selectedCategoryOption.key)) &&
    hasSelectedBackendIndustry;

  const activeFlowIndex = previewFlowIndex % analysisFlowSteps.length;
  const missionCompleted = Boolean(taskId && taskStatus === "completed");
  const missionCoreStatus = !taskId
    ? "READY"
    : missionCompleted
      ? "COMPLETE"
      : "RUNNING";

  function handleCategoryChange(nextCategory: string) {
    onSelectionChange({
      selectedDomain: "gaming_mouse",
      selectedCategory: nextCategory,
      selectedIndustryKey: getRunnableIndustryKey(nextCategory),
    });
  }

  function handleEnterConfig(nextCategory = selectedCategoryOption.key) {
    const nextIndustryKey = getRunnableIndustryKey(nextCategory);
    if (!nextIndustryKey) {
      return;
    }

    onSelectionChange({
      selectedDomain: "gaming_mouse",
      selectedCategory: nextCategory,
      selectedIndustryKey: nextIndustryKey,
    });
    onNavigate("product-compare");
  }

  return (
    <section className="mx-auto max-w-[1280px]">
      <div
        className="relative overflow-hidden rounded-3xl border border-[#1d2b4a] p-5 shadow-[0_24px_80px_rgba(2,6,23,0.45)] md:p-7"
        style={{
          background:
            "radial-gradient(900px 500px at 14% 8%, rgba(37,99,235,0.16), transparent 55%)," +
            "radial-gradient(800px 600px at 92% 92%, rgba(129,140,248,0.14), transparent 55%)," +
            "linear-gradient(135deg, #070d1c 0%, #0b1426 55%, #080c18 100%)",
        }}
      >
        {/* 动态网格 + 光斑 */}
        <div
          className="welcome-grid pointer-events-none absolute inset-[-40px] opacity-50"
          aria-hidden
        />
        <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
          <div className="welcome-blob absolute -left-16 -top-12 h-64 w-64 rounded-full bg-[#22d3ee]/15 blur-3xl" />
          <div
            className="welcome-blob absolute right-[-4rem] top-1/3 h-72 w-72 rounded-full bg-[#818cf8]/15 blur-3xl"
            style={{ animationDelay: "3s" }}
          />
        </div>
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#38bdf8]/60 to-transparent" />

        <div className="relative space-y-6">
          {/* Hero */}
          <div className="grid items-center gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <div>
              <p className="text-sm font-semibold tracking-[0.04em] text-[#7dd3fc]">
                Multi-Agent Competitive Intelligence
              </p>
              <h2 className="mt-3 text-4xl font-bold leading-tight text-[#f1f6ff] md:text-5xl">
                AI 竞品情报中枢
              </h2>
              <p className="mt-4 max-w-xl text-sm leading-7 text-[#9fb2d4] md:text-base">
                多 Agent 协同完成数据规划、证据结构化、事实校验、质量审查与专业报告生成。
              </p>
              <p className="mt-2 max-w-xl text-sm leading-6 text-[#7e91b5]">
                面向产品团队的竞品分析系统，从公开资料中抽取证据，生成可追溯的策略报告。
              </p>

              <div className="mt-7 flex flex-wrap gap-2">
                <Pill
                  label={isLoading ? "正在读取分析场景" : "分析场景已连接"}
                  tone={isLoading ? "warning" : error ? "danger" : "success"}
                />
                <Pill
                  label={
                    connectedRunnableCount > 0
                      ? `${connectedRunnableCount} 个电竞品类可分析`
                      : "电竞分析服务未就绪"
                  }
                  tone={connectedRunnableCount > 0 ? "success" : "warning"}
                />
                <Pill
                  label={displayTaskId ? `当前任务：${displayTaskId}` : "暂无任务"}
                  tone={taskId ? "info" : "neutral"}
                />
              </div>
            </div>

            {/* 伪 3D Agent 协作动画 */}
            <div className="min-w-0">
              <AgentOrbit3D phase={orbitPhase} />
              <p className="mt-2 text-center text-xs tracking-[0.2em] text-[#5f7299]">
                MULTI-AGENT COLLABORATION
              </p>
            </div>
          </div>

          <section className="rounded-2xl border border-[#ffffff14] bg-[#0a1326]/40 p-5 backdrop-blur-sm md:p-6">
            <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-sm font-medium text-[#7dd3fc]">
                  Capability Highlights
                </p>
                <h3 className="mt-2 text-2xl font-semibold text-[#f1f6ff]">
                  系统核心能力
                </h3>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-[#8aa0c6]">
                  围绕 Agent 协作、证据追踪和质量门控构建可信竞品分析链路。
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                <Pill label="核心能力展示" tone="info" />
                <button
                  aria-controls="home-capability-cards"
                  aria-expanded={capabilitiesExpanded}
                  className="rounded-full border border-[#38bdf8]/35 bg-[#38bdf8]/10 px-3 py-1.5 text-xs font-semibold text-[#7dd3fc] transition duration-200 hover:border-[#7dd3fc] hover:bg-[#38bdf8]/15 hover:shadow-[0_0_22px_rgba(56,189,248,0.18)]"
                  onClick={() =>
                    setCapabilitiesExpanded((isExpanded) => !isExpanded)
                  }
                  type="button"
                >
                  {capabilitiesExpanded ? "收起能力展示 ↑" : "展开能力展示 ↓"}
                </button>
              </div>
            </div>

            {!capabilitiesExpanded ? (
              <div className="rounded-2xl border border-[#38bdf8]/20 bg-[#0b1426]/55 px-4 py-3">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-sm font-semibold text-[#f1f6ff]">
                    系统核心能力
                  </p>
                  <p className="text-sm leading-6 text-[#9fb2d4]">
                    多 Agent 协作 · 证据可追溯 · 质量门控审查
                  </p>
                </div>
              </div>
            ) : null}

            <div
              className={`grid transition-all duration-300 ease-out ${
                capabilitiesExpanded
                  ? "mt-5 grid-rows-[1fr] opacity-100"
                  : "mt-0 grid-rows-[0fr] opacity-0"
              }`}
              id="home-capability-cards"
            >
              <div className="overflow-hidden">
                <div
                  className={`grid gap-4 transition duration-300 md:grid-cols-3 ${
                    capabilitiesExpanded
                      ? "translate-y-0 scale-100"
                      : "-translate-y-2 scale-[0.98]"
                  }`}
                >
                  {capabilityCards.map((card) => (
                    <button
                      key={card.key}
                      className={`group overflow-hidden rounded-2xl border bg-gradient-to-b ${card.tone} to-transparent ${card.border} bg-[#0b1426]/60 p-5 text-left transition duration-200 hover:-translate-y-1 hover:shadow-[0_16px_44px_rgba(56,189,248,0.18)]`}
                      onClick={() => onNavigate(card.key)}
                      type="button"
                    >
                      <p className="text-xs font-medium uppercase tracking-[0.18em] text-[#6f84a8]">
                        Capability
                      </p>
                      <h3 className="mt-2 text-base font-semibold text-[#f1f6ff]">
                        {card.title}
                      </h3>
                      <p className="mt-2 text-sm leading-6 text-[#9fb2d4]">
                        {card.desc}
                      </p>
                      <div className="grid grid-rows-[0fr] transition-all duration-300 group-hover:grid-rows-[1fr]">
                        <p className="overflow-hidden text-sm leading-6 text-[#7dd3fc]">
                          <span className="mt-2 block">{card.detail}</span>
                        </p>
                      </div>
                      <span className="mt-3 inline-block text-sm font-medium text-[#7dd3fc] transition group-hover:translate-x-1">
                        查看详情 →
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="mt-7 border-t border-[#ffffff14] pt-6">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="text-sm font-medium text-[#7dd3fc]">
                    Intelligence Mission Map
                  </p>
                  <h3 className="mt-2 text-xl font-semibold text-[#f1f6ff]">
                    分析作战雷达
                  </h3>
                  <p className="mt-2 max-w-3xl text-sm leading-6 text-[#8aa0c6]">
                    从任务配置到策略报告，系统沿情报链路逐步完成可追溯竞品分析。
                  </p>
                </div>
                <Pill label="AI 竞品情报中枢" tone="info" />
              </div>

              <div className="mt-5">
                <div className="mission-map relative min-h-[560px] rounded-3xl border border-[#38bdf8]/18 bg-[#07111f]/70 px-4 py-5 shadow-[inset_0_1px_0_rgba(125,211,252,0.08),0_22px_70px_rgba(2,6,23,0.34)] md:px-6 md:py-7">
                  <div className="mission-map-surface pointer-events-none absolute inset-0 overflow-hidden rounded-3xl">
                    <div className="welcome-grid absolute inset-0 opacity-25" />
                    <div className="mission-radar-rings" />
                    <div className="mission-orbit mission-orbit-a" />
                    <div className="mission-orbit mission-orbit-b" />
                    <div className="mission-scan-line" />
                    <div className="mission-glow mission-glow-left" />
                    <div className="mission-glow mission-glow-right" />
                  </div>

                  <div className="mission-core">
                    <span className="mission-core-pulse" />
                    <span className="text-[10px] font-semibold uppercase tracking-[0.26em] text-[#7dd3fc]">
                      AI Core
                    </span>
                    <span className="mt-1 text-lg font-semibold text-[#f8fbff]">
                      分析核心
                    </span>
                    <span className="mt-2 rounded-full border border-[#38bdf8]/30 bg-[#38bdf8]/10 px-3 py-1 text-[11px] font-semibold text-[#bae6fd]">
                      {missionCoreStatus}
                    </span>
                    <span className="mt-2 max-w-[150px] truncate text-xs text-[#8aa0c6]">
                      {displayTaskId ?? "等待任务"}
                    </span>
                  </div>

                  <div className="mission-node-layer">
                    {analysisFlowSteps.map((step, index) => {
                      const isPreviewActive = index === activeFlowIndex;
                      const isActive = isPreviewActive;
                      const hasPassedInPreview = index < activeFlowIndex;
                      const isComplete =
                        missionCompleted || hasPassedInPreview;
                      const output =
                        step.key === "product-compare"
                          ? displayTaskId ?? "待创建"
                          : step.output;

                      return (
                        <button
                          className={`mission-chip group ${step.positionClass} ${
                            isActive
                              ? "mission-chip-active"
                              : isComplete
                                ? "mission-chip-complete"
                                : "mission-chip-idle"
                          }`}
                          key={step.key}
                          onClick={() => onNavigate(step.key)}
                          title={`${step.label}：${step.desc}`}
                          type="button"
                        >
                          <span className="mission-chip-topline">
                            <span className="mission-chip-code">{step.code}</span>
                            <span className="mission-chip-state">
                              {isActive ? "扫描中" : isComplete ? "已完成" : "待命"}
                            </span>
                          </span>
                          <span className="mission-chip-title">{step.label}</span>
                          <span className="mission-chip-subtitle">
                            {step.subtitle}
                          </span>
                          {(isComplete || isActive) && !isActive ? (
                            <span className="mission-chip-check">✓</span>
                          ) : null}
                          {isActive ? <span className="mission-chip-beam" /> : null}

                          <span className="mission-chip-detail">
                            <span>
                              <strong>Input</strong>
                              {step.input}
                            </span>
                            <span>
                              <strong>Process</strong>
                              {step.process}
                            </span>
                            <span>
                              <strong>Output</strong>
                              {output}
                            </span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          </section>

          {isLoading ? <LoadingState label="正在加载分析场景..." /> : null}

          {!isLoading && error ? (
            <EmptyState
              title="分析场景加载失败"
              description={error}
              action={<Pill label="请确认系统服务已启动" tone="danger" />}
            />
          ) : null}

          {!isLoading && !error ? (
            <section className="rounded-2xl border border-[#ffffff14] bg-[#0a1326]/55 p-5 backdrop-blur-sm md:p-6">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <p className="text-sm font-medium text-[#7dd3fc]">分析场景选择</p>
                  <h3 className="mt-2 text-2xl font-semibold text-[#f1f6ff]">
                    电竞品类选择
                  </h3>
                  <p className="mt-2 max-w-3xl text-sm leading-6 text-[#8aa0c6]">
                    当前正式开放电竞鼠标专业分析，使用最新的 GamingMouseFinalReportSchema。
                  </p>
                </div>
                <Pill
                  label={canEnterConfig ? "当前可分析" : "规划中"}
                  tone={canEnterConfig ? "success" : "warning"}
                />
              </div>

              {/* 环形悬浮品类选择器：方框产品卡，可旋转、悬停浮起、点击选中。 */}
              <div className="mt-6 rounded-2xl border border-[#ffffff14] bg-[#070f1f]/55 px-2 py-4 md:px-4">
                <ProductOrbit
                  activeKey={categoryValue}
                  canEnter={canEnterConfig}
                  modes={orbitModes}
                  onEnter={handleEnterConfig}
                  onSelect={handleCategoryChange}
                />
              </div>

            </section>
          ) : null}
        </div>
      </div>
    </section>
  );
}
