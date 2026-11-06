/**
 * npx create-heresay            set up a new Heresay (or finish one that stopped)
 * npx create-heresay update     deploy this version to a Heresay you set up
 * npx create-heresay status     what's deployed where
 * npx create-heresay open       open a dashboard
 * npx create-heresay remove     delete a Heresay and its Google Cloud project
 * npx create-heresay backup     save a Heresay's data to a file
 * npx create-heresay restore    put a backup into a Heresay
 *
 * The UX is specified in docs/plan/cli-ux.md.
 */
import * as p from '@clack/prompts';
import pc from 'picocolors';
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve as resolvePath } from 'node:path';
import { randomBytes } from 'node:crypto';
import { account, g } from './google.mjs';
import * as backup from './backup.mjs';
import { firebase, logTo } from './firebase.mjs';
import * as state from './state.mjs';
import * as steps from './steps.mjs';

const peacock = (s) => `\x1b[38;2;15;118;110m${s}\x1b[39m`;
/**
 * Where a Heresay answers. HERESAY_SITE (a named Hosting site) wins when set; otherwise the address
 * saved at setup or the last deploy (a Lite host, or a named site deployed from CI), and only then
 * the project's default site. Without the saved one, status checks an address that may be retired.
 */
const url = (id) => {
  if (process.env.HERESAY_SITE) return `https://${process.env.HERESAY_SITE}.web.app`;
  const rec = state.load().instances[id];
  return rec?.origin || rec?.url || `https://${id}.web.app`;
};

// ---- arguments --------------------------------------------------------------------------

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) { out._.push(a); continue; }
    const [k, v] = a.slice(2).split('=');
    if (v !== undefined) out[k] = v;
    else if (argv[i + 1] && !argv[i + 1].startsWith('--')) out[k] = argv[++i];
    else out[k] = true;
  }
  return out;
}

const HELP = `
  ${peacock('heresay')}  every report gets a hearing

  npx create-heresay             Set up your own Heresay (about 5 minutes)
  npx create-heresay update      Deploy this version to a Heresay you set up
  npx create-heresay status      See what's deployed, and where
  npx create-heresay open        Open your dashboard
  npx create-heresay backup      Save all of a Heresay's data to a file
  npx create-heresay restore     Put a backup file into a Heresay: restore <file>
  npx create-heresay remove      Delete a Heresay and its Google Cloud project

  Setup flags, to skip questions:
    --name <name>          --project-id <id>     --region us-central1|asia-south1|europe-west1
    --billing <account>    --owner <email>       --yes  (take every default, never ask)

  Free plan, no billing (Spark): the API runs on a host you choose instead of Cloud Functions.
    --lite --origin https://your-host.example      see docs/lite.md

  Backup and restore:
    --out <file>           where backup writes     --project-id <id>   a Heresay set up elsewhere
    --force                restore into a Heresay that already has data
`;

// ---- small helpers ----------------------------------------------------------------------

/** A prompt with no terminal to answer it hangs, and Node exits with a confusing warning. Say what to do instead. */
function needsTerminal(what, flags) {
  if (process.stdin.isTTY) return;
  p.log.error(`${what} asks questions, and there's no terminal to answer them here. Run it in a terminal, or pass ${flags}.`);
  process.exit(2);
}

function bail(v) {
  if (p.isCancel(v)) { p.cancel('Stopped. Nothing else was changed; run this again to carry on.'); process.exit(0); }
  return v;
}

function openInBrowser(target) {
  const cmd = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'cmd' : 'xdg-open';
  const args = process.platform === 'win32' ? ['/c', 'start', '', target] : [target];
  try { spawn(cmd, args, { stdio: 'ignore', detached: true }).unref(); } catch { /* the URL is printed anyway */ }
}

/** The named Hosting site a saved Heresay lives on, from its saved address. */
const savedSite = (rec) => /^https:\/\/([a-z0-9-]+)\.web\.app$/.exec(rec?.url ?? '')?.[1];
const savedCtx = (id, rec) => ({ id, name: rec.name, region: rec.region, billing: rec.billing, owner: rec.owner,
  lite: rec.lite, origin: rec.origin, site: savedSite(rec), onlySite: rec.only_site });

const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
function suggestId(name) {
  const tail = randomBytes(3).toString('hex').slice(0, 4);
  const base = slug(name).slice(0, 30 - 'heresay--'.length - tail.length).replace(/-+$/, '');
  return `heresay-${base ? base + '-' : ''}${tail}`;
}
const validId = (id) => /^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(id);

