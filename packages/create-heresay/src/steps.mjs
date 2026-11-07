/**
 * The build steps of a Heresay. Each one checks before it acts, so running setup again after
 * a failure picks up where it stopped instead of creating a second of anything.
 *
 * ctx: { id, name, region, billing, owner, version }. `say(text)` updates the spinner line.
 */
import { chmodSync, cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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

/** The hosting site id: the project id unless HERESAY_SITE names another site in the project. */
/**
 * The hosting site: HERESAY_SITE if set, else the one this Heresay was last deployed to (saved in
 * ~/.heresay), else the project's default site. So `update` from a laptop reaches the same site
 * CI deploys to, instead of the default one.
 */
export const siteOf = (ctx) => process.env.HERESAY_SITE || ctx.site || ctx.id;
/** Serve only the named site (the default one retired): HERESAY_ONLY_SITE=1, or saved from a deploy that set it. */
export const onlySite = (ctx) => process.env.HERESAY_ONLY_SITE === '1' || !!ctx.onlySite;

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
  // On a named site, keep serving the project's default site too: apps already shipped with its
  // address, and repos already connected to it, must keep working. HERESAY_ONLY_SITE=1 opts out
  // for an instance that has retired the default address.
  if (siteOf(ctx) !== ctx.id) {
    cfg.hosting = onlySite(ctx)
      ? { ...cfg.hosting, site: siteOf(ctx) }
      : [{ ...cfg.hosting, site: siteOf(ctx) }, { ...cfg.hosting, site: ctx.id }];
  }
  writeFileSync(join(dir, 'firebase.json'), JSON.stringify(cfg, null, 2) + '\n');
  writeFileSync(join(dir, '.firebaserc'), JSON.stringify({ projects: { default: ctx.id } }, null, 2) + '\n');
  // HERESAY_SITE: the API names this site (not the default one) in OAuth discovery and alert links.
  writeFileSync(join(dir, 'functions', '.env'), `HERESAY_REGION=${ctx.region}\n${siteOf(ctx) !== ctx.id ? `HERESAY_SITE=${siteOf(ctx)}\n` : ''}`);
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
            oauthRedirectUris: [`https://${siteOf(ctx)}.web.app/__/auth/handler`],
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
  const base = `https://${siteOf(ctx)}.web.app`;
  say('Calling the API');
  const until = Date.now() + 3 * 60_000;
  for (;;) {
    try {
      const h = await (await fetch(`${base}/v1/health`)).json();
      // The dashboard is the site's root page; check it really is the dashboard, not a leftover page.
      const app = await fetch(`${base}/`);
      if (h.ok && app.ok && (await app.text()).includes('/dashboard.js')) return `API ${h.version}, dashboard loads`;
    } catch { /* hosting can take a moment to answer on a new site */ }
    if (Date.now() > until) {
      throw new StepError(`${base} isn’t answering yet.`, 'New sites can take a few minutes. Run npx create-heresay status in a little while.');
    }
    await new Promise((r) => setTimeout(r, 5000));
  }
}

// ---- Lite: Spark plan, the API on a host you choose -------------------------------------
//
// No billing account and no Cloud Functions. Firestore and Auth stay on Firebase; the same API
// runs from functions/lib/providers/firebase/node-server.js on any Node host. See docs/lite.md.

const LITE_SERVICES = ['firestore.googleapis.com', 'identitytoolkit.googleapis.com', 'firebaserules.googleapis.com', 'iam.googleapis.com'];
const IAM = 'https://iam.googleapis.com/v1';

export async function liteServices(ctx, say) {
  say('Switching on Firestore and Auth');
  const o = await patiently(() => g('POST', `${SU}/projects/${ctx.id}/services:batchEnable`, { body: { serviceIds: LITE_SERVICES } }), { forMs: 90_000 });
  await op(SU, o, { timeoutMs: 6 * 60_000 });
  return 'Firestore, Auth';
}

/** Email-link sign-in, and the host's address allowed to use it. */
export async function liteSignIn(ctx, say) {
  await webApp(ctx, say);
  say('Switching on email links');
  await g('POST', `https://identitytoolkit.googleapis.com/v2/projects/${ctx.id}/identityPlatform:initializeAuth`, { project: ctx.id, body: {} })
    .catch((x) => { if (x.status !== 409 && !/already/i.test(x.message)) throw x; });
  await patiently(() => g('PATCH', `${IDT}/projects/${ctx.id}/config?updateMask=signIn.email.enabled,signIn.email.passwordRequired`, {
    project: ctx.id, body: { signIn: { email: { enabled: true, passwordRequired: false } } },
  }), { forMs: 90_000 }).catch((e) => {
    throw new StepError(`Sign-in couldn’t be switched on (${e.message}).`,
      `Open https://console.firebase.google.com/project/${ctx.id}/authentication, click Get started, then run this again.`);
  });
  say('Allowing ' + new URL(ctx.origin).hostname);
  const cfg = await patiently(() => g('GET', `${IDT}/projects/${ctx.id}/config`, { project: ctx.id }), { forMs: 90_000 });
  const domains = new Set(cfg.authorizedDomains ?? []);
  domains.add(new URL(ctx.origin).hostname);
  await g('PATCH', `${IDT}/projects/${ctx.id}/config?updateMask=authorizedDomains`, { project: ctx.id, body: { authorizedDomains: [...domains] } });
  return 'email links, ' + new URL(ctx.origin).hostname;
}

