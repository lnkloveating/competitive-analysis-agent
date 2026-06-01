import { useEffect, useState } from "react";
import { AppLayout } from "./components/layout/AppLayout";
import type { NavItem } from "./components/layout/Sidebar";
import { demoSteps } from "./utils/demoSteps";
import { ClaimsPage } from "./pages/ClaimsPage";
import { EvidencePage } from "./pages/EvidencePage";
import { HomePage } from "./pages/HomePage";
import { MetricsPage } from "./pages/MetricsPage";
import { NewAnalysisPage } from "./pages/NewAnalysisPage";
import { QualityPage } from "./pages/QualityPage";
import { ReportPage } from "./pages/ReportPage";
import { WelcomePage } from "./pages/WelcomePage";
import { WorkflowPage } from "./pages/WorkflowPage";
import { getDisplayTaskId } from "./utils/taskDisplay";
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
  | "new-analysis"
  | "workflow"
  | "evidence"
  | "claims"
  | "quality"
  | "report"
  | "metrics";

const navItems: Array<NavItem & { key: PageKey }> = [
  { key: "overview", label: "总览" },
  { key: "new-analysis", label: "新建分析" },
  { key: "workflow", label: "Agent 工作流" },
  { key: "evidence", label: "证据中心" },
  { key: "claims", label: "结论追踪" },
  { key: "quality", label: "质量审查" },
  { key: "report", label: "最终报告" },
  { key: "metrics", label: "指标看板" },
];

function isPageKey(key: string): key is PageKey {
  return navItems.some((item) => item.key === key);
}

function getPageKeyFromHash(): PageKey {
  if (typeof window === "undefined") {
    return "overview";
  }

  const pageKey = window.location.hash.replace(/^#\/?/, "");
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
  const [taskId, setTaskId] = useState<string | null>(getStoredTaskId);
  const [displayTaskId, setDisplayTaskId] = useState<string | null>(() =>
    getDisplayTaskId(getStoredTaskId()),
  );
  const [selectedDomain, setSelectedDomain] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedIndustryKey, setSelectedIndustryKey] = useState<string | null>(
    null,
  );

  // 自动演示模式状态
  const [autoDemoEnabled, setAutoDemoEnabled] = useState(true);
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
    }
  }

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

    if (typeof window !== "undefined") {
      window.sessionStorage.setItem("activeTaskId", nextTaskId);
    }
  }

  useEffect(() => {
    setDisplayTaskId(getDisplayTaskId(taskId));
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

  function renderPage() {
    switch (activePage) {
      case "overview":
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
      case "new-analysis":
        return (
          <NewAnalysisPage
            displayTaskId={displayTaskId ?? undefined}
            onNavigate={handleNavigate}
            onTaskCreated={handleTaskCreated}
            selectedIndustryKey={selectedIndustryKey}
            autoDemoEnabled={autoDemoEnabled}
            onToggleAutoDemo={setAutoDemoEnabled}
            onStartAutoDemo={startAutoDemo}
          />
        );
      case "workflow":
        return (
          <WorkflowPage
            displayTaskId={displayTaskId ?? undefined}
            taskId={taskId ?? undefined}
            onNavigate={handleNavigate}
            autoDemoActive={demoRunning && !demoPaused}
          />
        );
      case "evidence":
        return (
          <EvidencePage
            displayTaskId={displayTaskId ?? undefined}
            taskId={taskId ?? undefined}
            onNavigate={handleNavigate}
          />
        );
      case "claims":
        return (
          <ClaimsPage
            displayTaskId={displayTaskId ?? undefined}
            taskId={taskId ?? undefined}
            onNavigate={handleNavigate}
          />
        );
      case "quality":
        return (
          <QualityPage
            displayTaskId={displayTaskId ?? undefined}
            taskId={taskId ?? undefined}
            onNavigate={handleNavigate}
          />
        );
      case "report":
        return (
          <ReportPage
            displayTaskId={displayTaskId ?? undefined}
            taskId={taskId ?? undefined}
            onNavigate={handleNavigate}
          />
        );
      case "metrics":
        return (
          <MetricsPage
            displayTaskId={displayTaskId ?? undefined}
            taskId={taskId ?? undefined}
            onNavigate={handleNavigate}
          />
        );
      default:
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
    >
      <div className="page-enter" key={activePage}>
        {renderPage()}
      </div>
    </AppLayout>
  );
}
