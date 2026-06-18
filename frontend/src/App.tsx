import { useEffect, useRef, useState } from "react";
import { AppLayout } from "./components/layout/AppLayout";
import type { NavItem } from "./components/layout/Sidebar";
import { demoSteps } from "./utils/demoSteps";
import { ClaimsPage } from "./pages/ClaimsPage";
import { EvidencePage } from "./pages/EvidencePage";
import { HomePage } from "./pages/HomePage";
import { MetricsPage } from "./pages/MetricsPage";
import { ProductComparePage } from "./pages/ProductComparePage";
import { QualityPage } from "./pages/QualityPage";
import { ReportPage } from "./pages/ReportPage";
import { WelcomePage } from "./pages/WelcomePage";
import { WorkflowPage } from "./pages/WorkflowPage";
import { getDisplayTaskId } from "./utils/taskDisplay";
import { analysisApi } from "./api/analysisApi";
import type { AuthUser } from "./api/authApi";

const AUTH_TOKEN_KEY = "authToken";
const CURRENT_USER_KEY = "currentUser";

function getStoredToken(): string | null {
  if (typeof window === "undefined") {
    return null;
  }

  return window.sessionStorage.getItem(AUTH_TOKEN_KEY);
}

function getStoredUser(): AuthUser | null {
  if (typeof window === "undefined") {
    return null;
  }

  const raw = window.sessionStorage.getItem(CURRENT_USER_KEY);
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as AuthUser;
  } catch {
    return null;
  }
}

type PageKey =
  | "overview"
  | "product-compare"
  | "workflow"
  | "evidence"
  | "claims"
  | "quality"
  | "report"
  | "metrics";

const navItems: Array<NavItem & { key: PageKey }> = [
  { key: "overview", label: "总览" },
  { key: "product-compare", label: "产品对比" },
  { key: "workflow", label: "Agent 工作流" },
  { key: "evidence", label: "证据中心" },
  { key: "claims", label: "结论追踪" },
  { key: "quality", label: "质量审查" },
  { key: "report", label: "最终报告" },
  { key: "metrics", label: "指标看板" },
];

// 分析结果阶段的页面：合并成一条连续滚动视图，侧栏作为锚点导航。
const RESULT_KEYS = [
  "workflow",
  "evidence",
  "claims",
  "quality",
  "report",
  "metrics",
] as const;

function isResultKey(key: string): key is (typeof RESULT_KEYS)[number] {
  return (RESULT_KEYS as readonly string[]).includes(key);
}

// 滚动到结果视图中的某个 section（平滑动画由 #app-main 的 CSS scroll-behavior 提供）。
function scrollMainToSection(key: string) {
  const main = document.getElementById("app-main");
  const element = document.getElementById(`sec-${key}`);
  if (!main || !element) {
    return;
  }
  const target =
    main.scrollTop +
    (element.getBoundingClientRect().top - main.getBoundingClientRect().top) -
    8;
  main.scrollTop = Math.max(0, target);
}

function isPageKey(key: string): key is PageKey {
  return navItems.some((item) => item.key === key);
}