/** What the host needs: the runtime files, and one env file with everything it reads. */
export async function liteDeploy(ctx, say) {
  const dir = workDir(ctx.id);
  mkdirSync(dir, { recursive: true });
  for (const f of readdirSync(dir)) if (!['service-account.json', 'lite.env'].includes(f)) rmSync(join(dir, f), { recursive: true, force: true });
  cpSync(RELEASE, dir, { recursive: true });
  writeFileSync(join(dir, 'firebase.json'), JSON.stringify({ firestore: { rules: 'firestore.rules', indexes: 'firestore.indexes.json' } }, null, 2) + '\n');
  writeFileSync(join(dir, '.firebaserc'), JSON.stringify({ projects: { default: ctx.id } }, null, 2) + '\n');
  writeFileSync(join(dir, 'Dockerfile'), [
    'FROM node:22-slim',
    'ENV NODE_ENV=production PORT=8080 HERESAY_TRUST_PROXY=1',
    'WORKDIR /app',
    'COPY functions/package.json functions/package-lock.json ./functions/',
    'RUN npm --prefix functions ci --omit=dev',
    'COPY functions/lib ./functions/lib',
    'COPY public ./public',
    'USER node',
    'EXPOSE 8080',
    'CMD ["node", "functions/lib/providers/firebase/node-server.js"]',
    '',
  ].join('\n'));

  for (let attempt = 1; ; attempt++) {
    say(attempt === 1 ? 'Locking the database' : `Trying again (${attempt} of 3)`);
    const r = await firebase(['deploy', '--only', 'firestore', '--project', ctx.id, '--non-interactive', '--force'], { cwd: dir });
    if (r.code === 0) break;
    if (attempt < 3 && /permission|403|429|RESOURCE_EXHAUSTED|Internal error|retry|unavailable/i.test(r.out)) {
      say('Google is still setting up the project; waiting a minute');
      await new Promise((res) => setTimeout(res, 60_000));
      continue;
    }
    throw new StepError(`Deploy failed: ${deployError(r.out)}`, 'Your project is fine. Run the same command to try again.');
  }

  const keyPath = join(dir, 'service-account.json');
  if (!existsSync(keyPath)) {
    say('Creating the server’s key');
    const list = await patiently(() => g('GET', `${IAM}/projects/${ctx.id}/serviceAccounts`, { project: ctx.id }), { forMs: 120_000 });
    const sa = (list.accounts ?? []).find((a) => a.email.startsWith('firebase-adminsdk'));
    if (!sa) throw new StepError('The Firebase service account isn’t there yet.', 'Give it a minute and run this again.');
    let key;
    try {
      key = await g('POST', `${IAM}/${sa.name}/keys`, { project: ctx.id, body: {} });
    } catch (e) {
      throw new StepError(`Google wouldn’t create a key for the server (${e.message}).`,
        'An organisation policy may block service-account keys. Create the key by hand in the Firebase console (Project settings, Service accounts), save it as service-account.json in ' + dir + ', and run this again.');
    }
    writeFileSync(keyPath, Buffer.from(key.privateKeyData, 'base64'), { mode: 0o600 });
  }
  chmodSync(keyPath, 0o600);

  say('Reading the web config');
  const appId = await webApp(ctx, () => {});
  const web = await patiently(() => g('GET', `${FB}/projects/${ctx.id}/webApps/${appId}/config`, { project: ctx.id }), { forMs: 90_000 });
  const config = { apiKey: web.apiKey, authDomain: web.authDomain, projectId: web.projectId, appId: web.appId, messagingSenderId: web.messagingSenderId };
  const oneLine = (v) => JSON.stringify(v);
  writeFileSync(join(dir, 'lite.env'), [
    `HERESAY_ORIGIN=${ctx.origin}`,
    `GCLOUD_PROJECT=${ctx.id}`,
    `HERESAY_FIREBASE_CONFIG=${oneLine(config)}`,
    `GOOGLE_APPLICATION_CREDENTIALS_JSON=${oneLine(JSON.parse(readFileSync(keyPath, 'utf8')))}`,
    '',
  ].join('\n'), { mode: 0o600 });
  return dir;
}

export async function liteVerify(ctx) {
  try {
    const h = await (await fetch(`${ctx.origin}/v1/health`, { signal: AbortSignal.timeout(8000) })).json();
    if (h.ok) return `running, version ${h.version}`;
  } catch { /* not started yet, which is expected on first setup */ }
  return 'ready for your host';
}

// ---- remove -----------------------------------------------------------------------------

export async function remove(id) {
  await g('PUT', `${BILLING}/projects/${id}/billingInfo`, { body: { billingAccountName: '' } }).catch(() => {});
  await g('DELETE', `${CRM}/projects/${id}`);
}

export { GoogleError };
