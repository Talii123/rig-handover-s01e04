export type JobStatus = 'ok' | 'retry' | 'fail';

// One row per job in a night's run log. Times keep the offset from the log (styleguide).
// Missing data is null here; views render it as "—".
export type DigestRow = {
  job: string;
  owner: string | null;
  runs: number; // lines for this job
  retries: number; // lines with status "retry"
  lastStatus: JobStatus;
  lastError: string | null; // error of the latest line that has one
  firstAt: string;
  lastAt: string;
};

export type Night = {
  night: string; // YYYY-MM-DD
  rows: DigestRow[]; // sorted by job
  badLines: number; // lines that did not parse, counted never thrown
};

// Reads runs/<night>.jsonl. Returns null when the file does not exist (route -> 404).
// An empty file returns { rows: [], badLines: 0 }.
export type ReadNight = (runsDir: string, night: string) => Night | null;
export declare function readNight(runsDir: string, night: string): Night | null;
