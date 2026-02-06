const historyEl = document.getElementById("history");
const chatEl = document.getElementById("chat");
const promptEl = document.getElementById("prompt");
const sendBtn = document.getElementById("send");
const modelSelect = document.getElementById("model");
const newChatBtn = document.getElementById("newChat");
const activeTitleEl = document.getElementById("activeTitle");

const STORAGE_KEY = "openai-chat-history-v1";

let sessions = loadSessions();
let activeSessionId = sessions[0]?.id || null;

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

function createSession() {
  const session = {
    id: crypto.randomUUID(),
    title: "Nueva conversacion",
    messages: [],
    createdAt: Date.now(),
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

async function loadModels() {
  modelSelect.innerHTML = "<option>Cargando...</option>";
  try {
    const res = await fetch("/api/models");
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Error");

    modelSelect.innerHTML = "";
    const latestGroup = document.createElement("optgroup");
    latestGroup.label = "Ultimos modelos";
    data.latest.forEach((model) => {
      const option = document.createElement("option");
      option.value = model.id;
      option.textContent = model.id;
      latestGroup.appendChild(option);
    });

    const allGroup = document.createElement("optgroup");
    allGroup.label = "Todos";
    data.all.forEach((model) => {
      const option = document.createElement("option");
      option.value = model.id;
      option.textContent = model.id;
      allGroup.appendChild(option);
    });

    modelSelect.appendChild(latestGroup);
    modelSelect.appendChild(allGroup);
  } catch (err) {
    modelSelect.innerHTML =
      "<option>Configura OPENAI_API_KEY</option>";
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
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: modelSelect.value,
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
    const res = await fetch("/api/title", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: modelSelect.value,
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

promptEl.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    sendMessage();
  }
});

sendBtn.addEventListener("click", sendMessage);
newChatBtn.addEventListener("click", createSession);

loadModels();
render();
