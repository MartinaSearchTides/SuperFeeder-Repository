# Superfeeder Dashboard

SearchTides dashboard for the **Superfeeders** SeaTable base: published overview for 2026, current-month pipeline and budgets, backed by a single Vercel serverless API.

## Setup

### 1. GitHub

Push this repository (root contains `index.html`, `api/*.js`, and `lib/`).

### 2. Vercel

1. [vercel.com](https://vercel.com) → New Project → Import from GitHub  
2. Select this repository  
3. **Root Directory:** repository root (`SuperFeeder-Repository (root)`), not the `api` folder alone  
4. Deploy  

### 3. Environment variables

In Vercel → Project → Settings → Environment Variables:

| Name | Description |
|------|-------------|
| `SUPERFEEDER_API_TOKEN` | SeaTable API token for the Superfeeders base |
| `SUPERFEEDER_MONTHLY_BUDGET_JSON` | Optional. **Seed / fallback** budgets: JSON map per client / month. Merged with Redis (Redis wins on conflicts). |
| `SUPERFEEDER_BUDGET_SECRET` | Required **to save budgets from the dashboard**. Long random string; same value typed in the UI as “Budget admin key”. |
| `UPSTASH_REDIS_REST_URL` | From **Upstash Redis** (Vercel Storage). **Or** use legacy names below. |
| `UPSTASH_REDIS_REST_TOKEN` | Paired with URL. |
| `KV_REST_API_URL` | **Alternative:** if Vercel only created these (older KV / Redis link), the app uses them automatically. |
| `KV_REST_API_TOKEN` | **Alternative:** paired with `KV_REST_API_URL`. |
| `SUPERFEEDER_TIMEZONE` | Optional. IANA zone for “current production month” (default `Europe/Prague`). Use e.g. `America/New_York` if your team aligns months to US Eastern. |

After adding or changing variables, **Redeploy** the project.

### Monthly budgets: Redis + dashboard (recommended)

1. In Vercel → your project → **Storage** / [Marketplace](https://vercel.com/marketplace) → add **Upstash Redis** (or another Redis with REST URL + token).  
2. Link it to the project. Vercel usually adds **`UPSTASH_REDIS_REST_URL`** / **`UPSTASH_REDIS_REST_TOKEN`** or **`KV_REST_API_URL`** / **`KV_REST_API_TOKEN`** — the dashboard supports **either** pair.  
3. Set **`SUPERFEEDER_BUDGET_SECRET`** to a long random string (keep it private).  
4. Redeploy.

On the **This month** tab, enter that secret once per session, type each client’s monthly budget, and click **Save**. Values are stored in Redis under key `superfeeder:monthly_budget`; **every visitor** sees the same numbers. **Spend** and **remaining** still use SeaTable **`FINAL $`** (remaining = budget − spend).

`POST /api/budget` expects JSON: `{ "secret": "<SUPERFEEDER_BUDGET_SECRET>", "client": "Exact Client Name", "month": "Apr 2026", "amount": 12000 }` (use `""` for `amount` to clear that client/month in Redis).

### Monthly budget JSON (optional seed / fallback)

**SeaTable does not store the budget cap.** Optional env **`SUPERFEEDER_MONTHLY_BUDGET_JSON`** is merged with Redis: for the same client + month, **Redis overrides** env. Use env for defaults before anyone saves from the UI, or when Redis is not configured.

**You do not need budget env or Redis for the dashboard to run.** If both are missing, the **This month** tab still shows pipeline counts; budget shows “Not set” / “N/A”.

To set **env-only** seed budgets (optional):

1. Vercel → **Settings** → **Environment Variables** → add **`SUPERFEEDER_MONTHLY_BUDGET_JSON`**.  
2. Paste JSON (examples below), save, **Redeploy**.

**Shape:** outer keys = **client name** matching OM **`CLIENT*`** (and your ACTIVE Clients list). Inner keys = **month label** matching **`Prod Month`** in OM (e.g. `Apr 2026`). Values = **number** (monthly budget in dollars, no `$`).

**Minimal “placeholder”** (no budgets yet, same as omitting the variable):

```json
{}
```

**Real example** (one line is easiest to paste in Vercel):

```json
{"Acme Corp":{"Mar 2026":10000,"Apr 2026":12000},"Other Client":{"Apr 2026":8000}}
```

**Multi-line** is also valid if your Vercel UI allows it:

```json
{
  "Acme Corp": {
    "Mar 2026": 10000,
    "Apr 2026": 12000
  },
  "Other Client": {
    "Apr 2026": 8000
  }
}
```

Tip: open `/api/data` on your deployment and check `currentMonth[].client` to copy exact client strings.

If a client/month is missing, **This month** shows budget as "Not set" and remaining as "N/A".

**Spend** for the current month is the sum of **FINAL $** for that client and month for all rows that are **Published** or **Pending** (any Type of Post), plus **Content Requested** rows when Type of Post is **Guest Post** or **Other** (empty or unknown type). Content Requested on Profound / Link Insert is excluded from spend.

## Data source

- **Server:** `https://seatable.searchtides.com`  
- **Table:** `OM`  
- **View:** `Published Links_for Superfeeders Dashboard`  

Relevant OM columns: `CLIENT*`, `Prod Month`, `STATUS 1`, `Type of Post`, `LIVE LINK`, `FINAL $`, `DOMAIN`, `Live Link Date`.

**Clients (tabs & matrix columns):** table **`Clients`**, view **`Default view`**. Only rows whose **`STATUS`** is **`ACTIVE`** (case-insensitive) appear as dashboard columns and per-client tabs. The client name column should match **`CLIENT*`** text in OM. If the Clients table is missing or fails to load, the API falls back to all clients found in OM.

## Notes

- The API response is cached about **5 minutes** (`s-maxage=300`) to reduce SeaTable load.  
- Open `/api/data` in the browser to inspect JSON and the `debug` field if columns do not match.  
- Keep tokens out of git; store them only in Vercel environment variables.

### Search engines and bots (no indexing)

The project is configured to discourage indexing: `robots.txt` at the site root (`Disallow: /`), strict `noindex` / `nofollow` meta tags in `index.html`, and **`X-Robots-Tag`** on all responses via [`vercel.json`](vercel.json). This is not a cryptographic guarantee; a password or Vercel deployment protection adds stronger access control if you need it.
