/**
 * What the reporter says the thing IS.
 *
 * The reporter picks what they can actually judge. Someone using the app cannot rank their
 * report against work they have never seen, so asking for a priority produces a list where
 * everything is urgent. They CAN say whether it is broken or would just be better, and that
 * carries the urgency. Priority is derived from it (REPORT_ORDER), never asked for.
 */
export type ReportType =
  | 'broken'       // it does not work
  | 'confusing'    // it works, and I could not tell how
  | 'improvement'  // it works, and it could be better
  | 'idea';        // it does not exist yet

export const REPORT_TYPES: readonly ReportType[] = ['broken', 'confusing', 'improvement', 'idea'];

export const isReportType = (v: unknown): v is ReportType =>
  typeof v === 'string' && (REPORT_TYPES as readonly string[]).includes(v);

/**
 * Most urgent first. `confusing` above `improvement` on purpose: a feature nobody can operate
 * is closer to broken than to imperfect.
 */
export const REPORT_ORDER: Record<ReportType, number> = {
  broken: 0, confusing: 1, improvement: 2, idea: 3,
};

/**
 * open -> accepted -> fixed, or open -> declined (with a reason). The reporter sees all four.
 */
export type ReportStatus = 'open' | 'accepted' | 'fixed' | 'declined';

/** Attached by the SDK, not typed by the reporter. Every field is optional and length-capped. */
export interface ReportContext {
  route: string | null;
  app_version: string | null;
  platform: string | null;     // 'web', 'ios'
  os: string | null;           // 'macOS 15.1', 'iOS 18.0'
  browser: string | null;
  user_id: string | null;      // from the host app, if it chose to say
  user_label: string | null;
  /** What the SDK saw on the page ('next', 'nuxt', ...). Fills in an app's framework. */
  framework: string | null;
  /** The page the report was sent from. Web only; older SDKs leave them out. */
  page_title?: string | null;
  page_url?: string | null;   // origin + path + hash, never the query string
  viewport?: string | null;   // '1280x720'
}

/**
 * What the reporter chose to say about themselves, in the SDK's Preferences. Typed by the
 * reporter, so untrusted like the report text, and optional: nobody has to fill it in. Kept
 * apart from `context` (which the SDK attaches) and from user_id/user_label (which the host
 * app asserts), so the dashboard can say who claimed what.
 */
export interface ReporterPrefs {
  name: string | null;
  /** Only if they want to be contacted. Never shown to a coding agent. */
  email: string | null;
  /** A standing note sent with every report: "I use a screen reader", "on slow Wi-Fi". */
  note: string | null;
}

/** Frameworks the web SDK can recognise on a page. */
export const FRAMEWORKS = ['html', 'react', 'next', 'vue', 'nuxt', 'svelte', 'angular', 'swiftui', 'uikit', 'appkit'] as const;
export const isFramework = (v: unknown): v is (typeof FRAMEWORKS)[number] =>
  typeof v === 'string' && (FRAMEWORKS as readonly string[]).includes(v);

export interface Report {
  id: string;
  project_id: string;
  device_id: string;
  type: ReportType;
  text: string;
  context: ReportContext;
  /** null when the reporter set no preferences. */
  reporter?: ReporterPrefs | null;
  status: ReportStatus;
  decline_reason: string | null;
  /** What was done, in words for the reporter. Set when marked fixed. */
  fix_note?: string | null;
  created_at: string;
  updated_at: string;
  triaged_by: string | null;
}

/** What kind of app a project is. Decides the SDK and the install steps. */
export type Platform = 'web' | 'ios' | 'macos' | 'android' | 'react-native' | 'flutter';
export const PLATFORMS: readonly Platform[] = ['web', 'ios', 'macos', 'android', 'react-native', 'flutter'];
export const isPlatform = (v: unknown): v is Platform =>
  typeof v === 'string' && (PLATFORMS as readonly string[]).includes(v);

