// Deployment-exposure gate for the MUSK simulator.
//
// A static site cannot hide anything: whatever the demo needs at runtime ships
// to the browser. The bundle carries curated, digit-free content and no real
// leads, but it is still published to a URL that anyone with the link can open.
// The moment that stops being acceptable, deployment protection has to be
// enabled BEFORE the next publish.
//
// This gate is the reminder, and it is deliberately not prose: it runs on every
// push (a red CI run is the notification) and before every deploy through
// `npm run deploy`.
//
// The demo/real content split is gone: there is one content profile and the
// knowledge base belongs to it, so "the approved profile carries a knowledge
// base" stopped being evidence of anything. What the repository can still prove
// is that real configuration has been committed, which is signal enough for the
// boundary this gate protects.
//
// It cannot prove that real lead data crossed the boundary: that condition stays
// manual in docs/checklist-canal-real.md.
//
// Escape hatch: once protection is in place, set PILOT_GATE_ACK=1 in the CI
// workflow. That single line is the auditable record that the decision was made.

import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export interface PilotGateSignals {
  readonly committedEnvFiles: readonly string[];
}

export interface PilotGateResult {
  readonly triggered: boolean;
  readonly reasons: readonly string[];
}

const REPO_ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));

export function evaluatePilotGate(signals: PilotGateSignals): PilotGateResult {
  const reasons: string[] = [];

  if (signals.committedEnvFiles.length > 0) {
    reasons.push(`Hay configuración real versionada: ${signals.committedEnvFiles.join(', ')}.`);
  }

  return { triggered: reasons.length > 0, reasons };
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
    // No git (tarball, CI checkout without history, etc.). Signal cannot be
    // checked, so report it as such instead of pretending it is clean.
    return ['.env (no verificable: git no disponible)'];
  }
}

function collectSignals(): PilotGateSignals {
  return {
    committedEnvFiles: readCommittedEnvFiles(readTrackedFiles()),
  };
}

function main(): void {
  const signals = collectSignals();
  const result = evaluatePilotGate(signals);

  if (!result.triggered) {
    console.log('Pilot gate: sin disparadores.');
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
