from collections import defaultdict
from datetime import date, datetime, timedelta
from typing import Optional
import calendar

from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sqlmodel import Session, select

from .db import init_db, get_session
from .models import (
    Source, Workspace, Category, CategoryRule,
    ReimbursementGroup, FixedCostPattern, BudgetThreshold, Transaction,
)
from .parsers import parse_paypal, parse_sparkasse, parse_generic, sniff_columns
from .categorise import categorise
from .fixed_costs import detect_candidates, apply_confirmed_patterns
from .enrichment import enrich_sparkasse_with_paypal


app = FastAPI(title="Finance Analyser")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def on_startup():
    init_db()


# ---------- Workspaces ----------

class WorkspaceCreate(BaseModel):
    name: str
    description: Optional[str] = None
    color: str = "#0ea5e9"


@app.get("/workspaces")
def list_workspaces(session: Session = Depends(get_session)):
    return session.exec(select(Workspace).order_by(Workspace.id)).all()


@app.post("/workspaces")
def create_workspace(body: WorkspaceCreate, session: Session = Depends(get_session)):
    w = Workspace(**body.dict())
    session.add(w)
    session.commit()
    session.refresh(w)
    return w


# ---------- Sources ----------

class SourceCreate(BaseModel):
    name: str
    type: str
    color: str = "#64748b"


@app.get("/sources")
def list_sources(session: Session = Depends(get_session)):
    return session.exec(select(Source).order_by(Source.id)).all()


@app.post("/sources")
def create_source(body: SourceCreate, session: Session = Depends(get_session)):
    s = Source(**body.dict())
    session.add(s)
    session.commit()
    session.refresh(s)
    return s


# ---------- Categories ----------

class CategoryCreate(BaseModel):
    name: str
    color: str = "#94a3b8"
    workspace_id: Optional[int] = None


class CategoryUpdate(BaseModel):
    name: Optional[str] = None
    color: Optional[str] = None


@app.get("/categories")
def list_categories(session: Session = Depends(get_session)):
    return session.exec(select(Category).order_by(Category.id)).all()


@app.post("/categories")
def create_category(body: CategoryCreate, session: Session = Depends(get_session)):
    c = Category(**body.dict(), is_system=False)
    session.add(c)
    session.commit()
    session.refresh(c)
    return c


@app.patch("/categories/{cat_id}")
def update_category(cat_id: int, body: CategoryUpdate, session: Session = Depends(get_session)):
    c = session.get(Category, cat_id)
    if not c:
        raise HTTPException(404)
    for k, v in body.dict(exclude_unset=True).items():
        setattr(c, k, v)
    session.add(c)
    session.commit()
    session.refresh(c)
    return c


# ---------- Category Rules ----------

class RuleCreate(BaseModel):
    pattern: str
    field: str = "counterparty"
    category_id: int
    priority: int = 100
    min_amount: Optional[float] = None
    max_amount: Optional[float] = None
    day_of_month_min: Optional[int] = None
    day_of_month_max: Optional[int] = None


class RuleUpdate(BaseModel):
    pattern: Optional[str] = None
    field: Optional[str] = None
    category_id: Optional[int] = None
    priority: Optional[int] = None
    min_amount: Optional[float] = None
    max_amount: Optional[float] = None
    day_of_month_min: Optional[int] = None
    day_of_month_max: Optional[int] = None


@app.get("/category-rules")
def list_rules(session: Session = Depends(get_session)):
    return session.exec(select(CategoryRule).order_by(CategoryRule.priority.desc())).all()


@app.post("/category-rules")
def create_rule(body: RuleCreate, session: Session = Depends(get_session)):
    r = CategoryRule(**body.dict())
    session.add(r)
    session.commit()
    session.refresh(r)
    return r


@app.delete("/category-rules/{rule_id}")
def delete_rule(rule_id: int, session: Session = Depends(get_session)):
    r = session.get(CategoryRule, rule_id)
    if not r:
        raise HTTPException(404)
    session.delete(r)
    session.commit()
    return {"ok": True}


@app.put("/category-rules/{rule_id}")
def update_rule(rule_id: int, body: RuleUpdate, session: Session = Depends(get_session)):
    r = session.get(CategoryRule, rule_id)
    if not r:
        raise HTTPException(404)
    for k, v in body.dict(exclude_unset=True).items():
        setattr(r, k, v)
    session.add(r)
    session.commit()
    session.refresh(r)
    return r


