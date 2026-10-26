/**
 * Acting on notifications from Telegram (ADR 0016). Telegram calls the webhook; a tap only counts
 * if the Telegram user was linked, with a one-time code, to someone who is still on the team.
 * Accept and decline go through the same `triage` the dashboard uses, so nothing is duplicated:
 * a report still reaches an agent only through a person's accept, and declining still needs a reason.
 * Everything here is plain text (no parse_mode): reporter text is untrusted.
 */
import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import type { Deps, Req, Res } from './handler.js';
import { baseUrl } from './oauth.js';
import { LIMITS, type Member, type NotificationSettings, type Project, type Report } from './types.js';

type Telegram = NotificationSettings['telegram'];

/** Calls the Telegram Bot API. Never throws, and nothing it returns carries the token. */
export type TelegramApi = (token: string, method: string, body: Record<string, unknown>) => Promise<{ ok: boolean; result?: unknown }>;
/** handler.ts's triage, handed in so this file does not import the handler. */
export type TriageFn = (project: Project, report_id: string, action: string, uid: string, req: Req, deps: Deps) => Promise<Res>;

export function telegramApi(http: typeof fetch = fetch): TelegramApi {
  return async (token, method, body) => {
    try {
      const response = await http(`https://api.telegram.org/bot${token}/${method}`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
        signal: AbortSignal.timeout(5000), redirect: 'error',
      });
      const result = await response.json().catch(() => ({})) as { ok?: boolean; result?: unknown };
      return { ok: response.ok && result.ok === true, result: result.result };
    } catch { return { ok: false }; }  // the error may carry the token URL
  };
}

const LINK_TTL_MS = 10 * 60_000;
const DECLINE_TTL_MS = 10 * 60_000;
const TEXT_MAX = 4096;
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';  // no 0/O, 1/I
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const json = (status: number, body: unknown): Res => ({ status, body, headers: { 'cache-control': 'no-store' } });

// ---- the keyboard on a "new report" notification -------------------------------------------

/** a = accept, d = decline, t = full text; then the project and report ids. Null if it would pass 64 bytes. */
export function reportKeyboard(project_id: string, report_id: string) {
  const data = (a: string) => `${a}|${project_id}|${report_id}`;
  if (Buffer.byteLength(data('a')) > 64) return null;
  return { inline_keyboard: [[
    { text: 'Accept', callback_data: data('a') },
    { text: 'Decline', callback_data: data('d') },
    { text: 'Show full text', callback_data: data('t') },
  ]] };
}

// ---- keeping Telegram's webhook in step with the saved bot ----------------------------------

/** The secret in the webhook URL. A second value, derived from it, goes in Telegram's header. */
export const headerSecret = (secret: string) => createHash('sha256').update('heresay-telegram-header:' + secret).digest('base64url');

export const actionsConnected = (tg: Telegram | undefined) => !!(tg?.enabled && tg.token && tg.webhook_secret && tg.webhook_url);

/**
 * After notification settings are saved: point the bot's webhook at us, or take it away. Skipped
 * silently when the public address isn't https (the emulator). Never fails the save and never logs
 * the token or the secret.
 */
