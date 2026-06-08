# 实时爬虫模块使用文档

## 模块总览

本模块为竞品分析 Agent 系统提供完全真实的互联网实时数据采集能力，替代原有的 Mock 模拟数据源，实现从公开互联网获取最新电竞外设相关信息的完整端到端链路。

## 目录结构

```
backend/
  config/
    crawler_config.yaml          # 全局爬虫配置
  app/services/
    crawler/
      __init__.py
      http_downloader.py         # HTTP下载器
      content_extractor.py       # 正文清洗提取
      cache_manager.py           # 本地缓存管理
      dimension_classifier.py    # 维度自动分类
      crawler_research_provider.py # 主爬虫类
      archive_manager.py        # 历史归档管理
      failed_url_retry.py        # 失败URL重试队列
      incremental_crawler.py    # 增量爬虫
      quality_statistics.py     # 数据质量统计
    research_provider_factory.py # Provider动态工厂
  run_crawler_demo.py            # 一键演示脚本
  manual_crawl_single_url.py     # 单URL手动爬取工具
  test_crawler_provider.py       # 爬虫单元测试
```

## 快速开始

### 1. 安装额外依赖

```bash
cd backend
pip install trafilatura>=1.10.0 pyyaml>=6.0.0
```

原有项目所有依赖完全兼容，无需卸载或修改任何已有包。

### 2. 环境变量配置

在 `.env` 文件中添加（可选，默认值为 `mock`）：

```
RESEARCH_PROVIDER=crawler
```

- `mock`：使用原有 MockResearchProvider，完全向后兼容
- `crawler`：启用真实实时爬虫模式

### 3. 一键运行演示

```bash
cd backend
python run_crawler_demo.py
```

脚本会自动开始实时爬取电竞鼠标行业的所有种子URL，控制台逐行打印进度，最终输出完全结构化的 RawResearchItem 列表。

## 核心功能说明

### 真实种子URL池配置

配置文件 `config/crawler_config.yaml` 中预置了三个电竞品类各15+条真实公开URL：

- gaming_mouse（电竞鼠标）
- gaming_keyboard（电竞键盘）
- gaming_headset（电竞头戴式耳机）

覆盖全部6种source_type：official / news / review / ecommerce / user_review / report。

### 本地缓存机制

所有爬取过的页面响应自动以 URL 的 SHA1 哈希值为文件名保存在 `data/cache/crawled/` 目录下，默认TTL为7天。

优点：
- 避免重复请求相同网站，提升速度
- 演示过程不会被网站限流或封IP
- 断网环境下仍然可以正常从缓存读取已有数据

### 历史数据回看

所有爬虫执行完的结果自动归档在 `data/archive/` 目录，以 `{task_id}_{timestamp}.json` 命名永久留存。通过 ArchiveManager 可以随时回看任意历史批次的原始爬取数据。

## 工具使用

### 手动单URL爬取工具

```bash
python manual_crawl_single_url.py https://www.example.com review 罗技
```

适合用户手动补充遗漏的数据源，立即生成一条完全合规的 RawResearchItem 条目。

### 运行单元测试

```bash
pytest backend/test_crawler_provider.py -v
```

验证所有Schema字段完整性、source_type枚举值、缓存机制正确性。

## 常见问题排查

1. **部分网站爬取失败**
   - 属于正常现象，爬虫有自动重试机制，失败的URL不会中断整体流程
   - 可以后续手动运行重试队列单独重试这批失败的URL

2. **想清空所有缓存重新全量爬取**
   - 删除 `data/cache/crawled/` 目录下的所有 .json 文件即可

3. **如何添加新的种子URL**
   - 直接编辑 `backend/config/crawler_config.yaml` 在对应行业分组的 seed_urls 数组中追加新条目即可

## 架构特性承诺

本爬虫模块所有代码100%不改动任何原有Agent业务逻辑和前端代码，完全向后兼容零侵入。
