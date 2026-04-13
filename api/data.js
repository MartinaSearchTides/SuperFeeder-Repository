const SERVER = "https://seatable.searchtides.com";

const OM_TABLE = "OM";
const OM_VIEW = "Published Links_for Superfeeders Dashboard";

const CLIENTS_TABLE = "Clients";
const CLIENTS_VIEW = "Default view";
const CLIENT_RECORD_ACTIVE = "ACTIVE";

const STATUS_PUBLISHED = "Published";
const STATUS_PENDING = "Pending";
const STATUS_CONTENT_REQUESTED = "Content Requested";
const ALL_STATUSES = [STATUS_PUBLISHED, STATUS_PENDING, STATUS_CONTENT_REQUESTED];

const POST_PROFOUND = "Profound Placement";
const POST_LINK_INSERT = "Link Insert";
const POST_GUEST = "Guest Post";
const POST_OTHER = "Other";
const ALL_POST_TYPES = [POST_PROFOUND, POST_LINK_INSERT, POST_GUEST, POST_OTHER];

const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

async function getAccess(apiToken) {
  const res = await fetch(SERVER + "/api/v2.1/dtable/app-access-token/", {
    headers: { "Authorization": "Token " + apiToken, "Accept": "application/json" }
  });
  const text = await res.text();
  if (!res.ok) throw new Error("getAccess " + res.status + ": " + text.substring(0, 200));
  return JSON.parse(text);
}

async function listRows(access, tableName, viewName) {
  const base = access.dtable_server.endsWith("/") ? access.dtable_server : access.dtable_server + "/";
  const uuid = access.dtable_uuid;
  const tok = access.access_token;
  let rows = [], start = 0, limit = 1000;

  while (true) {
    let url = base + "api/v2/dtables/" + uuid + "/rows/?table_name=" +
      encodeURIComponent(tableName) + "&limit=" + limit + "&start=" + start + "&convert_keys=true";
    if (viewName && viewName.trim()) url += "&view_name=" + encodeURIComponent(viewName);

    const res = await fetch(url, {
      headers: { "Authorization": "Token " + tok, "Accept": "application/json" }
    });
    const text = await res.text();
    if (!res.ok) throw new Error("listRows(" + tableName + ") " + res.status + ": " + text.substring(0, 200));

    const batch = (JSON.parse(text).rows || []);
    rows = rows.concat(batch);
    if (batch.length < limit) break;
    start += limit;
  }
  return rows;
}

function resolve(val) {
  if (Array.isArray(val)) val = val[0] || null;
  if (val && typeof val === "object") return val.display_value || val.name || null;
  return val || null;
}

function prodMonthNow() {
  const tz = process.env.SUPERFEEDER_TIMEZONE || "Europe/Prague";
  try {
    return new Date().toLocaleString("en-US", {
      month: "short",
      year: "numeric",
      timeZone: tz
    });
  } catch (e) {
    return new Date().toLocaleString("en-US", { month: "short", year: "numeric" });
  }
}

