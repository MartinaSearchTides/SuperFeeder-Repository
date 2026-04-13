# Superfeeder Dashboard

SearchTides dashboard for the **Superfeeders** SeaTable base: published overview for 2026, current-month pipeline and budgets, backed by a single Vercel serverless API.

## Setup

### 1. GitHub

Push this repository (root contains `index.html` and `api/data.js`).

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
| `SUPERFEEDER_MONTHLY_BUDGET_JSON` | Optional. **Monthly budgets live only here (Vercel), not in SeaTable.** JSON map per client / month (see below). |
| `SUPERFEEDER_TIMEZONE` | Optional. IANA zone for “current production month” (default `Europe/Prague`). Use e.g. `America/New_York` if your team aligns months to US Eastern. |

After adding or changing variables, **Redeploy** the project.

### Monthly budget JSON (how to create it)

**Budgets are configured only on Vercel** (this env var). SeaTable holds **spend** (`FINAL $`) and pipeline data; it does not store the monthly budget cap. Everyone who loads the dashboard sees the same numbers from this JSON until you change the variable and redeploy.

**You do not need this variable for the dashboard to run.** If it is missing, the **This month** tab still shows pipeline counts; budget fields show “Not set” / “N/A”.

When you are ready:

1. In Vercel open your project → **Settings** → **Environment Variables**.
2. Click **Add New**.
3. **Name:** `SUPERFEEDER_MONTHLY_BUDGET_JSON`
4. **Value:** paste a valid JSON object (see examples below). Use **Production** (and Preview if you want).
5. Save, then **Deployments** → **…** on the latest deployment → **Redeploy**.

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
