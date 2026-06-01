import { useEffect, useRef, useState } from "react";

export type OrbitProduct = {
  key: string;
  label: string;
  description: string;
  available: boolean;
  /** 复用的图标名，见 ProductGlyph。 */
  glyph: string;
};

export type OrbitMode = {
  key: string;
  label: string;
  en: string;
  tagline: string;
  items: OrbitProduct[];
};

type ProductOrbitProps = {
  modes: OrbitMode[];
  /** 当前选中的产品 key（受控）。 */
  activeKey: string;
  onSelect: (key: string) => void;
  /** 点击主操作（仅选中项 available 且服务就绪时触发）。 */
  onEnter: (key: string) => void;
  /** 选中项是否真正可进入分析（受后端服务就绪状态影响）。 */
  canEnter: boolean;
};

// 自研产品图标（line-art，跟随 currentColor），避免引入第三方图标库。
function ProductGlyph({ name }: { name: string }) {
  const common = {
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.6,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };

  switch (name) {
    case "mouse":
      return (
        <svg viewBox="0 0 48 48" width="100%" height="100%" {...common}>
          <rect x="15" y="8" width="18" height="32" rx="9" />
          <path d="M24 8v11" />
          <path d="M24 12.5c2.4 0 3.4 1.4 3.4 3.2v2.4c0 1.4-1.5 2.5-3.4 2.5s-3.4-1.1-3.4-2.5v-2.4c0-1.8 1-3.2 3.4-3.2Z" />
        </svg>
      );
    case "keyboard":
      return (
        <svg viewBox="0 0 48 48" width="100%" height="100%" {...common}>
          <rect x="6" y="14" width="36" height="20" rx="4" />
          <path d="M12 20h0M18 20h0M24 20h0M30 20h0M36 20h0" />
          <path d="M12 26h0M18 26h0M30 26h0M36 26h0" />
          <path d="M16 31h16" />
        </svg>
      );
    case "headset":
      return (
        <svg viewBox="0 0 48 48" width="100%" height="100%" {...common}>
          <path d="M11 28v-4a13 13 0 0 1 26 0v4" />
          <rect x="8" y="27" width="7" height="12" rx="3" />
          <rect x="33" y="27" width="7" height="12" rx="3" />
          <path d="M33 38c0 3-2.6 5-6 5h-2" />
        </svg>
      );
    case "mic":
      return (
        <svg viewBox="0 0 48 48" width="100%" height="100%" {...common}>
          <rect x="18" y="6" width="12" height="21" rx="6" />
          <path d="M14 23a10 10 0 0 0 20 0" />
          <path d="M24 33v6" />
          <path d="M18 41h12" />
        </svg>
      );
    case "inear":
      return (
        <svg viewBox="0 0 48 48" width="100%" height="100%" {...common}>
          <circle cx="21" cy="19" r="9" />
          <circle cx="21" cy="19" r="3" />
          <path d="M28 24l5 9a3.2 3.2 0 0 1-5 2.4l-3.4-6.4" />
        </svg>
      );
    case "earbuds":
      return (
        <svg viewBox="0 0 48 48" width="100%" height="100%" {...common}>
          <rect x="16" y="7" width="12" height="15" rx="6" />
          <path d="M22 22v11" />
          <circle cx="22" cy="37" r="3" />
        </svg>
      );
    case "speaker":
      return (
        <svg viewBox="0 0 48 48" width="100%" height="100%" {...common}>
          <rect x="14" y="6" width="20" height="36" rx="4" />
          <circle cx="24" cy="16" r="2.4" />
          <circle cx="24" cy="30" r="6" />
        </svg>
      );
    case "webcam":
      return (
        <svg viewBox="0 0 48 48" width="100%" height="100%" {...common}>
          <circle cx="24" cy="21" r="11" />
          <circle cx="24" cy="21" r="4" />
          <path d="M24 32v6" />
          <path d="M16 40h16" />
        </svg>
      );
    default:
      return (
        <svg viewBox="0 0 48 48" width="100%" height="100%" {...common}>
          <circle cx="24" cy="24" r="13" />
        </svg>
      );
  }
}

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) {
    return false;
  }
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

