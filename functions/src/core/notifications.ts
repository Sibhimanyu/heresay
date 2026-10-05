import type { Deps, Req, Res } from './handler.js';
import type { NotificationEvent, NotificationSettings, Project } from './types.js';

export const NOTIFICATION_EVENTS: NotificationEvent[] = ['new_report', 'accepted', 'fixed', 'handoff'];
export type Destination = NotificationSettings['telegram'] | NotificationSettings['cliq'];
export type NotificationSender = (provider: 'telegram' | 'cliq', destination: Destination, text: string) => Promise<void>;
export interface TelegramChat { id: string; title: string; kind: 'private' | 'group' | 'supergroup' | 'channel' }
/** Who a bot token belongs to, and the chats that have messaged it lately, so nobody hunts for an ID. */
export type TelegramLookup = (token: string) => Promise<{ bot: { username: string; name: string }; chats: TelegramChat[] }>;
export class TelegramLookupError extends Error {}

export const defaultNotifications = (): NotificationSettings => ({
  events: { new_report: true, accepted: false, fixed: true, handoff: true },
  telegram: { enabled: false, token: null, chat_id: '' },
  cliq: { enabled: false, token: null, endpoint: '' },
});

/** Credentials never leave the server, including in save responses. */
export function notificationView(settings: NotificationSettings) {
  return {
    events: settings.events,
    telegram: { enabled: settings.telegram.enabled, configured: !!settings.telegram.token, chat_id: settings.telegram.chat_id },
    cliq: { enabled: settings.cliq.enabled, configured: !!settings.cliq.token, endpoint: settings.cliq.endpoint },
  };
}

class SettingsError extends Error {}
const TELEGRAM_TOKEN = /^\d+:[A-Za-z0-9_-]{20,}$/;

const object = (v: unknown): Record<string, unknown> => {
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw new SettingsError('Invalid notification settings.');
  return v as Record<string, unknown>;
};
const field = (v: unknown, max: number) => {
  if (typeof v !== 'string' || v.length > max) throw new SettingsError('Invalid notification field.');
  return v.trim();
};
const boolean = (v: unknown) => {
  if (typeof v !== 'boolean') throw new SettingsError('Notification switches must be true or false.');
  return v;
};

/** Only Zoho's message endpoints; redirects and arbitrary webhook hosts are not allowed. */
const CLIQ_HOSTS = new Set([
  'cliq.zoho.com', 'cliq.zoho.in', 'cliq.zoho.eu', 'cliq.zoho.com.au',
  'cliq.zoho.jp', 'cliq.zohocloud.ca', 'cliq.zoho.com.cn', 'cliq.zoho.sa',
  'cliq.zoho.uk', 'cliq.zoho.ae', 'cliq.zoho.sg',
]);
export function validCliqEndpoint(endpoint: string): boolean {
  try {
    const u = new URL(endpoint);
    return u.protocol === 'https:' && !u.username && !u.password && !u.port && !u.search && !u.hash
      && CLIQ_HOSTS.has(u.hostname)
      && /^\/api\/v2\/(bots|channelsbyname)\/[A-Za-z0-9_-]+\/message$/.test(u.pathname);
  } catch { return false; }
}

/** Patch inside updateInstance: blank/omitted tokens retain the saved secret; null removes it. */
export function patchNotifications(current: NotificationSettings, body: Record<string, unknown>): NotificationSettings {
  const next = structuredClone(current);
  if (body.events !== undefined) {
    const events = object(body.events);
    for (const event of NOTIFICATION_EVENTS) if (events[event] !== undefined) next.events[event] = boolean(events[event]);
  }
  for (const provider of ['telegram', 'cliq'] as const) {
    if (body[provider] === undefined) continue;
    const patch = object(body[provider]);
    const target = next[provider];
    if (patch.enabled !== undefined) target.enabled = boolean(patch.enabled);
    if (patch.token === null) target.token = null;
    else if (patch.token !== undefined) {
      const token = field(patch.token, 512);
      if (token) {
        if (provider === 'telegram' ? !TELEGRAM_TOKEN.test(token) : !/^[A-Za-z0-9._-]+$/.test(token)) {
          throw new SettingsError(`Invalid ${provider === 'telegram' ? 'Telegram bot' : 'Cliq webhook'} token.`);
        }
        target.token = token;
      }
    }
    if (provider === 'telegram' && patch.chat_id !== undefined) next.telegram.chat_id = field(patch.chat_id, 100);
    if (provider === 'cliq' && patch.endpoint !== undefined) next.cliq.endpoint = field(patch.endpoint, 300);
  }
  if (next.telegram.chat_id && !/^(?:-?\d+|@[A-Za-z][A-Za-z0-9_]{4,})$/.test(next.telegram.chat_id)) {
    throw new SettingsError('Enter a Telegram chat ID or @channel username.');
  }
  if (next.cliq.endpoint && !validCliqEndpoint(next.cliq.endpoint)) {
    throw new SettingsError('Use a Zoho Cliq bot or channel message endpoint, without a query string.');
  }
  if (next.telegram.enabled && (!next.telegram.token || !next.telegram.chat_id)) {
    throw new SettingsError('Telegram needs a bot token and a chat ID.');
  }
  if (next.cliq.enabled && (!next.cliq.token || !next.cliq.endpoint)) {
    throw new SettingsError('Cliq needs a webhook token and a message endpoint.');
  }
  return next;
}