export async function syncWebhook(before: Telegram | undefined, req: Req, deps: Deps): Promise<void> {
  try {
    const api = deps.telegramApi;
    const tg = (await deps.store.getInstance())?.notifications?.telegram;
    if (!api || !tg) return;
    const old = before?.token ?? null;
    const want = tg.enabled && !!tg.token;
    const setUrl = (url: string | null) => deps.store.updateInstance((cur) => {
      const n = structuredClone(cur!.notifications!); n.telegram.webhook_url = url;
      return { ...cur!, notifications: n };
    });
    if (old && (!want || old !== tg.token)) {
      const r = await api(old, 'deleteWebhook', {});
      deps.log('api.telegram_webhook', { action: 'delete', ok: r.ok });
    }
    if (!want) { if (tg.webhook_url) await setUrl(null); return; }
    const base = baseUrl(req, deps);
    if (!base.startsWith('https://')) return;
    let secret = tg.webhook_secret;
    if (!secret) {
      secret = randomBytes(24).toString('base64url');
      const fresh = secret;
      const inst = await deps.store.updateInstance((cur) => {
        const n = structuredClone(cur!.notifications!);
        n.telegram.webhook_secret = n.telegram.webhook_secret ?? fresh;  // once per instance
        return { ...cur!, notifications: n };
      });
      secret = inst.notifications!.telegram.webhook_secret!;
    }
    const url = `${base}/v1/telegram/webhook/${secret}`;
    if (tg.webhook_url === url && old === tg.token) return;
    const r = await api(tg.token!, 'setWebhook', {
      url, secret_token: headerSecret(secret), allowed_updates: ['message', 'callback_query'],
    });
    deps.log('api.telegram_webhook', { action: 'set', ok: r.ok });
    if (r.ok) await setUrl(url);
  } catch {
    deps.log('api.telegram_webhook', { action: 'sync', ok: false });
  }
}

// ---- linking: dashboard side ----------------------------------------------------------------

const normEmail = (e: string) => e.trim().toLowerCase();
const normCode = (c: string) => c.toUpperCase().replace(/[^A-Z0-9]/g, '');
const codeId = (c: string) => sha('heresay-telegram-link:' + normCode(c));

async function minute(deps: Deps, bucket: string, limit: number): Promise<boolean> {
  const start = Math.floor(deps.now() / 60_000) * 60_000;
  return deps.store.hit(`${bucket}:${start}`, limit, start + 60_000);
}

/** Member-level (any signed-in member): link status, a one-time code, and unlink. */
export async function linkRoutes(p: string[], me: Member, req: Req, deps: Deps): Promise<Res> {
  const tg = (await deps.store.getInstance())?.notifications?.telegram;
  const mine = (l: Telegram['links']) => Object.values(l ?? {}).some((e) => normEmail(e) === normEmail(me.email));
  if (p[1] === 'link' && p.length === 2 && req.method === 'GET') {
    return json(200, { connected: actionsConnected(tg), linked: mine(tg?.links) });
  }
  if (p[1] === 'link-code' && p.length === 2 && req.method === 'POST') {
    if (!actionsConnected(tg)) {
      return json(409, { error: 'Telegram isn’t connected for actions yet. An owner connects a bot under Notifications, on this Heresay’s public https address.' });
    }
    const start = Math.floor(deps.now() / 600_000) * 600_000;
    if (!await deps.store.hit(`tg-link-code:${normEmail(me.email)}:${start}`, 5, start + 600_000)) {
      return json(429, { error: 'Wait a few minutes before making another code.' });
    }
    for (const old of await deps.store.listAuth('link')) {
      if (old.data.email === normEmail(me.email)) await deps.store.deleteAuth('link', old.id);
    }
    let code = '';
    for (let i = 0; i < 8; i++) code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
    const expires = new Date(deps.now() + LINK_TTL_MS).toISOString();
    await deps.store.putAuth({ kind: 'link', id: codeId(code), data: { email: normEmail(me.email) }, expires_at: expires });
    let bot_username: string | null = null;
    const bot = await deps.telegramApi?.(tg!.token!, 'getMe', {});
    const name = (bot?.result as { username?: unknown } | undefined)?.username;
    if (bot?.ok && typeof name === 'string') bot_username = name;
    return json(200, { code, expires_at: expires, bot_username });
  }
  if (p[1] === 'link' && p.length === 2 && req.method === 'DELETE') {
    await deps.store.updateInstance((cur) => {
      const n = cur!.notifications;
      if (!n?.telegram.links) return cur!;
      const next = structuredClone(n);
      for (const [id, e] of Object.entries(next.telegram.links!)) if (normEmail(e) === normEmail(me.email)) delete next.telegram.links![id];
      return { ...cur!, notifications: next };
    });
    for (const old of await deps.store.listAuth('link')) {
      if (old.data.email === normEmail(me.email)) await deps.store.deleteAuth('link', old.id);
    }
    return json(200, { ok: true });
  }
  return json(404, { error: 'not found' });
}

