import { useEffect, useState, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { api, fmtEUR, fmtDate } from "../api";
import { useToast } from "../components/Toasts.jsx";
import Empty from "../components/Empty.jsx";

export default function ReimbursementLinker({ ctx }) {
  const [groups, setGroups] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [search, setSearch] = useState("");
  const [picked, setPicked] = useState({});
  const [label, setLabel] = useState("");
  const [notes, setNotes] = useState("");
  const [suggestions, setSuggestions] = useState(null);
  const { push } = useToast();

  const load = useCallback(async () => {
    const [g, t, s] = await Promise.all([
      api.groups(ctx.workspace.id),
      api.transactions({ workspace_id: ctx.workspace.id }),
      api.suggestMensa(ctx.workspace.id),
    ]);
    setGroups(g);
    setTransactions(t);
    setSuggestions(s);
  }, [ctx.workspace.id]);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return transactions
      .filter((t) =>
        !q ||
        (t.counterparty || "").toLowerCase().includes(q) ||
        (t.description || "").toLowerCase().includes(q)
      )
      .slice(0, 200);
  }, [transactions, search]);

  const expense_ids = Object.entries(picked).filter(([, v]) => v === "expense").map(([k]) => Number(k));
  const reimbursement_ids = Object.entries(picked).filter(([, v]) => v === "reimbursement").map(([k]) => Number(k));

  const createGroup = async () => {
    if (!label.trim() || (expense_ids.length === 0 && reimbursement_ids.length === 0)) return;
    await api.createGroup({
      label: label.trim(),
      notes: notes || null,
      workspace_id: ctx.workspace.id,
      expense_ids,
      reimbursement_ids,
    });
    push("Group created", "success");
    setLabel("");
    setNotes("");
    setPicked({});
    load();
  };

  const acceptMensaSuggestion = async () => {
    if (!suggestions) return;
    const exp = suggestions.campuskarte_topups.map((t) => t.id);
    const reim = suggestions.incoming_paypal.map((t) => t.id);
    if (!exp.length && !reim.length) return;
    await api.createGroup({
      label: "Mensa reimbursements",
      workspace_id: ctx.workspace.id,
      expense_ids: exp,
      reimbursement_ids: reim,
    });
    push("Mensa group created", "success");
    load();
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2 space-y-4">
        <h2 className="text-lg font-semibold">Link expenses ↔ reimbursements</h2>

        {suggestions && (suggestions.incoming_paypal.length > 0 || suggestions.campuskarte_topups.length > 0) && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-amber-50 border border-amber-200 rounded-xl p-4"
          >
            <div className="flex items-start gap-3">
              <div className="text-2xl">🍽️</div>
              <div className="flex-1">
                <div className="font-medium text-amber-900">
                  Mensa reimbursement detected
                </div>
                <div className="text-sm text-amber-800 mt-1">
                  Found {suggestions.campuskarte_topups.length} Campuskarte top-up(s) and{" "}
                  {suggestions.incoming_paypal.length} incoming PayPal "Mensa" payment(s).
                  Group them?
                </div>
                <button
                  onClick={acceptMensaSuggestion}
                  className="mt-2 px-3 py-1.5 text-xs bg-amber-600 text-white rounded-md hover:bg-amber-700"
                >
                  Create Mensa group
                </button>
              </div>
            </div>
          </motion.div>
        )}

        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search transactions…"
          className="w-full bg-white border border-slate-200 rounded-md px-3 py-2 text-sm"
        />

        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-2 py-2 text-left">Pick</th>
                <th className="px-2 py-2 text-left">Date</th>
                <th className="px-2 py-2 text-left">Counterparty</th>
                <th className="px-2 py-2 text-right">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((t) => (
                <tr key={t.id} className={picked[t.id] ? "bg-sky-50" : ""}>
                  <td className="px-2 py-2">
                    <select
                      value={picked[t.id] || ""}
                      onChange={(e) => {
                        const v = e.target.value;
                        setPicked((p) => {
                          const n = { ...p };
                          if (!v) delete n[t.id];
                          else n[t.id] = v;
                          return n;
                        });
                      }}
                      className="text-xs border border-slate-200 rounded px-1 py-0.5"
                    >
                      <option value="">—</option>
                      <option value="expense">Expense</option>
                      <option value="reimbursement">Reimbursement</option>
                    </select>
                  </td>
                  <td className="px-2 py-2 text-slate-500">{fmtDate(t.date)}</td>
                  <td className="px-2 py-2 truncate max-w-[200px]">{t.counterparty}</td>
                  <td
                    className={`px-2 py-2 text-right font-semibold ${
                      t.amount >= 0 ? "text-emerald-600" : "text-slate-700"
                    }`}
                  >
                    {fmtEUR(t.amount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="space-y-4">
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="font-medium mb-2">New group</div>
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Label, e.g. Trip with Anna"
            className="w-full text-sm border border-slate-200 rounded-md px-3 py-2 mb-2"
          />
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Notes (optional)"
            rows={2}
            className="w-full text-sm border border-slate-200 rounded-md px-3 py-2 mb-2"
          />
          <div className="text-xs text-slate-500 mb-2">
            {expense_ids.length} expense(s) · {reimbursement_ids.length} reimbursement(s)
          </div>
          <button
            onClick={createGroup}
            disabled={!label.trim() || (expense_ids.length + reimbursement_ids.length) === 0}
            className="w-full px-3 py-1.5 text-sm bg-slate-900 text-white rounded-md hover:bg-slate-700 disabled:opacity-50"
          >
            Create group
          </button>
        </div>

        <div>
          <div className="font-medium mb-2">Existing groups</div>
          {groups.length === 0 ? (
            <Empty title="No groups yet" />
          ) : (
            <div className="space-y-2">
              <AnimatePresence>
                {groups.map((g) => {
                  const total = g.transactions.reduce((a, t) => a + t.amount, 0);
                  return (
                    <motion.div
                      key={g.id}
                      layout
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="bg-white rounded-xl border border-slate-200 p-3"
                    >
                      <div className="flex items-center justify-between">
                        <div className="font-medium">{g.label}</div>
                        <button
                          onClick={async () => {
                            await api.deleteGroup(g.id);
                            push("Removed", "success");
                            load();
                          }}
                          className="text-slate-400 hover:text-rose-600 text-xs"
                        >
                          ✕
                        </button>
                      </div>
                      <div className="text-xs text-slate-500 mt-0.5">
                        {g.transactions.length} txns · net {fmtEUR(total)}
                      </div>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
