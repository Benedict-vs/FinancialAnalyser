import { useEffect, useState, useCallback } from "react";
import { api, fmtEUR } from "../api";
import { useToast } from "../components/Toasts.jsx";

export default function SettingsView({ ctx }) {
  const [tab, setTab] = useState("sources");
  const tabs = [
    { id: "sources", label: "Sources" },
    { id: "workspaces", label: "Workspaces" },
    { id: "categories", label: "Categories" },
    { id: "rules", label: "Rules" },
    { id: "budgets", label: "Budgets" },
    { id: "maintenance", label: "Maintenance" },
  ];
  return (
    <div>
      <div className="flex gap-1 mb-6 border-b border-slate-200">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2 text-sm border-b-2 -mb-px transition-colors ${
              tab === t.id
                ? "border-slate-900 text-slate-900"
                : "border-transparent text-slate-500 hover:text-slate-900"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === "sources" && <SourcesTab ctx={ctx} />}
      {tab === "workspaces" && <WorkspacesTab ctx={ctx} />}
      {tab === "categories" && <CategoriesTab ctx={ctx} />}
      {tab === "rules" && <RulesTab ctx={ctx} />}
      {tab === "budgets" && <BudgetsTab ctx={ctx} />}
      {tab === "maintenance" && <MaintenanceTab ctx={ctx} />}
    </div>
  );
}

function SourcesTab({ ctx }) {
  const [name, setName] = useState("");
  const [type, setType] = useState("other");
  const [color, setColor] = useState("#64748b");
  const { push } = useToast();
  return (
    <div className="max-w-2xl">
      <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100 mb-4">
        {ctx.sources.map((s) => (
          <div key={s.id} className="px-4 py-3 flex items-center gap-3">
            <div className="w-3 h-3 rounded-full" style={{ background: s.color }} />
            <div className="flex-1">
              <div className="font-medium">{s.name}</div>
              <div className="text-xs text-slate-500">{s.type}</div>
            </div>
          </div>
        ))}
      </div>
      <div className="bg-white rounded-xl border border-slate-200 p-4">
        <div className="font-medium mb-3">Add source</div>
        <div className="grid grid-cols-3 gap-2 mb-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Name (e.g. Wise)"
            className="text-sm border border-slate-200 rounded-md px-3 py-2"
          />
          <select
            value={type}
            onChange={(e) => setType(e.target.value)}
            className="text-sm border border-slate-200 rounded-md px-3 py-2"
          >
            <option value="sparkasse">sparkasse</option>
            <option value="paypal">paypal</option>
            <option value="wise">wise</option>
            <option value="other">other</option>
          </select>
          <input
            type="color"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            className="h-9 w-full rounded-md cursor-pointer"
          />
        </div>
        <button
          onClick={async () => {
            if (!name) return;
            await api.createSource({ name, type, color });
            push("Source added", "success");
            await ctx.refreshCategories();
            setName("");
          }}
          className="text-sm bg-slate-900 text-white px-3 py-1.5 rounded-md hover:bg-slate-700"
        >
          Add
        </button>
      </div>
    </div>
  );
}

function WorkspacesTab({ ctx }) {
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const { push } = useToast();
  return (
    <div className="max-w-2xl">
      <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100 mb-4">
        {ctx.workspaces.map((w) => (
          <div key={w.id} className="px-4 py-3 flex items-center gap-3">
            <div className="w-3 h-3 rounded-full" style={{ background: w.color }} />
            <div className="flex-1">
              <div className="font-medium">{w.name}</div>
              {w.description && (
                <div className="text-xs text-slate-500">{w.description}</div>
              )}
            </div>
          </div>
        ))}
      </div>
      <div className="bg-white rounded-xl border border-slate-200 p-4">
        <div className="font-medium mb-3">New workspace</div>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Name"
          className="w-full text-sm border border-slate-200 rounded-md px-3 py-2 mb-2"
        />
        <input
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
          placeholder="Description (optional)"
          className="w-full text-sm border border-slate-200 rounded-md px-3 py-2 mb-2"
        />
        <button
          onClick={async () => {
            if (!name) return;
            await api.createWorkspace({ name, description: desc || null });
            push("Workspace created", "success");
            await ctx.refreshWorkspaces();
            setName("");
            setDesc("");
          }}
          className="text-sm bg-slate-900 text-white px-3 py-1.5 rounded-md hover:bg-slate-700"
        >
          Create
        </button>
      </div>
    </div>
  );
}