export async function notificationSettings(p: string[], req: Req, deps: Deps, body: Record<string, unknown>): Promise<Res> {
  const json = (status: number, body: unknown): Res => ({ status, body, headers: { 'cache-control': 'no-store' } });
  if (p.length === 1 && req.method === 'GET') {
    const settings = (await deps.store.getInstance())!.notifications ?? defaultNotifications();
    return json(200, { notifications: notificationView(settings) });
  }
  if (p.length === 1 && req.method === 'PATCH') {
    try {
      const instance = await deps.store.updateInstance((cur) => ({
        ...cur!, notifications: patchNotifications(cur!.notifications ?? defaultNotifications(), body),
      }));
      return json(200, { notifications: notificationView(instance.notifications!) });
    } catch (error) {
      // Validation messages are ours; never expose backend exceptions or credentials.
      if (error instanceof SettingsError) {
        return json(400, { error: error.message });
      }
      throw error;
    }
  }
  if (p.length === 3 && p[1] === 'telegram' && p[2] === 'lookup' && req.method === 'POST') {
    // A pasted token, or the saved one. The token goes only to Telegram and never comes back.
    const pasted = typeof body.token === 'string' ? body.token.trim() : '';
    const token = pasted || ((await deps.store.getInstance())!.notifications ?? defaultNotifications()).telegram.token;
    if (!token) return json(400, { error: 'Paste the bot token from BotFather first.' });
    if (!TELEGRAM_TOKEN.test(token)) return json(400, { error: 'That doesn’t look like a bot token. BotFather sends one like 123456789:AAH…' });
    const now = deps.now(), start = Math.floor(now / 60_000) * 60_000;
    if (!await deps.store.hit(`notification-lookup:telegram:${start}`, 30, start + 60_000)) {
      return json(429, { error: 'Wait a minute before looking again.' });
    }
    if (!deps.telegramLookup) return json(503, { error: 'Telegram lookup is unavailable.' });
    try {
      return json(200, await deps.telegramLookup(token));
    } catch (error) {
      return json(502, { error: error instanceof TelegramLookupError ? error.message : 'Could not reach Telegram. Try again in a moment.' });
    }
  }
  if (p.length === 2 && p[1] === 'test' && req.method === 'POST') {
    const provider = body.provider;
    if (provider !== 'telegram' && provider !== 'cliq') return json(400, { error: 'Choose Telegram or Cliq.' });
    const settings = (await deps.store.getInstance())!.notifications ?? defaultNotifications();
    const target = settings[provider];
    if (!target.enabled) return json(400, { error: 'Save and enable this destination first.' });
    const now = deps.now(), start = Math.floor(now / 60_000) * 60_000;
    if (!await deps.store.hit(`notification-test:${provider}:${start}`, 3, start + 60_000)) {
      return json(429, { error: 'Wait a minute before sending another test.' });
    }
    if (!deps.sendNotification) return json(503, { error: 'Notification delivery is unavailable.' });
    try {
      await deps.sendNotification(provider, target, 'Heresay notifications are connected. You will receive the events selected in Notifications.');
      return json(200, { ok: true });
    } catch {
      return json(502, { error: 'Test could not be delivered. Check the token, destination, and bot permissions, then try again.' });
    }
  }
  return json(404, { error: 'not found' });
}

/** Metadata only: open reports and reporter details must never flow into an integration. */
export async function notify(event: NotificationEvent, project: Project, reportId: string, deps: Deps): Promise<void> {
  try {
    const settings = (await deps.store.getInstance())?.notifications;
    if (!settings?.events[event] || !deps.sendNotification) return;
    const labels: Record<NotificationEvent, string> = {
      new_report: 'A new report needs your review', accepted: 'A report was accepted for a coding agent',
      fixed: 'A report was marked fixed', handoff: 'A coding agent handed off a report',
    };
    const origin = deps.selfOrigins?.[0];
    const text = `Heresay: ${labels[event]}.\nApp: ${project.name}\nReport: ${reportId}`
      + (origin ? `\n${origin}/app/#/apps/${encodeURIComponent(project.id)}` : '');
    await Promise.all((['telegram', 'cliq'] as const).map(async (provider) => {
      if (!settings[provider].enabled) return;
      try {
        await deps.sendNotification!(provider, settings[provider], text);
        deps.log('api.notification_sent', { provider, notification_event: event, project_id: project.id, report_id: reportId });
      } catch {
        // Transport errors may contain credential-bearing URLs. Never log those errors.
        deps.log('api.notification_failed', { provider, notification_event: event, project_id: project.id, report_id: reportId });
      }
    }));
  } catch {
    // A notification outage must not turn a saved report/status change into a failed request.
    deps.log('api.notification_failed', { notification_event: event, project_id: project.id, report_id: reportId });
  }
}

