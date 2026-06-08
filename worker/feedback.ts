export const FEEDBACK_TYPES = [
  "company_request",
  "feature_request",
  "general_feedback",
] as const;

export type FeedbackType = (typeof FEEDBACK_TYPES)[number];

export interface FeedbackInput {
  submission_type?: string;
  title?: string;
  details?: string;
  careers_url?: string;
}

export type FeedbackValidationResult =
  | {
      ok: true;
      value: {
        submission_type: FeedbackType;
        title: string;
        details: string;
        careers_url: string | null;
      };
    }
  | { ok: false; error: string };

export function validateFeedbackInput(input: FeedbackInput): FeedbackValidationResult {
  if (!FEEDBACK_TYPES.includes(input.submission_type as FeedbackType)) {
    return { ok: false, error: "Choose a valid feedback type" };
  }

  const title = input.title?.trim() ?? "";
  if (title.length < 2 || title.length > 160) {
    return { ok: false, error: "Title must be between 2 and 160 characters" };
  }

  const details = input.details?.trim() ?? "";
  if (details.length > 2000) {
    return { ok: false, error: "Details must be 2,000 characters or fewer" };
  }

  const rawCareersUrl = input.careers_url?.trim() ?? "";
  let careersUrl: string | null = null;
  if (rawCareersUrl) {
    try {
      const parsed = new URL(rawCareersUrl);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        return { ok: false, error: "Careers URL must start with http:// or https://" };
      }
      careersUrl = parsed.toString();
    } catch {
      return { ok: false, error: "Enter a valid careers URL" };
    }
  }

  if (input.submission_type !== "company_request" && careersUrl) {
    return { ok: false, error: "Careers URLs are only used for company requests" };
  }

  return {
    ok: true,
    value: {
      submission_type: input.submission_type as FeedbackType,
      title,
      details,
      careers_url: careersUrl,
    },
  };
}

