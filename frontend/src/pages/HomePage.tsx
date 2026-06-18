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
  demoStatusLabel?: string;
  currentDemoKey?: string;
  visitedKeys?: Set<string>;
};

type SelectOption = {
  key: string;
  label: string;
  description: string;
  available: boolean;
};

const industries: SelectOption[] = [
  {
    key: "gaming_peripherals",
    label: "电竞外设",
    description: "鼠标、键盘、耳机与桌面输入设备",
    available: true,
  },
  {
    key: "consumer_electronics",
    label: "消费电子",
    description: "手机、平板、智能穿戴与移动生态",
    available: false,
  },
  {
    key: "audio_devices",
    label: "音频设备",
    description: "耳机、音箱与内容创作音频",
    available: false,
  },
  {
    key: "camera_gear",
    label: "摄影器材",
    description: "相机、镜头与影像工作流",
    available: false,
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
      {
        key: "gaming_keyboard",
        label: "电竞键盘",
        description: "轴体、配列、热插拔与低延迟输入",
        available: true,
        glyph: "keyboard",
      },
      {
        key: "gaming_headset",
        label: "头戴式耳机",
        description: "空间音频、麦克风与佩戴舒适度",
        available: true,
        glyph: "headset",
      },
    ],
  },
];

const allProducts: OrbitProductDef[] = orbitModes.flatMap((mode) => mode.items);
const runnableProductKeys = new Set([
  "gaming_mouse",
  "gaming_keyboard",
  "gaming_headset",
]);

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

function flattenRepresentativeProducts(industry?: Industry) {
  return Object.values(industry?.representative_products || {}).flat();
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
    desc: "调研、证据、产品、商业、校验、风险、质检与策略 Agent 联动执行。",
    detail: "8 个 Agent 按 DAG 顺序协作，可在 Agent 工作流查看执行路径。",
    tone: "from-[#22d3ee]/20",
    border: "border-[#38bdf8]/30",
  },
  {
    key: "evidence",
    title: "证据可追溯",
    desc: "每条结论都绑定 Evidence ID 和 Claim ID，支持来源回溯。",
    detail: "在证据中心与结论追踪中可双向回溯 Evidence 与 Claim。",
    tone: "from-[#34d399]/20",
    border: "border-[#34d399]/30",
  },
  {
    key: "quality",
    title: "质量门控审查",
    desc: "VerificationAgent 与 QualityAgent 联合检查证据支撑、覆盖率和风险水位。",
    detail: "未通过自动打回重试，达到上限则转入人工审核并生成 ReviewTicket。",
    tone: "from-[#818cf8]/20",
    border: "border-[#818cf8]/30",
  },
];

