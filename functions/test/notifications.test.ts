import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handle, type Deps, type Req } from '../src/core/handler.js';
import { MemoryStore } from '../src/core/store.js';
import { defaultNotifications, notificationSender, notify, patchNotifications, telegramLookup, validCliqEndpoint } from '../src/core/notifications.js';
import type { Project, Report } from '../src/core/types.js';

const TOKEN = '123456:abcdefghijklmnopqrstuvwxyz_123456';
const CLIQ_TOKEN = 'cliq-secret-token';
const ENDPOINT = 'https://cliq.zoho.in/api/v2/channelsbyname/team/message';
const owner = { authorization: 'Bearer owner' };
function setup() {
  const store = new MemoryStore();
  store.instance = { created_at: 'x', members: [
    { email: 'owner@example.com', role: 'owner', added_at: 'x', added_by: null },
    { email: 'member@example.com', role: 'member', added_at: 'x', added_by: null },
  ] };
  const sent: { provider: string; text: string }[] = [], logs: unknown[] = [];
  let now = 0;
  const deps: Deps = {
    store, now: () => now, version: 'test', selfOrigins: ['https://heresay.example'],
    verifyIdToken: async (token) => ['owner', 'member', 'outsider', 'unverified'].includes(token)
      ? { uid: token, email: `${token}@example.com`, emailVerified: token !== 'unverified' } : null,
    log: (event, fields) => logs.push({ event, ...fields }),
    sendNotification: async (provider, _, text) => { sent.push({ provider, text }); },
  };
  const call = (r: Partial<Req>) => handle({ method: 'GET', path: '/v1/notifications', headers: owner, body: undefined, query: {}, ip: '127.0.0.1', ...r }, deps);
  const save = (body: unknown) => call({ method: 'PATCH', body });
  const enable = () => save({
    events: { new_report: true, accepted: true, fixed: true, handoff: true },
    telegram: { enabled: true, token: TOKEN, chat_id: '-1001234567890' },
    cliq: { enabled: true, token: CLIQ_TOKEN, endpoint: ENDPOINT },
  });
  return { store, deps, sent, logs, call, save, enable, tick: () => { now += 60_000; } };
}
async function world() {
  const s = setup();
  await s.enable();
  const created = await s.call({ method: 'POST', path: '/v1/projects', body: { name: 'Acme Notes' } });
  const project = (created.body as { project: Project }).project;
  const submit = () => s.call({ method: 'POST', path: '/v1/reports', headers: { origin: 'https://app.example' }, body: {
    key: project.key, device_id: 'device_1234567890123456', type: 'broken', text: 'Private reporter text',
    reporter: { name: 'Private name', email: 'private@example.com', note: 'Private note' },
    context: { user_email: 'private@example.com', route: '/private' },
  } });
  const triage = (id: string, action: string) => s.call({ method: 'POST', path: `/v1/projects/${project.id}/reports/${id}/${action}`, body: { note: 'Private fix note', reason: 'Private decline reason' } });
  return { ...s, project, submit, triage };
}

test('notifications require a verified team owner; members and agents cannot read, write or test', async () => {
  const s = setup();
  for (const headers of [{}, { authorization: 'Bearer outsider' }, { authorization: 'Bearer member' }, { authorization: 'Bearer unverified' }, { authorization: 'Bearer hst_not-a-user' }]) {
    for (const [method, path] of [['GET', '/v1/notifications'], ['PATCH', '/v1/notifications'], ['POST', '/v1/notifications/test']]) {
      const result = await s.call({ method, path, headers, body: { provider: 'telegram' } });
      assert.ok([401, 403].includes(result.status));
    }
  }
  assert.equal(s.store.instance!.notifications, undefined);
  assert.equal(s.sent.length, 0);
});

test('save and reload hide secrets; partial patches and team changes preserve credentials', async () => {
  const s = setup();
  assert.equal((await s.call({})).status, 200, 'old instances work without migration');
  for (const res of [await s.enable(), await s.call({})]) {
    assert.equal(res.status, 200);
    assert.equal(res.headers?.['cache-control'], 'no-store');
    assert.ok(!JSON.stringify(res.body).includes(TOKEN));
    assert.ok(!JSON.stringify(res.body).includes(CLIQ_TOKEN));
    assert.equal((res.body as { notifications: { telegram: { configured: boolean } } }).notifications.telegram.configured, true);
  }
  assert.equal((await s.save({ telegram: { token: '', chat_id: '@teamchannel' } })).status, 200);
  await s.save({ events: { accepted: false } });
  await s.call({ method: 'POST', path: '/v1/team', body: { email: 'new@example.com' } });
  assert.equal(s.store.instance!.notifications!.telegram.token, TOKEN);
  assert.equal(s.store.instance!.notifications!.telegram.chat_id, '@teamchannel');
  assert.equal(s.store.instance!.notifications!.cliq.token, CLIQ_TOKEN);
  assert.equal(s.store.instance!.notifications!.events.accepted, false);
  await s.save({ telegram: { enabled: false, token: null, chat_id: '' } });
  assert.equal(s.store.instance!.notifications!.telegram.token, null);
  assert.equal(((await s.call({})).body as { notifications: { telegram: { configured: boolean } } }).notifications.telegram.configured, false);
});