// ---- the webhook ----------------------------------------------------------------------------

interface TgUser { id: number; is_bot?: boolean }
interface TgChat { id: number | string; type?: string; username?: string }
interface TgMessage { message_id: number; chat: TgChat; from?: TgUser; text?: string; reply_to_message?: { message_id: number } }
interface TgCallback { id: string; from: TgUser; message?: TgMessage; data?: string }
interface TgUpdate { message?: TgMessage; callback_query?: TgCallback }

const same = (a: string, b: string) => {
  const x = createHash('sha256').update(a).digest(), y = createHash('sha256').update(b).digest();
  return timingSafeEqual(x, y);
};
const label = (s: string) => ({ accepted: 'accepted', declined: 'declined', fixed: 'fixed', withdrawn: 'withdrawn', open: 'open' } as Record<string, string>)[s] ?? s;

/** Telegram counts UTF-16 units; never leave half a character at the cut. */
export function capText(s: string, max = TEXT_MAX): string {
  if (s.length <= max) return s;
  let cut = s.slice(0, max - 1);
  if (/[\ud800-\udbff]$/.test(cut)) cut = cut.slice(0, -1);
  return cut + '…';
}

export async function telegramWebhook(secret: string, req: Req, deps: Deps, triage: TriageFn): Promise<Res> {
  const notFound = (): Res => ({ status: 404, body: null });
  // Before anything else, so a flood of guesses is cheap. Telegram's own servers are few; generous.
  if (!await minute(deps, `tg-hook-ip:${sha(req.ip)}`, 1200)) return { status: 429, body: null };
  const instance = await deps.store.getInstance();
  const tg = instance?.notifications?.telegram;
  if (!tg?.enabled || !tg.token || !tg.webhook_secret) return notFound();
  // Both, always evaluated, in constant time.
  const pathOk = same(secret, tg.webhook_secret);
  const headerOk = same(req.headers['x-telegram-bot-api-secret-token'] ?? '', headerSecret(tg.webhook_secret));
  if (!(pathOk && headerOk)) return notFound();
  try {
    const body = req.body instanceof Uint8Array ? JSON.parse(Buffer.from(req.body).toString('utf8')) : req.body;
    if (body && typeof body === 'object') await handleUpdate(body as TgUpdate, instance!.members, tg, deps, triage);
  } catch {
    deps.log('api.telegram_update', { ok: false });  // never the error: it may carry the token URL
  }
  return { status: 200, body: { ok: true } };  // Telegram retries anything else
}

const isConfiguredChat = (chat: TgChat, tg: Telegram) =>
  String(chat.id) === tg.chat_id || (!!chat.username && tg.chat_id.toLowerCase() === '@' + chat.username.toLowerCase());

