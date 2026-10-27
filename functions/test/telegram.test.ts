import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handle, type Deps, type Req } from '../src/core/handler.js';
import { MemoryStore } from '../src/core/store.js';
import { headerSecret, telegramApi, type TelegramApi } from '../src/core/telegram.js';
import type { Project, Report } from '../src/core/types.js';

const TOKEN = '123456:abcdefghijklmnopqrstuvwxyz_123456';
const CHAT = -1001234567890;
const HOST = { host: 'heresay.example' };
const owner = { authorization: 'Bearer owner', ...HOST };
const memberH = { authorization: 'Bearer member', ...HOST };
const GROUP = { id: CHAT, type: 'supergroup' };

function setup() {
  const store = new MemoryStore();
  store.instance = { created_at: 'x', members: [
    { email: 'owner@example.com', role: 'owner', added_at: 'x', added_by: null },
    { email: 'member@example.com', role: 'member', added_at: 'x', added_by: null },
  ] };
  const calls: { token: string; method: string; body: Record<string, any> }[] = [];
  const logs: unknown[] = [];
  const responses: unknown[] = [];
  let now = 1_700_000_000_000, nextMessage = 900;
  const api: TelegramApi = async (token, method, body) => {
    calls.push({ token, method, body });
    if (method === 'sendMessage') return { ok: true, result: { message_id: nextMessage++ } };
    if (method === 'getMe') return { ok: true, result: { username: 'heresay_bot', first_name: 'Heresay' } };
    return { ok: true, result: true };
  };
  const sent: { text: string; extra?: any }[] = [];
  const deps: Deps = {
    store, now: () => now, version: 'test', selfOrigins: ['https://heresay.example'], telegramApi: api,
    verifyIdToken: async (t) => ['owner', 'member', 'outsider'].includes(t) ? { uid: t, email: `${t}@example.com`, emailVerified: true } : null,
    log: (event, fields) => logs.push({ event, ...fields }),
    sendNotification: async (provider, _d, text, extra) => { if (provider === 'telegram') sent.push({ text, extra }); },
  };
  const call = async (r: Partial<Req>) => {
    const res = await handle({ method: 'GET', path: '/v1/notifications', headers: owner, body: undefined, query: {}, ip: '127.0.0.1', ...r }, deps);
    responses.push(res);
    return res;
  };
  const connect = () => call({ method: 'PATCH', body: { telegram: { enabled: true, token: TOKEN, chat_id: String(CHAT) } } });
  const tg = () => store.instance!.notifications!.telegram;
  const hook = (update: unknown, over: Partial<Req> = {}) => call({
    method: 'POST', path: `/v1/telegram/webhook/${tg().webhook_secret}`, ip: '149.154.167.1',
    headers: { 'x-telegram-bot-api-secret-token': headerSecret(tg().webhook_secret!) }, body: update, ...over,
  });
  const after = (from: number) => calls.slice(from);
  return { store, deps, calls, logs, responses, call, connect, tg, hook, sent, after, advance: (ms: number) => { now += ms; } };
}

async function world() {
  const s = setup();
  await s.connect();
  const created = await s.call({ method: 'POST', path: '/v1/projects', body: { name: 'Acme Notes' } });
  const project = (created.body as { project: Project }).project;
  const submit = async (text = 'The save button does nothing') => {
    const res = await s.call({ method: 'POST', path: '/v1/reports', headers: { origin: 'https://app.example' }, body: {
      key: project.key, device_id: 'device_1234567890123456', type: 'broken', text } });
    return (res.body as { report: Report }).report;
  };
  /** Gets a member linked through the real flow, as Telegram user `uid`. */
  const link = async (uid: number, who: 'member' | 'owner' = 'member') => {
    const made = await s.call({ method: 'POST', path: '/v1/telegram/link-code', headers: who === 'member' ? memberH : owner });
    const { code } = made.body as { code: string };
    await s.hook({ message: { message_id: 1, chat: GROUP, from: { id: uid }, text: `/start ${code}` } });
    return code;
  };
  const tap = (uid: number, data: string, chat: unknown = GROUP, message_id = 55, text = 'Heresay: A new report needs your review.\nApp: Acme Notes') =>
    s.hook({ callback_query: { id: `cb${message_id}${uid}`, from: { id: uid }, data, message: { message_id, chat, text } } });
  const data = (a: string, r: Report) => `${a}|${project.id}|${r.id}`;
  return { ...s, project, submit, link, tap, data };
}
const names = (calls: { method: string }[]) => calls.map((c) => c.method);

