import { useKeepWaitingAnswers, useSendWaiting, useWaitingSends } from "@pinkslip/data";
import { useEffect } from "react";
import { SheetModal, toast } from "../../../ui";
import { refusal } from "../send-facts";
import { WaitingSheet, type NeedAnswers } from "./SendSheets";

/**
 * The stopped sends' one sheet (Paper "Stopped sends · Nov 4", W5 to W7),
 * from Today's row or their push. Each answer is kept as it's given; Send
 * all keeps the last one first, then starts them all, and the live bar takes
 * over. One that can't start says why.
 */
export function WaitingSheetModal({ open, onClosed }: { open: boolean; onClosed: () => void }) {
  const waiting = useWaitingSends(open);
  const keep = useKeepWaitingAnswers();
  const send = useSendWaiting();

  // The push can outlive them: dropped, sent, or their day up.
  const gone = open && waiting.isSuccess && !waiting.data;
  useEffect(() => {
    if (!gone) return;
    onClosed();
    toast.show({ message: "Nothing is waiting on you", icon: "done" });
  }, [gone]);

  const sendAll = async (last: NeedAnswers) => {
    try {
      await keep.mutateAsync(last);
      const { failed } = await send.mutateAsync();
      onClosed();
      if (failed.length > 1) toast.error(`${failed.length} didn't start`);
      else if (failed[0]) {
        const outcome = refusal(failed[0].code, failed[0].company);
        toast.error(outcome.kind === "toast" ? outcome.message : `${failed[0].company}'s didn't start`);
      }
    } catch {
      toast.error("Couldn't send them. Try again.");
    }
  };

  return <SheetModal open={open && Boolean(waiting.data)} onClosed={onClosed}>
    {waiting.data
      ? <WaitingSheet waiting={waiting.data} pending={keep.isPending || send.isPending}
        onKeep={(answers) => keep.mutate(answers)} onSendAll={(answers) => void sendAll(answers)} />
      : null}
  </SheetModal>;
}