class RecategoriseRequest(BaseModel):
    transactions: list[dict]  # [{counterparty, description}, ...]


@app.post("/categorise-batch")
def categorise_batch(body: RecategoriseRequest, session: Session = Depends(get_session)):
    """Re-categorize a batch of transactions based on current rules."""
    results = []
    for txn in body.transactions:
        cat_id = categorise(
            session,
            txn.get("counterparty", ""),
            txn.get("description", ""),
            txn_date=txn.get("date"),
            txn_amount=txn.get("amount"),
        )
        results.append({
            "counterparty": txn.get("counterparty", ""),
            "description": txn.get("description", ""),
            "category_id": cat_id,
        })
    return {"results": results}


class RecategoriseSimilarRequest(BaseModel):
    pattern: str  # The rule pattern to match against
    new_category_id: int


@app.post("/recategorise-similar")
def recategorise_similar(body: RecategoriseSimilarRequest, session: Session = Depends(get_session)):
    """Re-categorize all uncategorized transactions matching a pattern and conditions."""
    import re

    uncategorised_cat = session.exec(select(Category).where(Category.name == "Uncategorised")).first()
    if not uncategorised_cat:
        raise HTTPException(400, "Uncategorised category not found")

    # Find the rule that will be applied (to get its conditions)
    rule = session.exec(
        select(CategoryRule).where(CategoryRule.category_id == body.new_category_id)
    ).first()

    # Find all uncategorized transactions
    all_uncategorized = session.exec(
        select(Transaction).where(
            Transaction.category_id == uncategorised_cat.id,
        )
    ).all()

    # Filter by pattern match and conditions
    matched = []
    try:
        # Try regex match first
        pattern_re = re.compile(body.pattern, re.IGNORECASE)
        for txn in all_uncategorized:
            haystack = (txn.counterparty or "") + " " + (txn.description or "")
            if pattern_re.search(haystack):
                # Pattern matched, now check rule conditions if rule exists
                if rule:
                    if rule.min_amount is not None and abs(txn.amount) < rule.min_amount:
                        continue
                    if rule.max_amount is not None and abs(txn.amount) > rule.max_amount:
                        continue
                    if rule.day_of_month_min is not None and txn.date.day < rule.day_of_month_min:
                        continue
                    if rule.day_of_month_max is not None and txn.date.day > rule.day_of_month_max:
                        continue
                matched.append(txn)
    except re.error:
        # Fallback to substring match
        pattern_lower = body.pattern.lower()
        for txn in all_uncategorized:
            haystack = ((txn.counterparty or "") + " " + (txn.description or "")).lower()
            if pattern_lower in haystack:
                # Pattern matched, now check rule conditions if rule exists
                if rule:
                    if rule.min_amount is not None and abs(txn.amount) < rule.min_amount:
                        continue
                    if rule.max_amount is not None and abs(txn.amount) > rule.max_amount:
                        continue
                    if rule.day_of_month_min is not None and txn.date.day < rule.day_of_month_min:
                        continue
                    if rule.day_of_month_max is not None and txn.date.day > rule.day_of_month_max:
                        continue
                matched.append(txn)

    print(f"DEBUG recategorise_similar: pattern='{body.pattern}', uncategorised_id={uncategorised_cat.id}, found={len(matched)}")
    for txn in matched:
        print(f"  - Updating txn {txn.id}: {txn.counterparty}")

    # Update them all
    for txn in matched:
        txn.category_id = body.new_category_id
        session.add(txn)

    session.commit()
    return {"updated": len(matched)}


# ---------- Import ----------

@app.post("/import/preview")
async def preview_import(
    file: UploadFile = File(...),
    source_id: int = Form(...),
    session: Session = Depends(get_session),
):
    src = session.get(Source, source_id)
    if not src:
        raise HTTPException(404, "Source not found")
    content = await file.read()
    if src.type == "paypal":
        rows = parse_paypal(content)
    elif src.type == "sparkasse":
        rows = parse_sparkasse(content)
    else:
        return {"columns": sniff_columns(content), "rows": [], "needs_mapping": True}

    existing_hashes = {
        h for h in session.exec(select(Transaction.dedup_hash)).all() if h
    }
    existing_paypal_ids = {
        p for p in session.exec(select(Transaction.paypal_transaction_id)).all() if p
    }
    duplicates = 0
    for r in rows:
        is_dup = (r.get("paypal_transaction_id") and r["paypal_transaction_id"] in existing_paypal_ids) \
                 or (r.get("dedup_hash") in existing_hashes)
        r["is_duplicate"] = is_dup
        if is_dup:
            duplicates += 1

    preview = []
    for r in rows[:20]:
        preview.append({
            "date": r["date"].isoformat() if r.get("date") else None,
            "amount": r.get("amount"),
            "counterparty": r.get("counterparty"),
            "description": r.get("description"),
            "is_duplicate": r.get("is_duplicate", False),
            "needs_paypal_enrichment": r.get("needs_paypal_enrichment", False),
        })
    return {
        "total": len(rows),
        "duplicates": duplicates,
        "preview": preview,
        "needs_mapping": False,
    }


