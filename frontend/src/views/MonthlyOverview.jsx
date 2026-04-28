import { useEffect, useState, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
  DragOverlay,
} from "@dnd-kit/core";
import { api, fmtEUR, fmtDate, MONTH_NAMES } from "../api";
import { useToast } from "../components/Toasts.jsx";
import Empty from "../components/Empty.jsx";

export default function MonthlyOverview({ ctx }) {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [data, setData] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [expanded, setExpanded] = useState(null);
  const [thresholds, setThresholds] = useState([]);
  const [trends, setTrends] = useState(null);
  const [groups, setGroups] = useState([]);
  const [showNet, setShowNet] = useState(false);
  const [activeDrag, setActiveDrag] = useState(null);
  const { push } = useToast();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const load = useCallback(async () => {
    const [m, t, b, tr, g] = await Promise.all([
      api.monthly(ctx.workspace.id, year, month),
      api.transactions({ workspace_id: ctx.workspace.id, year, month }),
      api.thresholds(ctx.workspace.id),
      api.trends(ctx.workspace.id, 4),
      api.groups(ctx.workspace.id),
    ]);
    setData(m);
    setTransactions(t);
    setThresholds(b);
    setTrends(tr);
    setGroups(g);
  }, [ctx.workspace.id, year, month]);

  useEffect(() => {
    load();
  }, [load]);

  const moveMonth = (delta) => {
    let m = month + delta;
    let y = year;
    if (m < 1) { m = 12; y -= 1; }
    if (m > 12) { m = 1; y += 1; }
    setMonth(m);
    setYear(y);
  };

  // Group reimbursement totals (income)
  const groupNet = useMemo(() => {
    const map = {};
    for (const t of transactions) {
      if (t.reimbursement_group_id) {
        map[t.reimbursement_group_id] = (map[t.reimbursement_group_id] || 0) + t.amount;
      }
    }
    return map;
  }, [transactions]);

  const txnsByCategory = useMemo(() => {
    const m = {};
    for (const t of transactions) {
      const k = t.category_id ?? "none";
      (m[k] ||= []).push(t);
    }
    return m;
  }, [transactions]);

  const handleDragEnd = async (event) => {
    setActiveDrag(null);
    const { active, over } = event;
    if (!over) return;
    if (!active.id || !over.id) return;
    if (active.id.startsWith("txn:")) {
      const txnId = Number(active.id.split(":")[1]);
      const fromCat = Number(active.data.current?.fromCat);
      const toCat = over.id.startsWith("cat:") ? Number(over.id.split(":")[1]) : null;
      if (toCat && toCat !== fromCat) {
        await api.patchTransaction(txnId, { category_id: toCat });
        push("Recategorised", "success");
        await load();
      }
    }
  };

  if (!data) {
    return <div className="text-slate-500 text-sm">Loading…</div>;
  }

  const sparklineFor = (catId) => {
    if (!trends) return [];
    const series = trends.series.find((s) => (s.category_id ?? null) === (catId ?? null));
    return series ? series.points.map((p) => p.value) : [];
  };

  const thresholdFor = (catId) =>
    thresholds.find((b) => b.category_id === catId)?.monthly_limit;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <button
            onClick={() => moveMonth(-1)}
            className="w-9 h-9 rounded-md text-slate-500 hover:bg-slate-100"
          >
            ‹
          </button>
          <select
            value={month}
            onChange={(e) => setMonth(Number(e.target.value))}
            className="text-lg font-semibold bg-transparent focus:outline-none cursor-pointer"
          >
            {MONTH_NAMES.map((n, i) => (
              <option key={i} value={i + 1}>{n}</option>
            ))}
          </select>
          <select
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            className="text-lg font-semibold bg-transparent focus:outline-none cursor-pointer"
          >
            {[year - 2, year - 1, year, year + 1].map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
          <button
            onClick={() => moveMonth(1)}
            className="w-9 h-9 rounded-md text-slate-500 hover:bg-slate-100"
          >
            ›
          </button>
        </div>

        <label className="flex items-center gap-2 text-sm text-slate-500 cursor-pointer">
          <input
            type="checkbox"
            checked={showNet}
            onChange={(e) => setShowNet(e.target.checked)}
            className="rounded"
          />
          Show net (after reimbursements)
        </label>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <SummaryStat label="In" value={fmtEUR(data.total_in)} color="text-emerald-600" />
        <SummaryStat label="Out" value={fmtEUR(data.total_out)} color="text-rose-600" />
        <SummaryStat label="Net" value={fmtEUR(data.net)} color={data.net >= 0 ? "text-emerald-600" : "text-rose-600"} />
        <SummaryStat label="Fixed costs" value={fmtEUR(data.fixed_total)} color="text-slate-700" />
      </div>

      {transactions.length === 0 ? (
        <Empty
          title="No transactions yet"
          hint="Import your first CSV to get started — Sparkasse and PayPal supported out of the box."
        />
      ) : (
        <DndContext
          sensors={sensors}
          onDragStart={(e) => setActiveDrag(e.active)}
          onDragEnd={handleDragEnd}
          onDragCancel={() => setActiveDrag(null)}
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {data.categories
              .slice()
              .sort((a, b) => {
                if (a.category_name === "Uncategorised") return -1;
                if (b.category_name === "Uncategorised") return 1;
                return a.gross - b.gross;
              })
              .map((cat) => (
                <CategoryTile
                  key={cat.category_id ?? "none"}
                  cat={cat}
                  txns={txnsByCategory[cat.category_id ?? "none"] || []}
                  expanded={expanded === (cat.category_id ?? "none")}
                  onToggle={() =>
                    setExpanded(
                      expanded === (cat.category_id ?? "none")
                        ? null
                        : cat.category_id ?? "none"
                    )
                  }
                  sparkline={sparklineFor(cat.category_id)}
                  threshold={thresholdFor(cat.category_id)}
                  showNet={showNet}
                  groupNet={groupNet}
                  groups={groups}
                  categories={ctx.categories}
                  onRefresh={load}
                />
              ))}
          </div>
          <DragOverlay>
            {activeDrag && activeDrag.id.startsWith("txn:") ? (
              <div className="bg-white border border-sky-300 shadow-lg rounded-md px-3 py-2 text-sm">
                Moving transaction…
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      )}
    </div>
  );
}

function SummaryStat({ label, value, color }) {
  return (
    <div className="bg-white rounded-xl p-4 border border-slate-200">
      <div className="text-xs uppercase tracking-wide text-slate-400">{label}</div>
      <div className={`text-xl font-semibold mt-1 ${color}`}>{value}</div>
    </div>
  );
}

function Sparkline({ values, color }) {
  if (!values || values.length < 2) return <div className="h-6" />;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const w = 80;
  const h = 22;
  const points = values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * w;
      const y = h - ((v - min) / range) * h;
      return `${x},${y}`;
    })
    .join(" ");
  return (
    <svg width={w} height={h} className="opacity-70">
      <polyline points={points} fill="none" stroke={color} strokeWidth="1.5" />
    </svg>
  );
}

