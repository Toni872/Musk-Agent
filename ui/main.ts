// DOM layer for the MUSK static UI.
//
// Thin by design: all conversation logic lives in the pure module ui/chat.ts.
// This file only renders ChatState and forwards user events to the chat.
// Everything user-provided is written with textContent, never innerHTML.

import {
  createChat,
  type ChatMessage,
  type ChatState,
  type ContentProfile,
} from './chat';

const ROLE_LABELS: Record<ChatMessage['role'], string> = {
  agent: 'Agente',
  lead: 'Lead',
  diagnostic: 'Operador',
  info: 'Aviso',
};

const INPUT_PLACEHOLDER = 'Escribe como el lead y pulsa Enviar';
const INPUT_PLACEHOLDER_STOPPED =
  'Conversación detenida: escribe un mensaje o pulsa Reiniciar.';

const chat = createChat({ profile: 'demo' });
let busy = false;

const root = document.getElementById('app');
if (!root) throw new Error('Missing #app container');

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
      <p class="hero__note">Respuestas deterministas: el mismo mensaje devuelve siempre la misma respuesta. Sin canal real, sin leads reales, sin CRM y sin servicios externos.</p>
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
              <p class="chat__status">En línea · respuestas aprobadas</p>
            </div>
          </div>
          <div class="chat__controls">
            <label class="field">
              <span class="field__label">Contenido</span>
              <select id="profile">
                <option value="demo">DEMO (muestra, no aprobado)</option>
                <option value="real">Real (contenido aprobado del piloto)</option>
              </select>
            </label>
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
    <p>Entorno de simulación: sin canal real, sin leads reales, sin CRM. No se envía información a ningún servicio externo.</p>
  </footer>
`;

const profileSelect = getElement<HTMLSelectElement>('profile');
const resetButton = getElement<HTMLButtonElement>('reset');
const exportButton = getElement<HTMLButtonElement>('export');
const banner = getElement<HTMLParagraphElement>('banner');
const messagesEl = getElement<HTMLDivElement>('messages');
const composer = getElement<HTMLFormElement>('composer');
const input = getElement<HTMLInputElement>('input');
const sendButton = getElement<HTMLButtonElement>('send');
const summaryEl = getElement<HTMLParagraphElement>('summary');
const recordsEl = getElement<HTMLOListElement>('records');

function getElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing #${id}`);
  return element as T;
}

// Message text is inserted with textContent, never innerHTML: lead input must
// never be interpreted as markup.
function render(state: ChatState): void {
  banner.textContent = state.banner;
  profileSelect.value = state.profile;
  document.body.dataset.stopped = String(state.stopped);

  if (state.messages.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'messages__empty';
    empty.textContent = 'Aún no hay mensajes. Escribe como el lead para empezar.';
    messagesEl.replaceChildren(empty);
  } else {
    messagesEl.replaceChildren(...state.messages.map(renderMessage));
  }

  const stopped = state.stopped ? 'sí' : 'no';
  // "Dudas" is the measurement the spec asks for (spec 6: register the main
  // questions with a denominator). The wording of each one is already in the
  // records list; this is the denominator.
  summaryEl.textContent = `Detenido: ${stopped} · Registros: ${state.records.length} · Turnos: ${state.turnCount} · Dudas: ${state.doubts.length}`;

  if (state.records.length === 0) {
    const empty = document.createElement('li');
    empty.className = 'records__empty';
    empty.textContent = 'Sin registros todavía.';
    recordsEl.replaceChildren(empty);
  } else {
    recordsEl.replaceChildren(...state.records.map(renderRecord));
  }

  messagesEl.scrollTop = messagesEl.scrollHeight;
  applyBusy(state);
}

function renderMessage(message: ChatMessage): HTMLElement {
  const item = document.createElement('div');
  item.className = `msg msg--${message.role}`;

  const role = document.createElement('span');
  role.className = 'msg-role';
  role.textContent = ROLE_LABELS[message.role];

  const body = document.createElement('p');
  body.className = 'msg-body';
  body.textContent = message.text;

  item.append(role, body);
  return item;
}

function formatRecordTime(timestamp?: string): string {
  if (!timestamp) return '';
  try {
    const date = new Date(timestamp);
    return `[${date.toLocaleString('es-ES')}] `;
  } catch {
    return '';
  }
}

function renderRecord(record: ChatState['records'][number]): HTMLLIElement {
  const item = document.createElement('li');

  const kind = document.createElement('span');
  kind.className = 'record__kind';
  kind.textContent = record.kind;

  const detail = document.createElement('span');
  detail.className = 'record__detail';
  const intent = record.intent ? `(${record.intent}) ` : '';
  const time = formatRecordTime(record.timestamp);
  detail.textContent = `${time}${intent}${record.detail}`;

  item.append(kind, detail);
  return item;
}