test('saving a bot registers our webhook once with a secret, and keeps every secret out of responses and logs', async () => {
  const s = setup();
  const res = await s.connect();
  assert.equal(res.status, 200);
  const set = s.calls.find((c) => c.method === 'setWebhook')!;
  assert.equal(set.token, TOKEN);
  assert.deepEqual(set.body.allowed_updates, ['message', 'callback_query']);
  assert.equal(set.body.url, `https://heresay.example/v1/telegram/webhook/${s.tg().webhook_secret}`);
  assert.equal(set.body.secret_token, headerSecret(s.tg().webhook_secret!));
  assert.notEqual(set.body.secret_token, s.tg().webhook_secret, 'the header value is not the path value');
  const secret = s.tg().webhook_secret!;
  await s.call({ method: 'PATCH', body: { events: { fixed: false } } });
  assert.equal(s.calls.filter((c) => c.method === 'setWebhook').length, 1, 'unrelated saves do not re-register');
  await s.call({ method: 'PATCH', body: { telegram: { chat_id: '@another_chat' } } });
  assert.equal(s.tg().webhook_secret, secret, 'one secret per instance');
  const all = JSON.stringify([s.responses, s.logs]);
  assert.ok(!all.includes(TOKEN) && !all.includes(secret) && !all.includes(headerSecret(secret)));
  // Turning Telegram off, or clearing the token, removes the webhook.
  await s.call({ method: 'PATCH', body: { telegram: { enabled: false } } });
  assert.equal(s.calls.at(-1)!.method, 'deleteWebhook');
  assert.equal(s.tg().webhook_url, null);
});

test('a bot saved before buttons existed gets its webhook on the next save, even with nothing changed', async () => {
  const s = setup();
  await s.connect();
  await s.deps.store.updateInstance((cur) => {
    const n = structuredClone(cur!.notifications!); n.telegram.webhook_url = null;
    return { ...cur!, notifications: n };
  });
  const before = s.calls.filter((c) => c.method === 'setWebhook').length;
  const res = await s.call({ method: 'PATCH', body: { telegram: { enabled: true, token: '', chat_id: s.tg().chat_id } } });
  assert.equal(res.status, 200);
  assert.equal(s.calls.filter((c) => c.method === 'setWebhook').length, before + 1);
  assert.ok(s.tg().webhook_url, 'recorded, so the next save leaves it alone');
});

test('no webhook is registered on an address that is not https, and a failure never fails the save', async () => {
  const s = setup();
  s.deps.selfOrigins = ['http://127.0.0.1:5055'];
  const res = await s.call({ method: 'PATCH', headers: { ...owner, host: '127.0.0.1:5055' }, body: { telegram: { enabled: true, token: TOKEN, chat_id: '1' } } });
  assert.equal(res.status, 200);
  assert.ok(!s.calls.some((c) => c.method === 'setWebhook'));
  const t = setup();
  t.deps.telegramApi = async () => { throw new Error(`boom ${TOKEN}`); };
  const bad = await t.call({ method: 'PATCH', body: { telegram: { enabled: true, token: TOKEN, chat_id: '1' } } });
  assert.equal(bad.status, 200);
  assert.ok(!JSON.stringify(t.logs).includes(TOKEN));
});

