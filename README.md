# AI 驱动的竞品分析多 Agent 协作系统

这是一个面向竞品分析场景的多 Agent 后端项目，使用 **FastAPI + LangGraph** 编排多个专业 Agent，模拟一个结构化的数字调研小组：从公开材料采集、证据抽取、产品/商业分析、风险识别、质量检查，到最终战略报告生成，形成一条**可追溯、可质检、拒绝凭空捏造**的分析链路。

当前 Demo 聚焦 **`gaming_mouse` 电竞鼠标**垂直场景，并已扩展支持电竞键盘、电竞头戴耳机两个品类。

## 核心特性

- **真·多 Agent 编排**：8 个 Agent 通过 LangGraph 组成 DAG，Product / Business 为真并行分支。
- **质量闭环 + 人工兜底**：QualityAgent 不通过时按目标 Agent 重试（上限 3 次），仍失败则转人工复核（`human_review`），输出"低置信草稿 + 待办事项"，**绝不 force pass**。
- **两层反幻觉**：① 引用有效性——每条 claim 必须引用已存在的 `evidence_id`；② 引用忠实度（`faithfulness.py`）——claim 中出现的数字必须能在所引证据原文中找到，否则判为硬失败。
- **Schema-first 通信**：每个 Agent 的输出都经过 Pydantic Schema 校验。
- **全程可追溯**：`trace_log` 记录每个 Agent 的执行轨迹，前端可直接展示 Evidence → Claim → Report 的溯源链。
- **三档可切换数据源**：mock / 预载真实数据库 / 实时爬虫，通过环境变量一键切换。
- **行业配置驱动**：新增品类只需扩展行业配置，无需改动编排逻辑。

## Agent 工作流

```text
ResearchAgent
  → EvidenceAgent
      → ProductAgent  ┐
      → BusinessAgent ┘  (并行)
          → VerificationAgent
              → RiskAgent
                  → QualityAgent
                       │ approved
                       ▼
                     StrategyAgent → final_report
```

质量检查失败时：

```text
QualityAgent → 路由回目标 Agent 重试（capped by MAX_ITERATIONS = 3）
3 次仍失败 → human_review → 输出低置信草稿，需人工复核
```

系统不会在证据不足时强制通过，也不会让 StrategyAgent 生成没有证据支撑的结论。

## 技术栈

| 层 | 技术 |
|---|---|
| 编排 | LangGraph（StateGraph / 条件路由 / 并行分支） |
| Web | FastAPI + Uvicorn |
| Agent 状态 | TypedDict + Pydantic Schema |
| LLM | Doubao / Ark（`langchain_openai.ChatOpenAI`，可通过环境变量关闭单个 Agent 的 LLM 调用） |
| 爬虫 | httpx + trafilatura + PyYAML |
| 数据源 | MockResearchProvider / DatabaseResearchProvider / CrawlerResearchProvider（工厂模式） |
| 前端 | React + Vite + TailwindCSS（图表/动画全部自研 CSS/SVG，无第三方图表库） |
| 认证 | 独立 auth 模块（bcrypt + PyJWT，最小侵入，失败不影响分析主流程） |

## 目录结构

```text
backend/
  main.py                      # 启动入口（uvicorn）
  api/
    routes.py                  # FastAPI 路由：任务启动 / 状态 / 报告 / 中间产物
  app/
    agents/                    # 8 个 Agent 实现
      research_agent.py
      evidence_agent.py
      product_agent.py
      business_agent.py
      verification_agent.py
      risk_agent.py
      quality_agent.py
      strategy_agent.py
    core/
      agent_runner.py          # run_node：schema 校验 + 错误恢复
    schemas/                   # research / evidence / claim / product /
                               # business / risk / quality / report / ...
    services/
      research_provider.py             # ResearchProvider 抽象基类
      research_provider_factory.py     # 按 RESEARCH_PROVIDER 选择数据源
      mock_research_provider.py
      faithfulness.py                  # 引用忠实度（数值/词法接地）
      metrics_service.py
      review_service.py
      crawl_data_service.py
      crawler/                         # 爬虫/数据库数据源实现
        http_downloader.py
        content_extractor.py
        cache_manager.py
        dimension_classifier.py
        crawler_research_provider.py
        database_research_provider.py
  orchestration/
    workflow.py                # LangGraph DAG 与路由
    state.py                   # 工作流状态与 reducer
    industry_config.py         # 行业预设（鼠标/键盘/耳机/泛外设）
  auth/                        # 登录认证（可选模块）
  config/crawler_config.yaml   # 爬虫配置（种子 URL / 全局参数）
  test_*.py                    # 测试脚本

crawler_package/               # 独立可分发的爬虫工具包（含文档与 demo 脚本）
data/preload/crawl_seeds.json  # 预载真实竞品数据（鼠标/键盘/耳机各 7 条）
frontend/src/                  # React 前端（9 个页面 + 自研可视化组件）
docs/                          # 架构 / API / Agent 协议文档
```

