const historyEl = document.getElementById("history");
const chatEl = document.getElementById("chat");
const promptEl = document.getElementById("prompt");
const sendBtn = document.getElementById("send");
const modelSelect = document.getElementById("model");
const newChatBtn = document.getElementById("newChat");
const activeTitleEl = document.getElementById("activeTitle");
const authModal = document.getElementById("authModal");
const authForm = document.getElementById("authForm");
const authError = document.getElementById("authError");
const usernameInput = document.getElementById("username");
const passwordInput = document.getElementById("password");

const STORAGE_KEY = "openai-chat-history-v1";
const DEMO_TOKEN_KEY = "openai-demo-token-v1";
const MODEL_PREF_KEY = "openai-model-pref-v1";

let sessions = loadSessions();
let activeSessionId = sessions[0]?.id || null;
let hasOpenAIKey = false;
let top5Models = [];
let demoToken = localStorage.getItem(DEMO_TOKEN_KEY);

function loadSessions() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
  } catch {
    return [];
  }
}

function saveSessions() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
}

function loadModelPreference() {
  try {
    return JSON.parse(localStorage.getItem(MODEL_PREF_KEY));
  } catch {
    return null;
  }
}

function saveModelPreference(model) {
  localStorage.setItem(MODEL_PREF_KEY, JSON.stringify(model));
}

function createSession() {
  const session = {
    id: crypto.randomUUID(),
    title: "Nueva conversacion",
    messages: [],
    createdAt: Date.now(),
    model: loadModelPreference(),
  };
  sessions.unshift(session);
  activeSessionId = session.id;
  saveSessions();
  render();
}

function getActiveSession() {
  return sessions.find((s) => s.id === activeSessionId);
}

function renderHistory() {
  historyEl.innerHTML = "";
  sessions.forEach((session) => {
    const item = document.createElement("div");
    item.className = "history-item";
    if (session.id === activeSessionId) item.classList.add("active");
    item.textContent = session.title || "Nueva conversacion";
    item.addEventListener("click", () => {
      activeSessionId = session.id;
      render();
    });
    historyEl.appendChild(item);
  });
}

function renderChat() {
  chatEl.innerHTML = "";
  const session = getActiveSession();
  if (!session) return;

  activeTitleEl.textContent = session.title || "Nueva conversacion";

  session.messages.forEach((message) => {
    const bubble = document.createElement("div");
    bubble.className = `message ${message.role}`;
    bubble.textContent = message.content;
    chatEl.appendChild(bubble);
  });

  chatEl.scrollTop = chatEl.scrollHeight;
}

function render() {
  if (!activeSessionId && sessions.length === 0) createSession();
  renderHistory();
  renderChat();
}

function getAuthHeaders() {
  const headers = { "Content-Type": "application/json" };
  if (demoToken) headers["X-Demo-Token"] = demoToken;
  return headers;
}

async function loadConfig() {
  const res = await fetch("/api/config");
  const data = await res.json();
  hasOpenAIKey = Boolean(data.hasOpenAIKey);
  top5Models = data.top5 || [];

  if (!hasOpenAIKey && !demoToken) {
    authModal.classList.add("show");
    return false;
  }
  return true;
}

function buildOption(value, label) {
  const option = document.createElement("option");
  option.value = value;
  option.textContent = label;
  return option;
}

async function loadModels() {
  modelSelect.innerHTML = "<option>Cargando...</option>";
  try {
    const res = await fetch("/api/models", {
      headers: demoToken ? { "X-Demo-Token": demoToken } : {},
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Error");

    modelSelect.innerHTML = "";
    const topGroup = document.createElement("optgroup");
    topGroup.label = "Top 5 del mercado";
    (data.top5 || top5Models).forEach((model) => {
      const option = buildOption(
        JSON.stringify({ provider: model.provider, model: model.model }),
        `${model.label} · ${model.provider}`
      );
      topGroup.appendChild(option);
    });
    modelSelect.appendChild(topGroup);

    if (data.latest?.length) {
      const latestGroup = document.createElement("optgroup");
      latestGroup.label = "OpenAI recientes";
      data.latest.forEach((model) => {
        const option = buildOption(
          JSON.stringify({ provider: "OpenAI", model: model.id }),
          model.id
        );
        latestGroup.appendChild(option);
      });
      modelSelect.appendChild(latestGroup);
    }

    if (data.all?.length) {
      const allGroup = document.createElement("optgroup");
      allGroup.label = "OpenAI todos";
      data.all.forEach((model) => {
        const option = buildOption(
          JSON.stringify({ provider: "OpenAI", model: model.id }),
          model.id
        );
        allGroup.appendChild(option);
      });
      modelSelect.appendChild(allGroup);
    }

    const stored = loadModelPreference();
    if (stored) {
      modelSelect.value = JSON.stringify(stored);
    } else if (modelSelect.options.length) {
      const initial = JSON.parse(modelSelect.options[0].value);
      saveModelPreference(initial);
    }
  } catch (err) {
    modelSelect.innerHTML = "<option>Configura OPENAI_API_KEY</option>";
  }
}

function addMessage(role, content) {
  const session = getActiveSession();
  if (!session) return;
  session.messages.push({ role, content });
  saveSessions();
  renderChat();
}

async function sendMessage() {
  const text = promptEl.value.trim();
  if (!text) return;
  promptEl.value = "";
  addMessage("user", text);

  const session = getActiveSession();
  if (!session) return;

  try {
    const selected = JSON.parse(modelSelect.value);
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: getAuthHeaders(),
      body: JSON.stringify({
        provider: selected.provider,
        model: selected.model,
        messages: session.messages,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Error");

    addMessage("assistant", data.text || "");
    await updateTitle();
  } catch (err) {
    addMessage("assistant", "No se pudo generar respuesta. Revisa tu API key.");
  }
}

async function updateTitle() {
  const session = getActiveSession();
  if (!session || session.messages.length < 2) return;

  try {
    const selected = JSON.parse(modelSelect.value);
    const res = await fetch("/api/title", {
      method: "POST",
      headers: getAuthHeaders(),
      body: JSON.stringify({
        provider: selected.provider,
        model: selected.model,
        messages: session.messages,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Error");

    session.title = data.title || session.title;
    saveSessions();
    renderHistory();
    activeTitleEl.textContent = session.title;
  } catch (err) {
    return;
  }
}

modelSelect.addEventListener("change", () => {
  try {
    const selected = JSON.parse(modelSelect.value);
    saveModelPreference(selected);
    const session = getActiveSession();
    if (session) {
      session.model = selected;
      saveSessions();
    }
  } catch {
    return;
  }
});

authForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  authError.textContent = "";
  try {
    const res = await fetch("/api/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: usernameInput.value.trim(),
        password: passwordInput.value,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Error");
    demoToken = data.token;
    localStorage.setItem(DEMO_TOKEN_KEY, demoToken);
    authModal.classList.remove("show");
    await loadModels();
  } catch (err) {
    authError.textContent = "Credenciales invalidas. Intenta de nuevo.";
  }
});

promptEl.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    sendMessage();
  }
});

sendBtn.addEventListener("click", sendMessage);
newChatBtn.addEventListener("click", createSession);

const ready = await loadConfig();
if (ready) {
  await loadModels();
}
render();