@app.post("/import")
async def do_import(
    file: UploadFile = File(...),
    source_id: int = Form(...),
    workspace_id: int = Form(...),
    session: Session = Depends(get_session),
):
    src = session.get(Source, source_id)
    if not src:
        raise HTTPException(404, "Source not found")
    ws = session.get(Workspace, workspace_id)
    if not ws:
        raise HTTPException(404, "Workspace not found")

    content = await file.read()
    if src.type == "paypal":
        rows = parse_paypal(content)
    elif src.type == "sparkasse":
        rows = parse_sparkasse(content)
    else:
        raise HTTPException(400, "Use /import/generic for non-standard sources")

    existing_hashes = {
        h for h in session.exec(select(Transaction.dedup_hash)).all() if h
    }
    existing_paypal_ids = {
        p for p in session.exec(select(Transaction.paypal_transaction_id)).all() if p
    }

    inserted = 0
    skipped = 0
    for r in rows:
        if r.get("paypal_transaction_id") and r["paypal_transaction_id"] in existing_paypal_ids:
            skipped += 1
            continue
        if r.get("dedup_hash") in existing_hashes:
            skipped += 1
            continue

        cat_id = categorise(
            session,
            r.get("counterparty", ""),
            r.get("description", ""),
            r.get("sparkasse_kategorie"),
            txn_date=r.get("date"),
            txn_amount=r.get("amount"),
        )
        t = Transaction(
            workspace_id=workspace_id,
            source_id=source_id,
            date=r["date"],
            time=r.get("time"),
            amount=r["amount"],
            currency=r.get("currency", "EUR"),
            counterparty=r.get("counterparty", ""),
            description=r.get("description", ""),
            note=r.get("note"),
            category_id=cat_id,
            paypal_transaction_id=r.get("paypal_transaction_id"),
            needs_paypal_enrichment=r.get("needs_paypal_enrichment", False),
            fee=r.get("fee", 0.0),
            raw=r.get("raw", "{}"),
            dedup_hash=r.get("dedup_hash"),
        )
        session.add(t)
        inserted += 1
        existing_hashes.add(r.get("dedup_hash"))
        if r.get("paypal_transaction_id"):
            existing_paypal_ids.add(r["paypal_transaction_id"])

    session.commit()

    matched = enrich_sparkasse_with_paypal(session, workspace_id)
    apply_confirmed_patterns(session, workspace_id)

    return {
        "inserted": inserted,
        "skipped_duplicates": skipped,
        "paypal_matches": matched,
    }


# ---------- Transactions ----------

class TransactionUpdate(BaseModel):
    category_id: Optional[int] = None
    note: Optional[str] = None
    is_fixed_cost: Optional[bool] = None
    fixed_cost_label: Optional[str] = None
    reimbursement_group_id: Optional[int] = None
    reimbursement_role: Optional[str] = None


class BulkCategorise(BaseModel):
    transaction_ids: list[int]
    category_id: int


def auto_learn_rule(session: Session, transaction: Transaction, new_category_id: int) -> dict | None:
    """
    Create a rule based on a manual categorization override.
    Returns dict with rule info or None if no rule was created.
    """
    # Only create rules for non-empty counterparties
    if not transaction.counterparty or not transaction.counterparty.strip():
        print(f"DEBUG auto_learn_rule: skipping empty counterparty")
        return None

    # Check if a rule already exists for this exact counterparty+category combo
    existing = session.exec(
        select(CategoryRule).where(
            CategoryRule.pattern == transaction.counterparty,
            CategoryRule.field == "counterparty",
            CategoryRule.category_id == new_category_id
        )
    ).first()
    if existing:
        print(f"DEBUG auto_learn_rule: rule already exists for '{transaction.counterparty}' -> {new_category_id}")
        return None  # Rule already exists

    # Create new rule with priority=150 (beats default 100)
    rule = CategoryRule(
        pattern=transaction.counterparty,
        field="counterparty",
        category_id=new_category_id,
        priority=150
    )
    session.add(rule)
    session.commit()
    session.refresh(rule)
    print(f"DEBUG auto_learn_rule: created rule {rule.id} for '{transaction.counterparty}' -> {new_category_id}")
    return {
        "id": rule.id,
        "pattern": rule.pattern,
        "field": rule.field,
        "category_id": rule.category_id,
        "priority": rule.priority,
    }