function CategoriesTab({ ctx }) {
  const [name, setName] = useState("");
  const [color, setColor] = useState("#94a3b8");
  const { push } = useToast();
  return (
    <div className="max-w-2xl">
      <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100 mb-4">
        {ctx.categories.map((c) => (
          <div key={c.id} className="px-4 py-3 flex items-center gap-3">
            <input
              type="color"
              defaultValue={c.color}
              onChange={async (e) => {
                await api.updateCategory(c.id, { color: e.target.value });
                ctx.refreshCategories();
              }}
              className="w-6 h-6 rounded-full cursor-pointer"
            />
            <input
              defaultValue={c.name}
              onBlur={async (e) => {
                if (e.target.value !== c.name) {
                  await api.updateCategory(c.id, { name: e.target.value });
                  ctx.refreshCategories();
                }
              }}
              className="flex-1 bg-transparent text-sm focus:outline-none"
            />
            {c.is_system && (
              <span className="text-[10px] uppercase text-slate-400">system</span>
            )}
          </div>
        ))}
      </div>
      <div className="bg-white rounded-xl border border-slate-200 p-4">
        <div className="font-medium mb-3">Add category</div>
        <div className="flex gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Name"
            className="flex-1 text-sm border border-slate-200 rounded-md px-3 py-2"
          />
          <input
            type="color"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            className="h-9 w-12 rounded-md cursor-pointer"
          />
          <button
            onClick={async () => {
              if (!name) return;
              await api.createCategory({ name, color });
              push("Added", "success");
              ctx.refreshCategories();
              setName("");
            }}
            className="text-sm bg-slate-900 text-white px-3 py-1.5 rounded-md hover:bg-slate-700"
          >
            Add
          </button>
        </div>
      </div>
    </div>
  );
}

