import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { Job } from "@pinkslip/core/api";
import { useMarkApplied } from "@pinkslip/data";
import { AlertDialog, toast } from "../../kit";
import { cachedJob } from "../jobs/cached-job";
import { usePromoteVisitor } from "../jobs/useJobActions";
import { dismissApplicationIntent, restoreApplicationIntent, useApplicationIntent } from "./application-return";

/** `ApplicationReturnPrompt.svelte`: back from an application tab, ask
 * whether they applied, so the history stays accurate. Mounted once. */
export function ApplicationReturnPrompt() {
  const intent = useApplicationIntent();
  const queryClient = useQueryClient();
  const markApplied = useMarkApplied();
  const promote = usePromoteVisitor();
  useEffect(() => restoreApplicationIntent(), []);

  return <AlertDialog
    open={intent !== null}
    onOpenChange={(open) => { if (!open) dismissApplicationIntent(); }}
    title="Did you apply?"
    description={intent ? `${intent.title} at ${intent.company}. You can always mark it later from the job page.` : ""}
    confirmLabel="Yes, I applied"
    cancelLabel="Not yet"
    pending={markApplied.isPending}
    onConfirm={() => {
      if (!intent) return;
      // The applied list refetches afterwards, so a partial record is enough here.
      const job = (cachedJob(queryClient, intent.jobId) ?? { id: intent.jobId, title: intent.title, company_name: intent.company }) as Job;
      markApplied.mutate(job, {
        onSuccess: () => {
          dismissApplicationIntent();
          promote();
          toast.success("Added to your applied jobs");
        },
        onError: () => toast.error("Couldn't mark that job as applied. Try again."),
      });
    }}
  />;
}