test('validation prevents invalid enabled destinations and arbitrary hosts, credentials or redirects', async () => {
  const s = setup();
  for (const body of [
    { telegram: { enabled: true } }, { cliq: { enabled: true } },
    { telegram: { enabled: 'yes' } }, { telegram: { token: 'bad' } },
    { telegram: { chat_id: 'chat with spaces' } }, { cliq: { token: 'secret?url=x' } },
    { events: { new_report: 'true' } }, { telegram: [] },
    { cliq: { endpoint: 'https://example.com/api/v2/bots/team/message' } },
  ]) assert.equal((await s.save(body)).status, 400, JSON.stringify(body));
  assert.equal(s.store.instance!.notifications, undefined, 'failed updates are atomic');
  for (const endpoint of [
    'http://cliq.zoho.com/api/v2/bots/team/message', 'https://cliq.zoho.com.evil.test/api/v2/bots/team/message',
    'https://cliq.zoho.com:444/api/v2/bots/team/message',
    'https://cliq.zoho.com/api/v2/bots/team/message?zapikey=secret', 'https://cliq.zoho.com/api/v2/bots/team/incoming',
    'https://cliq.zoho.com/api/v2/bots/team/message#fragment',
  ]) assert.equal(validCliqEndpoint(endpoint), false, endpoint);
  const authenticatedEndpoint = new URL('https://cliq.zoho.com/api/v2/bots/team/message');
  authenticatedEndpoint.username = 'example-user';
  authenticatedEndpoint.password = 'example-password';
  assert.equal(validCliqEndpoint(authenticatedEndpoint.href), false, 'URL credentials are refused');
  assert.equal(validCliqEndpoint(ENDPOINT), true);
  assert.equal(validCliqEndpoint('https://cliq.zoho.eu/api/v2/bots/team/message'), true);
  for (const host of ['cliq.zohocloud.ca', 'cliq.zoho.uk', 'cliq.zoho.ae', 'cliq.zoho.sg']) {
    const endpoint = `https://${host}/api/v2/channelsbyname/team/message`;
    assert.equal(validCliqEndpoint(endpoint), true, host);
    assert.equal((await s.save({ cliq: { endpoint } })).status, 200, host);
    assert.equal(validCliqEndpoint(`https://${host}.evil.test/api/v2/bots/team/message`), false);
  }
  assert.equal(validCliqEndpoint('https://cliq.zoho.ca/api/v2/bots/team/message'), false);
  assert.throws(() => patchNotifications(defaultNotifications(), { cliq: { token: 'x'.repeat(513) } }));
});

test('tests use saved destinations, require enablement, rate-limit and redact transport errors', async () => {
  const s = setup();
  const send = (provider: string) => s.call({ method: 'POST', path: '/v1/notifications/test', body: { provider } });
  assert.equal((await send('telegram')).status, 400);
  await s.enable();
  assert.equal((await send('unknown')).status, 400);
  for (let n = 0; n < 3; n++) assert.equal((await send('telegram')).status, 200);
  assert.equal((await send('telegram')).status, 429);
  assert.equal((await send('cliq')).status, 200, 'separate destination budget');
  s.tick();
  s.deps.sendNotification = async () => { throw new Error(`https://api.telegram.org/bot${TOKEN}/sendMessage`); };
  const failed = await send('telegram');
  assert.equal(failed.status, 502);
  assert.ok(!JSON.stringify(failed).includes(TOKEN));
  assert.ok(!JSON.stringify(s.logs).includes(TOKEN));
});

