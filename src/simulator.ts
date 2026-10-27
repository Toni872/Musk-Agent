// CLI entry point for the MUSK simulation harness.
//
//   npm run sim                    -> interactive REPL (lead writes, agent replies)
//   npm run sim -- --smoke         -> ONE scripted turn, exits 0 without stdin
// There is ONE content profile (src/content.ts): the demo/real split is gone and
// the curated copy is what every surface uses. Wording is still pending MUSK's
// final sign-off, which is why nothing here talks to a real lead.
//
// Standalone by design: no WhatsApp, no real leads, no CRM. The handoff target
// (Laura in the configured profiles) is simulated only; no notification is sent.
// The only optional network dependency is the LLM provider used for 'general'
// FAQ replies; the smoke run and all guarded intents are deterministic.

import { createInterface } from 'node:readline/promises';

import { MuskAgent, type LeadContact, type TurnResult } from './agent';
import { APPROVED_CONTENT, type ApprovedContent, type QualificationQuestion } from './content';
import { loadLLMConfigFromEnv, OpenAICompatibleLLM, type LLMProvider } from './llm';
import { composeTurnOutbound } from './outbound';

const args = process.argv.slice(2);
// Single unified profile: no flag, no alternate sample to drift out of sync.
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

const SMOKE_QUESTION = '¿cuánto cuesta la formación?';

function buildProvider(): LLMProvider | null {
  const config = loadLLMConfigFromEnv();
  return config ? new OpenAICompatibleLLM(config) : null;
}

// A turn can legitimately send nothing: a turn after a stop is suppressed, and a
// received answer whose reaction was empty produces no reply of its own while the
// next question does the talking. Never print an empty line.
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

// The lead-facing line of one turn: ONE message, composed from the reply and the
// qualification question with the same helper the UI uses (src/outbound.ts), so
// both surfaces show exactly the same text. `question` is null on a scripted run
// that asks nothing (--smoke).
function printTurn(result: TurnResult, question: QualificationQuestion | null = null): void {
  const outbound = composeTurnOutbound(result.reply, question);
  console.log(`agent   > ${outbound.text || noMessageNote(result)}`);
  // Disposition first: when the message was RECEIVED as the answer to the
  // pending ask, that is what happened, whatever the classifier says (a course
  // name classifies as 'kb' with no passage used). The classifier label follows
  // as a secondary note. Same order and same wording as ui/chat.ts
  // formatDiagnostic().
  if (result.capturedAnswer) {
    console.log(
      `received = answer to ${result.capturedAnswer.questionId ?? 'opening message'} (no doubt registered)`,
    );
  }
  console.log(
    `intent  = ${result.intent} | action = ${result.action} | suppressed = ${result.suppressed} | registered doubts = ${result.registeredDoubts.length}`,
  );
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
      // Brief qualification (MVP spec §4): one approved question per turn,
      // never an exam. The question is taken before printing and travels INSIDE
      // the turn's single message when there is a reply to join it to (same
      // helper as the UI). Nothing is asked once the lead stops or hands off.
      const ask = agent.nextQualificationQuestion();
      printTurn(result, ask);
      printKbProvenance(agent, recordsBefore);
      printGrounding(agent, recordsBefore);
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
