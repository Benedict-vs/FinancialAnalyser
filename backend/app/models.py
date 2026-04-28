from datetime import date as _date, time as _time, datetime as _datetime
from typing import Optional
from sqlmodel import SQLModel, Field


class Source(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    name: str
    type: str  # sparkasse | paypal | wise | other
    color: str = "#64748b"
    created_at: _datetime = Field(default_factory=_datetime.utcnow)


class Workspace(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    name: str
    description: Optional[str] = None
    color: str = "#0ea5e9"
    created_at: _datetime = Field(default_factory=_datetime.utcnow)


class Category(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    name: str
    color: str = "#94a3b8"
    is_system: bool = False
    workspace_id: Optional[int] = Field(default=None, foreign_key="workspace.id")


class CategoryRule(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    pattern: str
    field: str = "counterparty"  # counterparty | description
    category_id: int = Field(foreign_key="category.id")
    priority: int = 100


class ReimbursementGroup(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    label: str
    notes: Optional[str] = None
    workspace_id: int = Field(foreign_key="workspace.id")
    created_at: _datetime = Field(default_factory=_datetime.utcnow)


class FixedCostPattern(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    source_id: int = Field(foreign_key="source.id")
    counterparty_pattern: str
    typical_amount: float
    amount_tolerance_pct: float = 15.0
    interval_days: int = 30
    interval_tolerance_days: int = 5
    label: str
    category_id: Optional[int] = Field(default=None, foreign_key="category.id")
    confirmed: bool = False
    workspace_id: Optional[int] = Field(default=None, foreign_key="workspace.id")


class BudgetThreshold(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    category_id: int = Field(foreign_key="category.id")
    workspace_id: int = Field(foreign_key="workspace.id")
    monthly_limit: float


class Transaction(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    workspace_id: int = Field(foreign_key="workspace.id", index=True)
    source_id: int = Field(foreign_key="source.id", index=True)
    date: _date = Field(index=True)
    time: Optional[_time] = None
    amount: float
    currency: str = "EUR"
    counterparty: str = ""
    description: str = ""
    note: Optional[str] = None
    category_id: Optional[int] = Field(default=None, foreign_key="category.id", index=True)
    is_fixed_cost: bool = False
    fixed_cost_label: Optional[str] = None
    reimbursement_group_id: Optional[int] = Field(default=None, foreign_key="reimbursementgroup.id", index=True)
    reimbursement_role: Optional[str] = None  # expense | reimbursement
    paypal_transaction_id: Optional[str] = Field(default=None, index=True)
    sparkasse_linked_paypal_id: Optional[int] = Field(default=None, foreign_key="transaction.id")
    needs_paypal_enrichment: bool = False
    fee: float = 0.0
    raw: str = "{}"
    imported_at: _datetime = Field(default_factory=_datetime.utcnow)
    is_duplicate: bool = False
    dedup_hash: Optional[str] = Field(default=None, index=True)
