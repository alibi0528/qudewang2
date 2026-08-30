const CORS_H = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
};
export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS_H });
}
export async function onRequestGet(context) {
  const k = (context.env && context.env.DEEPSEEK_API_KEY) ? "KEYSET" : "NOKEY";
  return new Response("OK-" + k, {
    status: 200,
    headers: Object.assign({}, CORS_H, { "Content-Type": "text/plain; charset=utf-8" }),
  });
}