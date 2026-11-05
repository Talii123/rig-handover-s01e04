import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DigestRow, JobStatus, Night, ReadNight } from './types.js';

type Line = { at: string; job: string; status: JobStatus; owner: string | null; error: string | null };

const STATUSES: readonly string[] = ['ok', 'retry', 'fail'];

// Parse at the edge: anything that is not a valid line returns null and is counted.
function parseLine(raw: string): Line | null {
  let v: unknown;
  try {
    v = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof v !== 'object' || v === null) return null;
  const o = v as Record<string, unknown>;
  if (typeof o.at !== 'string' || typeof o.job !== 'string') return null;
  if (typeof o.status !== 'string' || !STATUSES.includes(o.status)) return null;
  return {
    at: o.at,
    job: o.job,
    status: o.status as JobStatus,
    owner: typeof o.owner === 'string' ? o.owner : null,
    error: typeof o.error === 'string' ? o.error : null,
  };
}

export const readNight: ReadNight = (runsDir, night) => {
  const path = join(runsDir, `${night}.jsonl`);
  if (!existsSync(path)) return null;

  const rows = new Map<string, DigestRow>();
  let badLines = 0;
  for (const raw of readFileSync(path, 'utf8').split('\n')) {
    if (raw.trim() === '') continue;
    const line = parseLine(raw);
    if (!line) {
      badLines++;
      continue;
    }
    const row = rows.get(line.job);
    if (!row) {
      rows.set(line.job, {
        job: line.job,
        owner: line.owner,
        runs: 1,
        retries: line.status === 'retry' ? 1 : 0,
        lastStatus: line.status,
        lastError: line.error,
        firstAt: line.at,
        lastAt: line.at,
      });
      continue;
    }
    row.runs++;
    if (line.status === 'retry') row.retries++;
    row.lastStatus = line.status;
    row.lastAt = line.at;
    if (line.error !== null) row.lastError = line.error;
    if (line.owner !== null) row.owner = line.owner;
  }
  const sorted = [...rows.values()].sort((a, b) => (a.job < b.job ? -1 : a.job > b.job ? 1 : 0));
  return { night, rows: sorted, badLines } satisfies Night;
};
