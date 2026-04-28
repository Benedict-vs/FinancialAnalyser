import { useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { api, fmtEUR } from "../api";
import { useToast } from "../components/Toasts.jsx";

export default function ImportView({ ctx }) {
  const [file, setFile] = useState(null);
  const [sourceId, setSourceId] = useState(ctx.sources[0]?.id || "");
  const [preview, setPreview] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef();
  const { push } = useToast();

  const handleFile = async (f) => {
    setFile(f);
    setPreview(null);
    if (!f || !sourceId) return;
    try {
      setBusy(true);
      const p = await api.importPreview(f, sourceId);
      setPreview(p);
    } catch (e) {
      push(`Preview failed: ${e.message}`, "error");
    } finally {
      setBusy(false);
    }
  };

  const onDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) handleFile(f);
  };

  const doImport = async () => {
    if (!file || !sourceId || !ctx.workspace.id) return;
    try {
      setBusy(true);
      const r = await api.importFile(file, sourceId, ctx.workspace.id);
      push(
        `Imported ${r.inserted} (${r.skipped_duplicates} duplicates, ${r.paypal_matches} PayPal matches)`,
        "success"
      );
      setFile(null);
      setPreview(null);
      if (inputRef.current) inputRef.current.value = "";
    } catch (e) {
      push(`Import failed: ${e.message}`, "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-3xl">
      <h2 className="text-lg font-semibold mb-4">Import transactions</h2>

      <div className="grid grid-cols-2 gap-3 mb-4">
        <label className="text-sm">
          <div className="text-xs uppercase tracking-wide text-slate-500 mb-1">Source</div>
          <select
            value={sourceId}
            onChange={(e) => {
              setSourceId(Number(e.target.value));
              if (file) handleFile(file);
            }}
            className="w-full bg-white border border-slate-200 rounded-md px-3 py-2 text-sm"
          >
            {ctx.sources.map((s) => (
              <option key={s.id} value={s.id}>{s.name} ({s.type})</option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <div className="text-xs uppercase tracking-wide text-slate-500 mb-1">Workspace</div>
          <input
            value={ctx.workspace.name}
            disabled
            className="w-full bg-slate-50 border border-slate-200 rounded-md px-3 py-2 text-sm"
          />
        </label>
      </div>

      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        className={`cursor-pointer border-2 border-dashed rounded-xl p-10 text-center transition-colors ${
          dragOver
            ? "border-sky-400 bg-sky-50"
            : "border-slate-200 bg-white hover:border-slate-300"
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={(e) => handleFile(e.target.files?.[0])}
        />
        <div className="text-3xl text-slate-300 mb-2">⤓</div>
        <div className="font-medium text-slate-700">
          {file ? file.name : "Drop a CSV file here or click to choose"}
        </div>
        <div className="text-xs text-slate-500 mt-1">
          Sparkasse and PayPal exports are auto-detected
        </div>
      </div>

      <AnimatePresence>
        {preview && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="mt-6"
          >
            <div className="flex items-center justify-between mb-3">
              <div className="text-sm">
                <span className="font-semibold">{preview.total}</span> rows
                {preview.duplicates > 0 && (
                  <span className="ml-3 text-amber-700">
                    ⚠ {preview.duplicates} duplicate{preview.duplicates === 1 ? "" : "s"} will be skipped
                  </span>
                )}
              </div>
              <button
                onClick={doImport}
                disabled={busy}
                className="px-4 py-1.5 bg-slate-900 text-white text-sm rounded-md hover:bg-slate-700 disabled:opacity-50"
              >
                {busy ? "Importing…" : "Confirm import"}
              </button>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                  <tr>
                    <th className="px-3 py-2 text-left">Date</th>
                    <th className="px-3 py-2 text-left">Counterparty</th>
                    <th className="px-3 py-2 text-left">Description</th>
                    <th className="px-3 py-2 text-right">Amount</th>
                    <th className="px-3 py-2 text-left">Flags</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {preview.preview.map((r, i) => (
                    <tr key={i} className={r.is_duplicate ? "opacity-50" : ""}>
                      <td className="px-3 py-2 whitespace-nowrap text-slate-500">{r.date}</td>
                      <td className="px-3 py-2 truncate max-w-[180px]">{r.counterparty}</td>
                      <td className="px-3 py-2 truncate max-w-[280px] text-slate-500">{r.description}</td>
                      <td className="px-3 py-2 text-right font-semibold whitespace-nowrap">
                        {fmtEUR(r.amount)}
                      </td>
                      <td className="px-3 py-2 text-xs space-x-1">
                        {r.is_duplicate && (
                          <span className="bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded">dup</span>
                        )}
                        {r.needs_paypal_enrichment && (
                          <span className="bg-amber-50 text-amber-700 px-1.5 py-0.5 rounded">paypal?</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {preview.total > preview.preview.length && (
              <div className="text-xs text-slate-400 mt-2">
                Showing first {preview.preview.length} of {preview.total} rows
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
