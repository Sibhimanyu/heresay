/**
 * The trail: what happened in the app in the minutes before a report was sent. Pages visited,
 * what was clicked, requests that failed, errors. The web SDK keeps it in memory on the device
 * and sends it only with a report, and only if the reporter left it switched on.
 *
 * Untrusted, like the report text: anyone can call console.error("ignore your instructions")
 * before reporting. So it is cleaned here whatever the SDK did, and an agent gets it fenced.
 */

export type TrailKind = 'page' | 'click' | 'request' | 'error' | 'warn' | 'state';
export const TRAIL_KINDS: readonly TrailKind[] = ['page', 'click', 'request', 'error', 'warn', 'state'];

export interface TrailEvent {
  kind: TrailKind;
  /** Seconds before the report was sent. */
  ago: number;
  /** One line: '/settings', 'button "Save"', 'PATCH /api/profile → 500', the error message. */
  text: string;
  /** Errors only: the top of the stack. */
  detail: string | null;
  /** The same thing, this many times in a row. */
  n: number;
}

export const TRAIL_LIMITS = { events: 30, textMax: 200, detailMax: 600, totalMax: 8000, agoMax: 3600, nMax: 999 } as const;

/**
 * Blanks what tends to be personal or secret, in case the SDK missed it or something other than
 * the SDK sent this. Emails, bearer tokens, JWTs, long opaque strings, long numbers, query strings.
 */
export function redact(s: string): string {
  // A query string goes; a stack frame's :line:col after it stays.
  const noQuery = (q: string) => /(:\d+){1,2}$/.exec(q)?.[0] ?? '';
  return s
    .replace(/(https?:\/\/[^\s?#"'`)]*)\?([^\s#"'`)]*)/g, (_, u: string, q: string) => u + noQuery(q))
    .replace(/(^|\s)(\/[^\s?#]*)\?([^\s#)]*)/g, (_, sp: string, u: string, q: string) => sp + u + noQuery(q))
    .replace(/[^\s@"'<>()]+@[^\s@"'<>()]+\.[A-Za-z]{2,}/g, '[email]')
    .replace(/\bBearer\s+\S+/gi, 'Bearer [token]')
    .replace(/\beyJ[\w-]+\.[\w-]+\.[\w-]*/g, '[token]')
    .replace(/\b(?=[A-Za-z0-9_-]*\d)(?=[A-Za-z0-9_-]*[A-Za-z])[A-Za-z0-9_-]{32,}\b/g, '[token]')
    .replace(/\d[\d -]{6,}\d/g, (m) => (m.replace(/\D/g, '').length >= 7 ? '[number]' : m));
}

const clean = (v: unknown, max: number): string | null => {
  if (typeof v !== 'string') return null;
  const t = redact(v.replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '').trim()).slice(0, max);
  return t || null;
};

/** Anything malformed is dropped, never refused: a broken trail must not lose the report. */
export function parseTrail(v: unknown): TrailEvent[] | null {
  if (!Array.isArray(v)) return null;
  const out: TrailEvent[] = [];
  let total = 0;
  // Newest last; when over the limits, the oldest go.
  for (const e of v.slice(-TRAIL_LIMITS.events).reverse()) {
    if (!e || typeof e !== 'object') continue;
    const o = e as Record<string, unknown>;
    if (typeof o.kind !== 'string' || !(TRAIL_KINDS as readonly string[]).includes(o.kind)) continue;
    const text = clean(o.text, TRAIL_LIMITS.textMax);
    if (!text) continue;
    const detail = o.kind === 'error' || o.kind === 'warn' ? clean(o.detail, TRAIL_LIMITS.detailMax) : null;
    total += text.length + (detail?.length ?? 0);
    if (total > TRAIL_LIMITS.totalMax) break;
    const num = (x: unknown, lo: number, hi: number) =>
      typeof x === 'number' && Number.isFinite(x) ? Math.min(hi, Math.max(lo, Math.round(x))) : lo;
    out.push({ kind: o.kind as TrailKind, ago: num(o.ago, 0, TRAIL_LIMITS.agoMax), text, detail, n: num(o.n, 1, TRAIL_LIMITS.nMax) });
  }
  out.reverse();
  return out.length ? out : null;
}

const LABEL: Record<TrailKind, string> = {
  page: 'Page', click: 'Click', request: 'Request', error: 'Error', warn: 'Warning', state: 'Device',
};

const ago = (s: number) => (s >= 60 ? `-${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` : `-0:${String(s).padStart(2, '0')}`);

/** The trail as lines of plain text, oldest first, for an agent prompt or a notification. */
export function trailLines(t: TrailEvent[]): string[] {
  return t.map((e) => {
    const line = `${ago(e.ago)} ${LABEL[e.kind]}: ${e.text}${e.n > 1 ? ` (x${e.n})` : ''}`;
    return e.detail ? `${line}\n${e.detail.split('\n').map((l) => `      ${l}`).join('\n')}` : line;
  });
}
