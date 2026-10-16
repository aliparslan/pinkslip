import { useReportJob, type ReportType } from "@pinkslip/data";
import { useState } from "react";
import { Keyboard, TextInput, View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { Button, Choice, Choices, faces, SHEET_GROUP_RADIUS, SheetHeader, SheetModal, SheetStep, toast, useSheet, useUiFontsLoaded } from "../../ui";

/** The reasons, in the words a person would use, each with what its note
 * asks for (Paper "Approved", R1 to R3). */
const reasons: { type: ReportType; title: string; note: string }[] = [
  { type: "expired_listing", title: "It's closed", note: "Anything to add?" },
  { type: "incorrect_details", title: "The details are wrong", note: "Which details?" },
  { type: "duplicate_listing", title: "It's listed twice", note: "Where's the other one?" },
  { type: "broken_source", title: "The apply link doesn't work", note: "What happens when you tap it?" },
  { type: "other", title: "Something else", note: "What's wrong with it?" },
];

export interface ReportJobSheetProps {
  jobId: string;
  open: boolean;
  onClosed: () => void;
  /** "It's closed" also takes the job out of your Jobs, as hiding it does. */
  onReportedClosed?: () => void;
  /** The kit's copy: Send closes without sending. */
  sample?: boolean;
}

/**
 * Report a job (owner, 2026-10-15, Paper "Report · Oct 15"): "What's wrong
 * with it?", one group of reasons, then an optional note that asks what fits
 * the reason. Send is grey until a reason is picked. Sent, the sheet closes
 * and the toast says so.
 */
export function ReportJobSheet({ jobId, open, onClosed, onReportedClosed, sample }: ReportJobSheetProps) {
  return <SheetModal open={open} onClosed={onClosed}>
    <ReportStep jobId={jobId} onReportedClosed={onReportedClosed} sample={sample} />
  </SheetModal>;
}

function ReportStep({ jobId, onReportedClosed, sample }: Pick<ReportJobSheetProps, "jobId" | "onReportedClosed" | "sample">) {
  const { theme } = useUnistyles();
  const fonts = useUiFontsLoaded();
  const sheet = useSheet();
  const report = useReportJob();
  const [picked, setPicked] = useState<ReportType | null>(null);
  const [note, setNote] = useState("");
  // Once you start the note, the other reasons fold away so the sheet fits
  // above the keyboard, and stay folded so Send doesn't move under your
  // finger. Tapping the picked reason brings them back.
  const [folded, setFolded] = useState(false);
  const unfold = () => {
    Keyboard.dismiss();
    setFolded(false);
  };
  const reason = reasons.find((option) => option.type === picked);
  const send = () => {
    if (!picked) return;
    if (sample) {
      sheet.close();
      toast.success("Report sent");
      return;
    }
    report.mutate({ jobId, type: picked, notes: note.trim() }, {
      onSuccess: () => {
        sheet.close();
        toast.success("Report sent");
        if (picked === "expired_listing") onReportedClosed?.();
      },
      onError: () => toast.error("Couldn't send that report. Try again."),
    });
  };
  return <SheetStep id="report">
    <SheetHeader title="What's wrong with it?" />
    <Choices>
      {reasons.filter((option) => !folded || option.type === picked).map((option) => <Choice key={option.type} plain title={option.title}
        selected={picked === option.type} onPress={() => folded ? unfold() : setPicked(option.type)} />)}
    </Choices>
    {reason ? <View style={styles.note}>
      <TextInput value={note} onChangeText={setNote} multiline maxLength={1000} textAlignVertical="top"
        placeholder={reason.note} placeholderTextColor={theme.ui.color["ink-3"]} accessibilityLabel={reason.note}
        onFocus={() => setFolded(true)}
        style={[styles.input, { fontFamily: fonts ? faces.text : undefined }]} />
    </View> : null}
    <Button variant="primary" fullWidth disabled={!picked} pending={report.isPending} onPress={send}>Send</Button>
  </SheetStep>;
}

const styles = StyleSheet.create((theme) => ({
  note: {
    minHeight: 88,
    paddingHorizontal: theme.ui.space["4"],
    borderRadius: SHEET_GROUP_RADIUS,
    borderCurve: "continuous",
    backgroundColor: theme.ui.color["sheet-group"],
  },
  input: {
    minHeight: 88,
    paddingTop: 14,
    paddingBottom: 14,
    fontSize: theme.ui.type.body.size,
    lineHeight: theme.ui.type.body.line,
    color: theme.ui.color.ink,
  },
}));
