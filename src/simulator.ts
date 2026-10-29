// CLI entry point for the MUSK simulation harness.
//
//   npm run sim                    -> interactive REPL (lead writes, agent replies)
//   npm run sim -- --smoke         -> ONE scripted turn, exits 0 without stdin
// There is ONE content profile (src/content.ts). Wording is still pending MUSK's
// final sign-off, which is why nothing here talks to a real lead.
//
// Standalone by design: no WhatsApp, no real leads, no CRM. The handoff target
// (Laura) is simulated only; no notification is sent. The optional network
// dependency is the LLM provider (Groq) that drives the conversation; without it
// the harness falls back to the closest approved passage.

import { createInterface } from 'node:readline/promises';

import { MuskAgent, type LeadContact, type TurnResult } from './agent';
import { APPROVED_CONTENT, type ApprovedContent } from './content';
import { loadLLMConfigFromEnv, OpenAICompatibleLLM, type LLMProvider } from './llm';

// Local convenience only: `.env` is git-ignored and optional. Without this, the
// documented "copy .env.example to .env" step would have no effect, because
// nothing else reads the file. Variables already exported in the shell win.
try {
  process.loadEnvFile('.env');
} catch {
  // No .env: deterministic mode, nothing to load.
}

const args = process.argv.slice(2);
const CONTENT: ApprovedContent = APPROVED_CONTENT;

function printContentBanner(): void {
  console.log(
    'Content: Escuela Musk unified profile (curated from MUSK material; final wording sign-off pending).',
  );
}

const SMOKE_LEAD: LeadContact = {
  id: 'smoke-lead',
  contact: '+34600000000',
  bucket: 'ilocalizable',
};

const SMOKE_QUESTION = 'cuéntame sobre el curso de videojuegos';

function buildProvider(): LLMProvider | null {
  const config = loadLLMConfigFromEnv();
  return config ? new OpenAICompatibleLLM(config) : null;
}

function printKbProvenance(agent: MuskAgent, recordsBefore: number): void {
  const records = agent.records.slice(recordsBefore).filter((record) => record.kind === 'kb');
  for (const record of records) console.log(record.detail);
}

function printTurn(result: TurnResult): void {
  console.log(`agent   > ${result.reply || '(no message sent)'}`);
  console.log(
    `intent  = ${result.intent} | action = ${result.action} | suppressed = ${result.suppressed} | registered doubts = ${result.registeredDoubts.length}`,
  );
  if (result.handoff) {
    const recipient = result.handoff.recipient ? ` destinataria=${result.handoff.recipient}` : '';
    const bucket = result.handoff.bucket === 'ilocalizable' ? 'ilocalizables' : 'no compradores';
    console.log(
      `aviso simulado = reason=${result.handoff.reason} lead=${result.handoff.leadId} contact=${result.handoff.contact} bucket=${bucket}${recipient}`,
    );
  }
  if (result.ruleViolations.length > 0) {
    console.log(`guard   = violations: ${result.ruleViolations.join(', ')}`);
  }
}

function printOpening(agent: MuskAgent): void {
  const opening = agent.opening();
  console.log('--- opening ---');
  console.log(
    opening
      ? `agent   > ${opening}`
      : 'agent   > (none: decision still open with MUSK — a TODO placeholder is never sent)',
  );
  const pending = agent.pendingDecisions;
  if (pending.length > 0) {
    console.log(`pending : ${pending.join(', ')}`);
  }
}

async function runSmoke(): Promise<void> {
  console.log('MUSK smoke run (scripted, non-interactive)');
  printContentBanner();
  const agent = new MuskAgent({ content: CONTENT, provider: buildProvider(), lead: SMOKE_LEAD });
  printOpening(agent);
  const recordsBefore = agent.records.length;
  const result = await agent.runTurn(SMOKE_QUESTION);
  console.log(`lead    > ${SMOKE_QUESTION}`);
  printTurn(result);
  printKbProvenance(agent, recordsBefore);
  console.log('smoke: OK');
}

async function runRepl(): Promise<void> {
  console.log('MUSK simulation harness — standalone: no real channel, no real leads, no CRM.');
  printContentBanner();
  const config = loadLLMConfigFromEnv();
  const provider = config ? new OpenAICompatibleLLM(config) : null;
  console.log(
    config
      ? `LLM provider: ${config.model} at ${config.baseUrl} (temperature ${config.temperature}).`
      : 'LLM provider: none — fallback to the closest approved passage. Set MUSK_LLM_BASE_URL and MUSK_LLM_API_KEY to enable.',
  );
  console.log('Commands: /reset (new conversation), /state (records), /exit');
  console.log('Write a message as the lead to start.');

  const lead: LeadContact = { id: 'sim-lead', contact: '+3460000000', bucket: 'ilocalizable' };
  let agent = new MuskAgent({ content: CONTENT, provider, lead });
  printOpening(agent);
  const rl = createInterface({ input: process.stdin, output: process.stdout });

  try {
    for (;;) {
      const line = (await rl.question('\nyou (lead) > ')).trim();
      if (!line) continue;
      if (line === '/exit' || line === '/salir') break;
      if (line === '/reset') {
        agent = new MuskAgent({ content: CONTENT, provider, lead });
        console.log('conversation reset');
        printOpening(agent);
        continue;
      }
      if (line === '/state') {
        console.log(`stopped=${agent.isStopped} records=${agent.records.length}`);
        for (const record of agent.records) {
          console.log(`  [${record.kind}] (${record.intent ?? '-'}) ${record.detail}`);
        }
        continue;
      }
      const recordsBefore = agent.records.length;
      const result = await agent.runTurn(line);
      printTurn(result);
      printKbProvenance(agent, recordsBefore);
    }
  } finally {
    rl.close();
  }
}

if (args.includes('--smoke')) {
  await runSmoke();
} else {
  await runRepl();
}
