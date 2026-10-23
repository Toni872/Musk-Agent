import { describe, expect, it } from 'vitest';

import {
  evaluatePilotGate,
  readCommittedEnvFiles,
  readPublicProfile,
  type PilotGateSignals,
} from '../scripts/pilot-gate';

// The gate is the reminder that the public bundle stops being a demo. It has to
// fail loudly when a signal fires and stay quiet otherwise, so these tests pin
// the decision of each signal instead of the wording of the banner.
const CLEAR: PilotGateSignals = {
  approvedKb: false,
  publicProfile: 'demo',
  committedEnvFiles: [],
};

describe('pilot gate', () => {
  it('stays silent while the public artifact is still a demo', () => {
    const result = evaluatePilotGate(CLEAR);
    expect(result.triggered).toBe(false);
    expect(result.reasons).toEqual([]);
  });

  it('fires when the approved profile carries a knowledge base', () => {
    const result = evaluatePilotGate({ ...CLEAR, approvedKb: true });
    expect(result.triggered).toBe(true);
    expect(result.reasons.join(' ')).toContain('base de conocimiento');
  });

  it('fires when the public demo opens with the approved profile', () => {
    const result = evaluatePilotGate({ ...CLEAR, publicProfile: 'real' });
    expect(result.triggered).toBe(true);
    expect(result.reasons.join(' ')).toContain("'real'");
  });

  it('fails closed when the public profile cannot be determined', () => {
    const result = evaluatePilotGate({ ...CLEAR, publicProfile: 'unknown' });
    expect(result.triggered).toBe(true);
    expect(result.reasons.join(' ')).toContain('se ha podido determinar');
  });

  it('fires when real configuration has been committed', () => {
    const result = evaluatePilotGate({ ...CLEAR, committedEnvFiles: ['.env'] });
    expect(result.triggered).toBe(true);
    expect(result.reasons.join(' ')).toContain('.env');
  });

  describe('readPublicProfile', () => {
    it('reads the profile from the entry point', () => {
      expect(readPublicProfile("const chat = createChat({ profile: 'demo' });")).toBe('demo');
      expect(readPublicProfile("const chat = createChat({ profile: 'real' });")).toBe('real');
    });

    it('reports unknown instead of guessing', () => {
      expect(readPublicProfile("const chat = createChat({ profile: selectedProfile });")).toBe(
        'unknown',
      );
      expect(readPublicProfile('')).toBe('unknown');
    });
  });

  describe('readCommittedEnvFiles', () => {
    it('catches a committed env file, at any depth', () => {
      expect(readCommittedEnvFiles(['.env', 'ui/.env.local', 'src/.env.production'])).toEqual([
        '.env',
        'ui/.env.local',
        'src/.env.production',
      ]);
    });

    it('ignores the template and names that merely contain the word', () => {
      expect(
        readCommittedEnvFiles([
          '.env.example',
          'docs/environment.md',
          'src/env.ts',
          'ui/environment.ts',
        ]),
      ).toEqual([]);
    });
  });
});
