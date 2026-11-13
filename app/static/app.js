"use strict";

// Simulator UI for the MUSK agent.
//
// Ported from the original TypeScript frontend (ui/main.ts + ui/chat.ts) to a
// plain ES module that talks to the server-side Python agent:
//   POST /sessions          -> initial state (opening, banner, pending decisions)
//   POST /chat              -> one turn (reply + handoff status)
//   GET  /sessions/{id}/state -> full state for the side panel (records, doubts)
//   POST /report.pdf        -> operator report as PDF
// All conversation logic lives server-side; this file only renders and forwards.

const ROLE_LABELS = { agent: "Agente", lead: "Lead", info: "Aviso" };

const OPENING_PLACEHOLDER =
  "(none: decision still open with MUSK — a TODO placeholder is never sent)";
const STOPPED_REPLY_PLACEHOLDER = "(no message sent: conversation stopped)";
const HANDOFF_REPLY_PLACEHOLDER = "(no message sent: the conversation is with a person)";
const INPUT_PLACEHOLDER = "Escribe como el lead y pulsa Enviar";
const INPUT_PLACEHOLDER_STOPPED = "Conversación detenida: escribe un mensaje o pulsa Reiniciar.";

const DEFAULT_LEAD = {
  id: "ui-lead",
  contact: "+3460000000",
  bucket: "ilocalizable",
  loss_reason: "no respondió a los intentos de llamada",
};

const root = document.getElementById("app");
if (!root) throw new Error("Missing #app container");

root.innerHTML = `
  <header class="masthead">
    <div class="masthead__bar">
      <a class="wordmark" href="#top" data-scroll="top" aria-label="Escuela MUSK, ir al inicio">
        <span class="wordmark__eyebrow">Escuela</span>
        <span class="wordmark__name">MUSK</span>
      </a>
      <p class="env-chip">Entorno de pruebas</p>
    </div>
    <nav class="nav" aria-label="Secciones del simulador">
      <a class="nav__link" href="#simulador" data-scroll="simulador">Simulador</a>
      <a class="nav__link" href="#estado" data-scroll="estado">Estado</a>
      <a class="nav__link" href="#registros" data-scroll="registros">Registros</a>
      <a class="nav__link" href="#contenido" data-scroll="contenido">Contenido</a>
    </nav>
  </header>

  <section class="hero" id="top">
    <div class="hero__inner">
      <p class="hero__kicker">Agente conversacional · MVP</p>
      <h1 class="hero__title">Simulador del agente</h1>
      <p class="hero__lead">Comprueba cómo responde el agente de MUSK a un lead real, paso a paso.</p>
      <p class="hero__note">Motor conversacional con LLM y base de conocimiento aprobada. Sin canal real, sin leads reales y sin CRM.</p>
      <div class="hero__actions">
        <button class="btn btn--primary" type="button" data-scroll="simulador">Empezar la demo</button>
        <button class="btn btn--ghost" type="button" data-scroll="estado">Ver estado</button>
      </div>
    </div>
  </section>

  <main class="stage">
    <div class="stage__grid">
      <section class="card chat" id="simulador" aria-label="Conversación">
        <div class="chat__head">
          <div class="chat__identity">
            <span class="dot" aria-hidden="true"></span>
            <div>
              <h2 class="card__title">Agente MUSK</h2>
              <p class="chat__status">En línea · simulación con contenido unificado</p>
            </div>
          </div>
          <div class="chat__controls">
            <button id="copy-handoff" class="btn btn--ghost btn--small" type="button">Copiar aviso</button>
            <button id="export-json" class="btn btn--ghost btn--small" type="button">Descargar JSON</button>
            <button id="export" class="btn btn--ghost btn--small" type="button">Descargar informe</button>
            <button id="reset" class="btn btn--ghost btn--small" type="button">Reiniciar</button>
          </div>
        </div>

        <div class="messages" id="messages" aria-live="polite" aria-label="Mensajes de la conversación"></div>

        <form class="composer" id="composer">
          <label class="sr-only" for="input">Mensaje del lead</label>
          <input id="input" type="text" autocomplete="off" placeholder="${INPUT_PLACEHOLDER}" />
          <button type="submit" id="send" class="btn btn--primary">Enviar</button>
        </form>
      </section>

      <aside class="card panel" id="estado" aria-label="Estado de la conversación">
        <h2 class="card__title">Estado de la conversación</h2>
        <p class="panel__summary" id="summary"></p>

        <div class="panel__block" id="contenido">
          <h3 class="panel__subtitle">Contenido</h3>
          <p class="banner" id="banner"></p>
        </div>

        <div class="panel__block" id="registros">
          <h3 class="panel__subtitle">Registros</h3>
          <ol class="records" id="records"></ol>
        </div>
      </aside>
    </div>
  </main>

  <footer class="footer">
    <p>Entorno de simulación: sin canal real, sin leads reales, sin CRM. Con el modelo LLM activo, el texto de la conversación se envía al proveedor para generar la respuesta.</p>
  </footer>
`;

