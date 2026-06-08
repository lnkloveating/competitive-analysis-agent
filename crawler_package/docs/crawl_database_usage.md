# 爬虫本地数据库使用文档

## 设计初衷
完全绕过互联网重度反爬站点，将优质人工筛选的真实公开采集内容全部持久化到本地SQLite数据库，全离线环境也能100%跑通完整的多Agent竞品分析全链路，演示零失败零风险。

## 快速开始

### 1. 初始化数据库
```bash
cd backend
python init_crawl_db.py
```
脚本自动在现有项目的SQLite数据库里创建两张新表，完全不影响原有auth用户表。

### 2. 三种模式切换
在 .env 里设置环境变量：
| RESEARCH_PROVIDER 值 | 说明 |
|---|---|
| mock | 默认值，完全沿用原来的Mock生成逻辑 |
| crawler | 实时HTTP联网爬取模式 |
| database | **推荐模式** 直接读取本地预置高质量真实数据，零网络零反爬 |

设置 database 模式后，启动整个系统，后续所有Agent拿到的就是真实的采集内容，直接开始分析。

## 查看数据的三种方式

### 方式1：命令行CLI工具
```bash
# 看统计
python crawl_db_cli.py stats

# 列出所有已入库任务
python crawl_db_cli.py list
```

### 方式2：FastAPI网页接口
启动后端服务后访问自动自带的Swagger：
```
http://localhost:8000/docs
```
你可以网页上直接点击按钮查询所有数据。

### 方式3：前端Evidence页面
全链路跑通后，你在系统前端工作台的Evidence页面里，直接看到所有真实数据，每条都带原始URL，点一下就跳转。

## 手动导入自己找到的优质内容
运行交互式导入工具，你把浏览器里看到的优秀外设评测内容，逐条填进去自动入库：
```bash
python manual_import_to_db.py
```

## 历史归档批量导入
把之前存在 data/archive 目录里的所有历史JSON文件一键批量全部导入数据库：
```bash
python batch_import_archive_to_db.py
```

## 预置数据
项目自带7条精选电竞鼠标真实采集样例，放在 `data/preload/crawl_seeds.json`，开箱即用不需要你做任何额外工作，首次启动 database 模式直接就能消费。
