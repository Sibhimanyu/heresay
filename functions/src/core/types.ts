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
}

export interface Report {
  id: string;
  project_id: string;
  device_id: string;
  type: ReportType;
  text: string;
  context: ReportContext;
  status: ReportStatus;
  decline_reason: string | null;
  created_at: string;
  updated_at: string;
  triaged_by: string | null;
}

export interface Project {
  id: string;
  name: string;
  /** Public. It goes in the host app's HTML. It identifies, it does not authorise triage. */
  key: string;
  owner_uid: string;
  /** Where the SDK may be embedded. Empty means any origin. */
  allowed_origins: string[];
  created_at: string;
}

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
  note: string | null;    // what the accepter added
  accepted_by: string;
  accepted_at: string;
}

/** What the reporter's device gets back. No other device's reports, no triager identity. */
export interface ReporterView {
  id: string;
  type: ReportType;
  text: string;
  status: ReportStatus;
  decline_reason: string | null;
  created_at: string;
  updated_at: string;
}

export const toReporterView = (r: Report): ReporterView => ({
  id: r.id, type: r.type, text: r.text, status: r.status,
  decline_reason: r.decline_reason, created_at: r.created_at, updated_at: r.updated_at,
});

export const LIMITS = {
  textMax: 2000,
  contextFieldMax: 200,
  deviceIdMin: 16,
  deviceIdMax: 64,
  reasonMax: 1000,
} as const;
