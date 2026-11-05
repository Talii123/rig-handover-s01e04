import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readNight } from '../src/digest/reader.js';

describe('readNight', () => {
  it('reads runs/2026-10-28.jsonl: 5 jobs, 1 bad line', () => {
    const n = readNight('runs', '2026-10-28');
    expect(n?.rows.map((r) => r.job)).toEqual([
      'digest/render',
      'fixtures/refresh',
      'lane/sync',
      'notes/backup',
      'rig/rotate-logs',
    ]);
    expect(n?.badLines).toBe(1);
    const fx = n?.rows.find((r) => r.job === 'fixtures/refresh');
    expect(fx).toMatchObject({ runs: 4, retries: 3, lastStatus: 'ok', lastError: 'upstream 503' });
    expect(fx?.firstAt).toBe('2026-10-29T01:30:00+01:00');
    expect(n?.rows.find((r) => r.job === 'digest/render')?.owner).toBeNull();
    expect(n?.rows.find((r) => r.job === 'notes/backup')).toMatchObject({ lastStatus: 'fail', lastError: 'quota exceeded' });
  });

  it('returns null for a night with no file', () => {
    expect(readNight('runs', '1999-01-01')).toBeNull();
  });

  it('counts bad lines and renders an empty file as no rows', () => {
    const dir = mkdtempSync(join(tmpdir(), 'rig-'));
    writeFileSync(join(dir, '2030-01-01.jsonl'), '');
    expect(readNight(dir, '2030-01-01')).toEqual({ night: '2030-01-01', rows: [], badLines: 0 });
    writeFileSync(join(dir, '2030-01-02.jsonl'), 'not json\n{"at":"x"}\n[]\n');
    expect(readNight(dir, '2030-01-02')?.badLines).toBe(3);
  });
});
