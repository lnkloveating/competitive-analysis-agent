# AI 驱动的竞品分析 Agent 协作系统

这是一个面向竞品分析场景的多 Agent 后端项目，使用 FastAPI + LangGraph 编排多个专业 Agent，模拟一个结构化数字调研小组，从公开材料采集、证据抽取、产品/商业分析、风险识别、质量检查到最终报告生成，形成可追溯的分析链路。

当前 Demo 第一阶段聚焦 `gaming_mouse` 电竞鼠标垂直场景，而不是泛电竞外设。

## Demo 场景

当前推荐 Demo 行业：

```text
industry_key = "gaming_mouse"
industry_name = "电竞鼠标"
```

覆盖品牌：

| 品牌 | 代表型号 |
|---|---|
| 罗技 | G Pro X Superlight 2、G502 X Plus |
| 雷蛇 | Viper V3 Pro、DeathAdder V3 Pro |
| 海盗船 | M75 Air、SABRE RGB PRO Wireless |

覆盖维度：

- 性能参数
- 轻量化设计
- 无线与续航
- 软件生态
- 用户口碑
- 价格定位
- 电竞品牌影响力

选择电竞鼠标作为第一阶段 Demo 的原因：

- 鼠标参数明确，适合结构化对比；
- 公开数据和评测资料充足，适合 evidence-grounded 分析；
- 用户评论丰富，适合展示 Evidence -> Claim -> Report 溯源链路；
- 场景足够垂直，便于前端做清晰的 Agent 工作台演示。

`gaming_peripherals` 泛电竞外设配置仍然保留，后续可以继续扩展到键盘、耳机、手柄等外设品类。

## 系统能力

- 多 Agent 协作竞品分析 workflow
- 行业配置驱动，支持多行业扩展
- ResearchProvider 抽象，当前使用 MockResearchProvider，未来可替换真实爬虫
- 每个 Agent 输出经过 Pydantic Schema 校验
- ProductAgent / BusinessAgent 生成结构化 claims
- StrategyAgent 最终报告必须引用已有 claim_id 和 evidence_id
- QualityAgent 支持结构化打回和三次失败后人工审核
- trace_log 记录 Agent 执行轨迹，便于前端展示和答辩说明
- FastAPI 提供任务启动、状态查询、报告查询和只读中间产物接口

## Agent 工作流

```text
ResearchAgent
  -> EvidenceAgent
  -> ProductAgent / BusinessAgent
  -> RiskAgent
  -> QualityAgent
       | approved
       v
     StrategyAgent
       |
       v
     final_report
```

质量检查失败时：

```text
QualityAgent -> reject_to target Agent
```

三次自动修复后仍失败：

```text
QualityAgent -> HumanReviewRequired
```

系统不会在证据不足时 force pass，也不会让 StrategyAgent 生成没有证据支撑的正式报告。

## 技术栈

- 后端：Python + FastAPI + LangGraph
- Agent 状态约束：TypedDict + Pydantic Schema
- LLM 接入：Doubao / Ark 客户端封装
- 当前数据入口：MockResearchProvider
- 后续数据入口：CrawlerResearchProvider，读取爬虫 JSON 并校验为 `RawResearchItem`
- 前端：React + Vite + TailwindCSS

## 后端目录结构

```text
backend/
  app/
    main.py
    api/
      analysis.py
      industries.py
      health.py
    agents/
      research_agent.py
      evidence_agent.py
      product_agent.py
      business_agent.py
      risk_agent.py
      quality_agent.py
      strategy_agent.py
    core/
      agent_runner.py
      config.py
      errors.py
      logging.py
    schemas/
      research.py
      evidence.py
      claim.py
      product.py
      business.py
      risk.py
      quality.py
      report.py
      trace.py
      metrics.py
      state.py
    services/
      research_provider.py
      mock_research_provider.py
      llm_client.py
      metrics_service.py
    workflow/
      graph.py
      state.py
      routing.py

  agents/
    research_agent.py      # compatibility wrapper
    evidence_agent.py      # compatibility wrapper
    product_agent.py       # compatibility wrapper
    business_agent.py      # compatibility wrapper
    risk_agent.py          # compatibility wrapper
    quality_agent.py       # compatibility wrapper
    strategy_agent.py      # compatibility wrapper
```