/** Shared HTTP transport; a backend adapter supplies this to the portable core. */
export function notificationSender(http: typeof fetch = fetch): NotificationSender {
  return async (provider, destination, text) => {
    let url: string, body: Record<string, unknown>;
    if (!destination.token) throw new Error('Notification token missing.');
    if (provider === 'telegram' && 'chat_id' in destination) {
      url = `https://api.telegram.org/bot${destination.token}/sendMessage`;
      body = { chat_id: destination.chat_id, text, link_preview_options: { is_disabled: true } };
    } else if (provider === 'cliq' && 'endpoint' in destination && validCliqEndpoint(destination.endpoint)) {
      const u = new URL(destination.endpoint);
      u.searchParams.set('zapikey', destination.token);
      url = u.href;
      body = { text };
    } else { throw new Error('Invalid notification destination.'); }
    // Await within the request so serverless runtimes cannot stop before delivery. Bounded,
    // with no retries: report creation and triage are never rolled back by a provider outage.
    const response = await http(url, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
      signal: AbortSignal.timeout(5000), redirect: 'error',
    });
    if (!response.ok) throw new Error('Notification provider rejected the message.');
    if (provider === 'telegram') {
      const result = await response.json() as { ok?: boolean };
      if (result.ok !== true) throw new Error('Telegram rejected the message.');
    }
  };
}

/**
 * Telegram has no "list my chats". A bot sees the chats that wrote to it (or added it) in the
 * last day, through getUpdates; that is enough to offer the right one. Read-only: no offset is
 * confirmed, so nothing is consumed.
 */
export function telegramLookup(http: typeof fetch = fetch): TelegramLookup {
  const call = async (token: string, method: string, body?: unknown) => {
    const response = await http(`https://api.telegram.org/bot${token}/${method}`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body ?? {}),
      signal: AbortSignal.timeout(5000), redirect: 'error',
    });
    const result = await response.json().catch(() => ({})) as { ok?: boolean; result?: unknown; error_code?: number };
    return { status: response.status, ...result };
  };
  return async (token) => {
    const me = await call(token, 'getMe');
    if (me.status === 401 || me.status === 404) throw new TelegramLookupError('Telegram doesn’t recognise this token. Copy it again from BotFather.');
    if (!me.ok) throw new TelegramLookupError('Telegram didn’t answer. Try again in a moment.');
    const bot = me.result as { username?: string; first_name?: string };
    const updates = await call(token, 'getUpdates', { limit: 100, timeout: 0, allowed_updates: ['message', 'channel_post', 'my_chat_member'] });
    if (updates.status === 409) {
      throw new TelegramLookupError('This bot already sends its messages to another service (a webhook), so Heresay can’t see its chats. Enter the chat ID yourself, or use a new bot.');
    }
    if (!updates.ok) throw new TelegramLookupError('Telegram didn’t answer. Try again in a moment.');
    const seen = new Map<string, TelegramChat>();
    for (const u of (updates.result as Record<string, { chat?: Record<string, unknown> }>[]) ?? []) {
      const chat = (u.message ?? u.channel_post ?? u.my_chat_member)?.chat;
      if (!chat || (typeof chat.id !== 'number' && typeof chat.id !== 'string')) continue;
      const kind = String(chat.type) as TelegramChat['kind'];
      if (!['private', 'group', 'supergroup', 'channel'].includes(kind)) continue;
      const title = kind === 'private'
        ? [chat.first_name, chat.last_name].filter((x) => typeof x === 'string').join(' ') || (typeof chat.username === 'string' ? '@' + chat.username : 'You')
        : typeof chat.title === 'string' ? chat.title : 'Untitled';
      seen.set(String(chat.id), { id: String(chat.id), title: title.slice(0, 120), kind });
    }
    return {
      bot: { username: typeof bot?.username === 'string' ? bot.username : '', name: typeof bot?.first_name === 'string' ? bot.first_name.slice(0, 120) : '' },
      chats: [...seen.values()].reverse(),  // the latest first
    };
  };
}