function CategoryTile({
  cat,
  txns,
  expanded,
  onToggle,
  sparkline,
  threshold,
  showNet,
  groupNet,
  groups,
  categories,
  onRefresh,
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `cat:${cat.category_id}` });

  // Compute net = gross - reimbursements that landed in this category's expenses
  let displayValue = cat.gross;
  if (showNet) {
    let offset = 0;
    for (const t of txns) {
      if (t.reimbursement_group_id && (groupNet[t.reimbursement_group_id] ?? 0) !== 0) {
        // include reimbursement income that maps to this expense's group
        const total = groupNet[t.reimbursement_group_id] || 0;
        if (t.reimbursement_role === "expense" && total > 0) {
          // Reimbursement received offsets the expense
          offset += Math.min(total, Math.abs(t.amount));
        }
      }
    }
    displayValue = cat.gross + offset;
  }

  const expenseAbs = Math.abs(Math.min(0, cat.gross));
  const pct = threshold ? Math.min(100, (expenseAbs / threshold) * 100) : null;
  const overBudget = pct !== null && pct >= 100;
  const nearBudget = pct !== null && pct >= 80 && pct < 100;

  return (
    <motion.div
      ref={setNodeRef}
      layout
      className={`bg-white rounded-xl border transition-shadow ${
        isOver
          ? "border-sky-400 ring-2 ring-sky-200 shadow-lg"
          : overBudget
          ? "border-red-300"
          : nearBudget
          ? "border-amber-300"
          : "border-slate-200"
      }`}
    >
      <button
        onClick={onToggle}
        className="w-full text-left px-4 py-3 flex items-start gap-3 hover:bg-slate-50 rounded-t-xl"
      >
        <div
          className="w-3 h-3 rounded-full mt-1.5 flex-shrink-0"
          style={{ background: cat.color }}
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <div className="font-medium truncate">{cat.category_name}</div>
            <div
              className={`text-sm font-semibold whitespace-nowrap ${
                displayValue >= 0 ? "text-emerald-600" : "text-rose-600"
              }`}
            >
              {fmtEUR(displayValue)}
            </div>
          </div>
          <div className="mt-1 flex items-center justify-between">
            <div className="text-xs text-slate-500">
              {cat.count} {cat.count === 1 ? "txn" : "txns"}
              {cat.fixed !== 0 && (
                <span className="ml-2 text-slate-400">
                  · {fmtEUR(cat.fixed)} fixed
                </span>
              )}
            </div>
            <Sparkline values={sparkline} color={cat.color} />
          </div>
          {threshold && (
            <div className="mt-2">
              <div className="h-1 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full ${
                    overBudget ? "bg-red-500" : nearBudget ? "bg-amber-400" : "bg-emerald-500"
                  }`}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <div className="text-[10px] text-slate-400 mt-0.5">
                {fmtEUR(expenseAbs)} / {fmtEUR(threshold)}
              </div>
            </div>
          )}
        </div>
      </button>
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="overflow-hidden"
          >
            <div className="border-t border-slate-100 divide-y divide-slate-50">
              {txns.length === 0 ? (
                <div className="px-4 py-3 text-sm text-slate-400">No transactions.</div>
              ) : (
                txns.map((t) => (
                  <TxnRow
                    key={t.id}
                    txn={t}
                    fromCat={cat.category_id}
                    categories={categories}
                    groups={groups}
                    onRefresh={onRefresh}
                  />
                ))
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function TxnRow({ txn, fromCat, categories, groups, onRefresh }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `txn:${txn.id}`,
    data: { fromCat },
  });
  const [editing, setEditing] = useState(false);
  const [note, setNote] = useState(txn.note || "");
  const [isFixed, setIsFixed] = useState(txn.is_fixed_cost);
  const [fixedLabel, setFixedLabel] = useState(txn.fixed_cost_label || "");
  const [catId, setCatId] = useState(txn.category_id || "");
  const [groupId, setGroupId] = useState(txn.reimbursement_group_id || "");

  const save = async () => {
    await api.patchTransaction(txn.id, {
      note: note || null,
      is_fixed_cost: isFixed,
      fixed_cost_label: fixedLabel || null,
      category_id: catId ? Number(catId) : null,
      reimbursement_group_id: groupId ? Number(groupId) : null,
    });
    setEditing(false);
    onRefresh();
  };

  return (
    <div
      ref={setNodeRef}
      style={{ opacity: isDragging ? 0.4 : 1 }}
      className="px-3 py-2 text-sm flex items-start gap-2 hover:bg-slate-50"
    >
      <button
        {...attributes}
        {...listeners}
        className="cursor-grab active:cursor-grabbing text-slate-300 hover:text-slate-500 px-1"
        title="Drag to recategorise"
      >
        ⋮⋮
      </button>
      <div className="flex-1 min-w-0">
        <button
          onClick={() => setEditing((v) => !v)}
          className="w-full text-left"
        >
          <div className="flex items-center gap-2">
            <span className="text-slate-400 text-xs w-12 flex-shrink-0">
              {fmtDate(txn.date)}
            </span>
            <span className="font-medium truncate">
              {txn.counterparty || "—"}
            </span>
            {txn.is_fixed_cost && (
              <span className="text-[10px] uppercase bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded">
                fixed
              </span>
            )}
            {txn.reimbursement_group_id && (
              <span className="text-[10px] uppercase bg-emerald-50 text-emerald-700 px-1.5 py-0.5 rounded">
                ↩ linked
              </span>
            )}
            {txn.needs_paypal_enrichment && (
              <span className="text-[10px] uppercase bg-amber-50 text-amber-700 px-1.5 py-0.5 rounded">
                needs enrichment
              </span>
            )}
            <span
              className={`ml-auto whitespace-nowrap font-semibold ${
                txn.amount >= 0 ? "text-emerald-600" : "text-slate-700"
              }`}
            >
              {fmtEUR(txn.amount)}
            </span>
          </div>
          {txn.description && (
            <div className="text-xs text-slate-500 truncate mt-0.5 ml-14">
              {txn.description}
            </div>
          )}
        </button>
        <AnimatePresence>
          {editing && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="mt-2 ml-14 grid grid-cols-2 gap-2 pb-2">
                <select
                  value={catId}
                  onChange={(e) => setCatId(e.target.value)}
                  className="text-xs border border-slate-200 rounded-md px-2 py-1.5"
                >
                  <option value="">— Category —</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
                <select
                  value={groupId}
                  onChange={(e) => setGroupId(e.target.value)}
                  className="text-xs border border-slate-200 rounded-md px-2 py-1.5"
                >
                  <option value="">— No group —</option>
                  {groups.map((g) => (
                    <option key={g.id} value={g.id}>{g.label}</option>
                  ))}
                </select>
                <input
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Note"
                  className="col-span-2 text-xs border border-slate-200 rounded-md px-2 py-1.5"
                />
                <label className="flex items-center gap-2 text-xs text-slate-600">
                  <input
                    type="checkbox"
                    checked={isFixed}
                    onChange={(e) => setIsFixed(e.target.checked)}
                  />
                  Fixed cost
                </label>
                <input
                  value={fixedLabel}
                  onChange={(e) => setFixedLabel(e.target.value)}
                  placeholder="Fixed cost label"
                  disabled={!isFixed}
                  className="text-xs border border-slate-200 rounded-md px-2 py-1.5 disabled:bg-slate-50"
                />
                <button
                  onClick={save}
                  className="col-span-2 text-xs bg-slate-900 text-white rounded-md py-1.5 hover:bg-slate-700"
                >
                  Save
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
