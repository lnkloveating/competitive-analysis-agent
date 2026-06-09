# ORM 模型包。导入即把模型注册到 auth.db 的 Base.metadata。
from app.models.crawl_models import CrawlTask, CrawlRawItem

__all__ = ["CrawlTask", "CrawlRawItem"]
