# FastAPI 接口文档

本文档面向前端同学，描述当前后端已经暴露的分析任务接口、行业配置接口和 Agent 工作台只读接口。

默认服务地址：

```text
http://localhost:8000
```

典型联调流程：

1. 调用 `POST /api/analysis/start` 创建分析任务，拿到 `task_id`。
2. 轮询 `GET /api/analysis/{task_id}/status`，直到 `status` 为 `completed` 或 `failed`。
3. 读取报告和中间产物：`report`、`evidence`、`claims`、`trace`、`quality`、`metrics`、`risks`、`artifacts`。

通用约定：

- 所有 `{task_id}` 都来自 `POST /api/analysis/start` 的返回值。
- 如果 `task_id` 不存在，任务相关接口返回 `404`。
- 如果某个中间字段尚未生成或不存在，接口返回空数组 `[]` 或空对象 `{}`，不会因为字段缺失返回 `500`。
- `POST /api/analysis/start` 会异步启动 LangGraph workflow，接口立即返回，不等待分析完成。
- 当前 Demo 推荐使用 `industry_key = "gaming_mouse"`。`gaming_peripherals` 仍然保留，用于后续泛电竞外设扩展。

## POST /api/analysis/start

| 项目 | 内容 |
|---|---|
| 用途 | 创建竞品分析任务，并在后台线程启动 LangGraph workflow |
| 请求方法 | `POST` |
| URL | `/api/analysis/start` |
| 请求参数 | JSON body，见下方示例 |
| 404 行为 | 不涉及 `task_id` 查询，正常不会返回 404 |

### Gaming Mouse Demo 请求示例

前端做 Demo 时，建议默认使用以下电竞鼠标场景：

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

后续仍然可以通过 `industry_key` 切换到其他行业，例如 `gaming_peripherals`、`smartphones`、`headphones`、`cameras`。

### 返回示例

```json
{
  "task_id": "0f7d9b63-7c80-4c08-9f38-0f841d8d4075",
  "status": "running"
}
```

### 字段说明

| 字段 | 类型 | 说明 |
|---|---|---|
| `industry_key` | string | 行业配置 key，Demo 推荐 `gaming_mouse` |
| `target_platform` | string | 目标品牌或平台 |
| `competitors` | string[] | 参与对比的品牌列表 |
| `analysis_scene` | string | 分析场景 |
| `target_user` | string | 报告目标用户 |
| `time_range` | string | 时间范围 |
| `focus_dimensions` | string[] | 前端传入的关注维度，后端会结合行业配置生成分析产物 |

## GET /api/analysis/{task_id}/status

| 项目 | 内容 |
|---|---|
| 用途 | 查询任务执行状态、当前 Agent 和进度 |
| 请求方法 | `GET` |
| URL | `/api/analysis/{task_id}/status` |
| 请求参数 | Path 参数：`task_id` |
| 404 行为 | `task_id` 不存在时返回 `404 {"detail": "task_id 不存在"}` |

返回示例：

```json
{
  "task_id": "0f7d9b63-7c80-4c08-9f38-0f841d8d4075",
  "status": "running",
  "current_agent": "EvidenceAgent",
  "progress": 28,
  "error": ""
}
```

状态说明：

| 字段 | 类型 | 说明 |
|---|---|---|
| `status` | string | `running`、`completed`、`failed` |
| `current_agent` | string | 当前或最近完成的 Agent |
| `progress` | number | 0-100，按当前 Agent 估算 |
| `error` | string | 失败时的错误信息，正常为空字符串 |

## GET /api/analysis/{task_id}/report

| 项目 | 内容 |
|---|---|
| 用途 | 获取最终报告、质检结果和证据列表 |
| 请求方法 | `GET` |
| URL | `/api/analysis/{task_id}/report` |
| 请求参数 | Path 参数：`task_id` |
| 404 行为 | `task_id` 不存在时返回 `404 {"detail": "task_id 不存在"}` |

返回示例：

