import re
from datetime import date as _date
from sqlmodel import Session, select
from .models import Category, CategoryRule


def categorise(session: Session, counterparty: str, description: str, sparkasse_kategorie: str | None = None, txn_date: _date | None = None, txn_amount: float | None = None) -> int | None:
    rules = session.exec(select(CategoryRule).order_by(CategoryRule.priority.desc())).all()
    text_by_field = {
        "counterparty": counterparty or "",
        "description": description or "",
    }
    for rule in rules:
        haystack = text_by_field.get(rule.field, "") + " " + (description or "")
        try:
            if re.search(rule.pattern, haystack, re.IGNORECASE):
                # Pattern matched, now check conditions
                if rule.min_amount is not None and txn_amount is not None:
                    if abs(txn_amount) < rule.min_amount:
                        continue
                if rule.max_amount is not None and txn_amount is not None:
                    if abs(txn_amount) > rule.max_amount:
                        continue
                if rule.day_of_month_min is not None and txn_date is not None:
                    if txn_date.day < rule.day_of_month_min:
                        continue
                if rule.day_of_month_max is not None and txn_date is not None:
                    if txn_date.day > rule.day_of_month_max:
                        continue
                # All conditions passed
                return rule.category_id
        except re.error:
            if rule.pattern.lower() in haystack.lower():
                # Pattern matched (substring), now check conditions
                if rule.min_amount is not None and txn_amount is not None:
                    if abs(txn_amount) < rule.min_amount:
                        continue
                if rule.max_amount is not None and txn_amount is not None:
                    if abs(txn_amount) > rule.max_amount:
                        continue
                if rule.day_of_month_min is not None and txn_date is not None:
                    if txn_date.day < rule.day_of_month_min:
                        continue
                if rule.day_of_month_max is not None and txn_date is not None:
                    if txn_date.day > rule.day_of_month_max:
                        continue
                # All conditions passed
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
