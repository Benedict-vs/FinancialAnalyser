# Finance Analyser

A fully-local personal finance web app built with **FastAPI** (Python 3.12+) + **React 18** (Vite) + **SQLite** + **Tailwind** + **Recharts** + **Framer Motion** + **dnd-kit**.

## Quick Start

```bash
./run.sh
```

This will:
1. Create a Python venv and install dependencies
2. Install npm packages
3. Start FastAPI backend on `:8000`
4. Start Vite dev server on `:5173`

Then open **http://localhost:5173** in your browser.

## Features

### Core
- **SQLite database** with SQLModel ORM — stores everything locally
- **Isolated workspaces** — create separate ledgers for trips, internships, etc.
- **Drag-and-drop recategorisation** — move transactions between categories with dnd-kit
- **Smooth animations** — Framer Motion on expand/collapse, tile transitions, toasts

### Import & Parsing
- **PayPal CSV** auto-detection and parsing (UTF-8 with BOM)
- **Sparkasse CSV** auto-detection and parsing (German format: semicolon delimiter, comma decimals)
- **Generic CSV** with user-defined column mappings (Wise, other banks)
- **Duplicate detection** by hash + PayPal transaction ID
- **PayPal ↔ Sparkasse cross-link enrichment** — auto-matches PayPal top-ups on Sparkasse by amount/date

### Categorisation
- **Auto-categorisation** on import using:
  - User-defined regex rules (keyword → category)
  - Sparkasse category hints
  - Built-in patterns (Mensa, Splitwise, etc.)
- **Default seed categories**: Groceries, Subscriptions, Transport, Online Shopping, Health, University/Mensa, Eating Out, Rent & Utilities, Income, Transfers/Splitwise, Uncategorised
- **Budget thresholds** per category (amber at 80%, red at 100%)

### Fixed Cost Detection
- **Auto-detection** of recurring transactions by counterparty, frequency, and amount variance
- **Levenshtein matching** for fuzzy grouping (handles minor name variations)
- **Monthly (~30 days) and yearly (~365 days) patterns** with tolerance windows
- **Candidate confirmation** UI to save patterns and backfill matching transactions

### Reimbursement Groups
- **Link expenses ↔ reimbursements** across categories, sources, and dates
- **Mensa auto-suggestion** — detects Campuskarte top-ups + incoming PayPal "Mensa" payments, offers one-click grouping
- **Net totals** with reimbursement offset displayed in category view

### Analytics
- **Monthly overview** — tiles per category with sparklines, drill-down to transaction list
- **Trends** — 6/12-month line chart with toggle-able categories
- **Estimates** — next-month forecast per category (3-month rolling average)
- **Summary stats** — in, out, net, fixed costs

### UI/UX
- **Workspace switcher** in top nav — switch ledgers instantly
- **Tabs for views**: Overview, Trends, Fixed Costs, Reimbursements, Import, Settings
- **Dark-aware Tailwind** — responsive grid layout, smooth Framer Motion animations
- **EUR formatting** — German locale (1.234,56 €)
- **Empty states** — friendly prompts to import first CSV
- **Toast notifications** — inline feedback (success, error, info)
- **Inline editing** — transactions: note, category, fixed-cost label, reimbursement group

### Settings
- **Manage sources** — add Sparkasse, PayPal, Wise, or custom sources with custom colours
- **Manage workspaces** — create isolated ledgers
- **Manage categories** — create, rename, recolour
- **Category rules** — define keyword patterns for auto-categorisation
- **Budget thresholds** — set monthly limits per category

## Architecture

### Backend (`backend/`)
```
app/
├── main.py              # FastAPI app + all endpoints
├── models.py            # SQLModel ORM (Source, Workspace, Transaction, etc.)
├── db.py                # SQLite init + seed data
├── parsers.py           # PayPal, Sparkasse, generic CSV parsers
├── categorise.py        # Auto-categorisation engine
├── fixed_costs.py       # Fixed cost detection + confirmation
└── enrichment.py        # PayPal ↔ Sparkasse cross-linking
requirements.txt        # Python deps (FastAPI, SQLModel, etc.)
```

