const BASE = "/api";

async function req(path, opts = {}) {
  const res = await fetch(BASE + path, opts);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${res.status} ${res.statusText}: ${text}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

export const api = {
  workspaces: () => req("/workspaces"),
  createWorkspace: (data) =>
    req("/workspaces", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }),
  sources: () => req("/sources"),
  createSource: (data) =>
    req("/sources", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }),
  categories: () => req("/categories"),
  createCategory: (data) =>
    req("/categories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }),
  updateCategory: (id, data) =>
    req(`/categories/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }),
  rules: () => req("/category-rules"),
  createRule: (data) =>
    req("/category-rules", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }),
  updateRule: (id, data) =>
    req(`/category-rules/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }),
  deleteRule: (id) => req(`/category-rules/${id}`, { method: "DELETE" }),
  recategoriseSimilar: (pattern, new_category_id) =>
    req("/recategorise-similar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pattern, new_category_id }),
    }),
  transactions: (params) => {
    const qs = new URLSearchParams(
      Object.entries(params).filter(([, v]) => v !== undefined && v !== null)
    ).toString();
    return req(`/transactions?${qs}`);
  },
  patchTransaction: (id, data) =>
    req(`/transactions/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }),
  bulkCategorise: (transaction_ids, category_id) =>
    req("/transactions/bulk-categorise", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ transaction_ids, category_id }),
    }),
  monthly: (workspace_id, year, month) =>
    req(`/analytics/monthly?workspace_id=${workspace_id}&year=${year}&month=${month}`),
  trends: (workspace_id, months = 6) =>
    req(`/analytics/trends?workspace_id=${workspace_id}&months=${months}`),
  estimates: (workspace_id) =>
    req(`/analytics/estimates?workspace_id=${workspace_id}`),
  fixedCosts: (workspace_id) =>
    req(`/fixed-costs?workspace_id=${workspace_id}`),
  confirmFixedCost: (data) =>
    req("/fixed-costs/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }),
  deleteFixedCost: (id) => req(`/fixed-costs/${id}`, { method: "DELETE" }),
  groups: (workspace_id) =>
    req(`/reimbursement-groups?workspace_id=${workspace_id}`),
  createGroup: (data) =>
    req("/reimbursement-groups", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }),
  patchGroup: (id, data) =>
    req(`/reimbursement-groups/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }),
  deleteGroup: (id) =>
    req(`/reimbursement-groups/${id}`, { method: "DELETE" }),
  suggestMensa: (workspace_id) =>
    req(`/reimbursement-groups/suggest-mensa?workspace_id=${workspace_id}`),
  thresholds: (workspace_id) =>
    req(`/budget-thresholds?workspace_id=${workspace_id}`),
  setThreshold: (data) =>
    req("/budget-thresholds", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }),
  deleteThreshold: (id) =>
    req(`/budget-thresholds/${id}`, { method: "DELETE" }),
  importPreview: (file, source_id) => {
    const fd = new FormData();
    fd.append("file", file);
    fd.append("source_id", source_id);
    return req("/import/preview", { method: "POST", body: fd });
  },
  importFile: (file, source_id, workspace_id) => {
    const fd = new FormData();
    fd.append("file", file);
    fd.append("source_id", source_id);
    fd.append("workspace_id", workspace_id);
    return req("/import", { method: "POST", body: fd });
  },
  clearCache: (workspace_id) =>
    req("/cache/clear", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workspace_id }),
    }),
};

export function fmtEUR(amount) {
  if (amount === null || amount === undefined || Number.isNaN(amount)) return "—";
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
  }).format(amount);
}

export function fmtDate(s) {
  if (!s) return "";
  const d = new Date(s);
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
}

export const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
