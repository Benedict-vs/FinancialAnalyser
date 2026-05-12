from pathlib import Path
from sqlmodel import SQLModel, Session, create_engine, select
from .models import Source, Workspace, Category, CategoryRule

DB_PATH = Path(__file__).resolve().parent.parent / "finance.db"
engine = create_engine(f"sqlite:///{DB_PATH}", connect_args={"check_same_thread": False})


def get_session():
    with Session(engine) as session:
        yield session


SEED_CATEGORIES = [
    ("Groceries", "#16a34a"),
    ("Subscriptions", "#a855f7"),
    ("Transport", "#0ea5e9"),
    ("Online Shopping", "#f59e0b"),
    ("Health", "#ef4444"),
    ("University / Mensa", "#eab308"),
    ("Eating Out", "#f97316"),
    ("Rent & Utilities", "#475569"),
    ("Income", "#10b981"),
    ("Transfers / Splitwise", "#6366f1"),
    ("Partying / Going Out", "#ec4899"),
    ("Insurance", "#64748b"),
    ("Cash", "#f43f5e"),
    ("Sport", "#06b6d4"),
    ("Uncategorised", "#94a3b8"),
]

SEED_RULES = [
    ("REWE", "Groceries"),
    ("Edeka", "Groceries"),
    ("EDEKA", "Groceries"),
    ("Aldi", "Groceries"),
    ("ALDI", "Groceries"),
    ("Lidl", "Groceries"),
    ("LIDL", "Groceries"),
    ("Penny", "Groceries"),
    ("PENNY", "Groceries"),
    ("Netto", "Groceries"),
    ("NETTO", "Groceries"),
    ("Spotify", "Subscriptions"),
    ("Netflix", "Subscriptions"),
    ("Apple", "Subscriptions"),
    ("Adobe", "Subscriptions"),
    ("DB Vertrieb", "Transport"),
    ("Deutsche Bahn", "Transport"),
    ("Flixbus", "Transport"),
    ("FlixBus", "Transport"),
    ("BVG", "Transport"),
    ("VRN", "Transport"),
    ("Amazon", "Online Shopping"),
    ("AMZN", "Online Shopping"),
    ("Apotheke", "Health"),
    ("Arzt", "Health"),
    ("dm-drogerie", "Health"),
    ("Mensa", "University / Mensa"),
    ("Marstall", "University / Mensa"),
    ("Campuskarte", "University / Mensa"),
    ("Mensacard", "University / Mensa"),
    ("Studentenwerk", "University / Mensa"),
    ("Splitwise", "Transfers / Splitwise"),
]


def init_db():
    SQLModel.metadata.create_all(engine)
    with Session(engine) as session:
        # Default workspace
        if not session.exec(select(Workspace)).first():
            session.add(Workspace(name="Default", description="Main ledger", color="#0ea5e9"))
            session.commit()

        # Default sources
        existing_sources = {s.type for s in session.exec(select(Source)).all()}
        for name, t, color in [
            ("Sparkasse", "sparkasse", "#dc2626"),
            ("PayPal", "paypal", "#0070ba"),
        ]:
            if t not in existing_sources:
                session.add(Source(name=name, type=t, color=color))
        session.commit()

        # Default categories (system-wide, workspace_id=None)
        existing = {c.name for c in session.exec(select(Category)).all()}
        for name, color in SEED_CATEGORIES:
            if name not in existing:
                session.add(Category(name=name, color=color, is_system=True))
        session.commit()

        # Default rules
        if not session.exec(select(CategoryRule)).first():
            cat_by_name = {c.name: c.id for c in session.exec(select(Category)).all()}
            for pattern, cat_name in SEED_RULES:
                cid = cat_by_name.get(cat_name)
                if cid:
                    session.add(CategoryRule(pattern=pattern, field="counterparty", category_id=cid, priority=100))
            session.commit()
