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
| `SUPERFEEDER_MONTHLY_BUDGET_JSON` | Optional. JSON map of monthly budgets per client (see below) |

After adding or changing variables, **Redeploy** the project.

### Monthly budget JSON

Keys must match **client names** from SeaTable (`CLIENT*`) and month labels exactly as in `Prod Month` (e.g. `Apr 2026`).

Example (single line in Vercel):

```json
{"Acme Corp":{"Mar 2026":10000,"Apr 2026":12000},"Other Client":{"Apr 2026":8000}}
```

If a client/month is missing, **This month** shows budget as "Not set" and remaining as "N/A".

**Spend** for the current month is the sum of **FINAL $** for that client and month for all rows that are **Published** or **Pending** (any Type of Post), plus **Content Requested** rows **only** when Type of Post is **Guest Post** (Content Requested on Profound / Link Insert is excluded).

## Data source

- **Server:** `https://seatable.searchtides.com`  
- **Table:** `OM`  
- **View:** `Published Links_for Superfeeders Dashboard`  

Relevant columns: `CLIENT*`, `Prod Month`, `STATUS 1`, `Type of Post`, `LIVE LINK`, `FINAL $`.

## Notes

- The API response is cached about **5 minutes** (`s-maxage=300`) to reduce SeaTable load.  
- Open `/api/data` in the browser to inspect JSON and the `debug` field if columns do not match.  
- Keep tokens out of git; store them only in Vercel environment variables.
