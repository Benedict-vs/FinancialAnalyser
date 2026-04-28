import { useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { api, fmtEUR } from "../api";
import { useToast } from "../components/Toasts.jsx";
import Empty from "../components/Empty.jsx";

export default function FixedCostsPanel({ ctx }) {
  const [data, setData] = useState(null);
  const { push } = useToast();

  const load = useCallback(async () => {
    setData(await api.fixedCosts(ctx.workspace.id));
  }, [ctx.workspace.id]);

  useEffect(() => { load(); }, [load]);

  if (!data) return <div className="text-slate-500 text-sm">Loading…</div>;

  const annualTotal = data.confirmed.reduce((acc, p) => {
    const n = p.interval_days <= 35 ? 12 : 1;
    return acc + p.typical_amount * n;
  }, 0);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Confirmed fixed costs</h2>
          <div className="text-sm text-slate-500">
            Annual total: <span className="font-semibold text-slate-700">{fmtEUR(annualTotal)}</span>
          </div>
        </div>
        {data.confirmed.length === 0 ? (
          <Empty
            title="Nothing confirmed yet"
            hint="Confirm a candidate on the right to start tracking your fixed costs."
          />
        ) : (
          <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100">
            {data.confirmed.map((p) => (
              <div key={p.id} className="px-4 py-3 flex items-center gap-3">
                <div className="flex-1">
                  <div className="font-medium">{p.label}</div>
                  <div className="text-xs text-slate-500">
                    {p.counterparty_pattern} · every {p.interval_days <= 35 ? "month" : "year"}
                  </div>
                </div>
                <div className="text-sm font-semibold text-slate-700">
                  {fmtEUR(p.typical_amount)}
                </div>
                <button
                  onClick={async () => {
                    await api.deleteFixedCost(p.id);
                    push("Removed", "success");
                    load();
                  }}
                  className="text-xs text-slate-400 hover:text-rose-600 px-2"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <h2 className="text-lg font-semibold mb-3">Candidates</h2>
        {data.candidates.length === 0 ? (
          <div className="bg-white rounded-xl border border-slate-200 p-6 text-sm text-slate-400 text-center">
            No new patterns detected.
          </div>
        ) : (
          <div className="space-y-3">
            <AnimatePresence>
              {data.candidates.map((c) => (
                <motion.div
                  key={c.counterparty_pattern + c.typical_amount}
                  layout
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  className="bg-white rounded-xl border border-slate-200 p-3"
                >
                  <div className="font-medium truncate">{c.label}</div>
                  <div className="text-xs text-slate-500 mt-0.5">
                    {c.occurrences}× · {c.interval_days <= 35 ? "monthly" : "yearly"} · last {c.last_seen}
                  </div>
                  <div className="text-sm font-semibold mt-2">{fmtEUR(c.typical_amount)}</div>
                  <button
                    onClick={async () => {
                      const sparkasse = ctx.sources.find((s) => s.type === "sparkasse");
                      const paypal = ctx.sources.find((s) => s.type === "paypal");
                      await api.confirmFixedCost({
                        workspace_id: ctx.workspace.id,
                        counterparty_pattern: c.counterparty_pattern,
                        typical_amount: c.typical_amount,
                        interval_days: c.interval_days,
                        label: c.label,
                        source_id: (sparkasse || paypal || ctx.sources[0])?.id,
                        transaction_ids: c.transaction_ids,
                      });
                      push("Confirmed", "success");
                      load();
                    }}
                    className="mt-2 w-full text-xs bg-slate-900 text-white rounded-md py-1.5 hover:bg-slate-700"
                  >
                    Confirm
                  </button>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>
    </div>
  );
}
