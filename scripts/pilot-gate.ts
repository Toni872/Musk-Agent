// Deployment-exposure gate for the MUSK simulator.
//
// A static site cannot hide anything: whatever the demo needs at runtime ships
// to the browser. That is acceptable TODAY because the bundle only carries
// demo-only material (no prices, no real leads) and the link is shared by hand.
// The moment the public artifact stops being a demo, deployment protection has
// to be enabled BEFORE the next publish.
//
// This gate is the reminder, and it is deliberately not prose: it runs on every
// push (a red CI run is the notification) and before every deploy through
// `npm run deploy`.
//
// It watches the three things it can prove from the repository:
//   1. the approved profile carries a knowledge base -> signed content ships;
//   2. the browser demo opens with the approved profile instead of the demo one;
//   3. a .env file has been committed -> real configuration in the repo.
//
// It cannot prove that real lead data crossed the boundary: that condition stays
// manual in docs/checklist-canal-real.md.
//
// Escape hatch: once protection is in place, set PILOT_GATE_ACK=1 in the CI
// workflow. That single line is the auditable record that the decision was made.

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { APPROVED_CONTENT } from '../src/content';

export type PublicProfile = 'demo' | 'real' | 'unknown';

export interface PilotGateSignals {
  readonly approvedKb: boolean;
  readonly publicProfile: PublicProfile;
  readonly committedEnvFiles: readonly string[];
}

export interface PilotGateResult {
  readonly triggered: boolean;
  readonly reasons: readonly string[];
}

const REPO_ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));

export function evaluatePilotGate(signals: PilotGateSignals): PilotGateResult {
  const reasons: string[] = [];

  if (signals.approvedKb) {
    reasons.push(
      'El perfil aprobado ya lleva base de conocimiento: el bundle público serviría contenido firmado, no material de demo.',
    );
  }

  if (signals.publicProfile === 'real') {
    reasons.push("El demo público arranca con el perfil aprobado ('real') en vez del perfil de demo.");
  } else if (signals.publicProfile === 'unknown') {
    reasons.push(
      'No se ha podido determinar con qué perfil arranca el demo público (se esperaba createChat({ profile: ... }) en ui/main.ts). Trátalo como expuesto.',
    );
  }

  if (signals.committedEnvFiles.length > 0) {
    reasons.push(`Hay configuración real versionada: ${signals.committedEnvFiles.join(', ')}.`);
  }

  return { triggered: reasons.length > 0, reasons };
}

// Fail closed: an unparseable entry point is reported as 'unknown', never as
// 'demo'. A gate that silently passes when it cannot see is not a gate.
export function readPublicProfile(mainSource: string): PublicProfile {
  const match = /createChat\(\s*\{\s*profile:\s*'(demo|real)'/.exec(mainSource);
  const profile = match?.[1];
  return profile === 'demo' || profile === 'real' ? profile : 'unknown';
}

export function readCommittedEnvFiles(trackedFiles: readonly string[]): string[] {
  return trackedFiles.filter(
    (file) => /(^|\/)\.env(\.[^/]*)?$/.test(file) && !file.endsWith('.env.example'),
  );
}

function readTrackedFiles(): string[] {
  try {
    const output = execFileSync('git', ['ls-files'], { cwd: REPO_ROOT, encoding: 'utf8' });
    return output.split(/\r?\n/).filter((line) => line.length > 0);
  } catch {
    // No git (tarball, CI checkout without history, etc.). Signal 3 cannot be
    // checked, so report it as such instead of pretending it is clean.
    return ['.env (no verificable: git no disponible)'];
  }
}

function collectSignals(): PilotGateSignals {
  return {
    approvedKb: APPROVED_CONTENT.kb !== undefined,
    publicProfile: readPublicProfile(
      readFileSync(resolve(REPO_ROOT, 'ui', 'main.ts'), 'utf8'),
    ),
    committedEnvFiles: readCommittedEnvFiles(readTrackedFiles()),
  };
}

function main(): void {
  const signals = collectSignals();
  const result = evaluatePilotGate(signals);

  if (!result.triggered) {
    console.log('Pilot gate: sin disparadores. El bundle público sigue siendo material de demo.');
    console.log('  - perfil aprobado sin base de conocimiento');
    console.log('  - demo público en el perfil de demo');
    console.log('  - sin configuración real versionada');
    return;
  }

  const acknowledged = process.env.PILOT_GATE_ACK === '1';

  console.log('');
  console.log('==============================================================');
  console.log(' DISPARADOR DE PROTECCIÓN DEL DESPLIEGUE');
  console.log('==============================================================');
  for (const reason of result.reasons) console.log(` * ${reason}`);
  console.log('');
  console.log(' Qué hacer ANTES de publicar:');
  console.log('   1. Activar protección de despliegue en Vercel (contraseña o SSO).');
  console.log('   2. Verificar que el alias público ya no sirve el bundle sin credenciales.');
  console.log('   3. Registrar la decisión (fecha, quién, qué protección) en');
  console.log('      docs/checklist-canal-real.md y poner PILOT_GATE_ACK=1 en');
  console.log('      .github/workflows/ci.yml.');
  console.log('');

  if (acknowledged) {
    console.log(' PILOT_GATE_ACK=1: protección declarada, se continúa. Si no está activa,');
    console.log(' el bundle público está expuesto.');
    console.log('');
    return;
  }

  console.log(' Bloqueado: sin PILOT_GATE_ACK=1 el gate falla a propósito.');
  console.log('');
  process.exitCode = 1;
}

const isMain =
  process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  main();
}