@app.get("/transactions")
def list_transactions(
    workspace_id: int,
    year: Optional[int] = None,
    month: Optional[int] = None,
    category_id: Optional[int] = None,
    source_id: Optional[int] = None,
    needs_enrichment: Optional[bool] = None,
    search: Optional[str] = None,
    limit: int = 500,
    session: Session = Depends(get_session),
):
    q = select(Transaction).where(Transaction.workspace_id == workspace_id)
    if year and month:
        first = date(year, month, 1)
        last = date(year, month, calendar.monthrange(year, month)[1])
        q = q.where(Transaction.date >= first, Transaction.date <= last)
    if category_id is not None:
        q = q.where(Transaction.category_id == category_id)
    if source_id is not None:
        q = q.where(Transaction.source_id == source_id)
    if needs_enrichment:
        q = q.where(Transaction.needs_paypal_enrichment == True)
    if search:
        q = q.where(
            Transaction.counterparty.icontains(search)
            | Transaction.description.icontains(search)
        )
    q = q.order_by(Transaction.date.desc(), Transaction.id.desc()).limit(limit)
    return session.exec(q).all()


@app.patch("/transactions/{tid}")
def update_transaction(tid: int, body: TransactionUpdate, session: Session = Depends(get_session)):
    t = session.get(Transaction, tid)
    if not t:
        raise HTTPException(404)

    # Check if category is being updated and if it's an override
    rule_auto_learned = None
    if "category_id" in body.dict(exclude_unset=True):
        new_category_id = body.category_id
        # Determine what the current rules would categorize this transaction as
        current_auto_category = categorise(
            session,
            t.counterparty or "",
            t.description or "",
            txn_date=t.date,
            txn_amount=t.amount,
        )
        print(f"DEBUG update_transaction: tid={tid}, current_auto={current_auto_category}, new={new_category_id}")
        # If user is overriding the auto-categorization, learn the pattern
        if new_category_id and new_category_id != current_auto_category:
            rule_auto_learned = auto_learn_rule(session, t, new_category_id)
            print(f"DEBUG update_transaction: rule_auto_learned={rule_auto_learned is not None}")

    # Update transaction fields
    for k, v in body.dict(exclude_unset=True).items():
        setattr(t, k, v)
    session.add(t)
    session.commit()
    session.refresh(t)

    # Return response with auto-learning info
    response = {
        "transaction": t,
        "rule_auto_learned": rule_auto_learned is not None,
        "auto_learned_rule": rule_auto_learned,
    }
    print(f"DEBUG update_transaction: response={response}")
    return response


@app.post("/transactions/bulk-categorise")
def bulk_categorise(body: BulkCategorise, session: Session = Depends(get_session)):
    for tid in body.transaction_ids:
        t = session.get(Transaction, tid)
        if t:
            t.category_id = body.category_id
            session.add(t)
    session.commit()
    return {"updated": len(body.transaction_ids)}


# ---------- Fixed Costs ----------

class FixedCostConfirm(BaseModel):
    workspace_id: int
    counterparty_pattern: str
    typical_amount: float
    interval_days: int
    label: str
    source_id: int
    category_id: Optional[int] = None
    transaction_ids: list[int] = []


@app.get("/fixed-costs")
def fixed_costs(workspace_id: int, session: Session = Depends(get_session)):
    confirmed = session.exec(
        select(FixedCostPattern).where(
            (FixedCostPattern.confirmed == True),
            ((FixedCostPattern.workspace_id == workspace_id) | (FixedCostPattern.workspace_id == None)),
        )
    ).all()
    candidates = detect_candidates(session, workspace_id)
    return {"confirmed": confirmed, "candidates": candidates}


