import type { Night } from '../digest/types.js';

const dash = '—';
// A job whose last run logged no error has nothing missing: say so instead of showing a dash.
const noError = 'none';

export function Digest({ data }: { data: Night }) {
  return (
    <>
      <h1>digest {data.night}</h1>
      {data.badLines > 0 && <p class="warn">{data.badLines} bad line(s) skipped</p>}
      {data.rows.length === 0 ? (
        <p class="mute">nothing ran</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>job</th>
              <th>owner</th>
              <th>runs</th>
              <th>retries</th>
              <th>last status</th>
              <th>last error</th>
              <th>first</th>
              <th>last</th>
            </tr>
          </thead>
          <tbody>
            {data.rows.map((r) => {
              const marked = r.retries >= 3 || r.lastStatus === 'fail';
              return (
                <tr class={marked ? 'warn' : undefined}>
                  <td>{marked ? `! ${r.job}` : r.job}</td>
                  <td>{r.owner ?? dash}</td>
                  <td>{r.runs}</td>
                  <td>{r.retries}</td>
                  <td>{r.lastStatus}</td>
                  <td>{r.lastError ?? noError}</td>
                  <td>{r.firstAt}</td>
                  <td>{r.lastAt}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </>
  );
}
