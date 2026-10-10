// CLI entry point for the MUSK simulation harness.
//
//   npm run sim              -> interactive REPL (lead writes, agent replies)
//   npm run sim -- --smoke   -> ONE scripted turn, exits 0 without stdin
//
// Standalone by design: no WhatsApp, no real leads, no CRM. The only optional
// network dependency is the LLM provider used for 'general' FAQ replies; the
// smoke run and all guarded intents are deterministic.

import { createInterface } from 'node:readline/promises';

import { MuskAgent, type LeadContact, type TurnResult } from './agent';
import { APPROVED_CONTENT } from './content';
import { loadLLMConfigFromEnv, OpenAICompatibleLLM, type LLMProvider } from './llm';

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

function printTurn(result: TurnResult): void {
  console.log(`agent   > ${result.reply || '(no message sent: conversation stopped)'}`);
  console.log(
    `intent  = ${result.intent} | action = ${result.action} | suppressed = ${result.suppressed} | registered doubts = ${result.registeredDoubts.length}`,
  );
  if (result.handoff) {
    console.log(
      `handoff = reason=${result.handoff.reason} lead=${result.handoff.leadId} contact=${result.handoff.contact} bucket=${result.handoff.bucket}`,
    );
  }
  if (result.ruleViolations.length > 0) {
    console.log(`guard   = violations: ${result.ruleViolations.join(', ')}`);
  }
}

async function runSmoke(): Promise<void> {
  console.log('MUSK smoke run (scripted, non-interactive)');
  const agent = new MuskAgent({ content: APPROVED_CONTENT, provider: buildProvider(), lead: SMOKE_LEAD });
  const result = await agent.runTurn(SMOKE_QUESTION);
  console.log(`lead    > ${SMOKE_QUESTION}`);
  printTurn(result);
  console.log('smoke: OK');
}

async function runRepl(): Promise<void> {
  console.log('MUSK simulation harness — standalone: no real channel, no real leads, no CRM.');
  const provider = buildProvider();
  console.log(
    provider
      ? 'LLM provider: OpenAI-compatible (configured via MUSK_LLM_* environment variables).'
      : 'LLM provider: none — deterministic approved replies only. Set MUSK_LLM_BASE_URL and MUSK_LLM_API_KEY to enable.',
  );
  console.log('Commands: /reset (new conversation), /state (records), /exit');
  console.log('Write a message as the lead to start.');

  const lead: LeadContact = { id: 'sim-lead', contact: '+3460000000', bucket: 'ilocalizable' };
  let agent = new MuskAgent({ content: APPROVED_CONTENT, provider, lead });
  const rl = createInterface({ input: process.stdin, output: process.stdout });

  try {
    for (;;) {
      const line = (await rl.question('\nyou (lead) > ')).trim();
      if (!line) continue;
      if (line === '/exit' || line === '/salir') break;
      if (line === '/reset') {
        agent = new MuskAgent({ content: APPROVED_CONTENT, provider, lead });
        console.log('conversation reset');
        continue;
      }
      if (line === '/state') {
        console.log(`stopped=${agent.isStopped} records=${agent.records.length}`);
        for (const record of agent.records) {
          console.log(`  [${record.kind}] (${record.intent}) ${record.detail}`);
        }
        continue;
      }
      const result = await agent.runTurn(line);
      printTurn(result);
    }
  } finally {
    rl.close();
  }
}

const args = process.argv.slice(2);
if (args.includes('--smoke')) {
  await runSmoke();
} else {
  await runRepl();
}
