/**
 * The build steps of a Heresay. Each one checks before it acts, so running setup again after
 * a failure picks up where it stopped instead of creating a second of anything.
 *
 * ctx: { id, name, region, billing, owner, version }. `say(text)` updates the spinner line.
 */
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { g, op, patiently, GoogleError } from './google.mjs';
import { firebase, npm } from './firebase.mjs';
import { workDir } from './state.mjs';

export const RELEASE = fileURLToPath(new URL('../release/', import.meta.url));
export const releaseVersion = () => readFileSync(join(RELEASE, 'VERSION'), 'utf8').trim();

const CRM = 'https://cloudresourcemanager.googleapis.com/v1';
const FB = 'https://firebase.googleapis.com/v1beta1';
const BILLING = 'https://cloudbilling.googleapis.com/v1';
const SU = 'https://serviceusage.googleapis.com/v1';
const FS = 'https://firestore.googleapis.com/v1';
const IDT = 'https://identitytoolkit.googleapis.com/admin/v2';

export const REGIONS = [
  { value: 'us-central1', label: 'United States', hint: 'Iowa, us-central1' },
  { value: 'asia-south1', label: 'India', hint: 'Mumbai, asia-south1' },
  { value: 'europe-west1', label: 'Europe', hint: 'Belgium, europe-west1' },
];

/** A plain-language failure: what went wrong, and what to do about it. */
export class StepError extends Error {
  constructor(message, fix) { super(message); this.fix = fix; }
}

// ---- 1. project -------------------------------------------------------------------------

export async function project(ctx, say) {
  const existing = await g('GET', `${CRM}/projects/${ctx.id}`, { missingOk: true }).catch((e) => {
    if (e.status === 403) return null; // not ours, or not there: Google won't say which
    throw e;
  });
  if (existing && existing.lifecycleState !== 'ACTIVE') {
    throw new StepError(`The project ${ctx.id} is being deleted.`, 'Pick another project id and run this again.');
  }
  if (!existing) {
    say('Creating the Google Cloud project');
    let o;
    try {
      o = await g('POST', `${CRM}/projects`, { body: { projectId: ctx.id, name: `Heresay ${ctx.name}`.slice(0, 30) } });
    } catch (e) {
      if (e.status === 409) throw new StepError(`The project id ${ctx.id} is taken.`, 'Run this again and pick another id.');
      if (/quota/i.test(e.message)) {
        throw new StepError('Your Google account can’t create more projects.',
          'Delete one you no longer use at https://console.cloud.google.com/cloud-resource-manager, or request more quota, then run this again.');
      }
      throw e;
    }
    await op(CRM, o, { timeoutMs: 3 * 60_000 });
  }
  const fb = await g('GET', `${FB}/projects/${ctx.id}`, { missingOk: true }).catch((e) => (e.status === 403 ? null : Promise.reject(e)));
  if (!fb) {
    say('Adding Firebase to it');
    try {
      const o = await patiently(() => g('POST', `${FB}/projects/${ctx.id}:addFirebase`, { body: {} }), { forMs: 60_000 });
      await op(FB, o, { timeoutMs: 3 * 60_000 });
    } catch (e) {
      if (/terms of service|tos/i.test(e.message)) {
        throw new StepError('Your Google account hasn’t accepted the Firebase terms yet.',
          'Open https://console.firebase.google.com once, accept the terms, then run this again.');
      }
      throw e;
    }
  }
  return ctx.id;
}

// ---- 2. billing -------------------------------------------------------------------------

export async function billingAccounts() {
  const b = await g('GET', `${BILLING}/billingAccounts?pageSize=50`);
  return (b.billingAccounts ?? []).filter((a) => a.open);
}

export async function billing(ctx, say) {
  const cur = await g('GET', `${BILLING}/projects/${ctx.id}/billingInfo`);
  if (cur.billingEnabled && cur.billingAccountName === ctx.billing.name) return ctx.billing.displayName;
  say('Linking ' + ctx.billing.displayName);
  try {
    await g('PUT', `${BILLING}/projects/${ctx.id}/billingInfo`, { body: { billingAccountName: ctx.billing.name } });
  } catch (e) {
    if (e.status === 403 || e.status === 400) {
      throw new StepError(`That billing account can’t be linked (${e.message}).`,
        'It may be closed, or you may not be allowed to link projects to it. Run this again and pick another.');
    }
    throw e;
  }
  return ctx.billing.displayName;
}

// ---- 3. services ------------------------------------------------------------------------

const SERVICES = [
  'firestore.googleapis.com', 'cloudfunctions.googleapis.com', 'run.googleapis.com',
  'cloudbuild.googleapis.com', 'artifactregistry.googleapis.com', 'identitytoolkit.googleapis.com',
  'firebasehosting.googleapis.com', 'firebaserules.googleapis.com',
];

export async function services(ctx, say) {
  say('Switching on Firestore, Functions, Auth and Hosting');
  const o = await patiently(() => g('POST', `${SU}/projects/${ctx.id}/services:batchEnable`, { body: { serviceIds: SERVICES } }), { forMs: 90_000 });
  await op(SU, o, { timeoutMs: 6 * 60_000 });
  return 'Firestore, Functions, Auth, Hosting';
}