`backend/agents` 保留为旧 workflow 的 compatibility wrapper。真实业务实现已经迁移到 `backend/app/agents`。

## 快速开始

### 后端

```bash
cd backend
pip install -r requirements.txt
cp .env.example .env
python main.py
```

默认服务地址：

```text
http://localhost:8000
```

健康检查：

```text
GET /health
```

### 前端

```bash
cd frontend
npm install
npm run dev
```

## Demo 请求示例

```json
{
  "target_platform": "罗技",
  "competitors": ["罗技", "雷蛇", "海盗船"],
  "analysis_scene": "电竞鼠标竞品分析",
  "target_user": "产品经理",
  "time_range": "近两年",
  "focus_dimensions": [
    "性能参数",
    "轻量化设计",
    "无线与续航",
    "软件生态",
    "用户口碑",
    "价格定位",
    "电竞品牌影响力"
  ],
  "industry_key": "gaming_mouse"
}
```

调用：

```text
POST /api/analysis/start
```

拿到 `task_id` 后轮询：

```text
GET /api/analysis/{task_id}/status
```

完成后读取：

```text
GET /api/analysis/{task_id}/report
GET /api/analysis/{task_id}/trace
GET /api/analysis/{task_id}/evidence
GET /api/analysis/{task_id}/claims
```

## FastAPI 接口

核心接口：

- `POST /api/analysis/start`
- `GET /api/analysis/{task_id}/status`
- `GET /api/analysis/{task_id}/report`
- `GET /api/industries`
- `GET /health`

Agent 工作台只读接口：

- `GET /api/analysis/{task_id}/evidence`
- `GET /api/analysis/{task_id}/claims`
- `GET /api/analysis/{task_id}/trace`
- `GET /api/analysis/{task_id}/quality`
- `GET /api/analysis/{task_id}/metrics`
- `GET /api/analysis/{task_id}/risks`
- `GET /api/analysis/{task_id}/artifacts`

完整接口说明见：

```text
docs/api.md
```

Agent 协议说明见：

```text
docs/agent_protocol.md
```

## MockResearchProvider

当前没有接真实爬虫。`MockResearchProvider` 会根据 `industry_key` 生成 mock raw research。

当 `industry_key = "gaming_mouse"` 时，mock 数据会围绕电竞鼠标生成，并覆盖：

- 罗技、雷蛇、海盗船三个品牌；
- 代表型号；
- 七个核心维度；
- `official`、`review`、`ecommerce`、`user_review`、`news`、`report` 等 source type；
- `mock://gaming_mouse/...` 风格 URL；
- `dimension`、`related_dimension`、`product_name`、`category` 兼容字段。

后续接真实爬虫时，只需要实现新的 `CrawlerResearchProvider`，让它输出符合 `RawResearchItem` schema 的数据即可。

## 测试

常用后端测试：

```bash
backend\venv\Scripts\python.exe backend\test_workflow.py
backend\venv\Scripts\python.exe backend\test_agents.py
backend\venv\Scripts\python.exe backend\test_traceability.py
backend\venv\Scripts\python.exe backend\test_api_readonly.py
backend\venv\Scripts\python.exe backend\test_gaming_mouse_config.py
```

`test_gaming_mouse_config.py` 会检查：

- 行业配置包含 `gaming_mouse`；
- 品牌覆盖罗技、雷蛇、海盗船；
- 维度覆盖七个电竞鼠标核心维度；
- MockResearchProvider 返回符合 `RawResearchItem` 的数据；
- mock 数据覆盖三个品牌和代表型号。

## 设计原则

- Schema-first Agent communication
- Evidence-grounded claims
- No unsupported final report
- Quality rejection before strategy generation
- Human review instead of force pass
- Backward compatibility during migration
- Traceable and frontend-readable intermediate artifacts
- Industry-config driven extensibility

当前系统不是普通 LLM 报告生成器，而是 evidence-grounded、schema-validated、quality-controlled 的多 Agent 竞品分析工作流。
