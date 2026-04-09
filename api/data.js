const SERVER_URL = "https://seatable.searchtides.com";

const OM_TOKEN    = process.env.OM_API_TOKEN;
const LBT_TOKEN   = process.env.LBT_API_TOKEN;
const CMS_TOKEN   = process.env.CMS_API_TOKEN;

const BTF = ["Published", "Pending", "Content Requested", "Ready for Delivery"];
const TOP = ["Site Approved", "Negotiation"];
const ALL_STATUSES = [...BTF, ...TOP];
const LBT_CLIENTS = ["FanDuel", "FanDuel Casino", "FanDuel Racing", "CreditNinja"];
const PRESS_CLIENT = "FanDuel";

// ── SeaTable auth ──
async function getAuthToken(apiToken) {
  const res = await fetch(`${SERVER_URL}/api2/auth-token/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: apiToken })
  });
  if (!res.ok) throw new Error(`Auth failed: ${res.status}`);
  const data = await res.json();
  return data.token;
}

// ── Get base info (dtable_uuid + jwt token) ──
async function getBaseAccess(apiToken) {
  const res = await fetch(`${SERVER_URL}/api/v2.1/dtable/app-access-token/`, {
    headers: { "Authorization": `Token ${apiToken}` }
  });
  if (!res.ok) throw new Error(`Base access failed: ${res.status} ${await res.text()}`);
  return res.json();
}

// ── List rows (paginated) ──
async function listRows(baseInfo, tableName, viewName) {
  const { access_token, dtable_uuid } = baseInfo;
  let rows = [], start = 0, limit = 1000;

  while (true) {
    const url = `${SERVER_URL}/dtable-server/api/v1/dtables/${dtable_uuid}/rows/?` +
      `table_name=${encodeURIComponent(tableName)}&view_name=${encodeURIComponent(viewName)}&start=${start}&limit=${limit}`;
    const res = await fetch(url, {
      headers: { "Authorization": `Token ${access_token}` }
    });
    if (!res.ok) throw new Error(`listRows failed: ${res.status} ${await res.text()}`);
    const data = await res.json();
    const batch = data.rows || [];
    rows = rows.concat(batch);
    if (batch.length < limit) break;
    start += limit;
  }
  return rows;
}

// ── Resolve linked column value ──
function resolve(val) {
  if (Array.isArray(val)) val = val[0] || null;
  if (val && typeof val === "object") val = val.display_value || val.name || null;
  return val;
}

// ── Main handler ──
export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "s-maxage=300"); // cache 5 min on Vercel edge

  try {
    const now = new Date();
    const currentYear  = now.getFullYear();
    const currentMonth = now.getMonth() + 1;
    const monthShort   = now.toLocaleString("en-US", { month: "short" }); // "Apr"
    const prodMonth    = now.toLocaleString("en-US", { month: "short", year: "numeric" }); // "Apr 2026"

    // ── 1. OM base (HSS) ──
    const omAccess = await getBaseAccess(OM_TOKEN);

    // Quotas
    const quotaRows = await listRows(omAccess, "QUOTAS", "");
    const quotas = {};
    for (const row of quotaRows) {
      const client    = resolve(row["\uD83D\uDD39Client"] || row["Client"]);
      const monthVal  = row["\uD83D\uDD39Month"] || row["Month"];
      const yearVal   = row["\uD83D\uDD39Year"]  || row["Year"];
      const quotaVal  = row["\uD83D\uDD39 LV Quota"] || row["LV Quota"];
      if (!client || !monthVal) continue;
      const mOk = typeof monthVal === "string" && monthVal.trim().toLowerCase() === monthShort.toLowerCase();
      const yOk = yearVal ? String(yearVal).trim() === String(currentYear) : true;
      if (mOk && yOk) quotas[client] = parseFloat(quotaVal) || 0;
    }

    // OM LV data
    const omRows = await listRows(omAccess, "OM", "Martina Dashboard View");
    const internal = {};
    for (const row of omRows) {
      const client     = resolve(row["CLIENT*"]);
      const status     = row["STATUS 1"];
      const lv         = parseFloat(row["LV"]) || 0;
      const prodMonthR = row["Prod Month"] || "";
      if (prodMonthR.trim() !== prodMonth) continue;
      if (!client || !ALL_STATUSES.includes(status)) continue;
      if (!internal[client]) internal[client] = {};
      internal[client][status] = (internal[client][status] || 0) + lv;
    }

    // ── 2. LBT base ──
    const lbtAccess = await getBaseAccess(LBT_TOKEN);
    const lbtRows   = await listRows(lbtAccess, "OM", "View for dashboard");
    const external  = {};
    for (const row of lbtRows) {
      const client     = resolve(row["CLIENT*"]);
      const status     = row["STATUS 1"];
      const lv         = parseFloat(row["LV"]) || 0;
      const prodMonthR = row["Prod Month"] || "";
      if (prodMonthR.trim() !== prodMonth) continue;
      if (!client || !LBT_CLIENTS.includes(client)) continue;
      if (status !== "Published") continue;
      external[client] = (external[client] || 0) + lv;
    }

    // ── 3. CMS Master base ──
    const cmsAccess = await getBaseAccess(CMS_TOKEN);
    const cmsRows   = await listRows(cmsAccess, "OM", "Default View_Martina");
    let journalists = 0;
    for (const row of cmsRows) {
      const dateVal = row["Live Link Date"] || "";
      const lv      = parseFloat(row["LV"]) || 0;
      if (!dateVal) continue;
      try {
        const d = new Date(String(dateVal).substring(0, 10));
        if (d.getFullYear() === currentYear && d.getMonth() + 1 === currentMonth) {
          journalists += lv;
        }
      } catch(e) { continue; }
    }

    // ── 4. Build response ──
    const allClients = [...new Set([...Object.keys(internal), ...Object.keys(quotas)])].sort();
    const result = allClients.map(client => {
      const quota   = quotas[client] || 0;
      const intData = internal[client] || {};
      const extPub  = LBT_CLIENTS.includes(client) ? Math.round((external[client] || 0) * 100) / 100 : 0;
      const journ   = client === PRESS_CLIENT ? Math.round(journalists * 100) / 100 : 0;
      const row = { client, quota, ext_published: extPub, journalists: journ };
      for (const s of ALL_STATUSES) row[s] = Math.round((intData[s] || 0) * 100) / 100;
      return row;
    });

    res.status(200).json({
      ok: true,
      generated: now.toISOString(),
      prod_month: prodMonth,
      clients: result
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: err.message });
  }
}

