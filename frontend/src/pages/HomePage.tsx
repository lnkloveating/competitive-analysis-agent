import { useEffect, useState } from "react";
import { analysisApi } from "../api/analysisApi";
import { EmptyState } from "../components/common/EmptyState";
import { LoadingState } from "../components/common/LoadingState";
import { StatusBadge } from "../components/common/StatusBadge";
import type { Industry } from "../types/analysis";

type HomeSelection = {
  selectedDomain?: string | null;
  selectedCategory?: string | null;
  selectedIndustryKey?: string | null;
};

type HomePageProps = {
  taskId?: string;
  selectedDomain?: string | null;
  selectedCategory?: string | null;
  selectedIndustryKey?: string | null;
  onNavigate: (key: string) => void;
  onSelectionChange: (selection: HomeSelection) => void;
};

type DomainCard = {
  key: string;
  title: string;
  subtitle: string;
  available: boolean;
};

type CategoryCard = {
  key: string;
  title: string;
  subtitle: string;
  industryKey?: string;
};

const domains: DomainCard[] = [
  {
    key: "gaming_peripherals",
    title: "电竞外设",
    subtitle: "鼠标、键盘、耳机与桌面输入设备",
    available: true,
  },
  {
    key: "mobile",
    title: "手机",
    subtitle: "旗舰机、折叠屏与移动生态",
    available: false,
  },
  {
    key: "audio",
    title: "音频设备",
    subtitle: "耳机、音箱与内容创作音频",
    available: false,
  },
  {
    key: "camera",
    title: "摄影器材",
    subtitle: "相机、镜头与影像工作流",
    available: false,
  },
];

const categories: CategoryCard[] = [
  {
    key: "gaming_mouse",
    title: "电竞鼠标",
    subtitle: "当前开放 Demo",
    industryKey: "gaming_mouse",
  },
  {
    key: "gaming_keyboard",
    title: "电竞键盘",
    subtitle: "轴体、配列与低延迟输入",
  },
  {
    key: "gaming_headset",
    title: "电竞耳机",
    subtitle: "空间音频、麦克风与舒适度",
  },
  {
    key: "mouse_pad",
    title: "鼠标垫",
    subtitle: "材质、阻尼与定位稳定性",
  },
  {
    key: "microphone",
    title: "麦克风",
    subtitle: "直播、会议与降噪表现",
  },
];

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
          typeof item.name === "string" ? item.name : key || "Unknown industry",
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

