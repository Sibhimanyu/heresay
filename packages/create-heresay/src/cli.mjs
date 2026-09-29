/**
 * npx create-heresay            set up a new Heresay (or finish one that stopped)
 * npx create-heresay update     deploy this version to a Heresay you set up
 * npx create-heresay status     what's deployed where
 * npx create-heresay open       open a dashboard
 * npx create-heresay remove     delete a Heresay and its Google Cloud project
 *
 * The UX is specified in docs/plan/cli-ux.md.
 */
import * as p from '@clack/prompts';
import pc from 'picocolors';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { account } from './google.mjs';
import { firebase, logTo } from './firebase.mjs';
import * as state from './state.mjs';
import * as steps from './steps.mjs';

const peacock = (s) => `\x1b[38;2;15;118;110m${s}\x1b[39m`;
const url = (id) => `https://${id}.web.app`;

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
  npx create-heresay remove      Delete a Heresay and its Google Cloud project

  Setup flags, to skip questions:
    --name <name>          --project-id <id>     --region us-central1|asia-south1|europe-west1
    --billing <account>    --owner <email>       --yes  (take every default, never ask)
`;

// ---- small helpers ----------------------------------------------------------------------

function bail(v) {
  if (p.isCancel(v)) { p.cancel('Stopped. Nothing else was changed; run this again to carry on.'); process.exit(0); }
  return v;
}

function openInBrowser(target) {
  const cmd = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'cmd' : 'xdg-open';
  const args = process.platform === 'win32' ? ['/c', 'start', '', target] : [target];
  try { spawn(cmd, args, { stdio: 'ignore', detached: true }).unref(); } catch { /* the URL is printed anyway */ }
}

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
    if (resume) ctx = { id, name: rec.name, region: rec.region, billing: rec.billing, owner: rec.owner, version };
    else if (!args.yes) {
      const drop = bail(await p.confirm({ message: 'Forget it and start a new one? (The Google project stays; remove it with npx create-heresay remove.)', initialValue: false }));
      if (!drop) { p.outro('Nothing changed.'); return; }
      state.forget(id);
    }
  }

  if (!ctx) {
    p.note([
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

    const billing = await pickBilling(args);

    const owner = args.owner ?? (args.yes ? email : bail(await p.text({
      message: 'Who can sign in to the dashboard?',
      placeholder: email, defaultValue: email,
      validate: (v) => (!v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? undefined : 'That isn’t an email address'),
    })));

    ctx = { id, name, region, billing, owner, version, account: email };
    state.update(id, { name, region, billing, owner, url: url(id), created_at: new Date().toISOString(), done: {} });
    if (!args.yes) p.log.message(pc.dim('You can add teammates in the dashboard later.'));
  }

  await build(ctx);

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
  for (const [key, doing, title, run] of BUILD) {
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
      if (key === 'deploy') state.update(ctx.id, { version: ctx.version, url: url(ctx.id) });
    } catch (e) {
      s.error(`${doing}: stopped`);
      fail(e, ctx.id);
    }
  }
}

// ---- other commands ---------------------------------------------------------------------

async function pickInstance(verb, args) {
  const all = state.load().instances;
  const ids = Object.keys(all);
  if (args['project-id']) {
    if (!all[args['project-id']]) { p.log.error(`This computer didn’t set up ${args['project-id']}.`); process.exit(1); }
    return args['project-id'];
  }
  if (!ids.length) { p.log.error('This computer hasn’t set up a Heresay yet. Run npx create-heresay first.'); process.exit(1); }
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
  await build({ id, name: rec.name, region: rec.region, billing: rec.billing, owner: rec.owner, version, account: signedIn }, ['deploy', 'verify']);
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
  console.log(`Unknown command: ${cmd}\n${HELP}`);
  process.exit(1);
}