```json
{
  "task_id": "0f7d9b63-7c80-4c08-9f38-0f841d8d4075",
  "status": "completed",
  "final_report": {
    "quality_status": "approved",
    "needs_human_review": false,
    "executive_summary": [
      "本报告基于结构化 evidence 和 claims 生成，聚焦电竞鼠标竞品对比。"
    ],
    "competitive_ranking": [
      {
        "platform": "罗技",
        "score": 8.4,
        "rank": 1,
        "summary": "罗技在轻量化设计和电竞品牌影响力上有较多证据支持（证据：EV001、EV005）"
      }
    ],
    "swot_analysis": {
      "strengths": ["罗技在高端无线电竞鼠标中有较强品牌认知（证据：EV005）"],
      "weaknesses": ["部分价格定位仍需结合更多电商数据复核（证据：EV006）"],
      "opportunities": ["围绕轻量化和低延迟体验强化产品叙事。"],
      "threats": ["雷蛇和海盗船在新品节奏上可能改变当前对比格局。"]
    },
    "strategic_recommendations": [
      {
        "recommendation": "优先围绕轻量化设计和无线性能形成差异化卖点。",
        "supporting_claim_ids": ["PCL001"],
        "supporting_evidence_ids": ["EV001"],
        "confidence_score": 0.85
      }
    ],
    "used_claim_ids": ["PCL001"],
    "used_evidence_ids": ["EV001"]
  },
  "quality_result": {
    "approved": true,
    "score": 90,
    "status": "approved",
    "quality_score": 90
  },
  "evidence_list": [],
  "error": ""
}
```

## GET /api/industries

| 项目 | 内容 |
|---|---|
| 用途 | 获取后端支持的行业配置列表 |
| 请求方法 | `GET` |
| URL | `/api/industries` |
| 请求参数 | 无 |
| 404 行为 | 不涉及 `task_id` 查询，正常不会返回 404 |

当前 Demo 推荐使用 `gaming_mouse`。`gaming_peripherals` 仍然保留，用于后续扩展到更宽泛的电竞外设场景。

返回示例：

```json
{
  "industries": [
    {
      "key": "gaming_mouse",
      "industry_key": "gaming_mouse",
      "name": "电竞鼠标",
      "competitors": ["罗技", "雷蛇", "海盗船"],
      "dimensions": [
        "性能参数",
        "轻量化设计",
        "无线与续航",
        "软件生态",
        "用户口碑",
        "价格定位",
        "电竞品牌影响力"
      ],
      "representative_products": {
        "罗技": ["G Pro X Superlight 2", "G502 X Plus"],
        "雷蛇": ["Viper V3 Pro", "DeathAdder V3 Pro"],
        "海盗船": ["M75 Air", "SABRE RGB PRO Wireless"]
      },
      "description": "聚焦电竞鼠标产品的性能、手感、软件、口碑、价格和电竞品牌影响力分析。"
    },
    {
      "key": "gaming_peripherals",
      "industry_key": "gaming_peripherals",
      "name": "电竞外设",
      "competitors": ["罗技", "雷蛇", "海盗船", "SteelSeries"],
      "dimensions": ["硬件性能", "软件驱动", "用户口碑", "定价策略", "产品线广度"]
    }
  ]
}
```

## GET /health

| 项目 | 内容 |
|---|---|
| 用途 | 健康检查 |
| 请求方法 | `GET` |
| URL | `/health` |
| 请求参数 | 无 |
| 404 行为 | 不涉及 `task_id` 查询，正常不会返回 404 |

返回示例：

```json
{
  "status": "ok"
}
```

## GET /api/analysis/{task_id}/evidence

| 项目 | 内容 |
|---|---|
| 用途 | 获取 EvidenceAgent 产出的结构化证据列表 |
| 请求方法 | `GET` |
| URL | `/api/analysis/{task_id}/evidence` |
| 请求参数 | Path 参数：`task_id` |
| 404 行为 | `task_id` 不存在时返回 `404 {"detail": "task_id 不存在"}` |

在 `gaming_mouse` 场景下，`evidence_list` 会围绕电竞鼠标代表型号、产品参数、软件生态、用户口碑、价格定位和电竞影响力生成。

返回示例：

```json
{
  "task_id": "0f7d9b63-7c80-4c08-9f38-0f841d8d4075",
  "evidence_list": [
    {
      "evidence_id": "EV001",
      "platform": "罗技",
      "claim": "罗技 G Pro X Superlight 2 在性能参数维度有公开材料支撑。",
      "source_type": "official",
      "source_title": "罗技 G Pro X Superlight 2 官方性能参数资料",
      "source_url": "mock://gaming_mouse/logitech/g-pro-x-superlight-2/official",
      "publish_time": "2025-03-01",
      "collected_time": "2026-05-26T10:00:00",
      "credibility": "high",
      "related_dimension": "性能参数",
      "raw_content": "原始材料摘要...",
      "confidence_score": 0.85
    }
  ]
}
```

字段缺失时返回：

```json
{
  "task_id": "0f7d9b63-7c80-4c08-9f38-0f841d8d4075",
  "evidence_list": []
}
```

## GET /api/analysis/{task_id}/claims

