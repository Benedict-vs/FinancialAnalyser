from collections import defaultdict
from datetime import timedelta
from sqlmodel import Session, select
from .models import Transaction, FixedCostPattern


def _levenshtein(a: str, b: str, threshold: int = 3) -> int:
    if a == b:
        return 0
    if not a:
        return len(b)
    if not b:
        return len(a)
    if abs(len(a) - len(b)) >= threshold:
        return threshold
    if len(a) > len(b):
        a, b = b, a
    prev = list(range(len(a) + 1))
    for i, cb in enumerate(b, 1):
        curr = [i]
        for j, ca in enumerate(a, 1):
            ins = curr[j - 1] + 1
            dele = prev[j] + 1
            sub = prev[j - 1] + (0 if ca == cb else 1)
            curr.append(min(ins, dele, sub))
        if min(curr) >= threshold:
            return threshold
        prev = curr
    return prev[-1]


def _key(counterparty: str) -> str:
    return (counterparty or "").lower().strip()[:40]


def detect_candidates(session: Session, workspace_id: int) -> list[dict]:
    """Find counterparty groups that look like recurring fixed costs."""
    txns = session.exec(
        select(Transaction).where(Transaction.workspace_id == workspace_id, Transaction.amount < 0)
    ).all()

    groups: dict[str, list[Transaction]] = defaultdict(list)
    keys: list[str] = []
    alias: dict[str, str] = {}
    for t in txns:
        k = _key(t.counterparty)
        if not k:
            continue
        if k in groups:
            groups[k].append(t)
            continue
        if k in alias:
            groups[alias[k]].append(t)
            continue
        matched = None
        for existing in keys:
            if _levenshtein(k, existing) < 3:
                matched = existing
                break
        if matched:
            alias[k] = matched
            groups[matched].append(t)
        else:
            keys.append(k)
            groups[k].append(t)

    candidates: list[dict] = []
    confirmed_patterns = session.exec(
        select(FixedCostPattern).where(FixedCostPattern.confirmed == True)
    ).all()
    confirmed_keys = {_key(p.counterparty_pattern) for p in confirmed_patterns}

    for k, items in groups.items():
        if len(items) < 2 or k in confirmed_keys:
            continue
        items_sorted = sorted(items, key=lambda x: x.date)
        intervals = [
            (items_sorted[i + 1].date - items_sorted[i].date).days
            for i in range(len(items_sorted) - 1)
        ]
        if not intervals:
            continue
        avg_interval = sum(intervals) / len(intervals)

        is_monthly = all(25 <= iv <= 35 for iv in intervals)
        is_yearly = all(351 <= iv <= 379 for iv in intervals)
        if not (is_monthly or is_yearly):
            continue

        amounts = [abs(t.amount) for t in items_sorted]
        avg_amt = sum(amounts) / len(amounts)
        if avg_amt == 0:
            continue
        max_dev = max(abs(a - avg_amt) / avg_amt for a in amounts)
        if max_dev > 0.15:
            continue

        candidates.append({
            "counterparty_pattern": items_sorted[-1].counterparty,
            "typical_amount": round(avg_amt, 2),
            "interval_days": 30 if is_monthly else 365,
            "occurrences": len(items_sorted),
            "last_seen": items_sorted[-1].date.isoformat(),
            "label": items_sorted[-1].counterparty,
            "transaction_ids": [t.id for t in items_sorted],
        })
    return candidates


def apply_confirmed_patterns(session: Session, workspace_id: int):
    """Tag transactions matching confirmed FixedCostPattern rows."""
    patterns = session.exec(
        select(FixedCostPattern).where(FixedCostPattern.confirmed == True)
    ).all()
    txns = session.exec(
        select(Transaction).where(
            Transaction.workspace_id == workspace_id, Transaction.is_fixed_cost == False
        )
    ).all()
    for p in patterns:
        pkey = _key(p.counterparty_pattern)
        for t in txns:
            if _levenshtein(_key(t.counterparty), pkey) < 3:
                amt = abs(t.amount)
                if abs(amt - p.typical_amount) / max(p.typical_amount, 0.01) <= (p.amount_tolerance_pct / 100):
                    t.is_fixed_cost = True
                    t.fixed_cost_label = p.label
                    if p.category_id and not t.category_id:
                        t.category_id = p.category_id
                    session.add(t)
    session.commit()
