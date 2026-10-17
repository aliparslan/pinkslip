/**
 * Sends the app's unexpected JavaScript errors to the API's errors table
 * (`POST /errors`; docs/backend-inventory-2026-10-16.md, Decisions: Admin #1).
 * Each kind goes once per launch, ten at most, and a report that can't be
 * sent is dropped: reporting must never become a second failure.
 */

export interface ErrorReportBody {
  name: string;
  message: string;
  stack?: string;
  route: string;
  build?: string;
}

export interface ErrorReporterOptions {
  /** POSTs the JSON body to `/errors` (the API client's `fetchApi`). */
  send(body: string): Promise<unknown>;
  /** The screen the person is on. */
  route(): string;
  build?: string;
}

/** Most reports a launch sends; past it, the page or app is too broken to add news. */
const MAX_REPORTS = 10;

export function describeError(error: unknown): { name: string; message: string; stack?: string } {
  if (error instanceof Error) {
    return { name: error.name || "Error", message: error.message, stack: error.stack };
  }
  if (typeof error === "string") return { name: "Error", message: error };
  try {
    return { name: "Error", message: JSON.stringify(error) ?? String(error) };
  } catch {
    return { name: "Error", message: String(error) };
  }
}

/** API answers are recorded by the server; cancellations aren't faults. */
function expected(name: string): boolean {
  return name === "ApiError" || name === "AbortError";
}

export function buildErrorReport(error: unknown, route: string, build?: string): ErrorReportBody | null {
  const { name, message, stack } = describeError(error);
  if (!message || expected(name)) return null;
  return {
    name: name.slice(0, 80),
    message: message.slice(0, 2000),
    ...(stack ? { stack: stack.slice(0, 8000) } : {}),
    route: route.slice(0, 200),
    ...(build ? { build: build.slice(0, 40) } : {}),
  };
}

export function createErrorReporter(options: ErrorReporterOptions) {
  const seen = new Set<string>();
  return (error: unknown): ErrorReportBody | null => {
    const report = buildErrorReport(error, options.route(), options.build);
    if (!report) return null;
    const key = `${report.name}: ${report.message}`.slice(0, 300);
    if (seen.has(key) || seen.size >= MAX_REPORTS) return null;
    seen.add(key);
    try {
      void options.send(JSON.stringify(report)).catch(() => undefined);
    } catch {
      // A broken transport mustn't throw from inside an error handler.
    }
    return report;
  };
}