| 项目 | 内容 |
|---|---|
| 用途 | 获取 ProductAgent 和 BusinessAgent 生成的结构化 claims |
| 请求方法 | `GET` |
| URL | `/api/analysis/{task_id}/claims` |
| 请求参数 | Path 参数：`task_id` |
| 404 行为 | `task_id` 不存在时返回 `404 {"detail": "task_id 不存在"}` |

在 `gaming_mouse` 场景下，`claims` 会围绕电竞鼠标代表型号、产品参数、软件生态、用户口碑、价格定位和电竞影响力生成。

返回示例：

```json
{
  "task_id": "0f7d9b63-7c80-4c08-9f38-0f841d8d4075",
  "claims": [
    {
      "claim_id": "PCL001",
      "content": "罗技在性能参数维度有证据支持，主要体现为高端传感器和无线低延迟体验。",
      "dimension": "性能参数",
      "related_platforms": ["罗技"],
      "evidence_ids": ["EV001"],
      "confidence_score": 0.85,
      "generated_by": "ProductAgent"
    },
    {
      "claim_id": "BCL001",
      "content": "雷蛇在价格定位上更偏向高端电竞用户。",
      "dimension": "价格定位",
      "related_platforms": ["雷蛇"],
      "evidence_ids": ["EV013"],
      "confidence_score": 0.7,
      "generated_by": "BusinessAgent"
    }
  ]
}
```

字段缺失时返回：

```json
{
  "task_id": "0f7d9b63-7c80-4c08-9f38-0f841d8d4075",
  "claims": []
}
```

## GET /api/analysis/{task_id}/trace

| 项目 | 内容 |
|---|---|
| 用途 | 获取 Agent 执行轨迹，用于工作台时间线展示 |
| 请求方法 | `GET` |
| URL | `/api/analysis/{task_id}/trace` |
| 请求参数 | Path 参数：`task_id` |
| 404 行为 | `task_id` 不存在时返回 `404 {"detail": "task_id 不存在"}` |

返回示例：

```json
{
  "task_id": "0f7d9b63-7c80-4c08-9f38-0f841d8d4075",
  "trace_log": [
    {
      "step_id": 1,
      "agent_name": "ResearchAgent",
      "status": "success",
      "output_summary": "collected 21 raw research items",
      "error": null
    },
    {
      "step_id": 7,
      "agent_name": "StrategyAgent",
      "status": "success",
      "output_summary": "generated final_report using 42 claims and 21 evidence items",
      "error": null
    }
  ]
}
```

字段缺失时返回：

```json
{
  "task_id": "0f7d9b63-7c80-4c08-9f38-0f841d8d4075",
  "trace_log": []
}
```

## GET /api/analysis/{task_id}/quality

| 项目 | 内容 |
|---|---|
| 用途 | 获取 QualityAgent 质检结果和打回状态 |
| 请求方法 | `GET` |
| URL | `/api/analysis/{task_id}/quality` |
| 请求参数 | Path 参数：`task_id` |
| 404 行为 | `task_id` 不存在时返回 `404 {"detail": "task_id 不存在"}` |

返回示例：

```json
{
  "task_id": "0f7d9b63-7c80-4c08-9f38-0f841d8d4075",
  "quality_result": {
    "approved": true,
    "score": 90,
    "reject_to": null,
    "reject_reason": null,
    "missing_dimensions": [],
    "missing_platforms": [],
    "required_actions": [],
    "checked_items": {
      "all_claims_have_evidence": true,
      "all_evidence_ids_valid": true,
      "all_competitors_covered": true,
      "all_dimensions_covered": true,
      "product_matrix_not_empty": true,
      "business_matrix_not_empty": true,
      "no_high_severity_risk": true
    },
    "status": "approved",
    "quality_score": 90
  },
  "is_approved": true,
  "iteration_count": 0,
  "rejected_agents": [],
  "needs_human_review": false,
  "quality_status": "approved"
}
```

人工审核状态示例：

```json
{
  "task_id": "0f7d9b63-7c80-4c08-9f38-0f841d8d4075",
  "quality_result": {
    "approved": false,
    "score": 60,
    "reject_to": "EvidenceAgent",
    "reject_reason": "部分质量检查未通过",
    "required_actions": ["补充缺失维度的 evidence"]
  },
  "is_approved": false,
  "iteration_count": 3,
  "rejected_agents": ["EvidenceAgent", "EvidenceAgent", "EvidenceAgent"],
  "needs_human_review": true,
  "quality_status": "rejected_after_max_iterations"
}
```

字段缺失时返回：