API endpoints:
- `POST /import` — upload CSV + preview/confirm
- `GET /transactions`, `PATCH /transactions/{id}`, `POST /transactions/bulk-categorise`
- `GET /categories`, `POST /categories`, `PATCH /categories/{id}`
- `GET /category-rules`, `POST /category-rules`, `DELETE /category-rules/{id}`
- `GET /fixed-costs`, `POST /fixed-costs/confirm`, `DELETE /fixed-costs/{id}`
- `GET /reimbursement-groups`, `POST /reimbursement-groups`, `PATCH /reimbursement-groups/{id}`, `DELETE /reimbursement-groups/{id}`
- `GET /analytics/monthly`, `GET /analytics/trends`, `GET /analytics/estimates`
- `GET /workspaces`, `POST /workspaces`
- `GET /sources`, `POST /sources`
- `GET /budget-thresholds`, `POST /budget-thresholds`, `DELETE /budget-thresholds/{id}`

### Frontend (`frontend/`)
```
src/
├── main.jsx               # React 18 entry + Tailwind
├── App.jsx                # Top-level router + workspace switcher
├── api.js                 # Fetch wrapper + formatting helpers (fmtEUR, fmtDate)
├── components/
│   ├── Toasts.jsx         # Toast context + notifications
│   └── Empty.jsx          # Empty state component
└── views/
    ├── MonthlyOverview.jsx # Category tiles + drag-drop recategorise
    ├── TrendsView.jsx      # 6-month line chart (Recharts)
    ├── FixedCostsPanel.jsx # Confirmed + candidate patterns
    ├── ImportView.jsx      # CSV upload + preview
    ├── ReimbursementLinker.jsx  # Link expenses ↔ reimbursements + Mensa suggestions
    └── SettingsView.jsx    # Manage sources, workspaces, categories, rules, budgets
```

### Database Schema
- **Source** — bank/service (Sparkasse, PayPal, Wise, custom)
- **Workspace** — isolated ledger
- **Transaction** — dated event with amount, category, optional reimbursement group
- **Category** — for grouping transactions
- **CategoryRule** — pattern → category mapping
- **ReimbursementGroup** — links N expenses to M reimbursements
- **FixedCostPattern** — detected/confirmed recurring transaction template
- **BudgetThreshold** — monthly limit per category

All tables use SQLite with proper indexing on `workspace_id`, `date`, `category_id`, `reimbursement_group_id`.

## Dependencies

### Backend
- **fastapi** — REST API framework
- **uvicorn** — ASGI server
- **sqlmodel** — SQLAlchemy ORM + Pydantic validation
- **python-multipart** — file upload handling

### Frontend
- **react**, **react-dom** — UI library
- **@vitejs/plugin-react** — JSX support
- **vite** — build tool
- **tailwindcss**, **postcss**, **autoprefixer** — styling
- **framer-motion** — animations
- **@dnd-kit/core**, **@dnd-kit/sortable** — drag-and-drop
- **recharts** — charting library

## Usage Tips

1. **First import**: Go to "Import" tab → upload a Sparkasse or PayPal CSV → select source + workspace → confirm
2. **Auto-categorisation**: Rules apply on import; check category assignments in Monthly Overview
3. **Fixed costs**: Wait for ~3–4 months of data, then check "Fixed Costs" tab for candidates
4. **Mensa**: Import Campuskarte top-ups (Studentenwerk), then import PayPal with "Mensa" in description. Tab → Reimbursements → accept suggestion
5. **Budgets**: Settings → Budgets → set limits per category
6. **Rules**: Settings → Rules → add patterns like "Spotify" → Subscriptions

## No Auth, No Cloud

Everything runs locally. No signup, no API keys, no tracking. SQLite database is a single file in `backend/finance.db`.

---

Built with ❤️ for local-first personal finance tracking.
