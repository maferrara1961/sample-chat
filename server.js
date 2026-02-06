import express from "express";
import OpenAI from "openai";

const app = express();
const PORT = 10000;

app.use(express.json({ limit: "1mb" }));
app.use(express.static("public"));

const client = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || "";
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const MISTRAL_API_KEY = process.env.MISTRAL_API_KEY || "";
const META_API_KEY = process.env.META_API_KEY || "";
const META_API_BASE_URL = process.env.META_API_BASE_URL || "";

const DEMO_USER = process.env.DEMO_USER || "demo";
const DEMO_PASS = process.env.DEMO_PASS || "demo";
const DEMO_TOKEN = "demo-token";

const TOP5_MODELS = [
  {
    provider: "OpenAI",
    model: "gpt-4.1",
    label: "GPT-4.1",
    description: "Modelo de uso general con foco en codigo.",
  },
  {
    provider: "Anthropic",
    model: "claude-3.5-sonnet",
    label: "Claude 3.5 Sonnet",
    description: "Equilibrio entre razonamiento y velocidad.",
  },
  {
    provider: "Google",
    model: "gemini-1.5-pro",
    label: "Gemini 1.5 Pro",
    description: "Multimodal con contexto largo.",
  },
  {
    provider: "Meta",
    model: "llama-3.1",
    label: "Llama 3.1",
    description: "Modelo abierto de alta capacidad.",
  },
  {
    provider: "Mistral",
    model: "mistral-large-2",
    label: "Mistral Large 2",
    description: "Razonamiento y codigo con buen costo.",
  },
];

const PROVIDER_STATUS = {
  OpenAI: Boolean(client),
  Anthropic: Boolean(ANTHROPIC_API_KEY),
  Google: Boolean(GEMINI_API_KEY),
  Mistral: Boolean(MISTRAL_API_KEY),
  Meta: Boolean(META_API_KEY && META_API_BASE_URL),
};

const HAS_ANY_PROVIDER_KEY = Object.values(PROVIDER_STATUS).some(Boolean);

function isDemoAuthed(req) {
  const token = req.headers["x-demo-token"];
  return token === DEMO_TOKEN;
}

function ensureProviderAvailable(provider) {
  if (!Object.prototype.hasOwnProperty.call(PROVIDER_STATUS, provider)) {
    return { ok: false, error: "Proveedor no soportado." };
  }
  if (!PROVIDER_STATUS[provider]) {
    return {
      ok: false,
      error:
        provider === "Meta"
          ? "Falta META_API_KEY o META_API_BASE_URL."
          : `Falta API key de ${provider}.`,
    };
  }
  return { ok: true };
}

function toOpenAIInput(messages) {
  return messages.map((m) => ({
    role: m.role,
    content: [{ type: "input_text", text: m.content }],
  }));
}

function toAnthropicMessages(messages) {
  return messages.map((m) => ({
    role: m.role === "assistant" ? "assistant" : "user",
    content: m.content,
  }));
}

function toGeminiContents(messages) {
  return messages.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));
}

function buildTitlePrompt(messages) {
  const context = messages
    .slice(-6)
    .map((m) => `${m.role === "assistant" ? "Asistente" : "Usuario"}: ${m.content}`)
    .join("\n");
  return `Genera un titulo corto (3-6 palabras) en espanol que resuma la conversacion. No uses comillas.\n\n${context}`;
}

async function callOpenAI({ model, messages }) {
  if (!client) throw new Error("Falta OPENAI_API_KEY.");
  const response = await client.responses.create({
    model,
    input: toOpenAIInput(messages),
  });
  return response.output_text || "";
}

async function callAnthropic({ model, messages }) {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: 1024,
      messages: toAnthropicMessages(messages),
    }),
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.error?.message || "Error en Anthropic.");
  }
  return (data.content || [])
    .filter((item) => item.type === "text")
    .map((item) => item.text)
    .join("");
}

async function callGemini({ model, messages }) {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": GEMINI_API_KEY,
      },
      body: JSON.stringify({
        contents: toGeminiContents(messages),
      }),
    }
  );
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.error?.message || "Error en Gemini.");
  }
  return (
    data.candidates?.[0]?.content?.parts?.map((part) => part.text).join("") || ""
  );
}

async function callMistral({ model, messages }) {
  const response = await fetch("https://api.mistral.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${MISTRAL_API_KEY}`,
    },
    body: JSON.stringify({
      model,
      messages,
    }),
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.error?.message || "Error en Mistral.");
  }
  return data.choices?.[0]?.message?.content || "";
}