// ---- 4. database ------------------------------------------------------------------------

export async function database(ctx, say) {
  const db = `${FS}/projects/${ctx.id}/databases/(default)`;
  // Right after the API is switched on, Firestore answers 403 for a minute or two.
  const have = await patiently(() => g('GET', db, { missingOk: true }), { forMs: 180_000 });
  if (have) return have.locationId;
  say('Creating the database in ' + ctx.region);
  const o = await patiently(() => g('POST', `${FS}/projects/${ctx.id}/databases?databaseId=(default)`, {
    body: { locationId: ctx.region, type: 'FIRESTORE_NATIVE' },
  }), { forMs: 90_000 });
  await op(FS, o, { timeoutMs: 5 * 60_000 });
  return ctx.region;
}

// ---- the release, laid out for `firebase deploy` ----------------------------------------

/** Copy the bundled release into ~/.heresay/instances/<id>/ and write its config. */
export function prepareRelease(ctx) {
  const dir = workDir(ctx.id);
  mkdirSync(dir, { recursive: true });
  // Keep the installed runtime dependencies between deploys; replace everything else.
  for (const f of readdirSync(dir)) if (f !== 'functions') rmSync(join(dir, f), { recursive: true, force: true });
  if (existsSync(join(dir, 'functions'))) {
    for (const f of readdirSync(join(dir, 'functions'))) if (f !== 'node_modules') rmSync(join(dir, 'functions', f), { recursive: true, force: true });
  }
  cpSync(RELEASE, dir, { recursive: true });

  const cfg = JSON.parse(readFileSync(join(RELEASE, 'firebase.json'), 'utf8'));
  delete cfg.emulators;
  for (const fn of cfg.functions) delete fn.predeploy;
  for (const r of cfg.hosting.rewrites) if (r.function) r.function.region = ctx.region;
  writeFileSync(join(dir, 'firebase.json'), JSON.stringify(cfg, null, 2) + '\n');
  writeFileSync(join(dir, '.firebaserc'), JSON.stringify({ projects: { default: ctx.id } }, null, 2) + '\n');
  writeFileSync(join(dir, 'functions', '.env'), `HERESAY_REGION=${ctx.region}\n`);
  return dir;
}

function deployError(out) {
  const lines = out.split('\n').map((l) => l.trim()).filter(Boolean);
  const err = lines.filter((l) => /^Error:|^⚠|failed|denied/i.test(l)).slice(-3).join(' ');
  return err || lines.slice(-2).join(' ');
}

// ---- 5. sign-in -------------------------------------------------------------------------
//
// These calls carry the user's own project as quota project. Through the Firebase CLI they
// would share one quota with every Firebase CLI user in the world, and fail with 429 at busy times.

/** The web app whose config the dashboard loads from /__/firebase/init.js. */
async function webApp(ctx, say) {
  const list = await patiently(() => g('GET', `${FB}/projects/${ctx.id}/webApps`, { project: ctx.id }), { forMs: 90_000 });
  if (list.apps?.length) return list.apps[0].appId;
  say('Registering the dashboard with Firebase');
  const o = await patiently(() => g('POST', `${FB}/projects/${ctx.id}/webApps`, { project: ctx.id, body: { displayName: 'Heresay dashboard' } }), { forMs: 90_000 });
  const app = await op(FB, o, { project: ctx.id });
  return app.appId;
}

export async function signIn(ctx, say) {
  const appId = await webApp(ctx, say);
  const methods = [];

  say('Switching on Google sign-in');
  try {
    const o = await patiently(() => g('POST', 'https://firebase.googleapis.com/v1alpha/firebase:provisionFirebaseApp', {
      project: ctx.id,
      body: {
        appNamespace: appId, displayName: 'Heresay dashboard', parent: `projects/${ctx.id}`, webInput: {},
        firebaseAuthInput: {
          emailAuthProviderMode: 'PROVIDER_ENABLED',
          googleSigninProviderMode: 'PROVIDER_ENABLED',
          googleSigninProviderConfig: {
            publicDisplayName: `Heresay ${ctx.name}`.slice(0, 30),
            // Google requires the signed-in account (or a group it manages) here.
            customerSupportEmail: ctx.account ?? ctx.owner,
            // The firebaseapp.com handler is added by Google itself; listing it again is an error.
            oauthRedirectUris: [`https://${ctx.id}.web.app/__/auth/handler`],
          },
        },
      },
    }), { forMs: 60_000 });
    await op(FB, o, { project: ctx.id, timeoutMs: 3 * 60_000 });
    methods.push('Google');
  } catch (e) {
    // Without Google, email links still work; set Auth up the plain way.
    await g('POST', `https://identitytoolkit.googleapis.com/v2/projects/${ctx.id}/identityPlatform:initializeAuth`, { project: ctx.id, body: {} })
      .catch((x) => { if (x.status !== 409 && !/already/i.test(x.message)) throw x; });
    ctx.googleError = e.message;
  }

  // Email links: for teammates without a Google account.
  say('Switching on email links');
  await patiently(() => g('PATCH', `${IDT}/projects/${ctx.id}/config?updateMask=signIn.email.enabled,signIn.email.passwordRequired`, {
    project: ctx.id, body: { signIn: { email: { enabled: true, passwordRequired: false } } },
  }), { forMs: 90_000 }).then(() => methods.push('email links')).catch((e) => {
    if (!methods.length) {
      throw new StepError(`Sign-in couldn’t be switched on (${e.message}).`,
        `Open https://console.firebase.google.com/project/${ctx.id}/authentication, click Get started, then run this again.`);
    }
  });
  return methods.join(' and ');
}

