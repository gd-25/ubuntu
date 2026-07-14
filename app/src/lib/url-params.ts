/**
 * Parses query-string and fragment parameters from a URL.
 * Handles magic-link redirects where tokens arrive in the fragment
 * (e.g. ubuntu://#access_token=...&refresh_token=...).
 */
export function parseUrlParams(url: string): Record<string, string> {
  const out: Record<string, string> = {};
  const queryStart = url.indexOf('?');
  const hashStart = url.indexOf('#');

  const collect = (raw: string) => {
    for (const pair of raw.split('&')) {
      const eq = pair.indexOf('=');
      if (eq <= 0) continue;
      out[decodeURIComponent(pair.slice(0, eq))] = decodeURIComponent(pair.slice(eq + 1));
    }
  };

  if (queryStart >= 0) {
    const end = hashStart > queryStart ? hashStart : url.length;
    collect(url.slice(queryStart + 1, end));
  }
  if (hashStart >= 0) collect(url.slice(hashStart + 1));
  return out;
}
