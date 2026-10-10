import { useState } from "react";
import { useReportJob, type ReportType } from "@pinkslip/data";
import { Button, Dialog, Field, Select, Stack, Textarea, toast } from "../../kit";

const reasons: { value: ReportType; label: string }[] = [
  { value: "expired_listing", label: "Listing is closed" },
  { value: "incorrect_details", label: "Details are incorrect" },
  { value: "duplicate_listing", label: "Duplicate listing" },
  { value: "broken_source", label: "Company source is broken" },
  { value: "other", label: "Something else" },
];

/** "Report listing" from the job's menu. */
export function ReportDialog({ jobId, open, onOpenChange, onSent }: {
  jobId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSent?: () => void;
}) {
  const [type, setType] = useState<ReportType>("incorrect_details");
  const [notes, setNotes] = useState("");
  const report = useReportJob();
  return <Dialog open={open} onOpenChange={onOpenChange} title="Report listing" size="sm" busy={report.isPending}>
    <Stack gap="4">
      <Field label="Reason">
        <Select value={type} onChange={(event) => setType(event.target.value as ReportType)}>
          {reasons.map((reason) => <option key={reason.value} value={reason.value}>{reason.label}</option>)}
        </Select>
      </Field>
      <Field label="Details" optional>
        <Textarea value={notes} maxLength={1000} onChange={(event) => setNotes(event.target.value)} />
      </Field>
      <Button variant="primary" fullWidth pending={report.isPending} onClick={() => report.mutate({ jobId, type, notes: notes.trim() }, {
        onSuccess: () => {
          onOpenChange(false);
          setNotes("");
          onSent?.();
          toast.success("Report sent. Thanks for helping keep listings accurate.");
        },
        onError: () => toast.error("Couldn't send that report. Try again."),
      })}>Send report</Button>
    </Stack>
  </Dialog>;
}
