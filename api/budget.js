import { getRedis } from "../lib/redis.js";
import { kvBudgetKey } from "../lib/budgetMerge.js";

function normalizeProdMonthLabel(pm) {
  return String(pm == null ? "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const needSecret = process.env.SUPERFEEDER_BUDGET_SECRET;
  if (!needSecret || !String(needSecret).trim()) {
    return res.status(503).json({
      ok: false,
      error: "Set SUPERFEEDER_BUDGET_SECRET on Vercel to enable saving budgets."
    });
  }

  const redis = getRedis();
  if (!redis) {
    return res.status(503).json({
      ok: false,
      error:
        "Redis REST URL/token missing. Set UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN, or KV_REST_API_URL + KV_REST_API_TOKEN (Vercel Storage), then redeploy."
    });
  }

  let body = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body || "{}");
    } catch (e) {
      return res.status(400).json({ ok: false, error: "Invalid JSON body" });
    }
  }
  if (!body || typeof body !== "object") {
    return res.status(400).json({ ok: false, error: "JSON body required" });
  }
  if (body.secret !== needSecret) {
    return res.status(403).json({ ok: false, error: "Invalid secret" });
  }

  const client = String(body.client || "").trim();
  const month = normalizeProdMonthLabel(body.month);
  if (!client || !month) {
    return res.status(400).json({ ok: false, error: "client and month required" });
  }

  try {
    const key = kvBudgetKey();
    let stored = await redis.get(key);
    if (typeof stored === "string") {
      try {
        stored = JSON.parse(stored);
      } catch (e) {
        stored = {};
      }
    }
    if (!stored || typeof stored !== "object") stored = {};
    if (!stored[client]) stored[client] = {};

    const amtRaw = body.amount;
    if (amtRaw === null || amtRaw === undefined || String(amtRaw).trim() === "") {
      delete stored[client][month];
      if (Object.keys(stored[client]).length === 0) delete stored[client];
    } else {
      const n = parseFloat(amtRaw);
      if (isNaN(n)) return res.status(400).json({ ok: false, error: "Invalid amount" });
      stored[client][month] = Math.round(n * 100) / 100;
    }

    await redis.set(key, stored);
    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error("Superfeeder budget save:", e);
    return res.status(500).json({ ok: false, error: e.message || "Save failed" });
  }
}
