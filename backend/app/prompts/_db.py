"""Database-backed prompt override helper."""


def get_prompt(key: str, default: str, db=None) -> str:
    """从数据库读取 prompt 内容；若不存在则回退到代码默认值。"""
    if db is None:
        return default
    try:
        from app.models import SystemPrompt
        row = db.query(SystemPrompt).filter(SystemPrompt.key == key).first()
        if row and row.content:
            return row.content
    except Exception:
        pass
    return default
