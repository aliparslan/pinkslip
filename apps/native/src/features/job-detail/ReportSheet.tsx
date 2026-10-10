import { useReportJob, type ReportType } from "@pinkslip/data";
import { useState } from "react";
import { Button, Field, Select, Sheet, Textarea, toast } from "../../kit";

const reasons: { value: ReportType; label: string }[] = [
  { value: "expired_listing", label: "Listing is closed" },
  { value: "incorrect_details", label: "Details are incorrect" },
  { value: "duplicate_listing", label: "Duplicate listing" },
  { value: "broken_source", label: "Company source is broken" },
  { value: "other", label: "Something else" },
];

/** "Report listing" from the job's menu, as a page sheet. */
export function ReportSheet({ jobId, open, onOpenChange }: { jobId: string; open: boolean; onOpenChange: (open: boolean) => void }) {
  const [type, setType] = useState<ReportType>("incorrect_details");
  const [notes, setNotes] = useState("");
  const report = useReportJob();
  return <Sheet open={open} onOpenChange={onOpenChange} title="Report listing"
    footer={<Button variant="primary" fullWidth pending={report.isPending} onPress={() => report.mutate({ jobId, type, notes: notes.trim() }, {
      onSuccess: () => { onOpenChange(false); setNotes(""); toast.success("Report sent. Thanks for helping keep listings accurate."); },
      onError: () => toast.error("Couldn't send that report. Try again."),
    })}>Send report</Button>}>
    <Field label="Reason"><Select label="Reason" value={type} options={reasons} onValueChange={setType} /></Field>
    <Field label="Details" optional><Textarea value={notes} maxLength={1000} onChangeText={setNotes} /></Field>
  </Sheet>;
}