function RulesTab({ ctx }) {
  const [rules, setRules] = useState([]);
  const [pattern, setPattern] = useState("");
  const [field, setField] = useState("counterparty");
  const [catId, setCatId] = useState("");
  const [minAmount, setMinAmount] = useState("");
  const [maxAmount, setMaxAmount] = useState("");
  const [dayMin, setDayMin] = useState("");
  const [dayMax, setDayMax] = useState("");
  const { push } = useToast();
  const load = useCallback(async () => setRules(await api.rules()), []);
  useEffect(() => { load(); }, [load]);

  const catName = (id) => ctx.categories.find((c) => c.id === id)?.name || "—";

  const formatCondition = (r) => {
    const parts = [];
    if (r.min_amount !== null && r.max_amount !== null) {
      parts.push(`€${r.min_amount}-${r.max_amount}`);
    } else if (r.min_amount !== null) {
      parts.push(`≥€${r.min_amount}`);
    } else if (r.max_amount !== null) {
      parts.push(`≤€${r.max_amount}`);
    }
    if (r.day_of_month_min !== null && r.day_of_month_max !== null) {
      parts.push(`days ${r.day_of_month_min}-${r.day_of_month_max}`);
    } else if (r.day_of_month_min !== null) {
      parts.push(`from day ${r.day_of_month_min}`);
    } else if (r.day_of_month_max !== null) {
      parts.push(`until day ${r.day_of_month_max}`);
    }
    return parts.length > 0 ? parts.join(", ") : null;
  };

  return (
    <div className="max-w-4xl">
      <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100 mb-4">
        {rules.map((r) => {
          const condition = formatCondition(r);
          return (
            <div key={r.id} className="px-4 py-3 flex items-center gap-3 text-sm">
              <code className="bg-slate-100 px-2 py-0.5 rounded text-xs">{r.pattern}</code>
              <span className="text-slate-400">in</span>
              <span className="text-slate-600">{r.field}</span>
              <span className="text-slate-400">→</span>
              <span className="font-medium">{catName(r.category_id)}</span>
              {condition && (
                <>
                  <span className="text-slate-300">·</span>
                  <span className="text-slate-400 text-xs">{condition}</span>
                </>
              )}
              <button
                onClick={async () => {
                  await api.deleteRule(r.id);
                  push("Removed", "success");
                  load();
                }}
                className="ml-auto text-slate-400 hover:text-rose-600 text-xs"
              >
                ✕
              </button>
            </div>
          );
        })}
      </div>
      <div className="bg-white rounded-xl border border-slate-200 p-4">
        <div className="font-medium mb-3">Add rule</div>
        <div className="grid grid-cols-4 gap-2 mb-3">
          <input
            value={pattern}
            onChange={(e) => setPattern(e.target.value)}
            placeholder="Pattern (regex or text)"
            className="text-sm border border-slate-200 rounded-md px-3 py-2 col-span-2"
          />
          <select
            value={field}
            onChange={(e) => setField(e.target.value)}
            className="text-sm border border-slate-200 rounded-md px-3 py-2"
          >
            <option value="counterparty">counterparty</option>
            <option value="description">description</option>
          </select>
          <select
            value={catId}
            onChange={(e) => setCatId(e.target.value)}
            className="text-sm border border-slate-200 rounded-md px-3 py-2"
          >
            <option value="">— Category —</option>
            {ctx.categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-4 gap-2">
          <input
            type="number"
            value={minAmount}
            onChange={(e) => setMinAmount(e.target.value)}
            placeholder="Min amount (€)"
            step="0.01"
            className="text-sm border border-slate-200 rounded-md px-3 py-2"
          />
          <input
            type="number"
            value={maxAmount}
            onChange={(e) => setMaxAmount(e.target.value)}
            placeholder="Max amount (€)"
            step="0.01"
            className="text-sm border border-slate-200 rounded-md px-3 py-2"
          />
          <input
            type="number"
            value={dayMin}
            onChange={(e) => setDayMin(e.target.value)}
            placeholder="Day min (1-31)"
            min="1"
            max="31"
            className="text-sm border border-slate-200 rounded-md px-3 py-2"
          />
          <input
            type="number"
            value={dayMax}
            onChange={(e) => setDayMax(e.target.value)}
            placeholder="Day max (1-31)"
            min="1"
            max="31"
            className="text-sm border border-slate-200 rounded-md px-3 py-2"
          />
          <button
            onClick={async () => {
              if (!pattern || !catId) return;
              await api.createRule({
                pattern,
                field,
                category_id: Number(catId),
                priority: 100,
                min_amount: minAmount ? Number(minAmount) : null,
                max_amount: maxAmount ? Number(maxAmount) : null,
                day_of_month_min: dayMin ? Number(dayMin) : null,
                day_of_month_max: dayMax ? Number(dayMax) : null,
              });
              push("Rule added", "success");

              // Apply rule to existing uncategorized transactions
              try {
                const result = await api.recategoriseSimilar(pattern, Number(catId));
                if (result?.updated > 0) {
                  push(`Re-categorized ${result.updated} matching transaction${result.updated === 1 ? "" : "s"}`, "info");
                }
              } catch (err) {
                console.error("Failed to apply rule to uncategorized transactions:", err);
              }

              load();
              setPattern("");
              setMinAmount("");
              setMaxAmount("");
              setDayMin("");
              setDayMax("");
            }}
            className="col-span-4 text-sm bg-slate-900 text-white px-3 py-1.5 rounded-md hover:bg-slate-700"
          >
            Add
          </button>
        </div>
      </div>
    </div>
  );
}

function BudgetsTab({ ctx }) {
  const [thresholds, setThresholds] = useState([]);
  const load = useCallback(async () => {
    setThresholds(await api.thresholds(ctx.workspace.id));
  }, [ctx.workspace.id]);
  useEffect(() => { load(); }, [load]);

  const setLimit = async (cid, val) => {
    if (!val || val <= 0) return;
    await api.setThreshold({
      category_id: cid,
      workspace_id: ctx.workspace.id,
      monthly_limit: Number(val),
    });
    load();
  };

  const limitFor = (cid) =>
    thresholds.find((t) => t.category_id === cid)?.monthly_limit ?? "";

  return (
    <div className="max-w-2xl">
      <div className="text-sm text-slate-500 mb-3">
        Monthly limits for {ctx.workspace.name}. Tile turns amber at 80%, red at 100%.
      </div>
      <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100">
        {ctx.categories
          .filter((c) => c.name !== "Income")
          .map((c) => (
            <div key={c.id} className="px-4 py-2 flex items-center gap-3">
              <div className="w-3 h-3 rounded-full" style={{ background: c.color }} />
              <div className="flex-1 text-sm">{c.name}</div>
              <input
                type="number"
                step="10"
                defaultValue={limitFor(c.id)}
                onBlur={(e) => setLimit(c.id, e.target.value)}
                placeholder="—"
                className="w-28 text-sm border border-slate-200 rounded-md px-2 py-1 text-right"
              />
              <span className="text-xs text-slate-400">€/mo</span>
            </div>
          ))}
      </div>
    </div>
  );
}

function MaintenanceTab({ ctx }) {
  const [busy, setBusy] = useState(false);
  const { push } = useToast();

  const handleClearCache = async () => {
    const txnCount = await api.transactions({ workspace_id: ctx.workspace.id }).then(t => t.length).catch(() => "?");
    if (!confirm(`Delete all ${txnCount} transactions in "${ctx.workspace.name}"? This cannot be undone.`)) return;
    try {
      setBusy(true);
      const result = await api.clearCache(ctx.workspace.id);
      push(`Deleted ${result.deleted} transactions`, "success");
    } catch (e) {
      push(`Error: ${e.message}`, "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-2xl">
      <div className="bg-white rounded-xl border border-slate-200 p-4">
        <div className="font-medium mb-3">Clear Transactions</div>
        <div className="text-sm text-slate-600 mb-4">
          Delete all transactions from <span className="font-semibold">{ctx.workspace.name}</span>. This action cannot be undone.
        </div>
        <button
          onClick={handleClearCache}
          disabled={busy}
          className="px-4 py-2 bg-rose-600 text-white text-sm rounded-md hover:bg-rose-700 disabled:opacity-50"
        >
          {busy ? "Deleting…" : "Delete All Transactions"}
        </button>
      </div>
    </div>
  );
}