function getElement(id) {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing #${id}`);
  return element;
}

const resetButton = getElement("reset");
const exportButton = getElement("export");
const exportJsonButton = getElement("export-json");
const copyHandoffButton = getElement("copy-handoff");
const banner = getElement("banner");
const messagesEl = getElement("messages");
const composer = getElement("composer");
const input = getElement("input");
const sendButton = getElement("send");
const summaryEl = getElement("summary");
const recordsEl = getElement("records");

function newSessionId() {
  return "ui-" + Math.random().toString(36).slice(2, 10);
}

const state = {
  sessionId: newSessionId(),
  banner: "",
  messages: [],
  stopped: false,
  records: [],
  doubts: [],
  pendingDecisions: [],
  turnCount: 0,
  handoff: null,
  qualificationAnswers: [],
};

let busy = false;

// ---------------------------------------------------------------- API calls

async function postJson(url, body) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`${url} ${response.status}`);
  return response.json();
}

function createSession(sessionId) {
  return postJson("/sessions", { session_id: sessionId, lead: DEFAULT_LEAD });
}

function fetchState(sessionId) {
  return fetch(`/sessions/${encodeURIComponent(sessionId)}/state`).then((response) => {
    if (!response.ok) throw new Error(`state ${response.status}`);
    return response.json();
  });
}

function runTurn(sessionId, message) {
  return postJson("/chat", { session_id: sessionId, message, lead: DEFAULT_LEAD });
}

function applyServerState(data) {
  state.banner = data.banner || "";
  state.stopped = Boolean(data.stopped);
  state.records = data.records || [];
  state.doubts = data.doubts || [];
  state.pendingDecisions = data.pending_decisions || [];
  state.turnCount = data.turn_count || 0;
  state.handoff = data.handoff || null;
  state.qualificationAnswers = (data.qualification_answers || []).map((item) => ({
    questionId: item.question_id,
    answer: item.answer,
  }));
}

// ------------------------------------------------------------ turn formatting

function pushTurn(result) {
  if (result.reply !== "") {
    state.messages.push({ role: "agent", text: result.reply });
  } else if (result.suppressed) {
    state.messages.push({
      role: "agent",
      text: result.action === "stop" ? STOPPED_REPLY_PLACEHOLDER : HANDOFF_REPLY_PLACEHOLDER,
    });
  }
}

// -------------------------------------------------------------------- render

function render() {
  banner.textContent = state.banner;
  document.body.dataset.stopped = String(state.stopped);

  if (state.messages.length === 0) {
    const empty = document.createElement("p");
    empty.className = "messages__empty";
    empty.textContent = "Aún no hay mensajes. Escribe como el lead para empezar.";
    messagesEl.replaceChildren(empty);
  } else {
    messagesEl.replaceChildren(...state.messages.map(renderMessage));
  }

  const stopped = state.stopped ? "sí" : "no";
  summaryEl.textContent = `Detenido: ${stopped} · Registros: ${state.records.length} · Turnos: ${state.turnCount} · Dudas: ${state.doubts.length}`;

  if (state.records.length === 0) {
    const empty = document.createElement("li");
    empty.className = "records__empty";
    empty.textContent = "Sin registros todavía.";
    recordsEl.replaceChildren(empty);
  } else {
    recordsEl.replaceChildren(...state.records.map(renderRecord));
  }

  messagesEl.scrollTop = messagesEl.scrollHeight;
  applyBusy();
}