async function handleUpdate(u: TgUpdate, members: Member[], tg: Telegram, deps: Deps, triage: TriageFn) {
  const token = tg.token!;
  const api = deps.telegramApi;
  if (!api) return;
  const msg = u.callback_query?.message ?? u.message;
  const from = u.callback_query?.from ?? u.message?.from;
  if (!msg?.chat || !from || from.is_bot) return;
  if (!await minute(deps, `tg-hook-chat:${msg.chat.id}`, 60)) return;
  const say = (text: string, extra: Record<string, unknown> = {}) =>
    api(token, 'sendMessage', { chat_id: msg.chat.id, text: capText(text), link_preview_options: { is_disabled: true }, ...extra });

  // A person tapping a button.
  if (u.callback_query) {
    const cb = u.callback_query;
    if (!cb.message || !isConfiguredChat(cb.message.chat, tg)) return;  // somewhere we never posted
    const answer = (text?: string, alert = false) =>
      api(token, 'answerCallbackQuery', { callback_query_id: cb.id, ...(text ? { text: text.slice(0, 200), show_alert: alert } : {}) });
    const m = /^([adt])\|([\w-]{1,40})\|([\w-]{1,40})$/.exec(cb.data ?? '');
    if (!m) { await answer(); return; }
    const email = actor(members, tg, from.id);
    if (!email) { await answer('Link your Telegram first: Heresay dashboard > Notifications', true); return; }
    const project = await deps.store.getProject(m[2]);
    const report = project ? await deps.store.getReport(project.id, m[3]) : null;
    if (!project || !report) { await answer('That report no longer exists.', true); return; }
    // A decided report: say so, tidy the message, change nothing.
    async function alreadyOrFail(res: Res, pr: Project, id: string, ans: typeof answer, message: TgMessage) {
      const status = (res.body as { status?: string } | null)?.status;
      if (res.status === 409 && status) {
        const r = await deps.store.getReport(pr.id, id);
        const verdict = r ? decided(r) : null;
        await ans(verdict ?? `Already ${label(status)}.`, true);
        if (verdict && (status === 'accepted' || status === 'declined')) await finish(api!, token, message, verdict.replace(/^Already /, '').replace(/^./, (c) => c.toUpperCase()));
        return;
      }
      await ans(res.status === 409 ? 'This report was merged into another. Decide it in the dashboard.' : 'That didn’t work. Try the dashboard.', true);
    }

    if (m[1] === 't') {
      await answer();
      await say(`${report.type} · ${project.name}\n\n${report.text}`, { reply_parameters: { message_id: cb.message.message_id } });
      return;
    }
    if (m[1] === 'a') {
      const res = await triage(project, report.id, 'accept', email, fakeReq(), deps);
      if (res.status === 200) {
        await answer('Accepted');
        await finish(api, token, cb.message, `Accepted by ${email}`);
        return;
      }
      await alreadyOrFail(res, project, report.id, answer, cb.message);
      return;
    }
    // Decline: ask for the reason first; the reporter reads it.
    if (report.status !== 'open') { await alreadyOrFail({ status: 409, body: { status: report.status } }, project, report.id, answer, cb.message); return; }
    await answer('Reply to the next message with your reason.');
    const prompt = await say('Reply with why you’re declining this (the reporter will read it)', {
      reply_parameters: { message_id: cb.message.message_id },
      reply_markup: { force_reply: true, selective: true, input_field_placeholder: 'Why?' },
    });
    const pid = (prompt.result as { message_id?: unknown } | undefined)?.message_id;
    if (prompt.ok && typeof pid === 'number') {
      await deps.store.putAuth({
        kind: 'decline', id: `${cb.message.chat.id}:${pid}`, expires_at: new Date(deps.now() + DECLINE_TTL_MS).toISOString(),
        data: { user: from.id, project: project.id, report: report.id, message_id: cb.message.message_id, text: cb.message.text ?? '' },
      });
    }
    return;
  }

  // A message: a link code, or the reason for a decline.
  const text = msg.text?.trim() ?? '';
  const cmd = /^\/(?:start|link)(?:@\w+)?(?:\s+(.+))?$/i.exec(text);
  if (cmd) {
    const inPrivate = msg.chat.type === 'private';
    if (!inPrivate && !isConfiguredChat(msg.chat, tg)) return;
    if (!cmd[1]) {
      if (inPrivate) await say('To link your Telegram: in the Heresay dashboard open Notifications, tap “Link my Telegram”, then send me /start and the code.');
      return;
    }
    const start = Math.floor(deps.now() / 3600_000) * 3600_000;
    if (!await deps.store.hit(`tg-link-try:${from.id}:${start}`, 10, start + 3600_000)) { await say('Too many tries. Wait an hour, then make a new code.'); return; }
    const rec = await deps.store.takeAuth('link', codeId(cmd[1]));  // one use, however many try at once
    const email = rec && rec.expires_at && Date.parse(rec.expires_at) > deps.now() ? String(rec.data.email) : null;
    const member = email ? members.find((x) => normEmail(x.email) === email) : null;
    if (!email || !member) { await say('That code didn’t work, or it expired. Make a new one in the Heresay dashboard under Notifications.'); return; }
    await deps.store.updateInstance((cur) => {
      const n = structuredClone(cur!.notifications!);
      n.telegram.links = { ...(n.telegram.links ?? {}), [String(from.id)]: member.email };
      return { ...cur!, notifications: n };
    });
    deps.log('api.telegram_linked', { ok: true });
    await say(`Linked as ${member.email}`);
    return;
  }

  const replyTo = msg.reply_to_message?.message_id;
  if (replyTo === undefined || !isConfiguredChat(msg.chat, tg)) return;
  const key = `${msg.chat.id}:${replyTo}`;
  const pending = await deps.store.getAuth('decline', key);
  if (!pending || pending.data.user !== from.id) return;  // someone else's prompt, or not ours
  const reply = (t: string) => say(t, { reply_parameters: { message_id: msg.message_id } });
  if (!pending.expires_at || Date.parse(pending.expires_at) <= deps.now()) {
    await deps.store.deleteAuth('decline', key);
    await reply('That took too long. Tap Decline on the report again.');
    return;
  }
  const email = actor(members, tg, from.id);
  if (!email) { await reply('Link your Telegram first: Heresay dashboard > Notifications'); return; }
  if (!text) { await reply('Send the reason as text.'); return; }
  if (text.length > LIMITS.reasonMax) { await reply(`That reason is ${text.length} characters; the limit is ${LIMITS.reasonMax}. Send a shorter one.`); return; }
  const project = await deps.store.getProject(String(pending.data.project));
  if (!project) { await deps.store.deleteAuth('decline', key); return; }
  const res = await triage(project, String(pending.data.report), 'decline', email, fakeReq({ reason: text }), deps);
  const original = { message_id: Number(pending.data.message_id), chat: msg.chat, text: String(pending.data.text ?? '') };
  if (res.status === 200) {
    await deps.store.deleteAuth('decline', key);
    await finish(api, token, original, `Declined by ${email}: ${text}`);
    await reply('Declined. The reporter will see your reason.');
    return;
  }
  if (res.status === 400) { await reply('A reason is needed to decline. Send it as a reply.'); return; }  // stays pending
  await deps.store.deleteAuth('decline', key);
  const status = (res.body as { status?: string } | null)?.status;
  const r = await deps.store.getReport(project.id, String(pending.data.report));
  await reply(r && status ? (decided(r) ?? `Already ${label(status)}.`) : 'This report was merged into another. Decide it in the dashboard.');
}

