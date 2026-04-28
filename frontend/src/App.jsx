import { useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { api } from "./api";
import MonthlyOverview from "./views/MonthlyOverview.jsx";
import TrendsView from "./views/TrendsView.jsx";
import FixedCostsPanel from "./views/FixedCostsPanel.jsx";
import ImportView from "./views/ImportView.jsx";
import ReimbursementLinker from "./views/ReimbursementLinker.jsx";
import SettingsView from "./views/SettingsView.jsx";
import Toasts, { ToastProvider } from "./components/Toasts.jsx";

const VIEWS = [
  { id: "overview", label: "Overview" },
  { id: "trends", label: "Trends" },
  { id: "fixed", label: "Fixed Costs" },
  { id: "reimbursements", label: "Reimbursements" },
  { id: "import", label: "Import" },
  { id: "settings", label: "Settings" },
];

export default function App() {
  const [view, setView] = useState("overview");
  const [workspaces, setWorkspaces] = useState([]);
  const [activeWorkspace, setActiveWorkspace] = useState(null);
  const [categories, setCategories] = useState([]);
  const [sources, setSources] = useState([]);
  const [showNewWorkspace, setShowNewWorkspace] = useState(false);
  const [newWsName, setNewWsName] = useState("");

  const loadWorkspaces = useCallback(async () => {
    const ws = await api.workspaces();
    setWorkspaces(ws);
    if (!activeWorkspace && ws.length) setActiveWorkspace(ws[0]);
  }, [activeWorkspace]);

  const loadStatic = useCallback(async () => {
    const [c, s] = await Promise.all([api.categories(), api.sources()]);
    setCategories(c);
    setSources(s);
  }, []);

  useEffect(() => {
    loadWorkspaces();
    loadStatic();
  }, [loadWorkspaces, loadStatic]);

  const handleCreateWorkspace = async () => {
    if (!newWsName.trim()) return;
    await api.createWorkspace({ name: newWsName.trim() });
    setNewWsName("");
    setShowNewWorkspace(false);
    await loadWorkspaces();
  };

  if (!activeWorkspace) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-slate-500">Loading…</div>
      </div>
    );
  }

  const ctx = {
    workspace: activeWorkspace,
    workspaces,
    categories,
    sources,
    refreshCategories: loadStatic,
    refreshWorkspaces: loadWorkspaces,
  };

  return (
    <ToastProvider>
      <div className="min-h-screen flex flex-col">
        <header className="sticky top-0 z-20 bg-white/90 backdrop-blur border-b border-slate-200">
          <div className="max-w-7xl mx-auto px-6 py-3 flex items-center gap-6">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-sky-500 to-indigo-500" />
              <div className="font-bold text-lg">Finance</div>
            </div>

            <nav className="flex items-center gap-1 ml-4">
              {VIEWS.map((v) => (
                <button
                  key={v.id}
                  onClick={() => setView(v.id)}
                  className={`relative px-3 py-1.5 text-sm rounded-md transition-colors ${
                    view === v.id
                      ? "text-slate-900"
                      : "text-slate-500 hover:text-slate-900"
                  }`}
                >
                  {view === v.id && (
                    <motion.div
                      layoutId="nav-pill"
                      className="absolute inset-0 bg-slate-100 rounded-md"
                      transition={{ type: "spring", stiffness: 400, damping: 30 }}
                    />
                  )}
                  <span className="relative">{v.label}</span>
                </button>
              ))}
            </nav>

            <div className="ml-auto flex items-center gap-2">
              <select
                value={activeWorkspace.id}
                onChange={(e) =>
                  setActiveWorkspace(
                    workspaces.find((w) => w.id === Number(e.target.value))
                  )
                }
                className="text-sm bg-slate-100 border-0 rounded-md px-3 py-1.5 focus:ring-2 focus:ring-sky-500"
              >
                {workspaces.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </select>
              <button
                onClick={() => setShowNewWorkspace(true)}
                className="text-sm px-2 py-1.5 rounded-md text-slate-500 hover:bg-slate-100"
                title="New workspace"
              >
                +
              </button>
            </div>
          </div>
        </header>

        <main className="flex-1 max-w-7xl w-full mx-auto px-6 py-6">
          <AnimatePresence mode="wait">
            <motion.div
              key={view + "-" + activeWorkspace.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.18 }}
            >
              {view === "overview" && <MonthlyOverview ctx={ctx} />}
              {view === "trends" && <TrendsView ctx={ctx} />}
              {view === "fixed" && <FixedCostsPanel ctx={ctx} />}
              {view === "import" && <ImportView ctx={ctx} />}
              {view === "reimbursements" && <ReimbursementLinker ctx={ctx} />}
              {view === "settings" && <SettingsView ctx={ctx} />}
            </motion.div>
          </AnimatePresence>
        </main>

        <AnimatePresence>
          {showNewWorkspace && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-30 bg-slate-900/40 flex items-center justify-center"
              onClick={() => setShowNewWorkspace(false)}
            >
              <motion.div
                initial={{ scale: 0.95, y: 8 }}
                animate={{ scale: 1, y: 0 }}
                exit={{ scale: 0.95, y: 8 }}
                onClick={(e) => e.stopPropagation()}
                className="bg-white rounded-xl shadow-xl p-6 w-96"
              >
                <h2 className="text-lg font-semibold mb-3">New workspace</h2>
                <input
                  autoFocus
                  value={newWsName}
                  onChange={(e) => setNewWsName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleCreateWorkspace()}
                  placeholder="e.g. Paris Trip 2026"
                  className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-sky-500 outline-none"
                />
                <div className="mt-4 flex gap-2 justify-end">
                  <button
                    onClick={() => setShowNewWorkspace(false)}
                    className="px-3 py-1.5 text-sm rounded-md text-slate-500 hover:bg-slate-100"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleCreateWorkspace}
                    className="px-3 py-1.5 text-sm rounded-md bg-slate-900 text-white hover:bg-slate-700"
                  >
                    Create
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        <Toasts />
      </div>
    </ToastProvider>
  );
}