function normalizeProdMonthLabel(pm) {
  return String(pm == null ? "" : pm)
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function monthsOfYear(year) {
  const out = [];
  for (let mi = 0; mi < 12; mi++) {
    out.push(MONTH_SHORT[mi] + " " + year);
  }
  return out;
}

/** Parse "Apr 2026" style labels */
function parseProdMonthLabel(label) {
  const s = normalizeProdMonthLabel(label);
  const m = s.match(/^([A-Za-z]+)\s+(\d{4})$/);
  if (!m) return null;
  const monPart = m[1].slice(0, 3);
  const idx = MONTH_SHORT.findIndex(function (x) {
    return x.toLowerCase() === monPart.toLowerCase();
  });
  if (idx < 0) return null;
  const y = parseInt(m[2], 10);
  if (isNaN(y)) return null;
  return { year: y, monthIndex: idx, label: MONTH_SHORT[idx] + " " + y };
}

function findClientRaw(row) {
  const direct = ["CLIENT*", "CLIENT", "Client", "client"];
  for (let i = 0; i < direct.length; i++) {
    if (Object.prototype.hasOwnProperty.call(row, direct[i])) return row[direct[i]];
  }
  for (const k of Object.keys(row)) {
    const kn = String(k).replace(/^\uFEFF/, "").trim();
    if (kn === "CLIENT*" || /^client\*$/i.test(kn) || /^client$/i.test(kn)) return row[k];
  }
  return undefined;
}

function getClient(row) {
  const raw = findClientRaw(row);
  const v = resolve(raw);
  const s = v != null ? String(v).trim() : raw == null || raw === "" ? "" : String(raw).trim();
  return s || null;
}

function findStatusRaw(row) {
  const direct = ["STATUS 1", "STATUS1", "Status 1", "Status", "STATUS", "Pipeline status", "Pipeline Status"];
  for (let i = 0; i < direct.length; i++) {
    if (Object.prototype.hasOwnProperty.call(row, direct[i])) return row[direct[i]];
  }
  for (const k of Object.keys(row)) {
    const kn = String(k).replace(/^\uFEFF/, "").trim();
    if (/^status\s*1$/i.test(kn)) return row[k];
  }
  for (const k of Object.keys(row)) {
    const kn = String(k).replace(/^\uFEFF/, "").trim();
    if (/^status$/i.test(kn)) return row[k];
  }
  return undefined;
}

function getStatusCanonical(row) {
  const v = findStatusRaw(row);
  const r = resolve(v);
  const raw = r != null ? r : v;
  const s = raw == null ? "" : String(raw).trim();
  if (!s) return null;
  const low = s.toLowerCase();
  for (const st of ALL_STATUSES) {
    if (st.toLowerCase() === low) return st;
  }
  return null;
}

function findTypeOfPostRaw(row) {
  const direct = [
    "Type of Post",
    "Type Of Post",
    "TYPE OF POST",
    "Type of post",
    "Post Type",
    "Post type",
    "POST TYPE"
  ];
  for (let i = 0; i < direct.length; i++) {
    if (Object.prototype.hasOwnProperty.call(row, direct[i])) return row[direct[i]];
  }
  for (const k of Object.keys(row)) {
    const kn = String(k).replace(/^\uFEFF/, "").trim();
    if (/type\s*of\s*post/i.test(kn)) return row[k];
    if (/^post\s*type$/i.test(kn)) return row[k];
  }
  return undefined;
}

function getPostTypeCanonical(row) {
  const raw = findTypeOfPostRaw(row);
  const rr = resolve(raw);
  let s = rr != null ? String(rr).trim() : raw == null || raw === "" ? "" : String(raw).trim();
  if (!s || s === "-" || /^n\/?a$/i.test(s)) {
    return POST_OTHER;
  }
  const norm = s.toLowerCase().replace(/\s+/g, " ");
  if (norm === POST_PROFOUND.toLowerCase()) return POST_PROFOUND;
  if (norm === POST_LINK_INSERT.toLowerCase()) return POST_LINK_INSERT;
  if (norm === POST_GUEST.toLowerCase()) return POST_GUEST;
  if (norm.includes("guest")) return POST_GUEST;
  if (norm.includes("link") && norm.includes("insert")) return POST_LINK_INSERT;
  if (norm.includes("profound")) return POST_PROFOUND;
  return POST_OTHER;
}

function getFinalUsd(row) {
  const v = row["FINAL $"] ?? row["FINAL$"] ?? row["Final $"] ?? row["Final$"];
  if (v == null || v === "") return 0;
  const n = parseFloat(String(v).replace(/[^0-9.-]/g, ""));
  return isNaN(n) ? 0 : Math.round(n * 100) / 100;
}

function getLiveLink(row) {
  const v = row["LIVE LINK"] || row["Live Link"] || row["LIVE_LINK"];
  const s = resolve(v) || (typeof v === "string" ? v : v == null ? "" : String(v));
  return String(s || "").trim();
}

function getDomain(row) {
  const v = row["DOMAIN"] ?? row["Domain"] ?? row["domain"];
  const s = resolve(v) || (v == null || v === "" ? "" : String(v));
  return String(s || "").trim();
}

function findLiveLinkDateRaw(row) {
  const direct = ["Live Link Date", "LIVE LINK DATE", "Live link date", "Live Link date"];
  for (let i = 0; i < direct.length; i++) {
    if (Object.prototype.hasOwnProperty.call(row, direct[i])) return row[direct[i]];
  }
  for (const k of Object.keys(row)) {
    const kn = String(k).replace(/^\uFEFF/, "").trim();
    if (/live\s*link\s*date/i.test(kn)) return row[k];
  }
  return undefined;
}

/** Milliseconds for sorting; NaN if unknown (sorts before real dates when ascending) */
function getLiveLinkDateSortMs(row) {
  const raw = findLiveLinkDateRaw(row);
  const r = resolve(raw);
  const val = r != null ? r : raw;
  if (val == null || val === "") return NaN;
  if (typeof val === "number" && !isNaN(val)) {
    if (val > 1e12) return val;
    if (val > 1e9) return Math.round(val * 1000);
    return val;
  }
  const d = new Date(val);
  const t = d.getTime();
  return isNaN(t) ? NaN : t;
}

function getLiveLinkDateDisplay(row) {
  const raw = findLiveLinkDateRaw(row);
  const r = resolve(raw);
  const val = r != null ? r : raw;
  if (val == null || val === "") return "";
  if (typeof val === "string") return val.trim();
  if (typeof val === "number" && !isNaN(val)) {
    const ms = val > 1e12 ? val : val > 1e9 ? val * 1000 : val;
    const d = new Date(ms);
    return isNaN(d.getTime()) ? String(val) : d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
  }
  const d = new Date(val);
  return isNaN(d.getTime()) ? String(val) : d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

function findClientsStatusRaw(row) {
  const direct = ["STATUS", "Status"];
  for (let i = 0; i < direct.length; i++) {
    if (Object.prototype.hasOwnProperty.call(row, direct[i])) return row[direct[i]];
  }
  for (const k of Object.keys(row)) {
    const kn = String(k).replace(/^\uFEFF/, "").trim();
    if (/^status$/i.test(kn)) return row[k];
  }
  return undefined;
}

function isActiveClientRow(row) {
  const v = findClientsStatusRaw(row);
  const r = resolve(v);
  const raw = r != null ? r : v;
  const s = raw == null ? "" : String(raw).trim().toUpperCase().replace(/\s+/g, " ");
  return s === CLIENT_RECORD_ACTIVE;
}

/** Client names in Default view order, deduped, STATUS = ACTIVE */
function activeClientsFromRows(clientRows) {
  const out = [];
  const seen = new Set();
  for (const row of clientRows) {
    if (!isActiveClientRow(row)) continue;
    const name = getClient(row);
    if (!name || seen.has(name)) continue;
    seen.add(name);
    out.push(name);
  }
  return out;
}

function rowCountsTowardSpend(status, postType) {
  if (status === STATUS_PUBLISHED || status === STATUS_PENDING) return true;
  if (status === STATUS_CONTENT_REQUESTED && postType === POST_GUEST) return true;
  if (status === STATUS_CONTENT_REQUESTED && postType === POST_OTHER) return true;
  return false;
}

function emptySection() {
  return { published: 0, pending: 0, content_requested: 0 };
}

function parseBudgetJson(raw) {
  if (!raw || !String(raw).trim()) return {};
  try {
    const o = JSON.parse(String(raw));
    return o && typeof o === "object" ? o : {};
  } catch (e) {
    return {};
  }
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=60");

  const TOKEN = process.env.SUPERFEEDER_API_TOKEN;
  const BUDGET_JSON = process.env.SUPERFEEDER_MONTHLY_BUDGET_JSON || "";

  if (!TOKEN) {
    return res.status(500).json({ ok: false, error: "Missing env var: SUPERFEEDER_API_TOKEN" });
  }

  const YEAR = 2026;
  const PM_CURRENT = prodMonthNow();
  const months = monthsOfYear(YEAR);
  const budgetMap = parseBudgetJson(BUDGET_JSON);

  try {
    const access = await getAccess(TOKEN);
    const rows = await listRows(access, OM_TABLE, OM_VIEW);
    let clientRows = [];
    try {
      clientRows = await listRows(access, CLIENTS_TABLE, CLIENTS_VIEW);
    } catch (e) {
      console.error("Superfeeder: Clients table load failed:", e.message);
    }
    const activeClientsOrdered = activeClientsFromRows(clientRows);

    const publishedCount = {};
    const publishedTiles = [];
    const clientsInYear = new Set();

    const currentClientsSet = new Set();
    const sectionTemplate = function () {
      const o = {};
      o[POST_PROFOUND] = emptySection();
      o[POST_LINK_INSERT] = emptySection();
      o[POST_GUEST] = emptySection();
      o[POST_OTHER] = emptySection();
      return o;
    };

    const currentSections = {};
    const spendByClient = {};
    /** Same rules as This month Spend (FINAL $), summed per client × Prod Month for YEAR */
    const spendByClientMonth = {};

    for (const row of rows) {
      const client = getClient(row);
      let pmRaw = row["Prod Month"];
      if (pmRaw == null) {
        for (const k of Object.keys(row)) {
          if (/^prod\s*month$/i.test(String(k).replace(/^\uFEFF/, "").trim())) {
            pmRaw = row[k];
            break;
          }
        }
      }
      const pm = normalizeProdMonthLabel(resolve(pmRaw) != null ? resolve(pmRaw) : pmRaw);
      const parsed = parseProdMonthLabel(pm);
      const status = getStatusCanonical(row);
      const postType = getPostTypeCanonical(row);

      if (!client || !pm) continue;
      if (!status) continue;

      if (parsed && parsed.year === YEAR) clientsInYear.add(client);

      if (parsed && parsed.year === YEAR && status === STATUS_PUBLISHED) {
        if (!publishedCount[client]) publishedCount[client] = {};
        const mk = parsed.label;
        publishedCount[client][mk] = (publishedCount[client][mk] || 0) + 1;

        const link = getLiveLink(row);
        const sortMs = getLiveLinkDateSortMs(row);
        publishedTiles.push({
          client: client,
          prod_month: mk,
          live_link: link,
          domain: getDomain(row),
          live_link_date: getLiveLinkDateDisplay(row),
          live_link_sort: isNaN(sortMs) ? null : sortMs,
          type_of_post: postType,
          final_usd: getFinalUsd(row)
        });
      }

      if (parsed && parsed.year === YEAR && rowCountsTowardSpend(status, postType)) {
        const mk = parsed.label;
        const amt = getFinalUsd(row);
        if (!spendByClientMonth[client]) spendByClientMonth[client] = {};
        const prev = spendByClientMonth[client][mk] || 0;
        spendByClientMonth[client][mk] = Math.round((prev + amt) * 100) / 100;
      }

      if (pm === normalizeProdMonthLabel(PM_CURRENT)) {
        currentClientsSet.add(client);
        if (!currentSections[client]) currentSections[client] = sectionTemplate();
        if (!currentSections[client][postType]) {
          currentSections[client][postType] = emptySection();
        }
        const sec = currentSections[client][postType];
        if (status === STATUS_PUBLISHED) sec.published += 1;
        else if (status === STATUS_PENDING) sec.pending += 1;
        else if (status === STATUS_CONTENT_REQUESTED && postType === POST_GUEST) {
          sec.content_requested += 1;
        } else if (status === STATUS_CONTENT_REQUESTED && postType === POST_OTHER) {
          sec.content_requested += 1;
        }

        if (rowCountsTowardSpend(status, postType)) {
          const amt = getFinalUsd(row);
          if (!spendByClient[client]) spendByClient[client] = 0;
          spendByClient[client] = Math.round((spendByClient[client] + amt) * 100) / 100;
        }
      }
    }

    publishedTiles.sort(function (a, b) {
      const pa = parseProdMonthLabel(a.prod_month);
      const pb = parseProdMonthLabel(b.prod_month);
      if (pa && pb && (pa.year !== pb.year || pa.monthIndex !== pb.monthIndex)) {
        if (pa.year !== pb.year) return pa.year - pb.year;
        return pa.monthIndex - pb.monthIndex;
      }
      if (a.client !== b.client) return a.client.localeCompare(b.client);
      return (a.live_link || "").localeCompare(b.live_link || "");
    });

    for (const c of Object.keys(budgetMap)) {
      const m = budgetMap[c];
      if (m && m[PM_CURRENT] != null && String(m[PM_CURRENT]).trim() !== "") {
        currentClientsSet.add(c);
      }
    }

    const clientsSorted = [...new Set([
      ...clientsInYear,
      ...Object.keys(publishedCount),
      ...Object.keys(currentSections),
      ...Object.keys(spendByClient),
      ...Object.keys(spendByClientMonth)
    ])].sort();

    const clientsForColumns = activeClientsOrdered.length > 0
      ? activeClientsOrdered
      : clientsSorted;

    const activeSet = new Set(clientsForColumns);

    const yearMatrix = clientsForColumns.map(function (name) {
      const byMonth = {};
      for (const mk of months) {
        byMonth[mk] = (publishedCount[name] && publishedCount[name][mk]) || 0;
      }
      return { client: name, byMonth: byMonth };
    });

    const yearSpendMatrix = clientsForColumns.map(function (name) {
      const byMonth = {};
      for (const mk of months) {
        const v = (spendByClientMonth[name] && spendByClientMonth[name][mk]) || 0;
        byMonth[mk] = v;
      }
      return { client: name, byMonth: byMonth };
    });

    const currentMonthList = [...currentClientsSet].filter(function (name) {
      return activeSet.has(name);
    }).sort();
    const currentMonthPayload = currentMonthList.map(function (name) {
      const sections = currentSections[name] || sectionTemplate();
      const budgetRaw = budgetMap[name] && budgetMap[name][PM_CURRENT];
      const budget = budgetRaw == null || budgetRaw === "" ? null : parseFloat(budgetRaw);
      const budgetNum = budget != null && !isNaN(budget) ? Math.round(budget * 100) / 100 : null;
      const spend = spendByClient[name] || 0;
      let remaining = null;
      if (budgetNum != null) remaining = Math.round((budgetNum - spend) * 100) / 100;

      return {
        client: name,
        budget: budgetNum,
        spend: spend,
        remaining: remaining,
        sections: {
          profound: sections[POST_PROFOUND],
          linkInsert: sections[POST_LINK_INSERT],
          guestPost: sections[POST_GUEST],
          other: sections[POST_OTHER]
        }
      };
    });

    const debugSample = rows.length ? {
      keys: Object.keys(rows[0]).filter(function (k) {
        return /CLIENT|Prod|STATUS|Type|FINAL|LIVE/i.test(k);
      }).slice(0, 12),
      row_count: rows.length
    } : { row_count: 0 };

    return res.status(200).json({
      ok: true,
      generated: new Date().toISOString(),
      year: YEAR,
      current_prod_month: PM_CURRENT,
      months: months,
      yearMatrix: yearMatrix,
      yearSpendMatrix: yearSpendMatrix,
      activeClients: activeClientsOrdered.length > 0 ? activeClientsOrdered : clientsSorted,
      publishedTiles: publishedTiles,
      currentMonth: currentMonthPayload,
      debug: debugSample
    });

  } catch (err) {
    console.error("Superfeeder API error:", err);
    return res.status(500).json({ ok: false, error: err.message });
  }
}
