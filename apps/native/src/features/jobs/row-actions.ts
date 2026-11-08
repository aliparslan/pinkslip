import { ArrowUUpLeft, BookmarkSimple, CheckCircle, EyeSlash, X } from "phosphor-react-native";
import type { SwipeAction } from "../../kit";
import type { GlyphMenuItem } from "../../ui";
import { queueable } from "../redesign/send-facts";
import type { JobActions, RowJob } from "./useJobActions";

/** A row's full swipe each way and its long-press menu. The feed's right
 * swipe toggles Save and Library's moves a saved job to applied; the left
 * swipe hides, removes or undoes. */
export function rowActions(job: RowJob, actions: JobActions, viewed: boolean) {
  const saved = Boolean(job.saved);
  const applied = Boolean(job.applied);
  const { save, unsave, markApplied, unmarkApplied, toggleRead, hide, block, applyForMe } = actions;
  const sendable = Boolean(applyForMe) && queueable(job);

  const leading: SwipeAction | null = save && !saved ? { label: "Save", icon: BookmarkSimple, symbol: "save", tone: "accent", run: () => save(job) }
    : save && unsave && saved ? { label: "Unsave", icon: BookmarkSimple, symbol: "saved", tone: "neutral", run: () => unsave(job) }
    : markApplied && !applied ? { label: "Applied", icon: CheckCircle, symbol: "applied", tone: "accent", removes: true, run: () => markApplied(job) } : null;
  const trailing: SwipeAction | null = hide ? { label: "Hide", icon: EyeSlash, symbol: "hide", tone: "bad", removes: true, run: () => hide(job) }
    : unsave && saved ? { label: "Remove", icon: X, symbol: "remove", tone: "bad", removes: true, run: () => unsave(job) }
    : unmarkApplied && applied ? { label: "Didn't apply", icon: ArrowUUpLeft, symbol: "undo", tone: "neutral", removes: true, run: () => unmarkApplied(job) } : null;

  const items: (GlyphMenuItem | false | undefined)[] = [
    sendable && { id: "apply_for_me", title: "Apply for me", glyph: "bot", onSelect: () => applyForMe!(job) },
    save && !saved && { id: "save", title: "Save", glyph: "save", onSelect: () => save(job) },
    unsave && saved && { id: "unsave", title: "Remove from saved", glyph: "saved", onSelect: () => unsave(job) },
    markApplied && !applied && { id: "applied", title: "I applied", glyph: "applied", onSelect: () => markApplied(job) },
    unmarkApplied && applied && { id: "unapplied", title: "I didn't apply", glyph: "undo", onSelect: () => unmarkApplied(job) },
    toggleRead && { id: "read", title: viewed ? "Mark as unread" : "Mark as read", glyph: viewed ? "unread" : "read", onSelect: () => toggleRead(job, !viewed) },
    hide && { id: "hide", title: "Hide", glyph: "hide", onSelect: () => hide(job) },
    block && { id: "block", title: "Block for everyone", glyph: "block", destructive: true, onSelect: () => block(job) },
  ];
  const menu = items.filter((item): item is GlyphMenuItem => Boolean(item));

  return { leading, trailing, menu };
}