## 快速开始

### 后端

```bash
cd backend
python -m venv venv
venv\Scripts\activate          # Windows
pip install -r requirements.txt
copy .env.example .env         # 填入 ARK_API_KEY / ARK_EP
python main.py
```

默认服务地址：`http://localhost:8000`，健康检查：`GET /health`。

### 前端

```bash
cd frontend
npm install
npm run dev
```

前端通过 `VITE_API_BASE_URL`（默认 `http://127.0.0.1:8000`）连接后端。

## 数据源切换

通过环境变量 `RESEARCH_PROVIDER` 选择研究数据来源（默认 `database`）：

| 取值 | 说明 |
|---|---|
| `database` | 读取本地预载真实竞品数据（鼠标/键盘/耳机），SQLite 库不可用时自动回退到 `data/preload/crawl_seeds.json`。**推荐默认值** |
| `crawler` | 实时抓取公开站点（依赖 trafilatura / httpx / PyYAML），含 UA 轮换、重试、随机延迟、缓存、低质量页面过滤 |
| `mock` | 确定性模拟数据，无需网络与密钥，适合纯流程演示 |

三档 Provider 都输出统一的 `RawResearchItem` schema，对上层 Agent 完全透明。

## Demo 请求示例

```json
{
  "industry_key": "gaming_mouse",
  "target_platform": "罗技",
  "competitors": ["罗技", "雷蛇", "海盗船"],
  "analysis_scene": "电竞鼠标竞品分析",
  "target_user": "产品经理",
  "time_range": "近两年",
  "focus_dimensions": [
    "性能参数", "轻量化设计", "无线与续航",
    "软件生态", "用户口碑", "价格定位", "电竞品牌影响力"
  ]
}
```

调用流程：

```text
POST /api/analysis/start              → 拿到 task_id
GET  /api/analysis/{task_id}/status   → 轮询进度
GET  /api/analysis/{task_id}/report   → 最终报告
```

## FastAPI 接口

核心接口：

- `POST /api/analysis/start`
- `GET  /api/analysis/{task_id}/status`
- `GET  /api/analysis/{task_id}/report`
- `GET  /api/industries`
- `GET  /health`

Agent 中间产物（只读，供前端展示与溯源）：

- `GET /api/analysis/{task_id}/evidence`
- `GET /api/analysis/{task_id}/claims`
- `GET /api/analysis/{task_id}/trace`
- `GET /api/analysis/{task_id}/quality`
- `GET /api/analysis/{task_id}/metrics`
- `GET /api/analysis/{task_id}/risks`
- `GET /api/analysis/{task_id}/artifacts`

完整接口说明见 `docs/api.md`，Agent 协议说明见 `docs/agent_protocol.md`。

## 测试

```bash
backend\venv\Scripts\python.exe backend\test_workflow.py
backend\venv\Scripts\python.exe backend\test_agents.py
backend\venv\Scripts\python.exe backend\test_traceability.py
backend\venv\Scripts\python.exe backend\test_api_readonly.py
backend\venv\Scripts\python.exe backend\test_context_and_faithfulness.py
backend\venv\Scripts\python.exe backend\test_failure_paths.py
backend\venv\Scripts\python.exe backend\test_gaming_mouse_config.py
```

## 设计原则

- Schema-first：Agent 间结构化通信
- Evidence-grounded：claim 必须有证据支撑
- 无证据不出结论：禁止生成无支撑的正式报告
- 战略生成前先质检：QualityAgent 把关
- 人工复核优于强制通过：失败转 human review 而非 force pass
- 可追溯、前端可读的中间产物
- 行业配置驱动的可扩展性

本系统不是普通的 LLM 报告生成器，而是一条 **evidence-grounded、schema-validated、quality-controlled** 的多 Agent 竞品分析工作流。