test('real report transitions notify selected destinations once, without reporter content', async () => {
  const w = await world();
  const submitted = await w.submit();
  assert.equal(submitted.status, 201);
  const id = (submitted.body as { report: Report }).report.id;
  assert.equal(w.sent.length, 2);
  assert.match(w.sent[0].text, /needs your review/);
  assert.match(w.sent[0].text, /https:\/\/heresay.example\/app\/#\/apps\//);
  assert.equal((await w.triage(id, 'accept')).status, 200);
  assert.equal(w.sent.length, 4);
  assert.equal((await w.triage(id, 'accept')).status, 409);
  assert.equal(w.sent.length, 4, 'lost races do not notify');
  assert.equal((await w.triage(id, 'fixed')).status, 200);
  assert.equal(w.sent.length, 6);
  assert.equal((await w.triage(id, 'fixed')).status, 409);
  for (const message of w.sent) {
    assert.ok(!message.text.includes('Private'));
    assert.ok(!message.text.includes('private@example.com'));
    assert.ok(!message.text.includes('/private'));
  }
  await w.save({ telegram: { enabled: false }, events: { new_report: false } });
  const second = await w.submit();
  assert.equal(w.sent.length, 6, 'unselected events are silent');
  const secondId = (second.body as { report: Report }).report.id;
  await w.triage(secondId, 'accept');
  assert.equal(w.sent.length, 7);
  assert.equal(w.sent[6].provider, 'cliq');
});

test('provider failures neither roll back reports nor stop another destination', async () => {
  const w = await world();
  w.deps.sendNotification = async (provider, _, text) => {
    if (provider === 'telegram') throw new Error(TOKEN);
    w.sent.push({ provider, text });
  };
  const submitted = await w.submit();
  assert.equal(submitted.status, 201);
  const id = (submitted.body as { report: Report }).report.id;
  assert.equal((await w.triage(id, 'accept')).status, 200);
  assert.equal((await w.triage(id, 'fixed')).status, 200);
  assert.equal((await w.store.getReport(w.project.id, id))!.status, 'fixed');
  assert.equal(w.sent.length, 3);
  assert.ok(!JSON.stringify(w.logs).includes(TOKEN));
});

test('a missing delivery adapter leaves report workflows available and reports test unavailability', async () => {
  const w = await world();
  delete w.deps.sendNotification;
  const testResult = await w.call({ method: 'POST', path: '/v1/notifications/test', body: { provider: 'telegram' } });
  assert.equal(testResult.status, 503);
  const submitted = await w.submit();
  assert.equal(submitted.status, 201);
  const id = (submitted.body as { report: Report }).report.id;
  assert.equal((await w.triage(id, 'accept')).status, 200);
  assert.equal((await w.triage(id, 'fixed')).status, 200);
  assert.equal(w.sent.length, 0);
});

test('notification settings read failures are isolated and logged without secret-bearing errors', async () => {
  const w = await world();
  w.store.getInstance = async () => { throw new Error(`https://api.telegram.org/bot${TOKEN}/sendMessage`); };
  await notify('new_report', w.project, 'report-id', w.deps);
  assert.equal(w.sent.length, 0);
  assert.deepEqual(w.logs.at(-1), {
    event: 'api.notification_failed', notification_event: 'new_report', project_id: w.project.id, report_id: 'report-id',
  });
  assert.ok(!JSON.stringify(w.logs).includes(TOKEN));
});

test('agent handoffs and fixes send metadata notifications', async () => {
  const w = await world();
  const makeToken = async (repo: string) => {
    const result = await w.call({ method: 'POST', path: '/v1/agent-tokens', body: { repo, app_ids: [w.project.id] } });
    return { authorization: `Bearer ${(result.body as { token: string }).token}` };
  };
  const first = await makeToken('github.com/acme/web'), second = await makeToken('github.com/acme/api');
  const submitted = await w.submit(), id = (submitted.body as { report: Report }).report.id;
  await w.triage(id, 'accept');
  assert.equal((await w.call({ method: 'POST', path: `/v1/agent/briefs/${id}/handoff`, headers: first, body: { repo: 'github.com/acme/api', note: 'Private handoff note' } })).status, 200);
  assert.equal(w.sent.length, 6);
  assert.match(w.sent[4].text, /handed off/);
  assert.equal((await w.call({ method: 'POST', path: `/v1/agent/briefs/${id}/fixed`, headers: second, body: { note: 'Private fix note' } })).status, 200);
  assert.equal(w.sent.length, 8);
  assert.match(w.sent[6].text, /marked fixed/);
  assert.equal((await w.call({ method: 'POST', path: `/v1/agent/briefs/${id}/fixed`, headers: second, body: { note: 'again' } })).status, 409);
  assert.equal(w.sent.length, 8);
  assert.ok(!JSON.stringify(w.sent).includes('Private'));
});

test('HTTP delivery uses the Telegram and regional Cliq message APIs, bounds time and rejects redirects/errors', async () => {
  const calls: { url: string; options: RequestInit }[] = [];
  const http = (async (url: string | URL | Request, options: RequestInit) => {
    calls.push({ url: String(url), options });
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  }) as typeof fetch;
  const send = notificationSender(http);
  await send('telegram', { enabled: true, token: TOKEN, chat_id: '-100123' }, 'Plain text');
  await send('cliq', { enabled: true, token: CLIQ_TOKEN, endpoint: ENDPOINT }, 'Plain text');
  assert.equal(calls[0].url, `https://api.telegram.org/bot${TOKEN}/sendMessage`);
  assert.deepEqual(JSON.parse(calls[0].options.body as string), { chat_id: '-100123', text: 'Plain text', link_preview_options: { is_disabled: true } });
  assert.equal(calls[1].url, `${ENDPOINT}?zapikey=${CLIQ_TOKEN}`);
  assert.deepEqual(JSON.parse(calls[1].options.body as string), { text: 'Plain text' });
  for (const { options } of calls) {
    assert.equal(options.redirect, 'error');
    assert.ok(options.signal instanceof AbortSignal);
  }
  for (const response of [new Response('{}', { status: 401 }), new Response('{"ok":false}', { status: 200 })]) {
    const reject = notificationSender((async () => response) as typeof fetch);
    await assert.rejects(reject('telegram', { enabled: true, token: TOKEN, chat_id: '1' }, 'Test'));
  }
  await assert.rejects(send('cliq', { enabled: true, token: CLIQ_TOKEN, endpoint: 'https://localhost/' }, 'Test'));
  await assert.rejects(send('telegram', { enabled: true, token: null, chat_id: '1' }, 'Test'));
  await assert.rejects(send('telegram', { enabled: true, token: TOKEN, endpoint: ENDPOINT }, 'Test'));
  assert.equal(calls.length, 2, 'invalid endpoints never make a request');
});

test('telegram lookup: owner only, pasted or saved token, never echoes the token', async () => {
  const s = setup();
  const asked: string[] = [];
  s.deps.telegramLookup = async (token) => { asked.push(token); return { bot: { username: 'acme_bot', name: 'Acme' }, chats: [{ id: '42', title: 'Asha', kind: 'private' }] }; };
  const look = (body: unknown, headers: Record<string, string> = owner) => s.call({ method: 'POST', path: '/v1/notifications/telegram/lookup', body, headers });
  assert.equal((await look({ token: TOKEN }, { authorization: 'Bearer member' })).status, 403);
  assert.equal((await look({})).status, 400, 'no token pasted and none saved');
  assert.equal((await look({ token: 'nope' })).status, 400);
  const pasted = await look({ token: TOKEN });
  assert.equal(pasted.status, 200);
  assert.deepEqual((pasted.body as { chats: unknown[] }).chats, [{ id: '42', title: 'Asha', kind: 'private' }]);
  assert.ok(!JSON.stringify(pasted.body).includes(TOKEN));
  await s.enable();
  assert.equal((await look({})).status, 200, 'falls back to the saved token');
  assert.deepEqual(asked, [TOKEN, TOKEN]);
  for (let i = 0; i < 12; i++) await look({ token: TOKEN });
  assert.equal((await look({ token: TOKEN })).status, 429, 'rate-limited');
});

test('telegram lookup transport: lists recent chats, explains a bad token and a webhook bot', async () => {
  const reply = (status: number, json: unknown) => new Response(JSON.stringify(json), { status });
  const fake = (updates: Response) => (async (url: string) => String(url).endsWith('/getMe')
    ? reply(200, { ok: true, result: { username: 'acme_bot', first_name: 'Acme' } }) : updates) as unknown as typeof fetch;
  const found = await telegramLookup(fake(reply(200, { ok: true, result: [
    { message: { chat: { id: 42, type: 'private', first_name: 'Asha', last_name: 'R' } } },
    { my_chat_member: { chat: { id: -1001, type: 'supergroup', title: 'Team' } } },
    { message: { chat: { id: 42, type: 'private', first_name: 'Asha', last_name: 'R' } } },
    { channel_post: { chat: { id: -1002, type: 'channel', title: 'Releases' } } },
  ] })))(TOKEN);
  assert.deepEqual(found.bot, { username: 'acme_bot', name: 'Acme' });
  assert.deepEqual(found.chats.map((c) => c.id), ['-1002', '-1001', '42']);
  assert.equal(found.chats.find((c) => c.id === '42')!.title, 'Asha R');
  await assert.rejects(telegramLookup((async () => reply(401, { ok: false })) as unknown as typeof fetch)(TOKEN), /doesn’t recognise/);
  await assert.rejects(telegramLookup(fake(reply(409, { ok: false })))(TOKEN), /webhook/);
});
