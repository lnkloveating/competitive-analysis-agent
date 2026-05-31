import { useEffect, useMemo, useState } from "react";
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

const categories: SelectOption[] = [
  {
    key: "gaming_mouse",
    label: "电竞鼠标",
    description: "当前可分析场景：电竞鼠标",
    available: true,
  },
  {
    key: "gaming_keyboard",
    label: "电竞键盘",
    description: "轴体、配列与低延迟输入",
    available: false,
  },
  {
    key: "gaming_headset",
    label: "电竞耳机",
    description: "空间音频、麦克风与舒适度",
    available: false,
  },
  {
    key: "mouse_pad",
    label: "鼠标垫",
    description: "材质、阻尼与定位稳定性",
    available: false,
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
  const [searchQuery, setSearchQuery] = useState("");

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

  const industryValue = selectedDomain ?? "gaming_peripherals";
  const categoryValue = selectedCategory ?? "gaming_mouse";
  const selectedIndustry =
    industries.find((industry) => industry.key === industryValue) ?? industries[0];
  const selectedCategoryOption =
    categories.find((category) => category.key === categoryValue) ?? categories[0];
  const gamingMouse = backendIndustries.find((industry) => {
    return (industry.industry_key || industry.key) === "gaming_mouse";
  });
  const hasGamingMouse = Boolean(gamingMouse);
  const representativeProducts = flattenRepresentativeProducts(gamingMouse);
  const canEnterConfig =
    selectedIndustry.key === "gaming_peripherals" &&
    selectedCategoryOption.key === "gaming_mouse" &&
    hasGamingMouse;

  const filteredCategories = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    if (!query) {
      return categories;
    }

    return categories.filter((category) => {
      return `${category.label} ${category.description} ${category.key}`
        .toLowerCase()
        .includes(query);
    });
  }, [searchQuery]);

  function handleIndustryChange(nextIndustry: string) {
    const industry = industries.find((item) => item.key === nextIndustry);
    onSelectionChange({
      selectedDomain: nextIndustry,
      selectedCategory:
        industry?.key === "gaming_peripherals" ? categoryValue : null,
      selectedIndustryKey:
        industry?.key === "gaming_peripherals" && categoryValue === "gaming_mouse"
          ? "gaming_mouse"
          : null,
    });
  }

  function handleCategoryChange(nextCategory: string) {
    onSelectionChange({
      selectedDomain: "gaming_peripherals",
      selectedCategory: nextCategory,
      selectedIndustryKey: nextCategory === "gaming_mouse" ? "gaming_mouse" : null,
    });
  }

  function handleEnterConfig() {
    onSelectionChange({
      selectedDomain: "gaming_peripherals",
      selectedCategory: "gaming_mouse",
      selectedIndustryKey: "gaming_mouse",
    });
    onNavigate("new-analysis");
  }

  return (
    <section className="mx-auto max-w-[1280px] space-y-6">
      <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-slate-950/70 px-6 py-8 shadow-[0_24px_80px_rgba(2,6,23,0.32)] md:px-8">
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-cyan-300/70 to-transparent" />
        <div className="max-w-4xl">
          <p className="text-sm font-semibold text-cyan-300">
            Multi-Agent Competitive Intelligence
          </p>
          <h2 className="mt-3 text-3xl font-semibold tracking-normal text-white md:text-4xl">
            AI 竞品分析 Agent 控制台
          </h2>
          <p className="mt-4 max-w-3xl text-sm leading-7 text-slate-300 md:text-base">
            从公开信息到可追溯竞品报告的多 Agent 自动化分析平台，覆盖调研、证据抽取、结论追踪、质量审查与报告生成。
          </p>
        </div>
        <div className="mt-6 flex flex-wrap gap-2">
          <StatusBadge
            label={isLoading ? "正在读取分析场景" : "/api/industries 已连接"}
            tone={isLoading ? "warning" : error ? "danger" : "success"}
          />
          <StatusBadge
            label={hasGamingMouse ? "电竞鼠标可分析" : "电竞鼠标服务未就绪"}
            tone={hasGamingMouse ? "success" : "warning"}
          />
          <StatusBadge
            label={displayTaskId ? `当前任务：${displayTaskId}` : "暂无任务"}
            tone={taskId ? "info" : "neutral"}
          />
        </div>
      </div>

      {isLoading ? <LoadingState label="正在加载分析场景..." /> : null}

      {!isLoading && error ? (
        <EmptyState
          title="分析场景加载失败"
          description={error}
          action={<StatusBadge label="请确认 FastAPI 服务已启动" tone="danger" />}
        />
      ) : null}

      {!isLoading && !error ? (
        <section className="rounded-2xl border border-white/10 bg-slate-950/65 p-5 shadow-[0_24px_70px_rgba(2,6,23,0.26)] md:p-6">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-sm font-medium text-cyan-300">分析场景选择</p>
              <h3 className="mt-2 text-2xl font-semibold text-white">
                选择行业、品类与可用分析范围
              </h3>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
                当前正式开放电竞外设下的电竞鼠标分析，其它方向保留在规划中，后续可扩展为更多行业和品类。
              </p>
            </div>
            <StatusBadge
              label={canEnterConfig ? "当前可分析" : "规划中"}
              tone={canEnterConfig ? "success" : "warning"}
            />
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(220px,0.8fr)_minmax(220px,0.8fr)]">
            <label className="block min-w-0">
              <span className="text-xs font-medium uppercase tracking-[0.16em] text-slate-500">
                搜索
              </span>
              <input
                className="mt-2 w-full rounded-lg border border-white/10 bg-slate-950/80 px-4 py-3 text-sm text-slate-100 outline-none transition focus:border-cyan-300/70"
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="搜索行业、品类或竞品，例如：电竞鼠标、手机、耳机"
                value={searchQuery}
              />
            </label>

            <label className="block min-w-0">
              <span className="text-xs font-medium uppercase tracking-[0.16em] text-slate-500">
                行业
              </span>
              <select
                className="mt-2 w-full rounded-lg border border-white/10 bg-slate-950/80 px-4 py-3 text-sm text-slate-100 outline-none transition focus:border-cyan-300/70"
                onChange={(event) => handleIndustryChange(event.target.value)}
                value={industryValue}
              >
                {industries.map((industry) => (
                  <option key={industry.key} value={industry.key}>
                    {industry.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="block min-w-0">
              <span className="text-xs font-medium uppercase tracking-[0.16em] text-slate-500">
                品类
              </span>
              <select
                className="mt-2 w-full rounded-lg border border-white/10 bg-slate-950/80 px-4 py-3 text-sm text-slate-100 outline-none transition focus:border-cyan-300/70"
                onChange={(event) => handleCategoryChange(event.target.value)}
                value={categoryValue}
              >
                {categories.map((category) => (
                  <option key={category.key} value={category.key}>
                    {category.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
            <div className="min-w-0 rounded-xl border border-white/10 bg-slate-900/45 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-white">
                    {selectedIndustry.label} / {selectedCategoryOption.label}
                  </p>
                  <p className="mt-1 text-sm leading-6 text-slate-400">
                    {selectedCategoryOption.description}
                  </p>
                </div>
                <StatusBadge
                  label={canEnterConfig ? "可分析" : "规划中"}
                  tone={canEnterConfig ? "success" : "warning"}
                />
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <div className="rounded-lg border border-white/10 bg-slate-950/60 p-3">
                  <p className="text-xs uppercase tracking-[0.16em] text-slate-500">
                  竞品范围
                </p>
                <p className="mt-2 text-sm text-slate-200">
                    {canEnterConfig
                      ? (gamingMouse?.competitors || ["罗技", "雷蛇", "海盗船"]).join("、")
                      : "暂未开放"}
                </p>
              </div>
              <div className="rounded-lg border border-white/10 bg-slate-950/60 p-3">
                  <p className="text-xs uppercase tracking-[0.16em] text-slate-500">
                    分析场景
                </p>
                <p className="mt-2 text-sm font-medium text-cyan-700">
                    {canEnterConfig ? selectedIndustryKey || "gaming_mouse" : "暂未开放"}
                </p>
              </div>
            </div>

              <div className="mt-4">
                <p className="mb-3 text-sm font-semibold text-slate-200">
                  代表型号
                </p>
                <div className="flex flex-wrap gap-2">
                  {canEnterConfig && representativeProducts.length > 0 ? (
                    representativeProducts.slice(0, 8).map((product) => (
                      <span
                        className="rounded-lg border border-white/10 bg-slate-950/70 px-3 py-2 text-sm text-slate-200"
                        key={product}
                      >
                        {product}
                      </span>
                    ))
                  ) : (
                    <span className="text-sm text-slate-500">
                      {canEnterConfig ? "系统暂未返回代表型号" : "该品类仍在规划中"}
                    </span>
                  )}
                </div>
              </div>
            </div>

            <aside className="rounded-xl border border-white/10 bg-slate-900/35 p-4">
              <p className="text-sm font-semibold text-white">场景状态</p>
              <div className="mt-4 space-y-3">
                {filteredCategories.map((category) => (
                  <button
                    className={`w-full rounded-lg border px-3 py-3 text-left transition hover:border-cyan-300/50 ${
                      category.key === categoryValue
                        ? "border-cyan-300/50 bg-cyan-300/10"
                        : "border-white/10 bg-slate-950/45"
                    }`}
                    key={category.key}
                    onClick={() => handleCategoryChange(category.key)}
                    type="button"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-sm font-medium text-slate-100">
                        {category.label}
                      </span>
                      <StatusBadge
                        label={category.available && hasGamingMouse ? "可分析" : "规划中"}
                        tone={category.available && hasGamingMouse ? "success" : "warning"}
                      />
                    </div>
                  </button>
                ))}
              </div>
            </aside>
          </div>

          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-slate-400">
              进入配置后将使用现有系统接口创建任务，不会改变请求路径或任务存储方式。
            </p>
            <button
              className="rounded-lg bg-cyan-300 px-5 py-3 text-sm font-semibold text-slate-950 shadow-[0_0_28px_rgba(34,211,238,0.24)] transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400 disabled:shadow-none"
              disabled={!canEnterConfig}
              onClick={handleEnterConfig}
              type="button"
            >
              进入分析配置
            </button>
          </div>
        </section>
      ) : null}
    </section>
  );
}