function renderMessage(message) {
  const item = document.createElement("div");
  item.className = `msg msg--${message.role}`;

  const role = document.createElement("span");
  role.className = "msg-role";
  role.textContent = ROLE_LABELS[message.role] || message.role;

  const body = document.createElement("p");
  body.className = "msg-body";
  body.textContent = message.text;

  item.append(role, body);
  return item;
}

function formatRecordTime(timestamp) {
  if (!timestamp) return "";
  try {
    const date = new Date(timestamp);
    return `[${date.toLocaleString("es-ES")}] `;
  } catch {
    return "";
  }
}

function renderRecord(record) {
  const item = document.createElement("li");

  const kind = document.createElement("span");
  kind.className = "record__kind";
  kind.textContent = record.kind;

  const detail = document.createElement("span");
  detail.className = "record__detail";
  const intent = record.intent ? `(${record.intent}) ` : "";
  const time = formatRecordTime(record.timestamp);
  detail.textContent = `${time}${intent}${record.detail}`;

  item.append(kind, detail);
  return item;
}

function applyBusy() {
  input.disabled = busy;
  sendButton.disabled = busy;
  input.placeholder = state.stopped ? INPUT_PLACEHOLDER_STOPPED : INPUT_PLACEHOLDER;
  sendButton.textContent = busy ? "Enviando…" : "Enviar";
}

// ----------------------------------------------------------------- lifecycle

async function init() {
  try {
    const data = await createSession(state.sessionId);
    applyServerState(data);
    state.messages = [];
    const opening = data.opening;
    state.messages.push({ role: opening ? "agent" : "info", text: opening || OPENING_PLACEHOLDER });
    if (state.pendingDecisions.length > 0) {
      state.messages.push({ role: "info", text: `pending : ${state.pendingDecisions.join(", ")}` });
    }
    render();
  } catch (error) {
    state.messages = [{ role: "info", text: `No se pudo iniciar la sesión: ${error.message}` }];
    render();
  }
}

async function handleSend(text) {
  if (busy) return;
  busy = true;
  applyBusy();
  try {
    state.messages.push({ role: "lead", text });
    const result = await runTurn(state.sessionId, text);
    const fresh = await fetchState(state.sessionId);
    applyServerState(fresh);
    pushTurn(result);
    render();
  } catch (error) {
    state.messages.push({ role: "info", text: `error = ${error.message}` });
    render();
  } finally {
    busy = false;
    applyBusy();
    input.focus();
  }
}

// ------------------------------------------------------------------- exports

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

function clockStamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

