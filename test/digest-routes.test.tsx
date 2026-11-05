import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import type { DigestRow, Night } from '../src/digest/types.js';

// Routes under test: GET /digest/:night (HTML) and GET /api/digest/:night (JSON).
// All fixtures live in a temp dir; runs/ is never written.
const line = (o: Record<string, unknown>) => JSON.stringify(o);

const MIXED = [
  line({ at: '2026-11-01T01:00:00+01:00', job: 'zeta/last', status: 'ok', owner: 'tal' }),
  line({ at: '2026-11-01T01:05:00+01:00', job: 'alpha/first', status: 'ok', owner: 'ana' }),
  line({ at: '2026-11-01T01:10:00+01:00', job: 'mid/retried', status: 'retry', owner: 'bo', error: 'upstream 503' }),
  line({ at: '2026-11-01T01:15:00+01:00', job: 'mid/retried', status: 'retry', owner: 'bo', error: 'upstream 503' }),
  line({ at: '2026-11-01T01:20:00+01:00', job: 'mid/retried', status: 'retry', owner: 'bo', error: 'upstream 503' }),
  line({ at: '2026-11-01T01:25:00+01:00', job: 'mid/retried', status: 'ok', owner: 'bo' }),
  line({ at: '2026-11-01T01:30:00+01:00', job: 'mid/failed', status: 'fail', owner: 'cy', error: 'quota exceeded' }),
  line({ at: '2026-11-01T01:35:00+01:00', job: 'noowner/job', status: 'ok' }),
].join('\n');

const BAD = [
  line({ at: '2026-11-02T01:00:00+01:00', job: 'b/job', status: 'ok', owner: 'ana' }),
  'not json',
  line({ at: '2026-11-02T01:05:00+01:00', job: 'a/job', status: 'ok', owner: 'bo' }),
  '[]',
].join('\n');

let dir: string;
let app: ReturnType<typeof createApp>;

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'rig-digest-routes-'));
  writeFileSync(join(dir, '2026-11-01.jsonl'), `${MIXED}\n`);
  writeFileSync(join(dir, '2026-11-02.jsonl'), `${BAD}\n`);
  writeFileSync(join(dir, '2026-11-03.jsonl'), '');
  app = createApp({ adapter: 'shim', installed: '2026-10-29T14:06:00+01:00', beatEverySeconds: 60, runsDir: dir });
});

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

const rowsOf = (html: string) => [...html.matchAll(/<tr\b[^>]*>[\s\S]*?<\/tr>/g)].map((m) => m[0]);
const openTag = (tr: string) => /^<tr\b[^>]*>/.exec(tr)?.[0] ?? '';
// Data rows of the page (the header row has <th>, data rows do not).
const dataRows = (html: string) => rowsOf(html).filter((tr) => !tr.includes('<th'));
const jobsInPage = (html: string, jobs: string[]) => dataRows(html).map((tr) => jobs.find((j) => tr.includes(j)));
const getJson = async (night: string) => {
  const res = await app.request(`/api/digest/${night}`);
  return { res, body: (await res.json()) as Night };
};

describe('GET /api/digest/:night', () => {
  it('200 with night, rows sorted by job and badLines', async () => {
    const { res, body } = await getJson('2026-11-01');
    expect(res.status).toBe(200);
    expect(Object.keys(body).sort()).toEqual(['badLines', 'night', 'rows']);
    expect(body.night).toBe('2026-11-01');
    expect(body.badLines).toBe(0);
    expect(body.rows.map((r) => r.job)).toEqual(['alpha/first', 'mid/failed', 'mid/retried', 'noowner/job', 'zeta/last']);
    expect(body.rows.find((r) => r.job === 'mid/retried')).toEqual({
      job: 'mid/retried',
      owner: 'bo',
      runs: 4,
      retries: 3,
      lastStatus: 'ok',
      lastError: 'upstream 503',
      firstAt: '2026-11-01T01:10:00+01:00',
      lastAt: '2026-11-01T01:25:00+01:00',
    } satisfies DigestRow);
    expect(body.rows.find((r) => r.job === 'noowner/job')?.owner).toBeNull();
  });

  it('404 with {error:"not found"} for a night with no file', async () => {
    const res = await app.request('/api/digest/1999-01-01');
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'not found' });
  });

  it('empty night: 200 with no rows and no bad lines', async () => {
    const { res, body } = await getJson('2026-11-03');
    expect(res.status).toBe(200);
    expect(body).toEqual({ night: '2026-11-03', rows: [], badLines: 0 });
  });

  it('night with bad lines: counts them and keeps the good rows', async () => {
    const { res, body } = await getJson('2026-11-02');
    expect(res.status).toBe(200);
    expect(body.badLines).toBe(2);
    expect(body.rows.map((r) => r.job)).toEqual(['a/job', 'b/job']);
  });
});

describe('GET /digest/:night', () => {
  it('200 HTML with one table, rows sorted by job, null owner as —', async () => {
    const res = await app.request('/digest/2026-11-01');
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/html');
    expect(html.match(/<table\b/g)).toHaveLength(1);
    const jobs = ['alpha/first', 'mid/failed', 'mid/retried', 'noowner/job', 'zeta/last'];
    expect(jobsInPage(html, jobs)).toEqual(jobs);
    expect(dataRows(html).find((tr) => tr.includes('noowner/job'))).toContain('—');
    expect(dataRows(html).find((tr) => tr.includes('alpha/first'))).not.toContain('—');
  });

  it('marks rows with retries >= 3 or lastStatus fail, and only those', async () => {
    const html = await (await app.request('/digest/2026-11-01')).text();
    const tr = (job: string) => dataRows(html).find((r) => r.includes(job)) ?? '';
    // The marker's exact form is up to the view: it must make the row's <tr> tag differ
    // from an unmarked row's (class or attribute).
    const plain = openTag(tr('alpha/first'));
    expect(openTag(tr('zeta/last'))).toBe(plain);
    expect(openTag(tr('noowner/job'))).toBe(plain);
    expect(openTag(tr('mid/retried'))).not.toBe(plain); // retries = 3, last status ok
    expect(openTag(tr('mid/failed'))).not.toBe(plain); // retries = 0, last status fail
  });

  it('404 for a night with no file', async () => {
    const res = await app.request('/digest/1999-01-01');
    expect(res.status).toBe(404);
  });

  it('empty night: 200 and says "nothing ran"', async () => {
    const res = await app.request('/digest/2026-11-03');
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('nothing ran');
    expect(dataRows(html)).toHaveLength(0);
  });

  it('night with a bad line: 200 and the good rows still render', async () => {
    const res = await app.request('/digest/2026-11-02');
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('a/job');
    expect(html).toContain('b/job');
    expect(html).not.toContain('nothing ran');
  });
});

describe('page and JSON agree', () => {
  it('lists jobs in the same order', async () => {
    for (const night of ['2026-11-01', '2026-11-02']) {
      const { body } = await getJson(night);
      const jobs = body.rows.map((r) => r.job);
      const html = await (await app.request(`/digest/${night}`)).text();
      expect(jobsInPage(html, jobs)).toEqual(jobs);
    }
  });
});
