import { readdirSync } from 'node:fs';
import type { RigConfig } from './config.js';
import { readNight } from './digest/reader.js';
import { lastBeat, type Beat } from './heartbeat.js';

export type Status = {
  adapter: string;
  installed: string;
  lastBeat: Beat | null;
  nights: NightSummary[]; // counts are null when the night can't be read
};

export type NightSummary =
  | { night: string; ok: number; retry: number; fail: number }
  | { night: string; ok: null; retry: null; fail: null };

// Nights on disk = runs/<YYYY-MM-DD>.jsonl, newest first.
export function nightsOnDisk(runsDir: string): string[] {
  try {
    return readdirSync(runsDir)
      .filter((f) => /^\d{4}-\d{2}-\d{2}\.jsonl$/.test(f))
      .map((f) => f.slice(0, 10))
      .sort()
      .reverse();
  } catch {
    return [];
  }
}

function summarize(runsDir: string, night: string): NightSummary {
  const n = readNight(runsDir, night);
  if (!n) return { night, ok: null, retry: null, fail: null };
  // Rows are per job: ok = jobs whose lastStatus is ok, retry = total retries, fail = jobs whose lastStatus is fail.
  return {
    night,
    ok: n.rows.filter((r) => r.lastStatus === 'ok').length,
    retry: n.rows.reduce((t, r) => t + r.retries, 0),
    fail: n.rows.filter((r) => r.lastStatus === 'fail').length,
  };
}

export function readStatus(config: RigConfig): Status {
  return {
    adapter: config.adapter,
    installed: config.installed,
    lastBeat: lastBeat(),
    nights: nightsOnDisk(config.runsDir).map((n) => summarize(config.runsDir, n)),
  };
}