```json
{
  "task_id": "0f7d9b63-7c80-4c08-9f38-0f841d8d4075",
  "quality_result": {},
  "is_approved": false,
  "iteration_count": 0,
  "rejected_agents": [],
  "needs_human_review": false,
  "quality_status": ""
}
```

## GET /api/analysis/{task_id}/metrics

| 项目 | 内容 |
|---|---|
| 用途 | 获取报告质量和覆盖率等指标。当前可能为空对象，预留给后续指标服务 |
| 请求方法 | `GET` |
| URL | `/api/analysis/{task_id}/metrics` |
| 请求参数 | Path 参数：`task_id` |
| 404 行为 | `task_id` 不存在时返回 `404 {"detail": "task_id 不存在"}` |

返回示例：

```json
{
  "task_id": "0f7d9b63-7c80-4c08-9f38-0f841d8d4075",
  "metrics": {
    "evidence_count": 21,
    "claim_count": 42,
    "citation_rate": 1.0,
    "coverage_rate": 1.0,
    "quality_score": 90
  }
}
```

字段缺失时返回：

```json
{
  "task_id": "0f7d9b63-7c80-4c08-9f38-0f841d8d4075",
  "metrics": {}
}
```

## GET /api/analysis/{task_id}/risks

| 项目 | 内容 |
|---|---|
| 用途 | 获取 RiskAgent 识别出的风险列表 |
| 请求方法 | `GET` |
| URL | `/api/analysis/{task_id}/risks` |
| 请求参数 | Path 参数：`task_id` |
| 404 行为 | `task_id` 不存在时返回 `404 {"detail": "task_id 不存在"}` |

返回示例：

```json
{
  "task_id": "0f7d9b63-7c80-4c08-9f38-0f841d8d4075",
  "risk_flags": [
    {
      "risk_id": "R001",
      "risk_type": "evidence_gap",
      "description": "雷蛇在价格定位维度缺少可用证据。",
      "severity": "medium",
      "related_platforms": ["雷蛇"],
      "related_dimensions": ["价格定位"],
      "related_evidence_ids": []
    }
  ]
}
```

字段缺失或没有风险时返回：

```json
{
  "task_id": "0f7d9b63-7c80-4c08-9f38-0f841d8d4075",
  "risk_flags": []
}
```

## GET /api/analysis/{task_id}/artifacts

| 项目 | 内容 |
|---|---|
| 用途 | 获取完整中间产物摘要，适合工作台顶部统计卡片 |
| 请求方法 | `GET` |
| URL | `/api/analysis/{task_id}/artifacts` |
| 请求参数 | Path 参数：`task_id` |
| 404 行为 | `task_id` 不存在时返回 `404 {"detail": "task_id 不存在"}` |

在 `gaming_mouse` 场景下，`artifacts` 的统计结果可用于展示电竞鼠标代表型号、产品参数、软件生态、用户口碑、价格定位和电竞影响力相关 evidence / claims 的生成进度。

返回示例：

```json
{
  "task_id": "0f7d9b63-7c80-4c08-9f38-0f841d8d4075",
  "raw_research_count": 21,
  "evidence_count": 21,
  "claim_count": 42,
  "risk_count": 0,
  "trace_count": 7,
  "has_product_matrix": true,
  "has_business_matrix": true,
  "has_final_report": true
}
```

字段缺失时返回：

```json
{
  "task_id": "0f7d9b63-7c80-4c08-9f38-0f841d8d4075",
  "raw_research_count": 0,
  "evidence_count": 0,
  "claim_count": 0,
  "risk_count": 0,
  "trace_count": 0,
  "has_product_matrix": false,
  "has_business_matrix": false,
  "has_final_report": false
}
```

## 404 返回格式

所有带 `{task_id}` 的接口，如果任务不存在，返回：

```json
{
  "detail": "task_id 不存在"
}
```

HTTP 状态码为 `404`。

## 前端联调建议

- Demo 默认行业使用 `gaming_mouse`，默认品牌使用罗技、雷蛇、海盗船。
- 创建任务后立即展示 `task_id` 和 `running` 状态。
- 每 1-2 秒轮询 `/status`，`completed` 后停止轮询。
- 工作台页面可以并行请求：`/evidence`、`/claims`、`/trace`、`/quality`、`/risks`、`/artifacts`。
- 如果 `/quality` 返回 `needs_human_review: true`，前端应展示“待人工审核”状态，并避免把 `final_report` 当作正式报告展示。
- 如果某个只读接口返回空数组或空对象，表示对应 Agent 还没有产出或当前任务没有该类数据。
