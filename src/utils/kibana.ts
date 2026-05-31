// Kibana deep-link builders.
//
// Kibana keeps Discover / Dev Tools app state in the URL hash as Rison
// (https://github.com/Nanonid/rison), not JSON. We only need the *encode*
// direction, for the small set of JS value types that appear in a bool query
// plus the filter envelope, so a tiny self-contained encoder is enough — no
// dependency.

type Json = unknown;

// A Rison "id" can be written bare (unquoted). We're conservative: anything
// that isn't a plain identifier gets quoted, which is always valid Rison.
const SAFE_ID = /^[A-Za-z][A-Za-z0-9_]*$/;

function risonString(s: string): string {
  if (SAFE_ID.test(s)) return s;
  // Quoted string: ! and ' are the only escapes ( ! -> !!, ' -> !' ).
  return `'${s.replace(/!/g, '!!').replace(/'/g, "!'")}'`;
}

export function risonEncode(value: Json): string {
  if (value === null || value === undefined) return '!n';
  if (value === true) return '!t';
  if (value === false) return '!f';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '!n';
  if (typeof value === 'string') return risonString(value);
  if (Array.isArray(value)) return `!(${value.map(risonEncode).join(',')})`;
  if (typeof value === 'object') {
    const obj = value as Record<string, Json>;
    const parts = Object.keys(obj)
      .filter((k) => obj[k] !== undefined)
      .map((k) => `${risonString(k)}:${risonEncode(obj[k])}`);
    return `(${parts.join(',')})`;
  }
  return '!n';
}

/**
 * Discover deep-link that selects a data view and applies an arbitrary
 * Elasticsearch bool query, carried as a "custom" DSL filter in the app state
 * (`_a`). A custom filter is the only way to push raw query DSL into Discover
 * via the URL — the main search bar only speaks KQL/Lucene.
 *
 * A data view UUID is required: Discover needs to know which data view the
 * filter applies to. The time window defaults to a very wide range so the
 * query — not an accidental time filter — decides what shows up; the user can
 * narrow it with the Discover time picker.
 */
export function buildDiscoverUrl(
  kibanaUrl: string,
  dataViewId: string,
  query: Record<string, unknown>,
): string {
  const filter = {
    meta: {
      index: dataViewId,
      type: 'custom',
      disabled: false,
      negate: false,
      alias: 'ElastiX query',
      key: 'query',
      value: JSON.stringify(query),
    },
    query,
    $state: { store: 'appState' },
  };
  const appState = { filters: [filter], index: dataViewId };
  const globalState = { time: { from: 'now-15y', to: 'now' } };
  const _a = encodeURIComponent(risonEncode(appState));
  const _g = encodeURIComponent(risonEncode(globalState));
  return `${kibanaUrl}/app/discover#/?_g=${_g}&_a=${_a}`;
}

/**
 * Dev Tools / Console deep-link — the fallback when no data view UUID is
 * configured (Discover can't apply the query without one). Pre-loads a
 * `GET <index>/_search` with the query into the console.
 */
export function buildDevToolsUrl(
  kibanaUrl: string,
  indexPattern: string,
  query: Record<string, unknown>,
): string {
  const consoleCmd = `GET ${indexPattern}/_search\n${JSON.stringify({ query }, null, 2)}`;
  return `${kibanaUrl}/app/dev_tools#/console?load_from=data:text/plain,${encodeURIComponent(consoleCmd)}`;
}