test('the webhook answers 404, with nothing said, to a wrong or missing secret or header', async () => {
  const w = await world();
  const upd = { message: { message_id: 1, chat: GROUP, from: { id: 5 }, text: 'hi' } };
  const good = headerSecret(w.tg().webhook_secret!);
  for (const [path, header] of [
    ['/v1/telegram/webhook/wrong', good], [`/v1/telegram/webhook/${w.tg().webhook_secret}`, 'wrong'],
    [`/v1/telegram/webhook/${w.tg().webhook_secret}`, undefined], ['/v1/telegram/webhook/wrong', undefined],
    [`/v1/telegram/webhook/${w.tg().webhook_secret}`, w.tg().webhook_secret],  // the path value is not the header value
  ] as const) {
    const res = await w.hook(upd, { path, headers: header === undefined ? {} : { 'x-telegram-bot-api-secret-token': header } });
    assert.equal(res.status, 404);
    assert.equal(res.body, null);
  }
  assert.equal((await w.hook(upd)).status, 200);
  // Telegram off: the endpoint disappears.
  await w.call({ method: 'PATCH', body: { telegram: { enabled: false } } });
  assert.equal((await w.hook(upd)).status, 404);
});

test('the webhook is rate limited per network and per chat; errors are swallowed with a 200', async () => {
  const w = await world();
  const before = w.calls.length;
  for (let i = 0; i < 70; i++) await w.hook({ callback_query: { id: 'x', from: { id: 5 }, data: 'a|x|y', message: { message_id: 1, chat: GROUP } } });
  assert.equal(w.after(before).filter((c) => c.method === 'answerCallbackQuery').length, 60, 'the 61st update from a chat is dropped');
  const res = await w.hook({ callback_query: 'garbage' });
  assert.equal(res.status, 200);
  let last = 200;
  for (let i = 0; i < 1210; i++) last = (await w.hook({}, { ip: '10.0.0.1' })).status;
  assert.equal(last, 429);
});

test('link codes: member-level, single use, expire, wrong codes fail, and the code is not stored in the clear', async () => {
  const w = await world();
  assert.equal((await w.call({ method: 'POST', path: '/v1/telegram/link-code', headers: { authorization: 'Bearer outsider', ...HOST } })).status, 403);
  const made = await w.call({ method: 'POST', path: '/v1/telegram/link-code', headers: memberH });
  const body = made.body as { code: string; expires_at: string; bot_username: string };
  assert.equal(made.status, 200);
  assert.match(body.code, /^[A-Z2-9]{8}$/);
  assert.equal(body.bot_username, 'heresay_bot');
  assert.equal(Date.parse(body.expires_at) - w.deps.now(), 10 * 60_000);
  assert.ok(!JSON.stringify([...w.store.auth.values()]).includes(body.code), 'stored hashed');
  const start = (text: string, uid = 7) => w.hook({ message: { message_id: 3, chat: { id: uid, type: 'private' }, from: { id: uid }, text } });
  let n = w.calls.length;
  await start('/start WRONGCOD'); assert.match(w.after(n).at(-1)!.body.text, /didn’t work/);
  assert.equal(w.tg().links, undefined);
  n = w.calls.length;
  await start(`/start@heresay_bot ${body.code.toLowerCase()}`);
  assert.equal(w.after(n).at(-1)!.body.text, 'Linked as member@example.com');
  assert.equal(w.tg().links!['7'], 'member@example.com');
  n = w.calls.length;
  await start(`/link ${body.code}`, 8); assert.match(w.after(n).at(-1)!.body.text, /didn’t work/, 'single use');
  assert.equal(w.tg().links!['8'], undefined);
  // Expiry.
  const second = (await w.call({ method: 'POST', path: '/v1/telegram/link-code', headers: memberH })).body as { code: string };
  w.advance(10 * 60_000 + 1);
  n = w.calls.length;
  await start(`/start ${second.code}`, 9); assert.match(w.after(n).at(-1)!.body.text, /expired/);
  assert.equal(w.tg().links!['9'], undefined);
  // A new code replaces the old one.
  const a = (await w.call({ method: 'POST', path: '/v1/telegram/link-code', headers: memberH })).body as { code: string };
  const b = (await w.call({ method: 'POST', path: '/v1/telegram/link-code', headers: memberH })).body as { code: string };
  n = w.calls.length;
  await start(`/start ${a.code}`, 10); assert.equal(w.tg().links!['10'], undefined);
  await start(`/start ${b.code}`, 10); assert.equal(w.tg().links!['10'], 'member@example.com');
  // Status and unlink.
  assert.deepEqual((await w.call({ path: '/v1/telegram/link', headers: memberH })).body, { connected: true, linked: true });
  assert.equal((await w.call({ method: 'DELETE', path: '/v1/telegram/link', headers: memberH })).status, 200);
  assert.deepEqual(w.tg().links, {});
  assert.deepEqual((await w.call({ path: '/v1/telegram/link', headers: memberH })).body, { connected: true, linked: false });
});