@app.post("/fixed-costs/confirm")
def confirm_fixed_cost(body: FixedCostConfirm, session: Session = Depends(get_session)):
    p = FixedCostPattern(
        source_id=body.source_id,
        counterparty_pattern=body.counterparty_pattern,
        typical_amount=body.typical_amount,
        interval_days=body.interval_days,
        label=body.label,
        category_id=body.category_id,
        confirmed=True,
        workspace_id=body.workspace_id,
    )
    session.add(p)
    session.commit()
    session.refresh(p)
    for tid in body.transaction_ids:
        t = session.get(Transaction, tid)
        if t:
            t.is_fixed_cost = True
            t.fixed_cost_label = body.label
            if body.category_id and not t.category_id:
                t.category_id = body.category_id
            session.add(t)
    session.commit()
    apply_confirmed_patterns(session, body.workspace_id)
    return p


@app.delete("/fixed-costs/{pid}")
def delete_fixed_cost(pid: int, session: Session = Depends(get_session)):
    p = session.get(FixedCostPattern, pid)
    if not p:
        raise HTTPException(404)
    session.delete(p)
    session.commit()
    return {"ok": True}


# ---------- Reimbursement Groups ----------

class GroupCreate(BaseModel):
    label: str
    notes: Optional[str] = None
    workspace_id: int
    expense_ids: list[int] = []
    reimbursement_ids: list[int] = []


class GroupUpdate(BaseModel):
    label: Optional[str] = None
    notes: Optional[str] = None
    expense_ids: Optional[list[int]] = None
    reimbursement_ids: Optional[list[int]] = None


@app.get("/reimbursement-groups")
def list_groups(workspace_id: int, session: Session = Depends(get_session)):
    groups = session.exec(
        select(ReimbursementGroup).where(ReimbursementGroup.workspace_id == workspace_id)
    ).all()
    out = []
    for g in groups:
        txns = session.exec(
            select(Transaction).where(Transaction.reimbursement_group_id == g.id)
        ).all()
        out.append({
            "id": g.id,
            "label": g.label,
            "notes": g.notes,
            "workspace_id": g.workspace_id,
            "transactions": [t.dict() for t in txns],
        })
    return out


@app.post("/reimbursement-groups")
def create_group(body: GroupCreate, session: Session = Depends(get_session)):
    g = ReimbursementGroup(label=body.label, notes=body.notes, workspace_id=body.workspace_id)
    session.add(g)
    session.commit()
    session.refresh(g)
    for tid in body.expense_ids:
        t = session.get(Transaction, tid)
        if t:
            t.reimbursement_group_id = g.id
            t.reimbursement_role = "expense"
            session.add(t)
    for tid in body.reimbursement_ids:
        t = session.get(Transaction, tid)
        if t:
            t.reimbursement_group_id = g.id
            t.reimbursement_role = "reimbursement"
            session.add(t)
    session.commit()
    return g


@app.patch("/reimbursement-groups/{gid}")
def update_group(gid: int, body: GroupUpdate, session: Session = Depends(get_session)):
    g = session.get(ReimbursementGroup, gid)
    if not g:
        raise HTTPException(404)
    if body.label is not None:
        g.label = body.label
    if body.notes is not None:
        g.notes = body.notes
    session.add(g)
    if body.expense_ids is not None or body.reimbursement_ids is not None:
        existing = session.exec(
            select(Transaction).where(Transaction.reimbursement_group_id == gid)
        ).all()
        for t in existing:
            t.reimbursement_group_id = None
            t.reimbursement_role = None
            session.add(t)
        for tid in body.expense_ids or []:
            t = session.get(Transaction, tid)
            if t:
                t.reimbursement_group_id = gid
                t.reimbursement_role = "expense"
                session.add(t)
        for tid in body.reimbursement_ids or []:
            t = session.get(Transaction, tid)
            if t:
                t.reimbursement_group_id = gid
                t.reimbursement_role = "reimbursement"
                session.add(t)
    session.commit()
    return g


@app.delete("/reimbursement-groups/{gid}")
def delete_group(gid: int, session: Session = Depends(get_session)):
    g = session.get(ReimbursementGroup, gid)
    if not g:
        raise HTTPException(404)
    txns = session.exec(
        select(Transaction).where(Transaction.reimbursement_group_id == gid)
    ).all()
    for t in txns:
        t.reimbursement_group_id = None
        t.reimbursement_role = None
        session.add(t)
    session.delete(g)
    session.commit()
    return {"ok": True}


