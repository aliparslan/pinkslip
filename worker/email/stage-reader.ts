import type { DetectedStage } from "../../shared/email-tracking";
import { aiBudgetStatus } from "../ai-budget";
import { askJev, jevChoice, type JevRunner } from "../jev";
import type { Env } from "../types";
import type { EmailContent } from "./rules";

/*
 * The AI fallback (Decisions: Email tracking #2): only for an email that
 * passed the hiring check but that the rules couldn't place, and only within
 * the monthly AI budget. Mail is never sent to AI otherwise. Jev reads the
 * sender, subject and the start of the text; nothing is kept but the step.
 */

export const EMAIL_STAGE_QUESTIONS = {
  stage: jevChoice(
    "This email reached a job seeker. Which step of their own job application does it report? Choose none for job alerts, newsletters, marketing, recruiter cold outreach, reminders to finish an application, or a bare \"your status changed, sign in to see it\".",
    {
      applied: "The company confirms it received their application.",
      assessment: "They're asked to complete an assessment, coding test, take-home or recorded video interview.",
      interview: "They're invited to, or confirmed for, an interview, screen or call with the company.",
      offer: "The company offers them the job.",
      rejected: "The company won't move forward with their application.",
      none: "None of these: the email reports no step in their application.",
    }
  ),
};

/** Calls a day across everyone; a runaway forwarding loop stops here. */
export const EMAIL_AI_DAILY_LIMIT = 200;
/** How sure Jev must be to record a step it read. */
const MIN_PROBABILITY = 0.7;
/** The text Jev sees: enough for any job email, little else. */
const MAX_TEXT = 4000;

export async function readStageWithAi(
  env: Env,
  email: EmailContent,
  now = new Date(),
  ai: JevRunner | undefined = env.AI as unknown as JevRunner | undefined
): Promise<DetectedStage | null> {
  if (!ai) return null;
  if ((await aiBudgetStatus(env, now)).exhausted) return null;
  const day = now.toISOString().slice(0, 10);
  // Claim a call first, so the daily limit holds when emails arrive together.
  const claimed = await env.DB.prepare(
    `INSERT INTO classification_daily_budget (day, calls, reported_cost_usd, email_calls)
     VALUES (?, 0, 0, 1)
     ON CONFLICT(day) DO UPDATE SET email_calls = email_calls + 1
     WHERE classification_daily_budget.email_calls < ?
     RETURNING email_calls`
  ).bind(day, EMAIL_AI_DAILY_LIMIT).first<{ email_calls: number }>();
  if (!claimed) return null;

  try {
    const result = await askJev({
      from: `${email.from.name} <${email.from.address}>`,
      subject: email.subject,
      text: email.text.slice(0, MAX_TEXT),
    }, EMAIL_STAGE_QUESTIONS, ai, "feature:email-stage");
    if (result.costUsd) {
      await env.DB.prepare("UPDATE classification_daily_budget SET reported_cost_usd = reported_cost_usd + ? WHERE day = ?")
        .bind(result.costUsd, day).run();
    }
    const answer = result.answers.stage!;
    const probability = answer.probabilities?.[answer.choice];
    if (answer.choice === "none" || (probability !== undefined && probability < MIN_PROBABILITY)) return null;
    return answer.choice as DetectedStage;
  } catch (error) {
    console.error("Email stage fallback failed:", error instanceof Error ? error.message : String(error));
    return null;
  }
}