test('a code made before Telegram is connected for actions is refused, and codes are rate limited', async () => {
  const s = setup();
  assert.equal((await s.call({ method: 'POST', path: '/v1/telegram/link-code', headers: memberH })).status, 409);
  await s.connect();
  const codes = [];
  for (let i = 0; i < 6; i++) codes.push((await s.call({ method: 'POST', path: '/v1/telegram/link-code', headers: memberH })).status);
  assert.deepEqual(codes, [200, 200, 200, 200, 200, 429]);
});

test('the new-report notification gets Accept, Decline and Show full text; other events do not', async () => {
  const w = await world();
  await w.submit();
  const first = w.sent.at(-1)!;
  const row = first.extra.telegram_markup.inline_keyboard[0];
  assert.deepEqual(row.map((b: any) => b.text), ['Accept', 'Decline', 'Show full text']);
  for (const b of row) assert.ok(Buffer.byteLength(b.callback_data) <= 64, b.callback_data);
  assert.ok(!first.text.includes('save button'), 'the message itself still carries no reporter text');
  const r = (await w.store.listReports(w.project.id))[0];
  await w.call({ method: 'POST', path: `/v1/projects/${w.project.id}/reports/${r.id}/accept`, body: {} });
  await w.call({ method: 'PATCH', body: { events: { accepted: true } } });
  const sentBefore = w.sent.length;
  await w.call({ method: 'POST', path: `/v1/projects/${w.project.id}/reports/${r.id}/fixed`, body: {} });
  assert.ok(w.sent.length > sentBefore);
  assert.equal(w.sent.at(-1)!.extra, undefined);
});

test('a tap from an unlinked Telegram user is refused with an alert and changes nothing', async () => {
  const w = await world();
  const r = await w.submit();
  const n = w.calls.length;
  await w.tap(99, w.data('a', r));
  const [answer] = w.after(n);
  assert.equal(answer.method, 'answerCallbackQuery');
  assert.equal(answer.body.show_alert, true);
  assert.equal(answer.body.text, 'Link your Telegram first: Heresay dashboard > Notifications');
  assert.equal(w.after(n).length, 1);
  assert.equal((await w.store.getReport(w.project.id, r.id))!.status, 'open');
  assert.equal(await w.store.getTask(w.project.id, r.id), null);
});

test('a callback from any other chat is ignored entirely', async () => {
  const w = await world();
  const r = await w.submit();
  await w.link(7);
  const n = w.calls.length;
  await w.tap(7, w.data('a', r), { id: -999, type: 'supergroup' });
  assert.equal(w.after(n).length, 0);
  assert.equal((await w.store.getReport(w.project.id, r.id))!.status, 'open');
});

