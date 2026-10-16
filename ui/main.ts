// DOM layer for the MUSK static UI.
//
// Thin by design: all conversation logic lives in the pure module ui/chat.ts.
// This file only renders ChatState and forwards user events to the chat.

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

const chat = createChat({ profile: 'demo' });
let busy = false;

const root = document.getElementById('app');
if (!root) throw new Error('Missing #app container');

root.innerHTML = `
  <header class="topbar">
    <div class="brand">
      <span class="brand-mark">MUSK</span>
      <div>
        <h1>Simulador del agente</h1>
        <p class="subtitle">Conversación de prueba determinista, sin LLM. El motor es el mismo que usa <code>npm run sim</code>.</p>
      </div>
    </div>
    <div class="controls">
      <label class="field">
        <span>Contenido</span>
        <select id="profile">
          <option value="demo">DEMO (muestra, no aprobado)</option>
          <option value="real">Real (contenido aprobado del piloto)</option>
        </select>
      </label>
      <button id="reset" type="button">Reiniciar conversación</button>
    </div>
    <p class="banner" id="banner"></p>
  </header>
  <main class="layout">
    <section class="chat" aria-label="Conversación">
      <div class="messages" id="messages" aria-live="polite"></div>
      <form class="composer" id="composer">
        <label class="sr-only" for="input">Mensaje del lead</label>
        <input id="input" type="text" autocomplete="off" placeholder="Escribe como el lead y pulsa Enviar" />
        <button type="submit" id="send">Enviar</button>
      </form>
    </section>
    <aside class="panel" aria-label="Estado de la conversación">
      <h2>Estado de la conversación</h2>
      <p class="panel-summary" id="summary"></p>
      <ol class="records" id="records"></ol>
    </aside>
  </main>
  <footer class="footer">Entorno de simulación: sin canal real, sin leads reales, sin CRM. No se envía información a ningún servicio externo.</footer>
`;

const profileSelect = getElement<HTMLSelectElement>('profile');
const resetButton = getElement<HTMLButtonElement>('reset');
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

  messagesEl.replaceChildren(
    ...state.messages.map((message) => {
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
    }),
  );

  const stopped = state.stopped ? 'sí' : 'no';
  summaryEl.textContent = `Detenido: ${stopped} · Registros: ${state.records.length} · Turnos: ${state.turnCount}`;

  recordsEl.replaceChildren(
    ...state.records.map((record) => {
      const item = document.createElement('li');
      item.textContent = `[${record.kind}] (${record.intent ?? '-'}) ${record.detail}`;
      return item;
    }),
  );

  messagesEl.scrollTop = messagesEl.scrollHeight;
  applyBusy(state);
}

const INPUT_PLACEHOLDER = 'Escribe como el lead y pulsa Enviar';
const INPUT_PLACEHOLDER_STOPPED =
  'Conversación detenida: escribe un mensaje o pulsa Reiniciar conversación.';

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

composer.addEventListener('submit', (event) => {
  event.preventDefault();
  const text = input.value;
  if (!text.trim()) return;
  input.value = '';
  void handleSend(text);
});

profileSelect.addEventListener('change', () => {
  render(chat.setProfile(profileSelect.value as ContentProfile));
  input.focus();
});

resetButton.addEventListener('click', () => {
  render(chat.reset());
  input.focus();
});

render(chat.getState());
input.focus();
