import re
from sqlmodel import Session, select
from .models import Category, CategoryRule


def categorise(session: Session, counterparty: str, description: str, sparkasse_kategorie: str | None = None) -> int | None:
    rules = session.exec(select(CategoryRule).order_by(CategoryRule.priority.desc())).all()
    text_by_field = {
        "counterparty": counterparty or "",
        "description": description or "",
    }
    for rule in rules:
        haystack = text_by_field.get(rule.field, "") + " " + (description or "")
        try:
            if re.search(rule.pattern, haystack, re.IGNORECASE):
                return rule.category_id
        except re.error:
            if rule.pattern.lower() in haystack.lower():
                return rule.category_id

    combined = f"{counterparty} {description}".lower()
    cat_by_name = {c.name: c.id for c in session.exec(select(Category)).all()}
    if any(k in combined for k in ("mensa", "marstall", "campuskarte", "mensacard", "studentenwerk")):
        return cat_by_name.get("University / Mensa")
    if "splitwise" in combined:
        return cat_by_name.get("Transfers / Splitwise")

    if sparkasse_kategorie:
        sk = sparkasse_kategorie.lower()
        for name, cid in cat_by_name.items():
            if name.lower() in sk or sk in name.lower():
                return cid

    return cat_by_name.get("Uncategorised")