@app.get("/reimbursement-groups/suggest-mensa")
def suggest_mensa(workspace_id: int, session: Session = Depends(get_session)):
    """Suggest pairing incoming PayPal 'Mensa' with recent Studentenwerk top-ups."""
    today = date.today()
    cutoff = today - timedelta(days=60)
    paypal_source = session.exec(select(Source).where(Source.type == "paypal")).first()
    sparkasse_source = session.exec(select(Source).where(Source.type == "sparkasse")).first()

    incoming = []
    if paypal_source:
        incoming = session.exec(
            select(Transaction).where(
                Transaction.workspace_id == workspace_id,
                Transaction.source_id == paypal_source.id,
                Transaction.amount > 0,
                Transaction.date >= cutoff,
                Transaction.reimbursement_group_id == None,
            )
        ).all()
        incoming = [t for t in incoming if "mensa" in (t.description or "").lower() or "mensa" in (t.note or "").lower()]

    topups = []
    if sparkasse_source:
        all_sp = session.exec(
            select(Transaction).where(
                Transaction.workspace_id == workspace_id,
                Transaction.source_id == sparkasse_source.id,
                Transaction.amount < 0,
                Transaction.date >= cutoff,
            )
        ).all()
        topups = [t for t in all_sp if any(k in (t.counterparty or "").lower() + (t.description or "").lower()
                                           for k in ("studentenwerk", "campuskarte", "mensa", "marstall"))]
    return {"incoming_paypal": incoming, "campuskarte_topups": topups}


# ---------- Analytics ----------

@app.get("/analytics/monthly")
def analytics_monthly(
    workspace_id: int,
    year: int,
    month: int,
    session: Session = Depends(get_session),
):
    first = date(year, month, 1)
    last = date(year, month, calendar.monthrange(year, month)[1])
    txns = session.exec(
        select(Transaction).where(
            Transaction.workspace_id == workspace_id,
            Transaction.date >= first,
            Transaction.date <= last,
        )
    ).all()

    # Build reimbursement-group net offsets keyed by group
    group_totals: dict[int, float] = defaultdict(float)
    for t in txns:
        if t.reimbursement_group_id is not None:
            group_totals[t.reimbursement_group_id] += t.amount

    cat_totals: dict[Optional[int], dict] = defaultdict(lambda: {"gross": 0.0, "net": 0.0, "count": 0, "fixed": 0.0})
    total_in = 0.0
    total_out = 0.0
    fixed_total = 0.0
    for t in txns:
        cid = t.category_id
        cat_totals[cid]["gross"] += t.amount
        cat_totals[cid]["net"] += t.amount
        cat_totals[cid]["count"] += 1
        if t.is_fixed_cost:
            cat_totals[cid]["fixed"] += t.amount
            fixed_total += t.amount
        if t.amount > 0:
            total_in += t.amount
        else:
            total_out += t.amount

    cats = session.exec(select(Category)).all()
    cat_lookup = {c.id: c for c in cats}
    out = []
    for cid, vals in cat_totals.items():
        c = cat_lookup.get(cid) if cid is not None else None
        out.append({
            "category_id": cid,
            "category_name": c.name if c else "Uncategorised",
            "color": c.color if c else "#94a3b8",
            "gross": round(vals["gross"], 2),
            "net": round(vals["net"], 2),
            "fixed": round(vals["fixed"], 2),
            "count": vals["count"],
        })
    out.sort(key=lambda x: x["gross"])
    return {
        "year": year,
        "month": month,
        "total_in": round(total_in, 2),
        "total_out": round(total_out, 2),
        "net": round(total_in + total_out, 2),
        "fixed_total": round(fixed_total, 2),
        "categories": out,
    }


