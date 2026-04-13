import { getRedis } from "../lib/redis.js";
import { kvBudgetKey } from "../lib/budgetMerge.js";

function normalizeProdMonthLabel(pm) {
  return String(pm == null ? "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Vercel Node may pass Buffer or string; normalize to a plain object. */
function parseRequestBody(raw) {
  if (raw == null) return null;
  if (typeof Buffer !== "undefined" && Buffer.isBuffer(raw)) {
    raw = raw.toString("utf8");
  }
  if (typeof raw === "string") {
    try {
      const o = JSON.parse(raw || "{}");
      return o && typeof o === "object" ? o : null;
    } catch (e) {
      return null;
    }
  }
  if (typeof raw === "object") {
    return raw;
  }
  return null;
}

function redisWriteErrorHint(msg) {
  const m = String(msg || "").toLowerCase();
  if (
    m.includes("read only") ||
    m.includes("readonly") ||
    m.includes("noperm") ||
    m.includes("err noauth") ||
    m.includes("wrongpass")
  ) {
    return (
      String(msg) +
      " — In Vercel env, use the primary KV_REST_API_TOKEN (read/write), not KV_REST_API_READ_ONLY_TOKEN."
    );
  }
  return String(msg || "Save failed");
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

  let body = parseRequestBody(req.body);
  if (!body) {
    return res.status(400).json({ ok: false, error: "JSON body required" });
  }
  const got = String(body.secret ?? "").trim();
  const need = String(needSecret).trim();
  if (!got || got !== need) {
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
    if (!stored || typeof stored !== "object" || Array.isArray(stored)) stored = {};
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

    await redis.set(key, JSON.stringify(stored));
    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error("Superfeeder budget save:", e);
    const hint = redisWriteErrorHint(e && e.message ? e.message : e);
    return res.status(500).json({ ok: false, error: hint });
  }
}
