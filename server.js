import express from "express";
import OpenAI from "openai";

const app = express();
const PORT = 10000;

app.use(express.json({ limit: "1mb" }));
app.use(express.static("public"));

const client = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

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

function requireClient(res) {
  if (!client) {
    res.status(400).json({
      error:
        "Falta OPENAI_API_KEY. Configura la variable de entorno para habilitar el chat.",
    });
    return false;
  }
  return true;
}

function isDemoAuthed(req) {
  const token = req.headers["x-demo-token"];
  return token === DEMO_TOKEN;
}

app.get("/api/config", (_req, res) => {
  res.json({
    hasOpenAIKey: Boolean(client),
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
  if (!client && !isDemoAuthed(req)) {
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

  if (!client && !isDemoAuthed(req)) {
    return res.status(401).json({ error: "Autenticacion requerida." });
  }

  if (!client || provider !== "OpenAI") {
    return res.json({
      text:
        "Este proveedor no esta conectado en el demo. Configura OPENAI_API_KEY para activar OpenAI.",
    });
  }

  try {
    const input = messages.map((m) => ({
      role: m.role,
      content: m.content,
    }));

    const response = await client.responses.create({
      model,
      input,
    });

    res.json({
      text: response.output_text || "",
    });
  } catch (err) {
    res.status(500).json({ error: "Error al generar respuesta." });
  }
});

app.post("/api/title", async (req, res) => {
  const { provider, model, messages } = req.body || {};
  if (!model || !Array.isArray(messages)) {
    return res.status(400).json({ error: "Solicitud invalida." });
  }

  if (!client && !isDemoAuthed(req)) {
    return res.status(401).json({ error: "Autenticacion requerida." });
  }

  if (!client || provider !== "OpenAI") {
    return res.json({ title: "Conversacion demo" });
  }

  try {
    const input = [
      {
        role: "system",
        content:
          "Genera un titulo corto (3-6 palabras) en espanol que resuma la conversacion. No uses comillas.",
      },
      ...messages.slice(-6).map((m) => ({
        role: m.role,
        content: m.content,
      })),
    ];

    const response = await client.responses.create({
      model,
      input,
    });

    const title = (response.output_text || "Nueva conversacion").trim();
    res.json({ title });
  } catch (err) {
    res.status(500).json({ error: "No se pudo generar el titulo." });
  }
});

app.listen(PORT, () => {
  console.log(`Servidor activo en http://localhost:${PORT}`);
});
