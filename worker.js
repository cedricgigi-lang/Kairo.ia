// Kairo.IA — serveur (Cloudflare Worker)
// Gemini (clé secrète GEMINI_KEY) + GPT-OSS, Qwen, Llama + images Flux (liaison Workers AI « AI »)

const MODELES = {
  gpt: "@cf/openai/gpt-oss-120b",
  qwen: "@cf/qwen/qwen3.8-27b",
  llama: "@cf/meta/llama-4-scout-17b-16e-instruct",
};

const SYSTEME =
  "Tu es Kairo.IA, un assistant intelligent, chaleureux et précis. " +
  "Réponds toujours dans la langue de l'utilisateur, de façon claire et utile. " +
  "Si tu ne sais pas, dis-le honnêtement.";

const SYSTEME_CHANSON =
  "Tu es Kairo.IA, un parolier talentueux. Écris des chansons ORIGINALES " +
  "(jamais les paroles d'une chanson existante). Donne : un titre, le style " +
  "et le tempo, puis Couplet 1, Refrain, Couplet 2, Refrain, Pont, Refrain final, " +
  "et des accords simples. Réponds dans la langue de l'utilisateur.";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, "Content-Type": "application/json; charset=utf-8" },
  });
}

function texteDe(r) {
  if (!r) return "";
  if (typeof r === "string") return r;
  if (typeof r.response === "string") return r.response;
  const c = r.choices && r.choices[0] && r.choices[0].message;
  if (c && c.content) return c.content;
  if (Array.isArray(r.output)) {
    for (const o of r.output) {
      if (o.type === "message" && Array.isArray(o.content)) {
        const t = o.content.map((x) => x.text || "").join("");
        if (t) return t;
      }
    }
  }
  if (r.result) return texteDe(r.result);
  return "";
}

function nettoie(t) {
  return String(t).replace(/<think>[\s\S]*?<\/think>/g, "").trim();
}

async function gemini(env, systeme, messages) {
  if (!env.GEMINI_KEY) throw new Error("Clé Gemini manquante (secret GEMINI_KEY)");
  const contents = messages.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));
  const body = JSON.stringify({ systemInstruction: { parts: [{ text: systeme }] }, contents });
  let dernier = "";
  for (const modele of ["gemini-flash-lite-latest", "gemini-flash-latest"]) {
    const res = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/" + modele + ":generateContent",
      { method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": env.GEMINI_KEY }, body }
    );
    const d = await res.json().catch(() => ({}));
    if (res.ok) {
      const parts = (d.candidates && d.candidates[0] && d.candidates[0].content && d.candidates[0].content.parts) || [];
      const t = parts.map((p) => p.text || "").join("");
      if (t) return t;
    }
    dernier = (d.error && d.error.message) || "Erreur " + res.status;
  }
  throw new Error(dernier);
}

async function cloudflare(env, id, systeme, messages) {
  if (!env.AI) throw new Error("Liaison Workers AI manquante (variable AI)");
  const r = await env.AI.run(id, {
    messages: [{ role: "system", content: systeme }, ...messages],
    max_tokens: 1500,
  });
  const t = nettoie(texteDe(r));
  if (!t) throw new Error("Réponse vide");
  return t;
}

const MODELE_IMAGE = "@cf/black-forest-labs/flux-1-schnell";

async function creerImage(env, description) {
  if (!env.AI) throw new Error("Liaison Workers AI manquante (variable AI)");
  let prompt = description;
  try {
    const r = await env.AI.run(MODELES.llama, {
      messages: [
        { role: "system", content: "Rewrite the user's image request as one detailed English prompt for an image generator (subject, style, colors, lighting). Reply with the prompt only." },
        { role: "user", content: description },
      ],
      max_tokens: 200,
    });
    const t = nettoie(texteDe(r));
    if (t) prompt = t.slice(0, 1800);
  } catch (e) {}
  const r = await env.AI.run(MODELE_IMAGE, { prompt, steps: 6 });
  if (!r || !r.image) throw new Error("Image vide");
  return r.image;
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") return new Response(null, { headers: CORS });
    const url = new URL(request.url);
    let modele = "gemini", mode = "chat", messages = [];

    if (request.method === "GET") {
      const q = url.searchParams.get("q");
      if (!q) return json({ ok: true, nom: "Kairo.IA", modeles: ["gemini", ...Object.keys(MODELES)] });
      modele = url.searchParams.get("model") || "gemini";
      mode = url.searchParams.get("mode") || "chat";
      messages = [{ role: "user", content: q }];
    } else if (request.method === "POST") {
      const b = await request.json().catch(() => null);
      if (!b || !Array.isArray(b.messages)) return json({ erreur: "Format invalide" }, 400);
      modele = b.model || "gemini";
      mode = b.mode || "chat";
      messages = b.messages
        .filter((m) => m && typeof m.content === "string" && m.content.trim())
        .slice(-20)
        .map((m) => ({ role: m.role === "assistant" ? "assistant" : "user", content: m.content.slice(0, 8000) }));
    } else {
      return json({ erreur: "Méthode non permise" }, 405);
    }

    if (!messages.length) return json({ erreur: "Message vide" }, 400);
    if (mode === "image") {
      try {
        const desc = messages[messages.length - 1].content;
        const image = await creerImage(env, desc);
        if (request.method === "GET") {
          const bin = Uint8Array.from(atob(image), (c) => c.charCodeAt(0));
          return new Response(bin, { headers: { ...CORS, "Content-Type": "image/jpeg" } });
        }
        return json({ image, modele: "flux" });
      } catch (e) {
        return json({ erreur: String((e && e.message) || e) }, 502);
      }
    }

    const systeme = mode === "chanson" ? SYSTEME_CHANSON : SYSTEME;

    try {
      let reponse;
      if (modele === "gemini") reponse = await gemini(env, systeme, messages);
      else if (MODELES[modele]) reponse = await cloudflare(env, MODELES[modele], systeme, messages);
      else return json({ erreur: "Modèle inconnu : " + modele }, 400);
      return json({ reponse, modele });
    } catch (e) {
      return json({ erreur: String((e && e.message) || e) }, 502);
    }
  },
};