export function HomePage({
  taskId,
  selectedDomain,
  selectedCategory,
  selectedIndustryKey,
  onNavigate,
  onSelectionChange,
}: HomePageProps) {
  const [industries, setIndustries] = useState<Industry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let ignore = false;

    analysisApi
      .getIndustries()
      .then((payload) => {
        if (!ignore) {
          setIndustries(normalizeIndustries(payload));
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

  const gamingMouse = industries.find((industry) => {
    return (industry.industry_key || industry.key) === "gaming_mouse";
  });
  const hasGamingMouse = Boolean(gamingMouse);
  const representativeProducts = flattenRepresentativeProducts(gamingMouse);
  const hasPreview = selectedCategory === "gaming_mouse" && hasGamingMouse;

  function handleDomainClick(domain: DomainCard) {
    if (!domain.available) {
      setNotice(`${domain.title} Coming Soon`);
      return;
    }

    setNotice(null);
    onSelectionChange({
      selectedDomain: domain.key,
      selectedCategory: null,
      selectedIndustryKey: null,
    });
  }

  function handleCategoryClick(category: CategoryCard) {
    if (category.key !== "gaming_mouse") {
      setNotice(`${category.title} Coming Soon`);
      return;
    }

    if (!hasGamingMouse) {
      setNotice("gaming_mouse Backend Not Ready");
      return;
    }

    setNotice(null);
    onSelectionChange({
      selectedCategory: category.key,
      selectedIndustryKey: category.industryKey,
    });
  }

  function handleStartDemo() {
    onSelectionChange({
      selectedDomain: "gaming_peripherals",
      selectedCategory: "gaming_mouse",
      selectedIndustryKey: "gaming_mouse",
    });
    onNavigate("new-analysis");
  }

  return (
    <section className="mx-auto max-w-7xl">
      <div className="relative overflow-hidden rounded-lg border border-cyan-300/20 bg-slate-950 px-6 py-8 shadow-[0_0_36px_rgba(34,211,238,0.08)] md:px-8">
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-cyan-300 to-transparent" />
        <div className="max-w-4xl">
          <p className="text-sm font-semibold text-cyan-300">
            AI Competitive Analysis Agent Workspace
          </p>
          <h2 className="mt-3 text-3xl font-semibold text-white md:text-4xl">
            AI 驱动的竞品分析 Agent 工作台
          </h2>
          <p className="mt-4 max-w-3xl text-sm leading-7 text-slate-300 md:text-base">
            从公开信息到结构化竞品报告，多 Agent 自动完成调研、证据抽取、产品分析、商业分析、风险识别、质量审查与报告生成。
          </p>
        </div>
        <div className="mt-6 flex flex-wrap gap-2">
          <StatusBadge
            label={isLoading ? "Checking backend" : "/api/industries loaded"}
            tone={isLoading ? "warning" : error ? "danger" : "success"}
          />
          <StatusBadge
            label={
              hasGamingMouse
                ? "gaming_mouse Available"
                : "gaming_mouse Backend Not Ready"
            }
            tone={hasGamingMouse ? "success" : "danger"}
          />
          <StatusBadge
            label={taskId ? `Task ${taskId}` : "No active task"}
            tone={taskId ? "info" : "neutral"}
          />
        </div>
      </div>

      <div className="mt-6">
        {isLoading ? (
          <LoadingState label="Loading backend industry configuration..." />
        ) : null}

        {!isLoading && error ? (
          <EmptyState
            title="Backend industries unavailable"
            description={error}
            action={<StatusBadge label="FastAPI not reachable" tone="danger" />}
          />
        ) : null}
      </div>

      {!isLoading && !error ? (
        <>
          <section className="mt-8">
            <div className="mb-4 flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-cyan-300">Step 1</p>
                <h3 className="mt-1 text-xl font-semibold text-white">
                  选择行业大类
                </h3>
              </div>
              {notice ? <StatusBadge label={notice} tone="warning" /> : null}
            </div>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {domains.map((domain) => {
                const isSelected = selectedDomain === domain.key;

                return (
                  <button
                    className={`group min-h-40 rounded-lg border p-5 text-left transition duration-300 hover:-translate-y-1 ${
                      isSelected
                        ? "border-cyan-300 bg-cyan-300/10 shadow-[0_0_30px_rgba(34,211,238,0.2)]"
                        : domain.available
                          ? "border-slate-700 bg-slate-900/65 hover:border-cyan-300/70 hover:bg-slate-900"
                          : "border-slate-800 bg-slate-900/25 opacity-55"
                    }`}
                    key={domain.key}
                    onClick={() => handleDomainClick(domain)}
                    type="button"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-lg font-semibold text-white">
                          {domain.title}
                        </p>
                        <p className="mt-2 text-sm leading-6 text-slate-400">
                          {domain.subtitle}
                        </p>
                      </div>
                      <StatusBadge
                        label={domain.available ? "Available" : "Coming Soon"}
                        tone={domain.available ? "success" : "warning"}
                      />
                    </div>
                  </button>
                );
              })}
            </div>
          </section>

          {selectedDomain === "gaming_peripherals" ? (
            <section className="mt-8 animate-[fadeIn_0.3s_ease-out]">
              <div className="mb-4">
                <p className="text-sm font-medium text-cyan-300">Step 2</p>
                <h3 className="mt-1 text-xl font-semibold text-white">
                  选择外设品类
                </h3>
              </div>

              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
                {categories.map((category, index) => {
                  const isMouse = category.key === "gaming_mouse";
                  const isSelected = selectedCategory === category.key;
                  const statusLabel = isMouse
                    ? hasGamingMouse
                      ? "Available"
                      : "Backend Not Ready"
                    : "Coming Soon";

                  return (
                    <button
                      className={`min-h-36 rounded-lg border p-4 text-left transition duration-300 hover:-translate-y-1 ${
                        isMouse && hasGamingMouse
                          ? "border-cyan-300 bg-cyan-300/10 shadow-[0_0_34px_rgba(34,211,238,0.22)] hover:shadow-[0_0_44px_rgba(34,211,238,0.35)]"
                          : "border-slate-800 bg-slate-900/30 opacity-60"
                      } ${isSelected ? "ring-2 ring-cyan-200/70" : ""}`}
                      key={category.key}
                      onClick={() => handleCategoryClick(category)}
                      style={{
                        transitionDelay: `${index * 45}ms`,
                      }}
                      type="button"
                    >
                      <div className="flex h-full flex-col justify-between gap-4">
                        <div>
                          <p className="text-base font-semibold text-white">
                            {category.title}
                          </p>
                          <p className="mt-2 text-sm leading-6 text-slate-400">
                            {category.subtitle}
                          </p>
                        </div>
                        <StatusBadge
                          label={statusLabel}
                          tone={
                            isMouse && hasGamingMouse
                              ? "success"
                              : isMouse
                                ? "danger"
                                : "warning"
                          }
                        />
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>
          ) : null}

          {hasPreview ? (
            <section className="mt-8 rounded-lg border border-cyan-300/30 bg-slate-950/80 p-6 shadow-[0_0_42px_rgba(34,211,238,0.18)]">
              <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                <div>
                  <p className="text-sm font-medium text-cyan-300">Step 3</p>
                  <h3 className="mt-1 text-2xl font-semibold text-white">
                    电竞鼠标 Demo Preview
                  </h3>
                  <p className="mt-3 text-sm text-slate-300">
                    当前 Demo：{(gamingMouse?.competitors || []).join(" vs ")}
                  </p>
                </div>
                <StatusBadge
                  label={selectedIndustryKey || "gaming_mouse"}
                  tone="info"
                />
              </div>

              <div className="mt-6 grid gap-6 lg:grid-cols-2">
                <div>
                  <p className="mb-3 text-sm font-semibold text-slate-200">
                    代表型号
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {representativeProducts.length > 0 ? (
                      representativeProducts.map((product) => (
                        <span
                          className="rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-200"
                          key={product}
                        >
                          {product}
                        </span>
                      ))
                    ) : (
                      <StatusBadge label="No product data" tone="warning" />
                    )}
                  </div>
                </div>

                <div>
                  <p className="mb-3 text-sm font-semibold text-slate-200">
                    分析维度
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {(gamingMouse?.dimensions || []).length > 0 ? (
                      gamingMouse?.dimensions.map((dimension) => (
                        <span
                          className="rounded-md border border-cyan-300/25 bg-cyan-300/10 px-3 py-2 text-sm text-cyan-100"
                          key={dimension}
                        >
                          {dimension}
                        </span>
                      ))
                    ) : (
                      <StatusBadge label="No dimensions returned" tone="warning" />
                    )}
                  </div>
                </div>
              </div>

              <div className="mt-7">
                <button
                  className="animate-pulse rounded-md bg-cyan-300 px-5 py-3 text-sm font-semibold text-slate-950 shadow-[0_0_28px_rgba(34,211,238,0.35)] transition hover:bg-cyan-200"
                  onClick={handleStartDemo}
                  type="button"
                >
                  Start Gaming Mouse Demo
                </button>
              </div>
            </section>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
