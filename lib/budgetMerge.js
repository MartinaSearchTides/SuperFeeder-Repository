/** Shared budget map helpers for api/data.js and api/budget.js */

export function parseBudgetJson(raw) {
  if (!raw || !String(raw).trim()) return {};
  try {
    const o = JSON.parse(String(raw));
    return o && typeof o === "object" ? o : {};
  } catch (e) {
    return {};
  }
}

const KV_KEY = "superfeeder:monthly_budget";

export function kvBudgetKey() {
  return KV_KEY;
}

/** Merge env JSON map with KV map; KV values override env for same client/month. */
export function mergeBudgetMaps(envMap, kvMap) {
  const out = {};
  for (const c of Object.keys(envMap || {})) {
    const inner = envMap[c];
    if (inner && typeof inner === "object") {
      out[c] = { ...inner };
    }
  }
  for (const c of Object.keys(kvMap || {})) {
    const inner = kvMap[c];
    if (!inner || typeof inner !== "object") continue;
    if (!out[c]) out[c] = {};
    for (const m of Object.keys(inner)) {
      const v = inner[m];
      if (v === null || v === undefined || String(v).trim() === "") {
        delete out[c][m];
      } else {
        const n = parseFloat(v);
        if (!isNaN(n)) out[c][m] = Math.round(n * 100) / 100;
      }
    }
  }
  return out;
}