// ---- 6. owner ---------------------------------------------------------------------------

const str = (v) => ({ stringValue: v });

export async function owner(ctx) {
  const doc = `${FS}/projects/${ctx.id}/databases/(default)/documents/meta/instance`;
  const at = new Date().toISOString();
  const member = (email) => ({ mapValue: { fields: { email: str(email), role: str('owner'), added_at: str(at), added_by: { nullValue: null } } } });
  const email = ctx.owner.trim().toLowerCase();
  const cur = await patiently(() => g('GET', doc, { missingOk: true }), { forMs: 120_000 });
  if (!cur) {
    await g('PATCH', `${doc}?currentDocument.exists=false`, {
      body: { fields: { created_at: str(at), members: { arrayValue: { values: [member(email)] } } } },
    });
    return email;
  }
  const values = cur.fields?.members?.arrayValue?.values ?? [];
  if (values.some((v) => v.mapValue?.fields?.email?.stringValue === email)) return email;
  // Whoever owns the Google project can always make themselves an owner of its Heresay.
  await g('PATCH', `${doc}?updateMask.fieldPaths=members&currentDocument.updateTime=${encodeURIComponent(cur.updateTime)}`, {
    body: { fields: { members: { arrayValue: { values: [...values, member(email)] } } } },
  });
  return email;
}

// ---- 7. deploy --------------------------------------------------------------------------

export async function deploy(ctx, say) {
  const dir = prepareRelease(ctx);
  say('Installing the API’s dependencies');
  const inst = await npm(['install', '--omit=dev', '--no-audit', '--no-fund'], { cwd: join(dir, 'functions') });
  if (inst.code !== 0) throw new StepError('Installing the API’s dependencies failed.', 'Check your internet connection and run this again.');

  for (let attempt = 1; ; attempt++) {
    say(attempt === 1 ? 'Uploading the dashboard, API and SDK' : `Trying the deploy again (${attempt} of 3)`);
    // Deploy output interleaves; only ever move the status line forward.
    const phases = [
      [/firestore.*rules/i, 'Locking the database'],
      [/functions:.*(creating|updating|building|source uploaded)/i, 'Building the API (the slow part, a few minutes)'],
      [/hosting.*(uploading|found \d+ files|file upload)/i, 'Uploading the dashboard'],
      [/release complete|Deploy complete/i, 'Finishing up'],
    ];
    let at = -1;
    const r = await firebase(['deploy', '--only', 'hosting,functions,firestore', '--project', ctx.id, '--non-interactive', '--force'], {
      cwd: dir,
      onLine: (l) => {
        const i = phases.findIndex(([re]) => re.test(l));
        if (i > at) { at = i; say(phases[i][1]); }
      },
    });
    if (r.code === 0) return `dashboard, API, SDK`;
    // A new project's build service account can take a minute or two to get its permissions.
    if (attempt < 3 && /build service account|permission|403|429|Quota exceeded|RESOURCE_EXHAUSTED|Internal error|Build failed|retry|unavailable/i.test(r.out)) {
      say('Google is still setting up the project; waiting a minute');
      await new Promise((res) => setTimeout(res, 60_000));
      continue;
    }
    throw new StepError(`Deploy failed: ${deployError(r.out)}`, 'Your project is fine. Run the same command to try again.');
  }
}

// ---- 8. verify --------------------------------------------------------------------------

export async function verify(ctx, say) {
  const base = `https://${ctx.id}.web.app`;
  say('Calling the API');
  const until = Date.now() + 3 * 60_000;
  for (;;) {
    try {
      const h = await (await fetch(`${base}/v1/health`)).json();
      const app = await fetch(`${base}/app/`);
      if (h.ok && app.ok) return `API ${h.version}, dashboard loads`;
    } catch { /* hosting can take a moment to answer on a new site */ }
    if (Date.now() > until) {
      throw new StepError(`${base} isn’t answering yet.`, 'New sites can take a few minutes. Run npx create-heresay status in a little while.');
    }
    await new Promise((r) => setTimeout(r, 5000));
  }
}

// ---- remove -----------------------------------------------------------------------------

export async function remove(id) {
  await g('PUT', `${BILLING}/projects/${id}/billingInfo`, { body: { billingAccountName: '' } }).catch(() => {});
  await g('DELETE', `${CRM}/projects/${id}`);
}

export { GoogleError };
