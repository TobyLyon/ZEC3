export default async function handler(request, response) {
  const owner = request.query?.owner;
  if (!owner || typeof owner !== "string") {
    response.status(400).json({ error: "Missing owner" });
    return;
  }

  const apiUrl = (process.env.FLASH_API_URL || "https://flashapi.trade").replace(/\/$/, "");
  const upstream = await fetch(
    `${apiUrl}/positions/owner/${encodeURIComponent(owner)}?includePnlInLeverageDisplay=true`,
    { headers: { Accept: "application/json" } }
  );

  const text = await upstream.text();
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.status(upstream.status).send(text);
}