function getPageKeyFromHash(): PageKey {
  if (typeof window === "undefined") {
    return "overview";
  }

  const pageKey = window.location.hash.replace(/^#\/?/, "");
  if (pageKey === "new-analysis") {
    return "product-compare";
  }
  return isPageKey(pageKey) ? pageKey : "overview";
}

function getStoredTaskId(): string | null {
  if (typeof window === "undefined") {
    return null;
  }

  return window.sessionStorage.getItem("activeTaskId");
}

export default function App() {
  const [authToken, setAuthToken] = useState<string | null>(getStoredToken);
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(getStoredUser);
  const [activePage, setActivePage] = useState<PageKey>(getPageKeyFromHash);
  // 点击侧栏进入结果视图后，待滚动到的目标 section。
  const [pendingScrollKey, setPendingScrollKey] = useState<string | null>(null);
  const activePageRef = useRef(activePage);
  activePageRef.current = activePage;
  const [taskId, setTaskId] = useState<string | null>(getStoredTaskId);
  const [displayTaskId, setDisplayTaskId] = useState<string | null>(() =>
    getDisplayTaskId(getStoredTaskId()),
  );
  // 旧任务失效提示（后端重启 / task 过期后 /api/analysis/{id} 返回 404）。
  const [staleTaskNotice, setStaleTaskNotice] = useState(false);
  const [selectedDomain, setSelectedDomain] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedIndustryKey, setSelectedIndustryKey] = useState<string | null>(
    null,
  );

  const [demoRunning, setDemoRunning] = useState(false);
  const [demoPaused, setDemoPaused] = useState(false);
  const [demoStepIndex, setDemoStepIndex] = useState(0);
  const [visitedKeys, setVisitedKeys] = useState<Set<string>>(new Set());

  function markVisited(key: string) {
    setVisitedKeys((current) => {
      if (current.has(key)) {
        return current;
      }
      const next = new Set(current);
      next.add(key);
      return next;
    });
  }

  // 仅供自动演示内部使用的导航：切换页面但不暂停演示。
  function goToDemoPage(key: PageKey) {
    setActivePage(key);
    if (typeof window !== "undefined" && window.location.hash !== `#${key}`) {
      window.history.pushState(null, "", `#${key}`);
    }
    markVisited(key);
  }

  function startAutoDemo() {
    setVisitedKeys(new Set());
    setDemoStepIndex(0);
    setDemoPaused(false);
    setDemoRunning(true);
    goToDemoPage(demoSteps[0].key as PageKey);
  }

  function pauseDemo() {
    setDemoPaused(true);
  }

  function resumeDemo() {
    setDemoPaused(false);
    goToDemoPage(demoSteps[demoStepIndex].key as PageKey);
  }

  function stopDemo() {
    setDemoRunning(false);
    setDemoPaused(false);
  }

  // 自动演示定时器：每个步骤停留指定时长后切换到下一页。
  useEffect(() => {
    if (!demoRunning || demoPaused) {
      return;
    }

    const step = demoSteps[demoStepIndex];
    if (!step) {
      return;
    }

    const timerId = window.setTimeout(() => {
      const nextIndex = demoStepIndex + 1;
      if (nextIndex >= demoSteps.length) {
        setDemoRunning(false);
        return;
      }
      setDemoStepIndex(nextIndex);
      goToDemoPage(demoSteps[nextIndex].key as PageKey);
    }, step.delay);

    return () => window.clearTimeout(timerId);
    // goToDemoPage 仅调用稳定的 setState，无需作为依赖。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [demoRunning, demoPaused, demoStepIndex]);

  useEffect(() => {
    function handleHashChange() {
      setActivePage(getPageKeyFromHash());
    }

    window.addEventListener("hashchange", handleHashChange);
    window.addEventListener("popstate", handleHashChange);

    return () => {
      window.removeEventListener("hashchange", handleHashChange);
      window.removeEventListener("popstate", handleHashChange);
    };
  }, []);

  function handleNavigate(key: string) {
    if (isPageKey(key)) {
      // 用户手动切换页面时暂停自动演示（手动模式始终可用）。
      if (demoRunning && !demoPaused) {
        setDemoPaused(true);
      }

      setActivePage(key);
      markVisited(key);

      if (typeof window !== "undefined" && window.location.hash !== `#${key}`) {
        window.history.pushState(null, "", `#${key}`);
      }

      // 结果阶段的项：进入连续滚动视图，并滚动到对应 section。
      if (isResultKey(key)) {
        setPendingScrollKey(key);
      }
    }
  }

  // 进入/切换结果视图后，平滑滚动到点击的 section。
  useEffect(() => {
    if (!pendingScrollKey || !isResultKey(activePage)) {
      return;
    }
    const targetKey = pendingScrollKey;
    const timer = window.setTimeout(() => {
      scrollMainToSection(targetKey);
      setPendingScrollKey(null);
    }, 60);
    return () => window.clearTimeout(timer);
  }, [pendingScrollKey, activePage]);

  // 结果视图内的滚动联动：滚到哪个 section，侧栏就高亮哪个。
  const inResultsView = isResultKey(activePage);
  useEffect(() => {
    if (!inResultsView) {
      return;
    }
    const mainElement = document.getElementById("app-main");
    if (!mainElement) {
      return;
    }
    const container = mainElement;

    function handleScroll() {
      const mainTop = container.getBoundingClientRect().top;
      let current: string = RESULT_KEYS[0];
      for (const key of RESULT_KEYS) {
        const element = document.getElementById(`sec-${key}`);
        if (!element) {
          continue;
        }
        // section 顶部滚到主区顶部附近（<=100px）即视为当前所在段。
        if (element.getBoundingClientRect().top - mainTop <= 100) {
          current = key;
        }
      }
      if (current !== activePageRef.current && isPageKey(current)) {
        setActivePage(current);
      }
    }

    container.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll();
    return () => container.removeEventListener("scroll", handleScroll);
  }, [inResultsView]);

  function handleLogin(token: string, user: AuthUser) {
    setAuthToken(token);
    setCurrentUser(user);

    if (typeof window !== "undefined") {
      window.sessionStorage.setItem(AUTH_TOKEN_KEY, token);
      window.sessionStorage.setItem(CURRENT_USER_KEY, JSON.stringify(user));
    }
  }

  function handleLogout() {
    stopDemo();
    setAuthToken(null);
    setCurrentUser(null);

    if (typeof window !== "undefined") {
      window.sessionStorage.removeItem(AUTH_TOKEN_KEY);
      window.sessionStorage.removeItem(CURRENT_USER_KEY);
    }
  }

  function handleTaskCreated(nextTaskId: string) {
    setTaskId(nextTaskId);
    setDisplayTaskId(getDisplayTaskId(nextTaskId));
    setStaleTaskNotice(false);

    if (typeof window !== "undefined") {
      window.sessionStorage.setItem("activeTaskId", nextTaskId);
    }
  }

  useEffect(() => {
    setDisplayTaskId(getDisplayTaskId(taskId));
  }, [taskId]);

  // 校验当前任务是否仍存在：若 /api/analysis/{id} 返回 404（后端重启 / 任务过期），
  // 清除失效的 activeTaskId 并提示用户重新启动，避免各页面持续轮询已失效任务。
  useEffect(() => {
    if (!taskId) {
      return;
    }
    let cancelled = false;
    let timer: number | undefined;

    async function validate(currentTaskId: string) {
      try {
        await analysisApi.getStatus(currentTaskId);
      } catch (error) {
        if (cancelled) {
          return;
        }
        const message = error instanceof Error ? error.message : "";
        if (message.includes("404")) {
          if (typeof window !== "undefined") {
            window.sessionStorage.removeItem("activeTaskId");
          }
          setTaskId(null);
          setDisplayTaskId(null);
          setStaleTaskNotice(true);
          if (timer) {
            window.clearInterval(timer);
          }
        }
      }
    }

    validate(taskId);
    timer = window.setInterval(() => validate(taskId), 4000);

    return () => {
      cancelled = true;
      if (timer) {
        window.clearInterval(timer);
      }
    };
  }, [taskId]);

  function handleHomeSelection(selection: {
    selectedDomain?: string | null;
    selectedCategory?: string | null;
    selectedIndustryKey?: string | null;
  }) {
    if ("selectedDomain" in selection) {
      setSelectedDomain(selection.selectedDomain ?? null);
    }

    if ("selectedCategory" in selection) {
      setSelectedCategory(selection.selectedCategory ?? null);
    }

    if ("selectedIndustryKey" in selection) {
      setSelectedIndustryKey(selection.selectedIndustryKey ?? null);
    }
  }

  // 总览 / 新建分析：分析前的入口页，单页展示。
  function renderSinglePage() {
    if (activePage === "product-compare") {
      return (
        <ProductComparePage
          displayTaskId={displayTaskId ?? undefined}
          onNavigate={handleNavigate}
          onTaskCreated={handleTaskCreated}
        />
      );
    }

    return (
      <HomePage
        onNavigate={handleNavigate}
        onSelectionChange={handleHomeSelection}
        selectedCategory={selectedCategory}
        selectedDomain={selectedDomain}
        selectedIndustryKey={selectedIndustryKey}
        displayTaskId={displayTaskId ?? undefined}
        taskId={taskId ?? undefined}
        demoStatusLabel={demoStatusLabel}
        currentDemoKey={currentDemoKey}
        visitedKeys={visitedKeys}
      />
    );
  }

  // 分析结果阶段：六个页面合并为一条连续滚动视图，每段一个锚点 section。
  function renderResultsScroll() {
    const common = {
      displayTaskId: displayTaskId ?? undefined,
      taskId: taskId ?? undefined,
      onNavigate: handleNavigate,
    };

    return (
      <div className="space-y-12">
        <section id="sec-workflow" data-nav="workflow" className="scroll-mt-6">
          <WorkflowPage {...common} autoDemoActive={demoRunning && !demoPaused} />
        </section>
        <section id="sec-evidence" data-nav="evidence" className="scroll-mt-6">
          <EvidencePage {...common} />
        </section>
        <section id="sec-claims" data-nav="claims" className="scroll-mt-6">
          <ClaimsPage {...common} />
        </section>
        <section id="sec-quality" data-nav="quality" className="scroll-mt-6">
          <QualityPage {...common} />
        </section>
        <section id="sec-report" data-nav="report" className="scroll-mt-6">
          <ReportPage {...common} />
        </section>
        <section id="sec-metrics" data-nav="metrics" className="scroll-mt-6">
          <MetricsPage {...common} />
        </section>
        {/* 底部留白：让最后几个 section 也能滚动到顶部对齐。 */}
        <div aria-hidden className="h-[55vh]" />
      </div>
    );
  }

  if (!authToken) {
    return <WelcomePage onLogin={handleLogin} />;
  }

  const demoStatusLabel = demoRunning
    ? demoPaused
      ? "已暂停"
      : "演示中"
    : "手动模式";
  const currentDemoKey = demoRunning ? demoSteps[demoStepIndex]?.key : undefined;

  return (
    <AppLayout
      activePage={activePage}
      navItems={navItems}
      onNavigate={handleNavigate}
      onLogout={handleLogout}
      currentUser={currentUser}
      displayTaskId={displayTaskId ?? undefined}
      taskId={taskId ?? undefined}
      demoSteps={demoSteps}
      demoRunning={demoRunning}
      demoPaused={demoPaused}
      demoStepIndex={demoStepIndex}
      demoStatusLabel={demoStatusLabel}
      currentDemoKey={currentDemoKey}
      visitedKeys={visitedKeys}
      onPauseDemo={pauseDemo}
      onResumeDemo={resumeDemo}
      onStopDemo={stopDemo}
      showAmbientParticles={!inResultsView}
    >
      {staleTaskNotice ? (
        <div className="mb-5 flex flex-col gap-3 rounded-lg border border-amber-400/35 bg-amber-400/10 px-4 py-3 text-sm text-amber-100 sm:flex-row sm:items-center sm:justify-between">
          <span>上一个分析任务已失效（后端可能已重启或任务已过期），已停止轮询。请重新启动一次分析。</span>
          <div className="flex shrink-0 gap-2">
            <button
              className="rounded-md border border-amber-300/50 px-3 py-1.5 text-xs font-semibold text-amber-100 transition hover:bg-amber-300/15"
              onClick={() => {
                setStaleTaskNotice(false);
                handleNavigate("product-compare");
              }}
              type="button"
            >
              去产品对比
            </button>
            <button
              className="rounded-md border border-slate-600 px-3 py-1.5 text-xs font-medium text-slate-300 transition hover:border-slate-400"
              onClick={() => setStaleTaskNotice(false)}
              type="button"
            >
              知道了
            </button>
          </div>
        </div>
      ) : null}
      {inResultsView ? (
        <div className="page-enter" key="results-scroll">
          {renderResultsScroll()}
        </div>
      ) : (
        <div className="page-enter" key={activePage}>
          {renderSinglePage()}
        </div>
      )}
    </AppLayout>
  );
}