const analysisFlowSteps = [
  {
    key: "product-compare",
    code: "01",
    label: "产品对比",
    subtitle: "PRODUCT ENTRY",
    desc: "搜索两款电竞鼠标，先完成硬件规格对比，再启动 Agent 分析任务。",
    input: "产品 A / 产品 B",
    process: "规格事实库对比 + 任务创建",
    output: "规格对比 / TASK-001",
    positionClass: "mission-node-1",
  },
  {
    key: "workflow",
    code: "02",
    label: "Agent 工作流",
    subtitle: "AGENT DAG",
    desc: "展示 Research、Evidence、Product、Business、Verification、Risk、Quality、Strategy 多 Agent 协作过程。",
    input: "任务配置",
    process: "8 个 Agent 协同执行",
    output: "执行记录 Trace",
    positionClass: "mission-node-2",
  },
  {
    key: "evidence",
    code: "03",
    label: "证据中心",
    subtitle: "EVIDENCE LEDGER",
    desc: "查看 Evidence 列表、来源类型、可信度和证据详情。",
    input: "公开调研资料",
    process: "EvidenceAgent 抽取证据",
    output: "Evidence ID + 可信度 + 来源链接",
    positionClass: "mission-node-3",
  },
  {
    key: "claims",
    code: "04",
    label: "结论追踪",
    subtitle: "CLAIM TRACE",
    desc: "查看 Evidence 如何支撑 Product Claim 和 Business Claim。",
    input: "Evidence",
    process: "生成 Product Claim 与 Business Claim",
    output: "Claim Graph",
    positionClass: "mission-node-4",
  },
  {
    key: "verification",
    navigateKey: "quality",
    code: "05",
    label: "忠实校验",
    subtitle: "FAITHFULNESS",
    desc: "校验每条结论和矩阵数字能否被引用证据支撑，抑制幻觉。",
    input: "Evidence + Claims + Matrix",
    process: "VerificationAgent 校验证据支撑关系",
    output: "Faithfulness Report / Matrix Issues",
    positionClass: "mission-node-5",
  },
  {
    key: "quality",
    code: "06",
    label: "质量审查",
    subtitle: "QUALITY GATE",
    desc: "检查证据完整性、维度覆盖率、风险水位和是否需要打回重试或人工审核。",
    input: "Faithfulness + Evidence + Claims + Risk",
    process: "QualityAgent 检查覆盖率、证据完整性和风险水位",
    output: "Approved / Retry / Human Review",
    positionClass: "mission-node-6",
  },
  {
    key: "report",
    code: "07",
    label: "最终报告",
    subtitle: "STRATEGY REPORT",
    desc: "展示通过质量门控后的竞品策略报告和引用追踪。",
    input: "通过质量门控的 Claim",
    process: "StrategyAgent 生成策略建议",
    output: "可追溯竞品策略报告",
    positionClass: "mission-node-7",
  },
  {
    key: "metrics",
    code: "08",
    label: "指标看板",
    subtitle: "METRICS",
    desc: "展示证据数量、结论数量、报告可信度、引用率、上下文裁剪和错误恢复等指标。",
    input: "全流程结果",
    process: "统计证据、结论、质量和引用指标",
    output: "Citation / Coverage / Faithfulness / Recovery",
    positionClass: "mission-node-8",
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
  demoStatusLabel,
  currentDemoKey,
  visitedKeys,
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
    if (currentDemoKey) {
      return;
    }

    const timerId = window.setInterval(() => {
      setPreviewFlowIndex((current) => (current + 1) % analysisFlowSteps.length);
    }, 1800);

    return () => window.clearInterval(timerId);
  }, [currentDemoKey]);

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

  const industryValue = selectedDomain ?? "gaming_peripherals";
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
  const representativeProducts = flattenRepresentativeProducts(selectedBackendIndustry);
  const connectedRunnableCount = backendIndustries.filter((industry) =>
    getRunnableIndustryKey(industry.industry_key || industry.key || ""),
  ).length;
  const canEnterConfig =
    selectedIndustry.key === "gaming_peripherals" &&
    selectedCategoryOption.available &&
    Boolean(getRunnableIndustryKey(selectedCategoryOption.key)) &&
    hasSelectedBackendIndustry;

  const demoFlowIndex = analysisFlowSteps.findIndex(
    (step) => step.key === currentDemoKey,
  );
  const activeFlowIndex =
    demoFlowIndex >= 0 ? demoFlowIndex : previewFlowIndex % analysisFlowSteps.length;
  const missionCompleted = Boolean(taskId && taskStatus === "completed");
  const missionCoreStatus = !taskId
    ? "READY"
    : missionCompleted
      ? "COMPLETE"
      : "RUNNING";

  function handleCategoryChange(nextCategory: string) {
    onSelectionChange({
      selectedDomain: "gaming_peripherals",
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
      selectedDomain: "gaming_peripherals",
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
                多 Agent 协同完成公开调研、证据抽取、结论追踪、质量审查与策略报告生成。
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
                {demoStatusLabel ? (
                  <Pill label={`自动演示：${demoStatusLabel}`} tone="neutral" />
                ) : null}
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
                      const isCurrent = currentDemoKey === step.key;
                      const isVisited = visitedKeys?.has(step.key) ?? false;
                      const isPreviewActive = index === activeFlowIndex;
                      const isActive = isCurrent || isPreviewActive;
                      const hasPassedInPreview = index < activeFlowIndex;
                      const isComplete =
                        missionCompleted || isVisited || hasPassedInPreview;
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
                          onClick={() => onNavigate(step.navigateKey ?? step.key)}
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
                    点击环形卡片选择品类。当前正式开放电竞鼠标、电竞键盘与头戴式耳机分析。
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

              <div className="mt-6">
                <div className="min-w-0 rounded-xl border border-[#ffffff14] bg-[#0b1226]/55 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-[#f1f6ff]">
                        {selectedMode.label} / {selectedCategoryOption.label}
                      </p>
                      <p className="mt-1 text-sm leading-6 text-[#8aa0c6]">
                        {selectedCategoryOption.description}
                      </p>
                    </div>
                    <Pill
                      label={canEnterConfig ? "可分析" : "规划中"}
                      tone={canEnterConfig ? "success" : "warning"}
                    />
                  </div>

                  <div className="mt-4 grid gap-3 md:grid-cols-2">
                    <div className="rounded-lg border border-[#ffffff14] bg-[#0a1326]/60 p-3">
                      <p className="text-xs uppercase tracking-[0.16em] text-[#6f84a8]">
                        竞品范围
                      </p>
                      <p className="mt-2 text-sm text-[#cdd9f0]">
                        {canEnterConfig
                          ? (selectedBackendIndustry?.competitors || []).join("、")
                          : "暂未开放"}
                      </p>
                    </div>
                    <div className="rounded-lg border border-[#ffffff14] bg-[#0a1326]/60 p-3">
                      <p className="text-xs uppercase tracking-[0.16em] text-[#6f84a8]">
                        分析场景
                      </p>
                      <p className="mt-2 text-sm font-medium text-[#7dd3fc]">
                        {canEnterConfig
                          ? selectedIndustryKey || selectedCategoryOption.key
                          : "暂未开放"}
                      </p>
                    </div>
                  </div>

                  <div className="mt-4">
                    <p className="mb-3 text-sm font-semibold text-[#cdd9f0]">
                      代表型号
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {canEnterConfig && representativeProducts.length > 0 ? (
                        representativeProducts.slice(0, 8).map((product) => (
                          <span
                            className="rounded-lg border border-[#ffffff1a] bg-[#0a1326]/70 px-3 py-2 text-sm text-[#cdd9f0]"
                            key={product}
                          >
                            {product}
                          </span>
                        ))
                      ) : (
                        <span className="text-sm text-[#6f84a8]">
                          {canEnterConfig ? "系统暂未返回代表型号" : "该品类仍在规划中"}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>

            </section>
          ) : null}
        </div>
      </div>
    </section>
  );
}