/** Telegram user id -> the member they're linked to, only while that person is still on the team. */
function actor(members: Member[], tg: Telegram, telegramId: number): string | null {
  const linked = tg.links?.[String(telegramId)];
  return linked ? members.find((m) => normEmail(m.email) === normEmail(linked))?.email ?? null : null;
}

/** "Already accepted by x" for a report somebody decided, else null. */
function decided(r: Report): string | null {
  if (r.status === 'open') return null;
  const by = r.triaged_by ? ` by ${r.triaged_by}` : '';
  return `Already ${label(r.status)}${by}${r.status === 'declined' && r.decline_reason ? `: ${r.decline_reason}` : ''}`;
}

const fakeReq = (body: unknown = {}): Req => ({ method: 'POST', path: '', query: {}, headers: {}, ip: '', body });

/** Append the outcome to the notification and take the buttons away. */
async function finish(api: TelegramApi, token: string, message: { message_id: number; chat: TgChat; text?: string }, line: string) {
  await api(token, 'editMessageText', {
    chat_id: message.chat.id, message_id: message.message_id,
    text: capText(`${(message.text ?? '').replace(/\n\n(Accepted|Declined) by [\s\S]*$/, '')}\n\n${line}`.trim()),
    link_preview_options: { is_disabled: true }, reply_markup: { inline_keyboard: [] },
  });
}