test('a linked accept creates the task through the dashboard path, edits the message and removes the buttons; a second tap changes nothing', async () => {
  const w = await world();
  const r = await w.submit();
  await w.link(7);
  let n = w.calls.length;
  await w.tap(7, w.data('a', r));
  const edit = w.after(n).find((c) => c.method === 'editMessageText')!;
  assert.match(edit.body.text, /Accepted by member@example\.com$/);
  assert.deepEqual(edit.body.reply_markup, { inline_keyboard: [] });
  assert.equal(edit.body.parse_mode, undefined);
  const report = (await w.store.getReport(w.project.id, r.id))!;
  assert.equal(report.status, 'accepted');
  assert.equal(report.triaged_by, 'member@example.com');
  const task = (await w.store.getTask(w.project.id, r.id))!;
  assert.equal(task.text, r.text);
  assert.equal(task.accepted_by, 'member@example.com');
  n = w.calls.length;
  await w.tap(7, w.data('a', r), GROUP, 55, 'Heresay: x\n\nAccepted by member@example.com');
  const again = w.after(n).find((c) => c.method === 'answerCallbackQuery')!;
  assert.equal(again.body.text, 'Already accepted by member@example.com');
  assert.equal((await w.store.listTasks(w.project.id)).length, 1);
  // Decided in the dashboard first: the tap reports it and changes nothing.
  const r2 = await w.submit('Second one');
  await w.call({ method: 'POST', path: `/v1/projects/${w.project.id}/reports/${r2.id}/decline`, body: { reason: 'Not a bug' } });
  n = w.calls.length;
  await w.tap(7, w.data('a', r2));
  assert.match(w.after(n).find((c) => c.method === 'answerCallbackQuery')!.body.text, /^Already declined by owner@example\.com/);
  assert.equal(await w.store.getTask(w.project.id, r2.id), null);
});

test('decline asks for a reason; an empty or oversize reply is refused and keeps waiting; a valid reply declines with it', async () => {
  const w = await world();
  const r = await w.submit();
  await w.link(7);
  let n = w.calls.length;
  await w.tap(7, w.data('d', r));
  const prompt = w.after(n).find((c) => c.method === 'sendMessage')!;
  assert.equal(prompt.body.text, 'Reply with why you’re declining this (the reporter will read it)');
  assert.equal(prompt.body.reply_markup.force_reply, true);
  assert.equal((await w.store.getReport(w.project.id, r.id))!.status, 'open', 'nothing happens until there is a reason');
  const promptId = 900 + w.calls.filter((c) => c.method === 'sendMessage').length - 1;
  const reply = (text: string | undefined, uid = 7, to = promptId) => w.hook({ message: { message_id: 70, chat: GROUP, from: { id: uid }, text, reply_to_message: { message_id: to } } });
  n = w.calls.length;
  await reply('   '); assert.match(w.after(n).at(-1)!.body.text, /Send the reason/);
  await reply(undefined); await reply('x'.repeat(1001));
  assert.match(w.after(n).at(-1)!.body.text, /limit is 1000/);
  assert.equal((await w.store.getReport(w.project.id, r.id))!.status, 'open');
  await reply('Someone else says no', 8);  // a different person's reply does nothing
  assert.equal((await w.store.getReport(w.project.id, r.id))!.status, 'open');
  n = w.calls.length;
  await reply('We do not support this browser');
  const done = (await w.store.getReport(w.project.id, r.id))!;
  assert.equal(done.status, 'declined');
  assert.equal(done.decline_reason, 'We do not support this browser');
  assert.equal(done.triaged_by, 'member@example.com');
  const edit = w.after(n).find((c) => c.method === 'editMessageText')!;
  assert.match(edit.body.text, /Declined by member@example\.com: We do not support this browser$/);
  assert.deepEqual(edit.body.reply_markup, { inline_keyboard: [] });
  assert.equal(edit.body.message_id, 55);
  assert.equal(await w.store.getAuth('decline', `${CHAT}:${promptId}`), null, 'the pending decline is spent');
  n = w.calls.length;
  await reply('Again');  // spent: no second decline
  assert.equal(w.after(n).length, 0);
});

test('a pending decline expires after ten minutes', async () => {
  const w = await world();
  const r = await w.submit();
  await w.link(7);
  await w.tap(7, w.data('d', r));
  const promptId = 900 + w.calls.filter((c) => c.method === 'sendMessage').length - 1;
  w.advance(10 * 60_000 + 1);
  await w.hook({ message: { message_id: 70, chat: GROUP, from: { id: 7 }, text: 'late', reply_to_message: { message_id: promptId } } });
  assert.equal((await w.store.getReport(w.project.id, r.id))!.status, 'open');
  assert.match(w.calls.at(-1)!.body.text, /too long/);
});

