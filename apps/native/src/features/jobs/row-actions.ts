import { ArrowCounterClockwise, BookmarkSimple, CheckCircle, EyeSlash, X } from "phosphor-react-native";
import type { MenuItem, SwipeAction } from "../../kit";
import type { JobActions, RowJob } from "./useJobActions";

/** A row's full swipe each way and its long-press menu. The feed's right
 * swipe toggles Save and Library's moves a saved job to applied; the left
 * swipe hides, removes or undoes. */
export function rowActions(job: RowJob, actions: JobActions, viewed: boolean) {
  const saved = Boolean(job.saved);
  const applied = Boolean(job.applied);
  const { save, unsave, markApplied, unmarkApplied, toggleRead, hide, block } = actions;

  const leading: SwipeAction | null = save && !saved ? { label: "Save", icon: BookmarkSimple, symbol: "save", tone: "accent", run: () => save(job) }
    : save && unsave && saved ? { label: "Unsave", icon: BookmarkSimple, symbol: "saved", tone: "neutral", run: () => unsave(job) }
    : markApplied && !applied ? { label: "Applied", icon: CheckCircle, symbol: "applied", tone: "accent", removes: true, run: () => markApplied(job) } : null;
  const trailing: SwipeAction | null = hide ? { label: "Hide", icon: EyeSlash, symbol: "hide", tone: "bad", removes: true, run: () => hide(job) }
    : unsave && saved ? { label: "Remove", icon: X, symbol: "remove", tone: "bad", removes: true, run: () => unsave(job) }
    : unmarkApplied && applied ? { label: "Didn't apply", icon: ArrowCounterClockwise, symbol: "undo", tone: "neutral", removes: true, run: () => unmarkApplied(job) } : null;

  const items: (MenuItem | false | undefined)[] = [
    save && !saved && { id: "save", title: "Save", icon: "bookmark", onSelect: () => save(job) },
    unsave && saved && { id: "unsave", title: "Remove from saved", icon: "bookmark.slash", onSelect: () => unsave(job) },
    markApplied && !applied && { id: "applied", title: "I applied", icon: "checkmark.circle", onSelect: () => markApplied(job) },
    unmarkApplied && applied && { id: "unapplied", title: "I didn't apply", icon: "arrow.uturn.backward", onSelect: () => unmarkApplied(job) },
    toggleRead && { id: "read", title: viewed ? "Mark as unread" : "Mark as read", icon: viewed ? "envelope.badge" : "envelope.open", onSelect: () => toggleRead(job, !viewed) },
    hide && { id: "hide", title: "Hide", icon: "eye.slash", onSelect: () => hide(job) },
    block && { id: "block", title: "Block for everyone", icon: "nosign", destructive: true, onSelect: () => block(job) },
  ];
  const menu = items.filter((item): item is MenuItem => Boolean(item));

  return { leading, trailing, menu };
}