@app.get("/analytics/trends")
def analytics_trends(
    workspace_id: int,
    months: int = 6,
    session: Session = Depends(get_session),
):
    today = date.today()
    cats = session.exec(select(Category)).all()
    cat_lookup = {c.id: c for c in cats}

    months_list: list[tuple[int, int]] = []
    y, m = today.year, today.month
    for _ in range(months):
        months_list.append((y, m))
        m -= 1
        if m == 0:
            m = 12
            y -= 1
    months_list.reverse()

    first_yr, first_mo = months_list[0]
    last_yr, last_mo = months_list[-1]
    range_start = date(first_yr, first_mo, 1)
    range_end = date(last_yr, last_mo, calendar.monthrange(last_yr, last_mo)[1])

    txns = session.exec(
        select(Transaction).where(
            Transaction.workspace_id == workspace_id,
            Transaction.date >= range_start,
            Transaction.date <= range_end,
        )
    ).all()

    series: dict[int, dict[str, float]] = defaultdict(lambda: defaultdict(float))
    for t in txns:
        key = f"{t.date.year:04d}-{t.date.month:02d}"
        series[t.category_id or 0][key] += t.amount

    out = []
    for cid, points in series.items():
        c = cat_lookup.get(cid)
        out.append({
            "category_id": cid or None,
            "category_name": c.name if c else "Uncategorised",
            "color": c.color if c else "#94a3b8",
            "points": [{"month": f"{yr:04d}-{mo:02d}", "value": round(points.get(f"{yr:04d}-{mo:02d}", 0), 2)} for (yr, mo) in months_list],
        })
    return {"months": [f"{y:04d}-{m:02d}" for (y, m) in months_list], "series": out}


@app.get("/analytics/estimates")
def analytics_estimates(workspace_id: int, session: Session = Depends(get_session)):
    """Per-category estimate for next month based on 3-month rolling average."""
    today = date.today()
    months_list: list[tuple[int, int]] = []
    y, m = today.year, today.month
    for _ in range(3):
        m -= 1
        if m == 0:
            m = 12
            y -= 1
        months_list.append((y, m))

    first_yr, first_mo = months_list[-1]
    last_yr, last_mo = months_list[0]
    range_start = date(first_yr, first_mo, 1)
    range_end = date(last_yr, last_mo, calendar.monthrange(last_yr, last_mo)[1])

    txns = session.exec(
        select(Transaction).where(
            Transaction.workspace_id == workspace_id,
            Transaction.date >= range_start,
            Transaction.date <= range_end,
        )
    ).all()

    monthly_buckets: dict[int, dict[str, float]] = defaultdict(lambda: defaultdict(float))
    for t in txns:
        key = f"{t.date.year}-{t.date.month}"
        monthly_buckets[t.category_id or 0][key] += t.amount

    cats = session.exec(select(Category)).all()
    cat_lookup = {c.id: c for c in cats}
    out = []
    for cid, month_vals in monthly_buckets.items():
        avg = sum(month_vals.values()) / len(months_list)
        c = cat_lookup.get(cid)
        out.append({
            "category_id": cid or None,
            "category_name": c.name if c else "Uncategorised",
            "color": c.color if c else "#94a3b8",
            "estimate": round(avg, 2),
        })
    return out


# ---------- Budget Thresholds ----------

class ThresholdCreate(BaseModel):
    category_id: int
    workspace_id: int
    monthly_limit: float


@app.get("/budget-thresholds")
def list_thresholds(workspace_id: int, session: Session = Depends(get_session)):
    return session.exec(
        select(BudgetThreshold).where(BudgetThreshold.workspace_id == workspace_id)
    ).all()


@app.post("/budget-thresholds")
def create_threshold(body: ThresholdCreate, session: Session = Depends(get_session)):
    existing = session.exec(
        select(BudgetThreshold).where(
            BudgetThreshold.category_id == body.category_id,
            BudgetThreshold.workspace_id == body.workspace_id,
        )
    ).first()
    if existing:
        existing.monthly_limit = body.monthly_limit
        session.add(existing)
        session.commit()
        session.refresh(existing)
        return existing
    b = BudgetThreshold(**body.dict())
    session.add(b)
    session.commit()
    session.refresh(b)
    return b


@app.delete("/budget-thresholds/{tid}")
def delete_threshold(tid: int, session: Session = Depends(get_session)):
    b = session.get(BudgetThreshold, tid)
    if not b:
        raise HTTPException(404)
    session.delete(b)
    session.commit()
    return {"ok": True}


# ---------- Maintenance ----------

class CacheClear(BaseModel):
    workspace_id: int


@app.post("/cache/clear")
def clear_cache(body: CacheClear, session: Session = Depends(get_session)):
    """Clear all transactions in a workspace."""
    ws = session.get(Workspace, body.workspace_id)
    if not ws:
        raise HTTPException(404, "Workspace not found")

    txns = session.exec(
        select(Transaction).where(Transaction.workspace_id == body.workspace_id)
    ).all()
    for t in txns:
        session.delete(t)
    session.commit()
    return {"ok": True, "deleted": len(txns)}
