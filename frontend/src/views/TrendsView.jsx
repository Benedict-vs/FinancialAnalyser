import { useEffect, useState, useMemo } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer, ReferenceLine,
} from "recharts";
import { api, fmtEUR } from "../api";
import Empty from "../components/Empty.jsx";

export default function TrendsView({ ctx }) {
  const [months, setMonths] = useState(6);
  const [data, setData] = useState(null);
  const [estimates, setEstimates] = useState([]);
  const [enabled, setEnabled] = useState({});

  useEffect(() => {
    (async () => {
      const [t, e] = await Promise.all([
        api.trends(ctx.workspace.id, months),
        api.estimates(ctx.workspace.id),
      ]);
      setData(t);
      setEstimates(e);
      const init = {};
      for (const s of t.series) {
        init[s.category_name] = s.category_name !== "Uncategorised";
      }
      setEnabled(init);
    })();
  }, [ctx.workspace.id, months]);

  const chartData = useMemo(() => {
    if (!data) return [];
    const rows = data.months.map((m) => ({ month: m }));
    for (const s of data.series) {
      const est = estimates.find((e) => e.category_name === s.category_name)?.estimate ?? 0;
      for (let i = 0; i < data.months.length; i++) {
        rows[i][s.category_name] = s.points[i].value;
      }
      // Add estimate as a phantom point appended after series
      rows.push;
    }
    // Append estimate row
    if (estimates.length) {
      const next = nextMonth(data.months[data.months.length - 1]);
      const estRow = { month: next + " (est.)" };
      for (const s of data.series) {
        const est = estimates.find((e) => e.category_name === s.category_name)?.estimate ?? null;
        if (est !== null) estRow[s.category_name + "_est"] = est;
      }
      rows.push(estRow);
    }
    return rows;
  }, [data, estimates]);

  if (!data) return <div className="text-slate-500 text-sm">Loading…</div>;
  if (!data.series.length) {
    return <Empty title="No data yet" hint="Import some transactions to see trends." />;
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">Trends</h2>
        <select
          value={months}
          onChange={(e) => setMonths(Number(e.target.value))}
          className="text-sm bg-slate-100 rounded-md px-3 py-1.5 border-0"
        >
          <option value={3}>Last 3 months</option>
          <option value={6}>Last 6 months</option>
          <option value={12}>Last 12 months</option>
        </select>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-4">
        <div className="h-80">
          <ResponsiveContainer>
            <LineChart data={chartData} margin={{ top: 10, right: 24, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} stroke="#94a3b8" />
              <YAxis
                tick={{ fontSize: 11 }}
                stroke="#94a3b8"
                tickFormatter={(v) => fmtEUR(v).replace(",00", "")}
              />
              <Tooltip
                formatter={(v) => fmtEUR(v)}
                contentStyle={{ borderRadius: 8, border: "1px solid #e2e8f0" }}
              />
              <ReferenceLine y={0} stroke="#cbd5e1" />
              {data.series
                .filter((s) => enabled[s.category_name])
                .map((s) => (
                  <Line
                    key={s.category_name}
                    type="monotone"
                    dataKey={s.category_name}
                    stroke={s.color}
                    strokeWidth={2}
                    dot={{ r: 3 }}
                    activeDot={{ r: 5 }}
                    isAnimationActive
                  />
                ))}
              {data.series
                .filter((s) => enabled[s.category_name])
                .map((s) => (
                  <Line
                    key={s.category_name + "_est"}
                    type="monotone"
                    dataKey={s.category_name + "_est"}
                    stroke={s.color}
                    strokeWidth={2}
                    strokeDasharray="4 4"
                    dot={false}
                    legendType="none"
                    isAnimationActive
                  />
                ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {data.series.map((s) => (
          <button
            key={s.category_name}
            onClick={() =>
              setEnabled((e) => ({ ...e, [s.category_name]: !e[s.category_name] }))
            }
            className={`flex items-center gap-2 text-xs px-3 py-1.5 rounded-full border transition-colors ${
              enabled[s.category_name]
                ? "bg-white border-slate-300 text-slate-700"
                : "bg-slate-50 border-slate-200 text-slate-400"
            }`}
          >
            <span
              className="w-2.5 h-2.5 rounded-full"
              style={{ background: s.color }}
            />
            {s.category_name}
          </button>
        ))}
      </div>
    </div>
  );
}

function nextMonth(yyyymm) {
  const [y, m] = yyyymm.split("-").map(Number);
  let nm = m + 1;
  let ny = y;
  if (nm > 12) { nm = 1; ny += 1; }
  return `${ny}-${String(nm).padStart(2, "0")}`;
}
