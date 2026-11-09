import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from "cloudflare:workers";
import type { Env } from "../types";
import { enterSendCode, expireSendCode, failSend, queueFromTrigger, releaseKeptBrowser, runSend, sendsTurn } from "./sends";

type SendParams = { send_id?: string; email?: string; job?: string; dry_run?: boolean };

const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

/** How often a send behind another to its company looks again, and how many
 * times: 20 minutes, a little over two full waits for a code. */
const TURN_CHECK = "15 seconds";
const TURN_CHECKS = 80;

/**
 * One auto-apply send, as a Workflow so it outlives the request and can wait
 * for the code Greenhouse emails, or keep a checked form open for the send
 * after it. The instance id is the send's id.
 *
 * The browser step may run again after a failure; `runSend` makes that safe
 * (a send that died while submitting is recorded as unconfirmed, never
 * submitted twice). Entering the code never runs twice.
 */
export class ApplySendWorkflow extends WorkflowEntrypoint<Env, SendParams> {
  async run(event: Readonly<WorkflowEvent<SendParams>>, step: WorkflowStep) {
    const sendId = event.instanceId;
    if (!event.payload.send_id) {
      // Started with `wrangler workflows trigger`: queue it first.
      const queued = await step.do("queue", { retries: { limit: 2, delay: "5 seconds" } },
        () => queueFromTrigger(this.env, sendId, event.payload));
      if (!queued.ok) return queued;
    }

    for (let check = 0; check < TURN_CHECKS; check += 1) {
      const turn = await step.do(`its turn? ${check}`, { retries: { limit: 2, delay: "5 seconds" } }, () => sendsTurn(this.env, sendId));
      if (turn) break;
      await step.sleep(`the send ahead ${check}`, TURN_CHECK);
    }

    let sent;
    try {
      sent = await step.do("open, fill and submit", { retries: { limit: 2, delay: "30 seconds", backoff: "constant" }, timeout: "8 minutes" },
        () => runSend(this.env, sendId));
    } catch (error) {
      return step.do("record the failure", () => failSend(this.env, sendId, message(error)));
    }
    if ((sent.outcome === "ready" || sent.outcome === "needs_you") && sent.session_id) {
      // Check first, or a stop on questions: the filled form stays open for
      // Send, or for the answers, to carry on in. Then it's let go, unless a
      // send took it over.
      await step.sleep("keep the filled form open", "9 minutes");
      return step.do("let the form go", () => releaseKeptBrowser(this.env, sendId));
    }
    if (sent.outcome !== "code_needed") return sent;

    let code: string | null = null;
    try {
      const received = await step.waitForEvent<{ code?: string }>("wait for the emailed code", { type: "code", timeout: "9 minutes" });
      code = typeof received.payload?.code === "string" ? received.payload.code.trim() : null;
    } catch {
      // Timed out. Browser Run keeps the browser for ten minutes at most.
    }
    if (!code) return step.do("give up on the code", () => expireSendCode(this.env, sendId));
    try {
      return await step.do("enter the code", { retries: { limit: 0, delay: 0 }, timeout: "3 minutes" },
        () => enterSendCode(this.env, sendId, code));
    } catch (error) {
      return step.do("record the code failure", () => failSend(this.env, sendId, message(error)));
    }
  }
}