function applyBusy(state: ChatState): void {
  input.disabled = busy;
  sendButton.disabled = busy;
  // After a stop the CLI still accepts input (rule 7 reply: suppressed turn),
  // so the composer stays usable and only signals the state through copy.
  input.placeholder = state.stopped ? INPUT_PLACEHOLDER_STOPPED : INPUT_PLACEHOLDER;
  sendButton.textContent = busy ? 'Enviando…' : 'Enviar';
}

async function handleSend(text: string): Promise<void> {
  if (busy) return;
  busy = true;
  applyBusy(chat.getState());
  try {
    const state = await chat.send(text);
    render(state);
  } finally {
    busy = false;
    applyBusy(chat.getState());
    input.focus();
  }
}

// Section navigation: sticky header means the browser's native anchor jump
// hides the target under the nav, so scroll explicitly (and skip the animation
// when the user asked for reduced motion).
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

function scrollToSection(id: string): void {
  const target = document.getElementById(id);
  if (!target) return;
  target.scrollIntoView({
    behavior: reduceMotion.matches ? 'auto' : 'smooth',
    block: 'start',
  });
}

root.querySelectorAll<HTMLElement>('[data-scroll]').forEach((trigger) => {
  trigger.addEventListener('click', (event) => {
    const id = trigger.dataset.scroll;
    if (!id) return;
    event.preventDefault();
    scrollToSection(id);
    if (id === 'simulador') input.focus({ preventScroll: true });
  });
});

composer.addEventListener('submit', (event) => {
  event.preventDefault();
  const text = input.value;
  const trimmed = text.trim();
  if (!trimmed) return;
  const limited = trimmed.length > 1000 ? trimmed.slice(0, 1000) : trimmed;
  input.value = '';
  void handleSend(limited);
});

profileSelect.addEventListener('change', () => {
  render(chat.setProfile(profileSelect.value as ContentProfile));
  input.focus();
});

resetButton.addEventListener('click', () => {
  render(chat.reset());
  input.focus();
});

exportButton.addEventListener('click', () => {
  const state = chat.getState();
  const now = new Date().toLocaleString('es-ES');
  const title = `Informe MUSK - ${now.replace(/[/:]/g, '-')}`;

  const messages = state.messages
    .map((m) => {
      const role = ROLE_LABELS[m.role];
      return `<div class="line"><strong>[${role}]</strong> ${escapeHtml(m.text)}</div>`;
    })
    .join('');

  const records = state.records
    .map((r) => {
      const time = r.timestamp ? new Date(r.timestamp).toLocaleString('es-ES') : '-';
      const intent = r.intent ? ` (${r.intent})` : '';
      return `<tr><td>${escapeHtml(time)}</td><td>${escapeHtml(r.kind)}</td><td>${escapeHtml(intent)}</td><td>${escapeHtml(r.detail)}</td></tr>`;
    })
    .join('');

  const doubts = state.doubts
    .map((d, i) => `<li>${i + 1}. ${escapeHtml(d)}</li>`)
    .join('');

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <title>${title}</title>
  <style>
    body{font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;margin:32px;line-height:1.5;color:#111}
    h1,h2{margin:0 0 12px 0}
    .meta{color:#555;margin-bottom:24px}
    .section{margin:28px 0}
    .line{margin:6px 0}
    table{width:100%;border-collapse:collapse;font-size:12px}
    th,td{border:1px solid #ddd;padding:6px 8px;text-align:left;vertical-align:top}
    th{background:#f7f7f7}
    ul{margin:8px 0;padding-left:20px}
    @media print{button{display:none}}
  </style>
</head>
<body>
  <h1>Informe de conversación - Agente MUSK</h1>
  <div class="meta">
    <div>Fecha de generación: ${now}</div>
    <div>Perfil: ${state.profile === 'demo' ? 'DEMO (muestra, no aprobado)' : 'Real (contenido aprobado)'}</div>
    <div>Turnos: ${state.turnCount}</div>
    <div>Detenido: ${state.stopped ? 'Sí' : 'No'}</div>
    <div>Registros: ${state.records.length}</div>
    <div>Dudas: ${state.doubts.length}</div>
  </div>
  <div class="section">
    <h2>Conversación completa</h2>
    ${messages || '<p><em>Sin mensajes</em></p>'}
  </div>
  <div class="section">
    <h2>Registros cronológicos</h2>
    <table>
      <thead><tr><th>Fecha/Hora</th><th>Tipo</th><th>Intent</th><th>Detalle</th></tr></thead>
      <tbody>${records || ''}</tbody>
    </table>
  </div>
  <div class="section">
    <h2>Dudas registradas</h2>
    ${doubts ? `<ul>${doubts}</ul>` : '<p><em>Sin dudas registradas</em></p>'}
  </div>
  <script>window.onload = () => window.print();</script>
</body>
</html>`;

  const win = window.open('', '_blank');
  if (!win) {
    alert('No se ha podido abrir una nueva ventana. Permite ventanas emergentes para exportar el informe.');
    return;
  }
  win.document.write(html);
  win.document.close();
});

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

render(chat.getState());