function fail(e, id) {
  const log = id ? state.logPath(id) : null;
  if (e instanceof steps.StepError) {
    p.log.error(e.message);
    if (e.fix) p.log.message(e.fix);
  } else {
    p.log.error(e.message || String(e));
    p.log.message('Your progress is saved. Run the same command to carry on.');
  }
  if (log) p.log.message(pc.dim(`Full log: ${log}`));
  p.outro(pc.red('Setup stopped'));
  process.exit(1);
}

// ---- sign in to Google ------------------------------------------------------------------

async function ensureLogin(args) {
  let email = await account();
  if (email && !args.yes) {
    const use = bail(await p.select({
      message: 'Google account',
      options: [{ value: 'yes', label: `Use ${email}` }, { value: 'other', label: 'Use a different account' }],
    }));
    if (use === 'other') {
      await firebase(['logout'], {});
      email = null;
    }
  }
  if (!email) {
    if (args.yes) { p.log.error('Not signed in to Google. Run without --yes to sign in.'); process.exit(1); }
    p.log.step('Opening your browser to sign in to Google…');
    await firebase(['login', '--reauth'], { interactive: true });
    email = await account();
    if (!email) { p.cancel('Setup needs a Google account. Run this again when you’re ready.'); process.exit(1); }
  }
  p.log.success(`Signed in as ${email}`);
  return email;
}

// ---- setup ------------------------------------------------------------------------------

