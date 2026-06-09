# 方案：用户自选品类 + 竞品，查看(实时)爬虫分析

> 目标：用户在前端选择品类（电竞鼠标/键盘/耳机）+ 勾选要对比的竞品（≥2 个），
> 点"开始分析"后跑通后端工作流，并看到爬虫采集的过程/结果。
> 后端数据接线已完成（鼠标/键盘/耳机均已接真实爬虫数据）。

---

## 0. 当前缺口盘点（动手前先知道）

1. **前端写死成鼠标**：`frontend/src/pages/NewAnalysisPage.tsx`
   - 第 44-45 行 `industryKey` 永远是 `gaming_mouse`
   - 第 16 行 `defaultCompetitors` 写死 `["罗技","雷蛇","海盗船"]`
   - 第 17-26 行 `defaultDimensions` 写死鼠标维度
   - 没有任何品类下拉 / 竞品选择控件
2. **实时爬虫只配了鼠标**：`backend/config/crawler_config.yaml` 里 `industries` 只有 `gaming_mouse`
   的 3 个种子 URL；`gaming_keyboard` / `gaming_headset` 没有种子 URL → 切 `crawler` 模式时键盘/耳机抓不到东西。
3. **后端不向前端推送"逐条爬取进度"**：`/api/analysis/{id}/status` 只返回 agent 级进度
   （ResearchAgent 固定 12%），爬虫逐 URL 只 `print` 到控制台，前端拿不到"正在爬第几条 URL"。

> 结论：前端选品类+竞品 **不需要改后端接口**，同学可独立完成（见 §2）。
> 但"看到实时爬虫**过程**"需要后端额外做进度暴露（见 §3），这块由后端同学/我来做。

---

## 1. 数据来源模式说明（重要）

`backend/.env` 的 `RESEARCH_PROVIDER` 决定数据来源：

| 模式 | 行为 | 演示稳定性 | 键盘/耳机支持 |
|------|------|-----------|--------------|
| `database`（当前默认） | 读预载真实爬虫数据 `data/preload/crawl_seeds.json`（鼠标/键盘/耳机各 7 条） | 稳，秒级返回 | ✅ 已就绪 |
| `crawler` | 现场抓公开网页 | 慢(每 URL 0.5~1.5s + 重试)、可能被反爬、不稳定 | ❌ 需先补种子 URL（§3.1） |
| `mock` | LLM/确定性模拟 | 稳 | ✅ |

**建议**：演示主走 `database`（真实数据、稳、三品类齐全）；"实时过程"作为可选增强。

> 另外提醒：`backend/.env` 当前 **没有关闭 LLM**（`*_USE_LLM=0` 只在 `.env.example` 里）。
> 跑起来会真实调用豆包模型。要离线/省钱演示，把那 7 个 `=0` 复制进 `backend/.env`。

---

## 2. 前端改造方案（同学做，纯前端，不动后端接口）

只改 `frontend/src/pages/NewAnalysisPage.tsx`，复用已有 API：
`analysisApi.getIndustries()` 和 `analysisApi.startAnalysis(payload)`。

### 2.1 加载品类列表
- 组件挂载时 `analysisApi.getIndustries()` → 返回 `{ industries: Industry[] }`
- `Industry` 类型已定义（`types/analysis.ts`）：`{ industry_key, name, competitors[], dimensions[], representative_products }`
- 过滤出要展示的品类（如 `gaming_mouse` / `gaming_keyboard` / `gaming_headset`），做**品类下拉/卡片选择**。

### 2.2 竞品多选/搜索（核心需求）
- 选中品类后，用 `industry.competitors` 作为候选项渲染**可勾选 chips + 搜索框**：
  - 支持勾选已有竞品；支持输入框搜索过滤；可选：允许输入自定义竞品名追加。
  - 校验：**至少选 2 个**才允许提交（按钮 disabled + 提示）。
- 从已选竞品里指定一个作为 `target_platform`（"重点品牌"），或单独留一个输入框。

### 2.3 维度
- 用 `industry.dimensions` 渲染可勾选维度，默认全选，允许取消。

### 2.4 组装 payload（字段后端已支持，无需改接口）
```ts
const payload: StartAnalysisRequest = {
  industry_key: selectedIndustry.industry_key,   // 用户所选品类
  competitors: selectedCompetitors,              // 用户勾选，≥2
  target_platform: focusBrand,                   // 用户指定的重点品牌
  focus_dimensions: selectedDimensions,          // 用户所选维度
  analysis_scene: `${selectedIndustry.name}竞品分析`,
  target_user: targetUser,                       // 表单
  time_range: timeRange,                         // 表单
};
await analysisApi.startAnalysis(payload);
```
- 删掉第 16 行 `defaultCompetitors`、第 17-26 行 `defaultDimensions`、第 44-45 行写死的 `industryKey`，
  全部改成由所选品类驱动的 state。
- 提交后流程不变：拿 `task_id` → 跳 WorkflowPage 轮询。

### 2.5 验收
- 选"电竞键盘" + 勾"罗技/雷蛇/Cherry" → 报告/证据页应出现 GK001~GK007 的键盘数据。
- 选"电竞耳机" + 勾"索尼/森海塞尔/雷蛇" → 出现 GH001~GH007 的耳机数据。

---

## 3. 让"实时爬虫过程"成立（后端做）

如果要的是"用户看着它一条条爬"，需要后端两步：

### 3.1 给键盘/耳机补实时种子 URL
`backend/config/crawler_config.yaml` 的 `industries` 下增加 `gaming_keyboard`、`gaming_headset`，
各配几个**无反爬的公开页**（维基/官方规格页/百科等），格式同现有 `gaming_mouse`。

### 3.2 把爬取进度暴露给前端（当前没有，需新增）
现状：`CrawlerResearchProvider.collect()` 逐 URL 只 `print`。要前端能显示过程，二选一：
- **轻量(推荐)**：爬虫把每条 URL 的结果（url/状态/标题/命中维度）写进 state 的 `crawl_log`，
  新增 `GET /api/analysis/{id}/crawl-log` 端点，前端在 WorkflowPage 轮询展示"已爬 N 条 / 当前 URL"。
- **完整**：SSE / WebSocket 流式推送爬取事件。

> 这部分是后端工作（前端同学无法单独完成）。需要的话我来加 `crawl_log` + 端点，前端按 §2 接好后即可显示过程。

### 3.3 切到实时模式
`backend/.env` 设 `RESEARCH_PROVIDER=crawler`（演示完可切回 `database`）。

---

## 4. 已知约束
- 实时爬虫慢且可能被反爬，演示不稳；预载数据库稳定且也是真实抓来的数据。
- QualityAgent 质检较严：所选竞品需在数据里有对应证据，否则会 `rejected`（各品类一致，非 bug）。
- 后端接口、`startAnalysis` 字段均已就绪，前端选品类+竞品**不需要等后端**。
