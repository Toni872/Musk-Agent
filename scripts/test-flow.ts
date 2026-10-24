import { MuskAgent } from '../src/agent';
import { DEMO_CONTENT } from '../src/content.demo';

async function main() {
  const lead = { id: 'local-test', contact: '+34600000000', bucket: 'ilocalizable' as const };
  const agent = new MuskAgent({ content: DEMO_CONTENT, provider: null, lead });

  const msgs = [
    'Hola, me gustaría información sobre las formaciones',
    'Busco un cambio profesional, ¿qué formación me iría mejor?',
    'Me gustaría hablar con alguien para que me aclare dudas',
  ];

  for (const m of msgs) {
    const r = await agent.runTurn(m);
    console.log('\n==============================');
    console.log('LEAD:', m);
    console.log('AGENT:', r.reply);
    console.log('META:', {
      intent: r.intent,
      action: r.action,
      suppressed: r.suppressed,
      registeredDoubts: r.registeredDoubts.length,
    });
  }

  console.log('\n==============================');
  console.log('ESTADO FINAL:', {
    stopped: agent.isStopped,
    handoffFired: agent.records.some((x) => x.kind === 'handoff'),
    doubtsTotal: agent.doubts,
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