async function setup(args) {
  const version = steps.releaseVersion();
  p.intro(`${peacock(pc.bold('heresay'))}  ${pc.dim('·  every report gets a hearing')}`);
  if (!args.yes) needsTerminal('Setup', '--yes (it takes every default; see --help for the rest)');
  if (args.lite && args.yes && !args.origin) { p.log.error('Lite needs --origin https://your-host.example (the address your host will serve).'); process.exit(1); }

  const [major] = process.versions.node.split('.').map(Number);
  if (major < 20) {
    p.log.error(`Heresay needs Node 20 or newer. You have ${process.versions.node}. Install it from https://nodejs.org, then run this again.`);
    process.exit(1);
  }

  // Resume an unfinished one first, so a rerun never starts a second project by accident.
  const all = state.load().instances;
  const unfinished = Object.entries(all).filter(([, v]) => !v.done?.verify);
  let ctx = null;
  if (unfinished.length && !args['project-id']) {
    const [id, rec] = unfinished[0];
    const resume = args.yes ? true : bail(await p.confirm({ message: `Found an unfinished setup for ${pc.bold(id)}. Pick up where it stopped?` }));
    if (resume) ctx = { ...savedCtx(id, rec), version };
    else if (!args.yes) {
      const drop = bail(await p.confirm({ message: 'Forget it and start a new one? (The Google project stays; remove it with npx create-heresay remove.)', initialValue: false }));
      if (!drop) { p.outro('Nothing changed.'); return; }
      state.forget(id);
    }
  }

  const lite = ctx ? !!ctx.lite : !!args.lite;
  if (!ctx) {
    if (lite) p.note([
      'This sets up your own Heresay in your Google account, on the free Spark plan:',
      '',
      `  ${peacock('•')} A new Firebase project: its database and sign-in`,
      `  ${peacock('•')} A key and a settings file for the server`,
      '',
      'No billing account. The API, dashboard and SDK run as one Node server on a',
      'host you choose (any host that runs Docker or Node), at the address you give.',
    ].join('\n'), 'About 3 minutes');
    else p.note([
      'This sets up your own Heresay in your Google account:',
      '',
      `  ${peacock('•')} A new Firebase project, owned by you`,
      `  ${peacock('•')} Its database, sign-in and hosting`,
      `  ${peacock('•')} The Heresay dashboard, API and SDK, deployed to it`,
      '',
      'Heresay’s API runs on Cloud Functions, which needs Firebase’s',
      'pay-as-you-go (Blaze) plan. It has a free tier; a small app pays',
      'nothing. You can set a budget alert in the Google Cloud console.',
    ].join('\n'), 'About 5 minutes');
    if (!args.yes) {
      const go = bail(await p.confirm({ message: 'Continue?' }));
      if (!go) { p.outro('Nothing changed.'); return; }
    }
  }

  const email = await ensureLogin(args);
  if (ctx) ctx.account = email;

  if (!ctx) {
    const defaultName = slug(email.split('@')[0]).slice(0, 20) || 'team';
    const name = args.name ?? (args.yes ? defaultName : bail(await p.text({
      message: 'Name your Heresay',
      placeholder: defaultName, defaultValue: defaultName,
      validate: (v) => (v && v.length > 20 ? 'Keep it under 20 characters' : undefined),
    })));
    const suggested = suggestId(name);
    const id = args['project-id'] ?? (args.yes ? suggested : bail(await p.text({
      message: 'Project id',
      placeholder: suggested, defaultValue: suggested,
      validate: (v) => (!v || validId(v) ? undefined : '6 to 30 characters: lowercase letters, digits and dashes, starting with a letter'),
    })));
    if (!validId(id)) { p.log.error(`${id} isn’t a valid project id.`); process.exit(1); }

    const region = args.region ?? (args.yes ? 'us-central1' : bail(await p.select({
      message: 'Where should data live?',
      options: steps.REGIONS.map((r) => ({ value: r.value, label: r.label, hint: r.hint })),
    })));
    if (!steps.REGIONS.some((r) => r.value === region)) { p.log.error(`Unknown region ${region}.`); process.exit(1); }

    const billing = lite ? null : await pickBilling(args);
    let origin = null;
    if (lite) {
      origin = args.origin ?? (args.yes ? null : bail(await p.text({
        message: 'Where will your Heresay run? (its public https address)',
        placeholder: 'https://heresay.example.com',
        validate: (v) => (/^https:\/\/[^\s/]+$/.test((v ?? '').replace(/\/$/, '')) ? undefined : 'An https address like https://heresay.example.com'),
      })));
      origin = origin && String(origin).replace(/\/$/, '');
      if (!origin || !/^https:\/\/[^\s/]+$/.test(origin)) { p.log.error('Lite needs --origin https://your-host.example (the address your host will serve).'); process.exit(1); }
    }

    const owner = args.owner ?? (args.yes ? email : bail(await p.text({
      message: 'Who can sign in to the dashboard?',
      placeholder: email, defaultValue: email,
      validate: (v) => (!v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? undefined : 'That isn’t an email address'),
    })));

    ctx = { id, name, region, billing, owner, version, account: email, lite, origin };
    state.update(id, { name, region, billing, owner, lite, origin, url: lite ? origin : url(id), created_at: new Date().toISOString(), done: {} });
    if (!args.yes) p.log.message(pc.dim('You can add teammates in the dashboard later.'));
  }

  await build(ctx);

  if (ctx.lite) {
    const dir = state.workDir(ctx.id);
    p.note([
      `Everything your host needs is in ${pc.bold(dir)}:`,
      '',
      `  ${peacock('•')} Dockerfile    builds the server`,
      `  ${peacock('•')} lite.env      its settings and key (secret: keep it out of git)`,
      '',
      'Try it on this computer:',
      pc.dim(`  cd ${dir}`),
      pc.dim('  docker build -t heresay-lite . && docker run --rm -p 8080:8080 --env-file lite.env heresay-lite'),
      '',
      `On a host, build that folder as a Docker service and add each line of lite.env as an environment variable. It must answer at ${pc.bold(ctx.origin)}.`,
      `Then open ${ctx.origin}/app/ and sign in as ${ctx.owner}. Check with: npx create-heresay status`,
    ].join('\n'), 'Your Heresay is ready for a host');
    p.outro('Every report gets a hearing.');
    return;
  }

  p.note([
    pc.bold(peacock(url(ctx.id))),
    '',
    `Open it, sign in as ${ctx.owner}, and add your first app.`,
    '',
    pc.dim('Later:  npx create-heresay update    get new versions'),
    pc.dim('        npx create-heresay status    see what’s deployed'),
  ].join('\n'), 'Your Heresay is live');
  if (!args.yes && process.stdout.isTTY) {
    const open = bail(await p.confirm({ message: 'Open it now?' }));
    if (open) openInBrowser(url(ctx.id) + '/app/');
  }
  p.outro('Every report gets a hearing.');
}

