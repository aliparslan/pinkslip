/* The buttons on a one-job alert (owner, 2026-11-08): the Worker names the
 * set on each push, and the native handler (apps/native/modules/alert-actions,
 * which repeats these names in Swift) registers the sets and runs the actions
 * without opening the app. */

export const JOB_ALERT_CATEGORY = "job_alert";
/** With Queue: a form Pinkslip can send, for a person who has sends. */
export const JOB_ALERT_QUEUE_CATEGORY = "job_alert_queue";

export const ALERT_SAVE = "alert_save";
export const ALERT_QUEUE = "alert_queue";
export const ALERT_HIDE = "alert_hide";
