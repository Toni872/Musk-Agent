// CLI entry point for the MUSK simulation harness.
//
//   npm run sim                    -> interactive REPL (lead writes, agent replies)
//   npm run sim -- --smoke         -> ONE scripted turn, exits 0 without stdin
//   npm run sim -- --demo          -> interactive REPL with the DEMO sample content
//   npm run sim -- --demo --smoke  -> one scripted turn with the DEMO sample content
//
// --demo loads src/content.demo.ts (clearly-labelled SAMPLE, not approved by
// MUSK). Without --demo the real approved content for the pilot formation is
// used (Curso de Desarrollo Full Stack, curated from MUSK's dossier).
//
// Standalone by design: no WhatsApp, no real leads, no CRM. The handoff target
// (Laura in the configured profiles) is simulated only; no notification is sent.
// The only optional network dependency is the LLM provider used for 'general'
// FAQ replies; the smoke run and all guarded intents are deterministic.

import { createInterface } from 'node:readline/promises';

import { MuskAgent, type LeadContact, type TurnResult } from './agent';
import { APPROVED_CONTENT, type ApprovedContent } from './content';
import { DEMO_CONTENT } from './content.demo';
import { loadLLMConfigFromEnv, OpenAICompatibleLLM, type LLMProvider } from './llm';

const args = process.argv.slice(2);
const useDemoContent = args.includes('--demo');

// Content profile: the real approved content for the pilot formation by default,
// or the clearly-labelled DEMO sample when --demo is passed.
const CONTENT: ApprovedContent = useDemoContent ? DEMO_CONTENT : APPROVED_CONTENT;

function printContentBanner(): void {
  console.log(
    useDemoContent
      ? 'Content: DEMO SAMPLE (not approved by MUSK) — for flow demonstration only.'
      : 'Content: Curso de Desarrollo Full Stack (curated from MUSK dossier; final wording sign-off pending).',
  );
}

const SMOKE_LEAD: LeadContact = {
  id: 'smoke-lead',
  contact: '+34600000000',
  bucket: 'ilocalizable',
};

const SMOKE_QUESTION = '¿cuánto cuesta la formación?';

function buildProvider(): LLMProvider | null {
  const config = loadLLMConfigFromEnv();
  return config ? new OpenAICompatibleLLM(config) : null;
}

// A turn can legitimately send nothing: a received answer has no message of its
// own (the conversation continues with the next question) and a turn after a
// stop is suppressed. Never print an empty line.
function noMessageNote(result: TurnResult): string {
  return result.capturedAnswer
    ? '(no message: answer registered, the conversation continues with the next question)'
    : '(no message sent: conversation stopped)';
}

// Knowledge-base provenance of a turn, in the same operator style as the
// other lines: "kb = kb-catalogo (score 4.21, coverage 0.75)". It shows
// either the passage that answered or, when nothing cleared the thresholds,
// the closest one (the escalation context). Operator-facing only.
function printKbProvenance(agent: MuskAgent, recordsBefore: number): void {
  const records = agent.records.slice(recordsBefore).filter((record) => record.kind === 'kb');
  for (const record of records) console.log(record.detail);
}

// Grounding verdict of the optional LLM rephrase, in the same operator style
// as the knowledge-base line: "grounding = grounded rephrase of faq/modalidad"
// or "grounding = rephrase rejected (unsupported: "500"): used the approved
// text". It makes a rejected rephrase visible in the demo. Operator-facing
// only: the lead-facing transcript is untouched.
function printGrounding(agent: MuskAgent, recordsBefore: number): void {
  const records = agent.records.slice(recordsBefore).filter((record) => record.kind === 'grounding');
  for (const record of records) console.log(`grounding = ${record.detail}`);
}

function printTurn(result: TurnResult): void {
  console.log(`agent   > ${result.reply || noMessageNote(result)}`);
  console.log(
    `intent  = ${result.intent} | action = ${result.action} | suppressed = ${result.suppressed} | registered doubts = ${result.registeredDoubts.length}`,
  );
  if (result.capturedAnswer) {
    console.log(
      `received = answer to ${result.capturedAnswer.questionId ?? 'opening message'} (no doubt registered)`,
    );
  }
  if (result.handoff) {
    const recipient = result.handoff.recipient
      ? ` destinataria=${result.handoff.recipient}`
      : '';
    const bucket = result.handoff.bucket === 'ilocalizable' ? 'ilocalizables' : 'no compradores';
    console.log(
      `aviso simulado = reason=${result.handoff.reason} lead=${result.handoff.leadId} contact=${result.handoff.contact} bucket=${bucket}${recipient}`,
    );
  }
  if (result.ruleViolations.length > 0) {
    console.log(`guard   = violations: ${result.ruleViolations.join(', ')}`);
  }
}

// Opening message of the conversation (MVP spec §3.2) plus the items of the
// content profile that are still open with MUSK. A TODO(decisión) placeholder
// is never sent (rule 4); it is reported so the operator sees what is pending.
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
  printGrounding(agent, recordsBefore);
  console.log('smoke: OK');
}

async function runRepl(): Promise<void> {
  console.log('MUSK simulation harness — standalone: no real channel, no real leads, no CRM.');
  printContentBanner();
  const provider = buildProvider();
  console.log(
    provider
      ? 'LLM provider: OpenAI-compatible (configured via MUSK_LLM_* environment variables).'
      : 'LLM provider: none — deterministic approved replies only. Set MUSK_LLM_BASE_URL and MUSK_LLM_API_KEY to enable.',
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
      printGrounding(agent, recordsBefore);
      // Brief qualification (MVP spec §4): one approved question per turn,
      // never an exam. Nothing is asked once the lead stops or hands off.
      const ask = agent.nextQualificationQuestion();
      if (ask) console.log(`agent   > ${ask.text}`);
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