async function pickBilling(args) {
  for (;;) {
    let accounts;
    try { accounts = await steps.billingAccounts(); } catch (e) { fail(e); }
    if (args.billing) {
      const want = String(args.billing).replace(/^billingAccounts\//, '');
      const hit = accounts.find((a) => a.name === `billingAccounts/${want}` || a.displayName === args.billing);
      if (!hit) { p.log.error(`No open billing account matches ${args.billing}.`); process.exit(1); }
      return { name: hit.name, displayName: hit.displayName };
    }
    if (args.yes) {
      if (accounts.length === 1) return { name: accounts[0].name, displayName: accounts[0].displayName };
      p.log.error(accounts.length ? 'You have several billing accounts. Pass --billing <id>.' : 'You have no billing account. Run without --yes to create one.');
      process.exit(1);
    }
    const choice = bail(await p.select({
      message: 'Billing account',
      options: [
        ...accounts.map((a) => ({ value: a.name, label: a.displayName, hint: a.name.replace('billingAccounts/', '') })),
        { value: '__new', label: 'I need to create one', hint: 'opens the Google Cloud console' },
      ],
    }));
    if (choice !== '__new') return { name: choice, displayName: accounts.find((a) => a.name === choice).displayName };
    openInBrowser('https://console.cloud.google.com/billing/create');
    p.log.message('Create a billing account in the browser window. Google asks for a card, and won’t charge it inside the free tier.');
    bail(await p.text({ message: 'Press Enter when it’s done', defaultValue: 'ok' }));
  }
}

const BUILD_LITE = [
  ['project', 'Creating the project', 'Project created', steps.project],
  ['services', 'Switching on services', 'Services switched on', steps.liteServices],
  ['database', 'Creating the database', 'Database created', steps.database],
  ['signin', 'Setting up sign-in', 'Sign-in set up', steps.liteSignIn],
  ['owner', 'Adding you as owner', 'Owner added', steps.owner],
  ['deploy', 'Preparing the server', 'Server prepared', steps.liteDeploy],
  ['verify', 'Checking for your host', 'Checked', steps.liteVerify],
];

const BUILD = [
  ['project', 'Creating the project', 'Project created', steps.project],
  ['billing', 'Linking billing', 'Billing linked', steps.billing],
  ['services', 'Switching on services', 'Services switched on', steps.services],
  ['database', 'Creating the database', 'Database created', steps.database],
  ['signin', 'Setting up sign-in', 'Sign-in set up', steps.signIn],
  ['owner', 'Adding you as owner', 'Owner added', steps.owner],
  ['deploy', 'Deploying Heresay', 'Heresay deployed', steps.deploy],
  ['verify', 'Checking it works', 'Checked', steps.verify],
];

/** A spinner in a terminal; plain lines anywhere else (CI, piped to a file). */
function progress(animated) {
  if (process.stdout.isTTY) return p.spinner({ indicator: animated ? 'timer' : 'dots' });
  let last = '';
  const line = (m) => { if (m && m !== last) { last = m; console.log(`│  ${m}…`); } };
  return { start: line, message: line, stop: (m) => console.log(`◇  ${m}`), error: (m) => console.log(`■  ${m}`) };
}

async function build(ctx, only) {
  const log = state.logPath(ctx.id);
  logTo(log);
  (await import('./firebase.mjs')).log(`\n==== ${new Date().toISOString()} ${only ? 'update' : 'setup'} ${ctx.id} (Heresay ${ctx.version})`);
  p.log.step(pc.bold(only ? `Updating ${ctx.id}` : 'Building your Heresay'));
  const rec = state.load().instances[ctx.id] ?? {};
  for (const [key, doing, title, run] of (ctx.lite ? BUILD_LITE : BUILD)) {
    if (only && !only.includes(key)) continue;
    if (!only && rec.done?.[key] && key !== 'deploy' && key !== 'verify') {
      p.log.success(`${title}  ${pc.dim('(done before)')}`);
      continue;
    }
    const s = progress(key === 'deploy');
    s.start(doing);
    const started = Date.now();
    try {
      const detail = await run(ctx, (m) => s.message(m));
      const secs = Math.round((Date.now() - started) / 1000);
      s.stop(`${title.padEnd(22)} ${pc.dim(String(detail ?? ''))}${secs > 20 ? pc.dim(`  (${secs}s)`) : ''}`);
      state.markDone(ctx.id, key);
      if (key === 'signin' && ctx.googleError) {
        p.log.warn(`Google sign-in couldn’t be switched on (${ctx.googleError}). Email links work. To add Google later: https://console.firebase.google.com/project/${ctx.id}/authentication/providers`);
      }
      if (key === 'deploy') state.update(ctx.id, { version: ctx.version, url: ctx.lite ? ctx.origin : `https://${steps.siteOf(ctx)}.web.app`, ...(steps.onlySite(ctx) ? { only_site: true } : {}) });
    } catch (e) {
      s.error(`${doing}: stopped`);
      fail(e, ctx.id);
    }
  }
}

// ---- other commands ---------------------------------------------------------------------

/**
 * Which Heresay a command is about. `anywhere`: the command only needs the project id (backup,
 * restore), so a Heresay set up from another computer, or by a teammate, works with --project-id.
 */
async function pickInstance(verb, args, { anywhere = false } = {}) {
  const all = state.load().instances;
  const ids = Object.keys(all);
  if (args['project-id']) {
    if (!all[args['project-id']] && !anywhere) {
      p.log.error(`${args['project-id']} wasn’t set up from this computer, so its settings aren’t here. Run this on the computer that set it up.`);
      process.exit(1);
    }
    return args['project-id'];
  }
  if (!ids.length) {
    p.log.error(anywhere
      ? 'No Heresay was set up from this computer. Name yours with --project-id <id> (its Firebase project ID, listed at console.firebase.google.com), or run npx create-heresay to make one.'
      : 'No Heresay was set up from this computer. Run this on the computer that set it up, or npx create-heresay to make a new one.');
    process.exit(1);
  }
  if (ids.length === 1) return ids[0];
  return bail(await p.select({ message: `Which Heresay do you want to ${verb}?`, options: ids.map((id) => ({ value: id, label: id, hint: all[id].url })) }));
}

async function health(id) {
  try {
    const r = await fetch(`${url(id)}/v1/health`, { signal: AbortSignal.timeout(8000) });
    return r.ok ? await r.json() : null;
  } catch { return null; }
}

async function update(args) {
  p.intro(`${peacock(pc.bold('heresay'))} update`);
  const id = await pickInstance('update', args);
  const rec = state.load().instances[id];
  const live = await health(id);
  const version = steps.releaseVersion();
  p.log.info(`${id}: ${live ? live.version : 'not answering'} → ${version}`);
  if (!args.yes) {
    const go = bail(await p.confirm({ message: `Deploy ${version} to ${url(id)}?` }));
    if (!go) { p.outro('Nothing changed.'); return; }
  }
  const signedIn = await account();
  await build({ ...savedCtx(id, rec), version, account: signedIn }, ['deploy', 'verify']);
  if (rec.lite) { p.outro(`Rebuild your host from ${state.workDir(id)} to run ${version}.`); return; }
  p.outro(`${url(id)} is on ${version}.`);
}

async function status() {
  p.intro(`${peacock(pc.bold('heresay'))} status`);
  const all = state.load().instances;
  const ids = Object.keys(all);
  if (!ids.length) { p.outro('No Heresay set up from this computer yet. Run npx create-heresay.'); return; }
  const bundled = steps.releaseVersion();
  for (const id of ids) {
    const rec = all[id];
    const h = await health(id);
    const lines = [
      `${pc.dim('Dashboard')}  ${url(id)}/app/`,
      `${pc.dim('Region   ')}  ${rec.region}`,
      `${pc.dim('Version  ')}  ${h ? h.version : pc.red('not answering')}${h && h.version !== bundled ? pc.dim(`  (${bundled} available: npx create-heresay update)`) : ''}`,
      `${pc.dim('Setup    ')}  ${rec.done?.verify ? 'complete' : pc.yellow('unfinished: run npx create-heresay to carry on')}`,
    ];
    p.note(lines.join('\n'), id);
  }
  p.outro('Deploy a newer version with npx create-heresay update.');
}

async function open(args) {
  const id = await pickInstance('open', args);
  openInBrowser(`${url(id)}/app/`);
  console.log(`${url(id)}/app/`);
}

async function removeCmd(args) {
  p.intro(`${peacock(pc.bold('heresay'))} remove`);
  const id = await pickInstance('remove', args);
  p.log.warn([
    `This deletes the Google Cloud project ${pc.bold(id)}: its dashboard, every app and every report.`,
    'Google keeps it recoverable for 30 days, then it is gone. Billing is unlinked straight away.',
  ].join('\n'));
  needsTerminal('Remove', 'nothing: deleting a Heresay always needs a person to type its id');
  const typed = bail(await p.text({ message: `Type ${id} to confirm` }));
  if (typed !== id) { p.outro('That didn’t match. Nothing was deleted.'); return; }
  await account();
  const s = p.spinner();
  s.start('Deleting');
  try { await steps.remove(id); } catch (e) { s.error('Couldn’t delete it'); fail(e); }
  state.forget(id);
  s.stop(`Deleted ${id}`);
  p.outro('Done.');
}

const FS = 'https://firestore.googleapis.com/v1';

async function backupCmd(args) {
  p.intro(`${peacock(pc.bold('heresay'))} backup`);
  const id = await pickInstance('back up', args, { anywhere: true });
  await account();
  const s = progress(false);
  s.start(`Reading ${id}`);
  let b;
  try { b = await backup.dump(g, { base: FS, project: id, version: steps.releaseVersion(), say: (m) => s.message(m) }); } catch (e) { s.error('Couldn’t read it'); fail(e); }
  const stamp = b.created_at.slice(0, 16).replace(/[-:]/g, '').replace('T', '-');
  const file = resolvePath(String(args.out ?? `heresay-backup-${id}-${stamp}.json`));
  writeFileSync(file, JSON.stringify(b) + '\n', { mode: 0o600 });
  s.stop(`Saved ${b.documents.length} documents`);
  const by = backup.summarize(b);
  p.note([
    ...Object.entries(by).map(([k, n]) => `  ${k.padEnd(16)} ${n}`),
    '',
    pc.bold(file),
    '',
    ...(b.unscanned.length ? [pc.yellow(`${b.unscanned.length} documents with ':' in their id were saved, but Firestore can’t list subcollections under them (Heresay keeps none there).`), ''] : []),
    'It holds secrets (notification tokens, hashed agent tokens). Keep it somewhere private.',
    'Put it back with: npx create-heresay restore <file>',
  ].join('\n'), 'Backup');
  p.outro('Done.');
}

async function restoreCmd(args) {
  p.intro(`${peacock(pc.bold('heresay'))} restore`);
  const path = args._[1];
  if (!path) { p.log.error('Which file? npx create-heresay restore <file>'); process.exit(1); }
  let b;
  try { b = backup.check(JSON.parse(readFileSync(path, 'utf8'))); } catch (e) {
    p.log.error(e.code === 'ENOENT' ? `There’s no file at ${path}.` : e instanceof SyntaxError ? `${path} isn’t a Heresay backup (it isn’t JSON).` : e.message);
    process.exit(1);
  }
  const id = await pickInstance('restore into', args, { anywhere: true });
  await account();
  p.log.info(`${b.documents.length} documents from ${b.project} (${b.created_at.slice(0, 10)}) → ${id}`);
  if (await backup.hasData(g, { base: FS, project: id }) && !args.force) {
    p.log.error(`${id} already has data. Restoring would overwrite matching documents and keep the rest. Run again with --force if that’s what you want.`);
    process.exit(1);
  }
  if (!args.yes) {
    needsTerminal('Restore', '--yes to restore without typing the id');
    const typed = bail(await p.text({ message: `Type ${id} to restore into it` }));
    if (typed !== id) { p.outro('That didn’t match. Nothing was written.'); return; }
  }
  const s = progress(false);
  s.start('Writing');
  try { await backup.restore(g, b, { base: FS, project: id, say: (m) => s.message(m) }); } catch (e) { s.error('Stopped part way; run it again to finish'); fail(e); }
  s.stop(`Restored ${b.documents.length} documents`);
  p.outro(`Sign in at ${url(id)}/app/ with a team email. Reconnect repos with npx heresay connect --url ${url(id)}.`);
}

export async function main(argv) {
  const args = parseArgs(argv);
  const cmd = args._[0];
  if (args.help || args.h || cmd === 'help') { console.log(HELP); return; }
  if (args.version || args.v) { console.log(steps.releaseVersion()); return; }
  if (!cmd || cmd === 'setup' || cmd === 'create') return setup(args);
  if (cmd === 'update') return update(args);
  if (cmd === 'status') return status(args);
  if (cmd === 'open') return open(args);
  if (cmd === 'remove') return removeCmd(args);
  if (cmd === 'backup') return backupCmd(args);
  if (cmd === 'restore') return restoreCmd(args);
  console.log(`Unknown command: ${cmd}\n${HELP}`);
  process.exit(1);
}