async function copyHandoff() {
  const handoff = state.handoff;
  if (!handoff) {
    alert("Aún no hay handoff generado en esta sesión.");
    return;
  }

  const lines = [];
  lines.push("AVISO COMERCIAL - Escuela Musk");
  lines.push("===========================");
  lines.push(`Fecha: ${new Date().toLocaleString("es-ES")}`);
  lines.push(`Motivo: ${handoff.reason}`);
  lines.push(`Lead ID: ${handoff.lead_id}`);
  lines.push(`Contacto: ${handoff.contact || "-"}`);
  lines.push(
    `Bolsa / origen: ${handoff.bucket === "ilocalizable" ? "ilocalizables" : "no compradores"}`,
  );
  lines.push(`Destinataria: ${handoff.recipient || "Laura"}`);
  lines.push(`Formación detectada: ${handoff.formation || "-"}`);
  lines.push("");
  lines.push("RESUMEN PARA EL COMERCIAL:");
  lines.push(handoff.summary || "-");
  lines.push("");

  if (state.qualificationAnswers.length > 0) {
    lines.push("RESPUESTAS DE CUALIFICACIÓN:");
    for (const item of state.qualificationAnswers) {
      lines.push(`- ${item.questionId}: ${item.answer}`);
    }
    lines.push("");
  }

  if (handoff.doubts && handoff.doubts.length > 0) {
    lines.push("DUDAS INCLUIDAS:");
    for (const doubt of handoff.doubts) lines.push(`- ${doubt}`);
    lines.push("");
  }

  if (handoff.after_handoff && handoff.after_handoff.length > 0) {
    lines.push("MENSAJES DEL LEAD TRAS EL AVISO:");
    for (const message of handoff.after_handoff) lines.push(`- ${message}`);
    lines.push("");
  }

  const text = lines.join("\n");
  try {
    await navigator.clipboard.writeText(text);
    copyHandoffButton.textContent = "¡Copiado!";
    setTimeout(() => {
      copyHandoffButton.textContent = "Copiar aviso a Laura";
    }, 1500);
  } catch {
    const win = window.open("", "_blank");
    if (win) {
      win.document.write(`<pre>${escapeHtml(text)}</pre>`);
      win.document.close();
    } else {
      alert("No se ha podido copiar. Prueba con el informe PDF.");
    }
  }
}

function exportJson() {
  const now = new Date();
  const payload = {
    generatedAt: now.toISOString(),
    turnCount: state.turnCount,
    stopped: state.stopped,
    messages: state.messages,
    records: state.records,
    doubts: state.doubts,
    pendingDecisions: state.pendingDecisions,
    handoff: state.handoff,
    qualificationAnswers: state.qualificationAnswers,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json;charset=utf-8",
  });
  downloadBlob(blob, `musk-sesion-${clockStamp()}.json`);
}

async function exportPdf() {
  const payload = {
    generated_at: new Date().toISOString(),
    turn_count: state.turnCount,
    stopped: state.stopped,
    messages: state.messages.map((message) => ({ role: message.role, text: message.text })),
    records: state.records.map((record) => ({
      timestamp: record.timestamp || null,
      kind: record.kind,
      intent: record.intent || null,
      detail: record.detail,
    })),
    doubts: state.doubts,
    handoff: state.handoff,
    qualification_answers: state.qualificationAnswers.map((item) => ({
      question_id: item.questionId,
      answer: item.answer,
    })),
  };
  try {
    const response = await fetch("/report.pdf", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      alert(`No se pudo generar el informe (${response.status}).`);
      return;
    }
    downloadBlob(await response.blob(), `musk-sesion-${clockStamp()}.pdf`);
  } catch (error) {
    alert(`No se pudo generar el informe: ${error.message}`);
  }
}

function escapeHtml(value) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// --------------------------------------------------------------- DOM wiring

const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

function scrollToSection(id) {
  const target = document.getElementById(id);
  if (!target) return;
  target.scrollIntoView({ behavior: reduceMotion.matches ? "auto" : "smooth", block: "start" });
}

root.querySelectorAll("[data-scroll]").forEach((trigger) => {
  trigger.addEventListener("click", (event) => {
    const id = trigger.dataset.scroll;
    if (!id) return;
    event.preventDefault();
    scrollToSection(id);
    if (id === "simulador") input.focus({ preventScroll: true });
  });
});

composer.addEventListener("submit", (event) => {
  event.preventDefault();
  const trimmed = input.value.trim();
  if (!trimmed) return;
  const limited = trimmed.length > 1000 ? trimmed.slice(0, 1000) : trimmed;
  input.value = "";
  void handleSend(limited);
});

resetButton.addEventListener("click", async () => {
  if (!confirm("¿Reiniciar la sesión? Se borrará la conversación actual.")) return;
  state.sessionId = newSessionId();
  await init();
  input.focus();
});

copyHandoffButton.addEventListener("click", () => void copyHandoff());
exportJsonButton.addEventListener("click", exportJson);
exportButton.addEventListener("click", () => void exportPdf());

void init();
