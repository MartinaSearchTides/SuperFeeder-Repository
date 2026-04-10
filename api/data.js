const SERVER = "https://seatable.searchtides.com";

async function getAccess(apiToken) {
  const url = `${SERVER}/api/v2.1/dtable/app-access-token/`;
  const res = await fetch(url, {
    headers: { "Authorization": `Token ${apiToken}`, "Accept": "application/json" }
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`getAccess ${res.status}: ${text.substring(0, 300)}`);
  return JSON.parse(text);
}

async function tryListRows(access, tableName, viewName, urlTemplate) {
  const { access_token, dtable_uuid } = access;
  const url = urlTemplate
    .replace("{uuid}", dtable_uuid)
    .replace("{table}", encodeURIComponent(tableName))
    .replace("{view}", encodeURIComponent(viewName));

  const res = await fetch(url, {
    headers: { "Authorization": `Token ${access_token}`, "Accept": "application/json" }
  });
  const text = await res.text();
  return { status: res.status, ok: res.ok, body: text.substring(0, 300) };
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");

  const OM_TOKEN = process.env.OM_API_TOKEN;
  if (!OM_TOKEN) return res.status(500).json({ ok: false, error: "Missing OM_API_TOKEN" });

  try {
    // Step 1: get access info
    const access = await getAccess(OM_TOKEN);

    // Step 2: try different URL patterns
    const urls = [
      `${SERVER}/api-gateway/api/v2/dtables/{uuid}/rows/?table_name={table}&view_name={view}&limit=10&convert_keys=true`,
      `${SERVER}/api/v2/dtables/{uuid}/rows/?table_name={table}&view_name={view}&limit=10&convert_keys=true`,
      `${SERVER}/dtable-server/api/v1/dtables/{uuid}/rows/?table_name={table}&view_name={view}&limit=10`,
    ];

    const results = {};
    for (const urlTemplate of urls) {
      const label = urlTemplate.split("/dtables/")[0].split(SERVER)[1];
      results[label] = await tryListRows(access, "QUOTAS", "", urlTemplate);
    }

    return res.status(200).json({
      ok: true,
      access_keys: Object.keys(access),
      dtable_uuid: access.dtable_uuid,
      server: access.dtable_server,
      url_tests: results
    });

  } catch(err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
}
