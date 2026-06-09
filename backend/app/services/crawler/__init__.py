# 爬虫研究数据提供方模块。
# 注意：此处不做顶层 import，避免在仅使用 database/mock 模式时
# 强制依赖实时抓取相关的第三方库（trafilatura、httpx 等）。
# 各 provider 请按需 `from app.services.crawler.xxx import ...` 直接导入。