async function callMetaCompatible({ model, messages }) {
  const base = META_API_BASE_URL.replace(/\/$/, "");
  const response = await fetch(`${base}/v1/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${META_API_KEY}`,
    },
    body: JSON.stringify({
      model,
      messages,
    }),
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.error?.message || "Error en proveedor Meta.");
  }
  return data.choices?.[0]?.message?.content || "";
}

async function routeChatByProvider({ provider, model, messages }) {
  const availability = ensureProviderAvailable(provider);
  if (!availability.ok) {
    return "Proveedor no configurado. " + availability.error;
  }

  if (provider === "OpenAI") return callOpenAI({ model, messages });
  if (provider === "Anthropic") return callAnthropic({ model, messages });
  if (provider === "Google") return callGemini({ model, messages });
  if (provider === "Mistral") return callMistral({ model, messages });
  if (provider === "Meta") return callMetaCompatible({ model, messages });

  return "Proveedor no soportado.";
}

async function routeTitleByProvider({ provider, model, messages }) {
  const availability = ensureProviderAvailable(provider);
  if (!availability.ok) {
    return "Conversacion demo";
  }

  const titlePrompt = buildTitlePrompt(messages);

  if (provider === "OpenAI") {
    return (
      (await callOpenAI({
        model,
        messages: [{ role: "user", content: titlePrompt }],
      })) || "Nueva conversacion"
    ).trim();
  }

  if (provider === "Anthropic") {
    return (
      (await callAnthropic({
        model,
        messages: [{ role: "user", content: titlePrompt }],
      })) || "Nueva conversacion"
    ).trim();
  }

  if (provider === "Google") {
    return (
      (await callGemini({
        model,
        messages: [{ role: "user", content: titlePrompt }],
      })) || "Nueva conversacion"
    ).trim();
  }

  if (provider === "Mistral") {
    return (
      (await callMistral({
        model,
        messages: [{ role: "user", content: titlePrompt }],
      })) || "Nueva conversacion"
    ).trim();
  }

  if (provider === "Meta") {
    return (
      (await callMetaCompatible({
        model,
        messages: [{ role: "user", content: titlePrompt }],
      })) || "Nueva conversacion"
    ).trim();
  }

  return "Nueva conversacion";
}

app.get("/api/config", (_req, res) => {
  res.json({
    hasOpenAIKey: Boolean(client),
    hasAnyProviderKey: HAS_ANY_PROVIDER_KEY,
    providerStatus: PROVIDER_STATUS,
    top5: TOP5_MODELS,
  });
});

app.post("/api/auth", (req, res) => {
  const { username, password } = req.body || {};
  if (username === DEMO_USER && password === DEMO_PASS) {
    return res.json({ token: DEMO_TOKEN });
  }
  return res.status(401).json({ error: "Credenciales invalidas." });
});

app.get("/api/models", async (req, res) => {
  if (!HAS_ANY_PROVIDER_KEY && !isDemoAuthed(req)) {
    return res.status(401).json({ error: "Autenticacion requerida." });
  }

  if (!client) {
    return res.json({
      latest: [],
      all: [],
      top5: TOP5_MODELS,
    });
  }

  try {
    const models = await client.models.list();
    const items = (models.data || [])
      .filter((m) => typeof m.id === "string")
      .map((m) => ({ id: m.id, created: m.created || 0 }))
      .sort((a, b) => b.created - a.created);

    const latest = items.slice(0, 8);

    res.json({ latest, all: items, top5: TOP5_MODELS });
  } catch (err) {
    res.status(500).json({ error: "No se pudieron cargar los modelos." });
  }
});

app.post("/api/chat", async (req, res) => {
  const { provider, model, messages } = req.body || {};
  if (!model || !Array.isArray(messages)) {
    return res.status(400).json({ error: "Solicitud invalida." });
  }

  if (!HAS_ANY_PROVIDER_KEY && !isDemoAuthed(req)) {
    return res.status(401).json({ error: "Autenticacion requerida." });
  }

  try {
    const text = await routeChatByProvider({
      provider,
      model,
      messages,
    });

    res.json({ text });
  } catch (err) {
    res.status(500).json({ error: err.message || "Error al generar respuesta." });
  }
});

app.post("/api/title", async (req, res) => {
  const { provider, model, messages } = req.body || {};
  if (!model || !Array.isArray(messages)) {
    return res.status(400).json({ error: "Solicitud invalida." });
  }

  if (!HAS_ANY_PROVIDER_KEY && !isDemoAuthed(req)) {
    return res.status(401).json({ error: "Autenticacion requerida." });
  }

  try {
    const title = await routeTitleByProvider({
      provider,
      model,
      messages,
    });
    res.json({ title });
  } catch (err) {
    res.status(500).json({ error: err.message || "No se pudo generar el titulo." });
  }
});

app.listen(PORT, () => {
  console.log(`Servidor activo en http://localhost:${PORT}`);
});
