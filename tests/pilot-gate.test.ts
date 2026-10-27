import { describe, expect, it } from 'vitest';

import {
  evaluatePilotGate,
  readCommittedEnvFiles,
  type PilotGateSignals,
} from '../scripts/pilot-gate';

// The gate is the reminder that a published bundle is public. It has to fail
// loudly when a signal fires and stay quiet otherwise, so these tests pin the
// decision of each signal instead of the wording of the banner.
//
// The demo/real split is gone: there is one content profile and the knowledge
// base belongs to it, so those two signals were removed with the split. What
// remains provable from the repository is committed real configuration.
const CLEAR: PilotGateSignals = {
  committedEnvFiles: [],
};

describe('pilot gate', () => {
  it('stays silent when the repository carries no real configuration', () => {
    const result = evaluatePilotGate(CLEAR);
    expect(result.triggered).toBe(false);
    expect(result.reasons).toEqual([]);
  });

  it('fires when real configuration has been committed', () => {
    const result = evaluatePilotGate({ ...CLEAR, committedEnvFiles: ['.env'] });
    expect(result.triggered).toBe(true);
    expect(result.reasons.join(' ')).toContain('.env');
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