// 求最短环形偏移，让卡片以中心为基准向两侧扇形展开。
function ringOffset(index: number, active: number, total: number) {
  let offset = ((index - active) % total + total) % total;
  if (offset > total / 2) {
    offset -= total;
  }
  return offset;
}

// 一次性生成漂浮粒子，填充舞台空白并增加动感。
function makeParticles(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    id: i,
    left: 6 + Math.random() * 88,
    top: 8 + Math.random() * 78,
    size: 2 + Math.random() * 4,
    delay: Math.random() * 6,
    duration: 7 + Math.random() * 7,
  }));
}

export function ProductOrbit({
  modes,
  activeKey,
  onSelect,
  onEnter,
  canEnter,
}: ProductOrbitProps) {
  const [reduceMotion, setReduceMotion] = useState(prefersReducedMotion);
  const particles = useRef(makeParticles(16));
  const floatSeeds = useRef(
    Array.from({ length: 12 }, (_, i) => (i * 1.7) % 4),
  );

  // 测量舞台实际宽度，使弧线随容器宽度自适应、铺满整框。
  const stageRef = useRef<HTMLDivElement | null>(null);
  const [stageWidth, setStageWidth] = useState(960);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) {
      return;
    }
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const handler = () => setReduceMotion(media.matches);
    media.addEventListener("change", handler);
    return () => media.removeEventListener("change", handler);
  }, []);

  useEffect(() => {
    const element = stageRef.current;
    if (!element || typeof ResizeObserver === "undefined") {
      return;
    }
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setStageWidth(entry.contentRect.width);
      }
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  // 由选中产品反推所属模式，组件保持受控、无内部模式状态。
  const modeIndex = Math.max(
    0,
    modes.findIndex((mode) => mode.items.some((item) => item.key === activeKey)),
  );
  const mode = modes[modeIndex];
  const items = mode.items;
  const total = items.length;
  const activeIndex = Math.max(
    0,
    items.findIndex((item) => item.key === activeKey),
  );
  const activeItem = items[activeIndex];
  const availableCount = items.filter((item) => item.available).length;

  // 椭圆弧的横/纵半径：横向随框宽撑满，纵向保持克制。
  const radiusX = Math.min(540, Math.max(210, stageWidth * 0.42));
  const radiusY = stageWidth < 620 ? 118 : 150;
  const angleStep = 30;

  function switchMode(direction: 1 | -1) {
    const next = (modeIndex + direction + modes.length) % modes.length;
    onSelect(modes[next].items[0].key);
  }

  return (
    <div className="orbit-shell">
      {/* 模式切换条：独立放在框外，避免压住卡片 */}
      <div className={`orbit-modebar orbit-modebar-${mode.key}`}>
        <button
          aria-label="上一个模式"
          className="orbit-arrow"
          onClick={() => switchMode(-1)}
          type="button"
        >
          ‹
        </button>
        <div className="orbit-modebar-center">
          <span className="orbit-mode-label">{mode.label}</span>
          <span className="orbit-mode-en">{mode.en} MODE</span>
          <span className="orbit-modebar-tagline">{mode.tagline}</span>
        </div>
        <button
          aria-label="下一个模式"
          className="orbit-arrow"
          onClick={() => switchMode(1)}
          type="button"
        >
          ›
        </button>
      </div>

      <div
        className={`orbit-stage orbit-mode-${mode.key}`}
        aria-label="品类选择"
        ref={stageRef}
      >
        {/* 背景动态层：旋转环、光晕、扫描线、漂浮粒子 */}
        <div className="orbit-decor" aria-hidden>
          <span className="orbit-ring-deco orbit-ring-a" />
          <span className="orbit-ring-deco orbit-ring-b" />
          <span className="orbit-glow orbit-glow-1" />
          <span className="orbit-glow orbit-glow-2" />
          <span className="orbit-scan" />
          <span className="orbit-floor" />
          {!reduceMotion
            ? particles.current.map((particle) => (
                <span
                  className="orbit-particle"
                  key={particle.id}
                  style={{
                    left: `${particle.left}%`,
                    top: `${particle.top}%`,
                    width: `${particle.size}px`,
                    height: `${particle.size}px`,
                    animationDelay: `${particle.delay}s`,
                    animationDuration: `${particle.duration}s`,
                  }}
                />
              ))
            : null}
        </div>

        {/* 侧边浮动统计，填充画面 */}
        <div className="orbit-stat orbit-stat-left">
          <span className="orbit-stat-num">{total}</span>
          <span className="orbit-stat-label">{mode.label}品类</span>
        </div>
        <div className="orbit-stat orbit-stat-right">
          <span className="orbit-stat-num">{availableCount}</span>
          <span className="orbit-stat-label">可分析</span>
        </div>

        {/* 产品环：切换模式时整体重入（淡入 + 去模糊） */}
        <div className="orbit-ring" key={mode.key}>
          {items.map((item, index) => {
            const offset = ringOffset(index, activeIndex, total);
            const distance = Math.abs(offset);
            const isActive = index === activeIndex;
            // 椭圆弧排布：以中心为顶点向两侧铺开，靠外的卡片缩小、变淡。
            const angle = offset * angleStep;
            const rad = (angle * Math.PI) / 180;
            const x = radiusX * Math.sin(rad);
            const y = -radiusY * Math.cos(rad) + (isActive ? -8 : 0);
            const tilt = angle * 0.42;
            const scale = Math.max(0.6, 1.18 - distance * 0.16);
            const opacity = Math.max(0.34, 1 - distance * 0.24);

            return (
              <button
                aria-selected={isActive}
                className={`orbit-card ${isActive ? "orbit-card-active" : ""} ${
                  item.available ? "" : "orbit-card-planned"
                }`}
                key={item.key}
                onClick={() => onSelect(item.key)}
                type="button"
                style={{
                  transform: `translate(-50%, -50%) translate(${x}px, ${y}px) rotate(${tilt}deg) scale(${scale})`,
                  zIndex: 100 - distance * 10,
                  opacity,
                }}
              >
                <span
                  className="orbit-card-inner"
                  style={
                    reduceMotion
                      ? undefined
                      : { animationDelay: `${floatSeeds.current[index] ?? 0}s` }
                  }
                >
                  <span className="orbit-card-frame">
                    <span className="orbit-card-glyph">
                      <ProductGlyph name={item.glyph} />
                    </span>
                    {!item.available ? (
                      <span className="orbit-card-tag">规划中</span>
                    ) : null}
                  </span>
                  <span className="orbit-card-label">{item.label}</span>
                </span>
              </button>
            );
          })}

          <div className="orbit-caption">
            <span className="orbit-caption-name">{activeItem.label}</span>
          </div>
        </div>

        {/* 中心命名 + 主操作，呼应参考图的产品名与购买胶囊 */}
        <button
          className="orbit-cta"
          disabled={!activeItem.available || !canEnter}
          onClick={() => onEnter(activeItem.key)}
          type="button"
        >
          <span className="orbit-cta-icon" aria-hidden>
            →
          </span>
          <span>{activeItem.available && canEnter ? "进入分析" : "敬请期待"}</span>
          <span className="orbit-cta-divider" aria-hidden />
          <span className="orbit-cta-sub">{activeItem.label}</span>
        </button>
      </div>

      <div className="orbit-dots">
        {items.map((item, index) => (
          <button
            aria-label={`选择${item.label}`}
            className={`orbit-dot ${index === activeIndex ? "orbit-dot-active" : ""}`}
            key={item.key}
            onClick={() => onSelect(item.key)}
            type="button"
          />
        ))}
      </div>
    </div>
  );
}