/** One app that reports come from. The dashboard calls these "apps". */
export interface Project {
  id: string;
  name: string;
  platform: Platform;
  /** e.g. 'next', 'react', 'html'. Shapes the install steps; optional. */
  framework: string | null;
  /** True when the framework came from the SDK rather than from a person. */
  framework_detected?: boolean;
  /** The SDK was last seen running in the app: proof the install works, with no test report. */
  sdk_seen?: { at: string; where: string; sdk: string | null } | null;
  /** A coding agent found the app's key in a repo's code (`heresay check`). */
  code_found?: { at: string; repo: string; file: string } | null;
  /** Public. It goes in the host app's HTML. It identifies, it does not authorise triage. */
  key: string;
  /** Where the SDK may be embedded. Empty means any origin. Web only. */
  allowed_origins: string[];
  /** Email of the team member who added it. */
  created_by: string;
  created_at: string;
}

/**
 * One Heresay install belongs to one team. `create-heresay` writes the first owner; owners
 * invite the rest. Membership is by verified email, so signing in is all a teammate does.
 */
export type Role = 'owner' | 'member';
export interface Member { email: string; role: Role; added_at: string; added_by: string | null }
export interface Instance { members: Member[]; created_at: string }

/**
 * The ONLY thing a coding agent is ever handed. Written by `accept` and by nothing else, so a
 * reporter's words reach an agent only after a person has read them and said yes. This is a
 * separate collection, not a status filter over reports: no query bug can leak an open report
 * into an agent prompt, because open reports are not in here.
 */
export interface Task {
  id: string;             // same as the report id
  project_id: string;
  report_id: string;
  type: ReportType;
  text: string;
  context: ReportContext;
  /** The reporter's standing note, if any. Their name and email stay out of briefs. */
  reporter_note?: string | null;
  note: string | null;    // what the accepter added
  accepted_by: string;
  accepted_at: string;
  /**
   * Which repo the fix goes in, chosen at accept time or by a handoff. null: any repo
   * connected to the app may take it.
   */
  repo?: string | null;
  /** An agent working on it. Others skip it until the claim goes stale (CLAIM_TTL_MS). */
  claim?: { repo: string; at: string } | null;
  /** Private to the team: progress notes and handoffs. Never shown to the reporter. */
  notes?: TaskNote[];
}

export interface TaskNote { by: string; at: string; text: string; kind: 'note' | 'handoff' }

/** A claim nobody has touched for this long is dropped, so a crashed agent can't block a brief. */
export const CLAIM_TTL_MS = 24 * 3600_000;

/**
 * What `npx heresay connect` gives one repo: access to the briefs of the apps whose code is
 * there, and nothing else. The secret is shown once; only its hash is stored.
 */
export interface AgentToken {
  id: string;             // the public half: hst_<id>_<secret>
  secret_hash: string;
  /**
   * e.g. 'github.com/acme/web'. null until first used: a token made for a copy-paste prompt
   * binds to whichever repo runs `heresay connect` with it first, and only that one after.
   */
  repo: string | null;
  app_ids: string[];
  created_by: string;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
}

/** What the reporter's device gets back. No other device's reports, no triager identity. */
export interface ReporterView {
  id: string;
  type: ReportType;
  text: string;
  status: ReportStatus;
  decline_reason: string | null;
  fix_note: string | null;
  created_at: string;
  updated_at: string;
}

export const toReporterView = (r: Report): ReporterView => ({
  id: r.id, type: r.type, text: r.text, status: r.status,
  decline_reason: r.decline_reason, fix_note: r.fix_note ?? null,
  created_at: r.created_at, updated_at: r.updated_at,
});

export const LIMITS = {
  textMax: 2000,
  contextFieldMax: 200,
  deviceIdMin: 16,
  deviceIdMax: 64,
  reasonMax: 1000,
  repoMax: 200,
  nameMax: 80,
  emailMax: 200,
  noteMax: 500,
} as const;
