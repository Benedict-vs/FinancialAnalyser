from datetime import timedelta
from sqlmodel import Session, select
from .models import Transaction, Source


def enrich_sparkasse_with_paypal(session: Session, workspace_id: int) -> int:
    """For Sparkasse rows flagged needs_paypal_enrichment, find a matching
    PayPal transaction by amount (exact) and date (±2 days)."""
    paypal_source = session.exec(select(Source).where(Source.type == "paypal")).first()
    if not paypal_source:
        return 0

    pending = session.exec(
        select(Transaction).where(
            Transaction.workspace_id == workspace_id,
            Transaction.needs_paypal_enrichment == True,
            Transaction.sparkasse_linked_paypal_id == None,
        )
    ).all()

    matched = 0
    for sp in pending:
        candidates = session.exec(
            select(Transaction).where(
                Transaction.workspace_id == workspace_id,
                Transaction.source_id == paypal_source.id,
                Transaction.amount == sp.amount,
            )
        ).all()
        best = None
        best_delta = 999
        for c in candidates:
            delta = abs((c.date - sp.date).days)
            if delta <= 2 and delta < best_delta:
                best = c
                best_delta = delta
        if best:
            sp.sparkasse_linked_paypal_id = best.id
            sp.counterparty = best.counterparty or sp.counterparty
            if best.description:
                sp.description = best.description
            sp.needs_paypal_enrichment = False
            session.add(sp)
            matched += 1
    session.commit()
    return matched