test('show full text replies in plain text, only to linked members, capped at 4096', async () => {
  const w = await world();
  const r = await w.submit('Short *text* with <b>markup</b>');
  const big: Report = { ...(await w.store.getReport(w.project.id, r.id))!, id: 'r_big', text: 'é'.repeat(5000) };
  await w.store.createReport(big);
  let n = w.calls.length;
  await w.tap(7, w.data('t', r));
  assert.equal(w.after(n).filter((c) => c.method === 'sendMessage').length, 0, 'unlinked: no text');
  await w.link(7);
  n = w.calls.length;
  await w.tap(7, w.data('t', r));
  const msg = w.after(n).find((c) => c.method === 'sendMessage')!;
  assert.equal(msg.body.text, 'broken · Acme Notes\n\nShort *text* with <b>markup</b>');
  assert.equal(msg.body.parse_mode, undefined);
  assert.deepEqual(msg.body.reply_parameters, { message_id: 55 });
  n = w.calls.length;
  await w.tap(7, w.data('t', big));
  assert.ok(w.after(n).find((c) => c.method === 'sendMessage')!.body.text.length <= 4096);
  assert.equal((await w.store.getReport(w.project.id, r.id))!.status, 'open', 'reading changes nothing');
});

test('removing a member from the team ends their Telegram access at the next tap', async () => {
  const w = await world();
  const r = await w.submit();
  await w.link(7);
  await w.call({ method: 'DELETE', path: '/v1/team/member@example.com' });
  assert.ok(!w.store.instance!.members.some((m) => m.email === 'member@example.com'));
  assert.ok(w.tg().links!['7'], 'the link is still there; it just no longer counts');
  const n = w.calls.length;
  await w.tap(7, w.data('a', r));
  assert.equal(w.after(n)[0].body.show_alert, true);
  assert.equal((await w.store.getReport(w.project.id, r.id))!.status, 'open');
  // A code made before the member was removed cannot link anyone either.
  const w2 = await world();
  const { code } = (await w2.call({ method: 'POST', path: '/v1/telegram/link-code', headers: memberH })).body as { code: string };
  await w2.call({ method: 'DELETE', path: '/v1/team/member@example.com' });
  await w2.hook({ message: { message_id: 3, chat: GROUP, from: { id: 12 }, text: `/start ${code}` } });
  assert.equal(w2.tg().links, undefined);
});

test('the real transport sends no token anywhere but Telegram, and a failure leaks nothing', async () => {
  const seen: string[] = [];
  const ok = telegramApi((async (url: string) => { seen.push(url); return new Response(JSON.stringify({ ok: true, result: { message_id: 1 } })); }) as unknown as typeof fetch);
  assert.deepEqual(await ok(TOKEN, 'sendMessage', { chat_id: 1, text: 'x' }), { ok: true, result: { message_id: 1 } });
  assert.equal(seen[0], `https://api.telegram.org/bot${TOKEN}/sendMessage`);
  const bad = telegramApi((async () => { throw new Error(`failed ${TOKEN}`); }) as unknown as typeof fetch);
  assert.deepEqual(await bad(TOKEN, 'sendMessage', {}), { ok: false });
});

test('lookup says Telegram is connected, instead of failing on getUpdates, when our webhook is on the bot', async () => {
  const w = await world();
  const res = await w.call({ method: 'POST', path: '/v1/notifications/telegram/lookup', body: {} });
  assert.equal(res.status, 200);
  const b = res.body as { note: string; bot: { username: string }; chats: unknown[] };
  assert.equal(b.note, 'Telegram is connected; to pick a different chat, enter its chat ID.');
  assert.equal(b.bot.username, 'heresay_bot');
  assert.deepEqual(b.chats, []);
  assert.ok(!JSON.stringify(res).includes(TOKEN));
});
