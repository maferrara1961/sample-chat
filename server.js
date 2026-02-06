import express from "express";
import OpenAI from "openai";

const app = express();
const PORT = 10000;

app.use(express.json({ limit: "1mb" }));
app.use(express.static("public"));

const client = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

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

app.get("/api/models", async (_req, res) => {
  if (!requireClient(res)) return;

  try {
    const models = await client.models.list();
    const items = (models.data || [])
      .filter((m) => typeof m.id === "string")
      .map((m) => ({ id: m.id, created: m.created || 0 }))
      .sort((a, b) => b.created - a.created);

    const latest = items.slice(0, 8);

    res.json({ latest, all: items });
  } catch (err) {
    res.status(500).json({ error: "No se pudieron cargar los modelos." });
  }
});

app.post("/api/chat", async (req, res) => {
  if (!requireClient(res)) return;

  const { model, messages } = req.body || {};
  if (!model || !Array.isArray(messages)) {
    return res.status(400).json({ error: "Solicitud inválida." });
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
  if (!requireClient(res)) return;

  const { model, messages } = req.body || {};
  if (!model || !Array.isArray(messages)) {
    return res.status(400).json({ error: "Solicitud inválida." });
  }

  try {
    const input = [
      {
        role: "system",
        content:
          "Genera un titulo corto (3-6 palabras) en español que resuma la conversacion. No uses comillas.",
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
