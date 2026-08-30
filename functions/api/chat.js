const CORS_H = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Max-Age": "86400",
};
function json(obj, status) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: Object.assign({}, CORS_H, { "Content-Type": "application/json; charset=utf-8" }),
  });
}
export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS_H });
}
export async function onRequestPost(context) {
  const API_KEY = context.env && context.env.DEEPSEEK_API_KEY;
  if (!API_KEY) return json({ error: "No DEEPSEEK_API_KEY in Pages env vars." }, 500);
  try {
    const body = await context.request.json();
    const messages = body && body.messages;
    const model = (body && body.model) || "deepseek-chat";
    if (!Array.isArray(messages) || messages.length === 0) {
      return json({ error: "messages must be a non-empty array" }, 400);
    }
    const s = JSON.stringify(messages);
    if (s.length > 150000) return json({ error: "Messages too long (max 150K)" }, 400);
    const resp = await fetch("https://api.deepseek.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": "Bearer " + API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: model, messages: messages, stream: false,
        temperature: 0.7, max_tokens: 4096,
      }),
    });
    if (!resp.ok) {
      const t = await resp.text();
      return json({ error: "DeepSeek " + resp.status + ": " + t.slice(0, 800) }, 502);
    }
    const data = await resp.json();
    const content = (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || "(no reply)";
    return json({ content: content, role: "assistant", model: data.model || model, usage: data.usage || null });
  } catch (e) {
    return json({ error: "Request failed: " + String((e && e.message) || e) }, 502);
  }
}