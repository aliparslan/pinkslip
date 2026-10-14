import Svg, { Circle, Path } from "react-native-svg";
import { useUnistyles } from "react-native-unistyles";
import { Icon, ICON_STROKE } from "./Icon";
import type { StageMarkKind } from "./stage-group";
import type { TextTone } from "./Text";

export interface StageMarkProps {
  stage: StageMarkKind;
  /** 14 beside small text, 20 in a sheet (beside the 24 check). */
  size?: number;
  /** Saved's and Applied's grey. The stages where something's happening keep
   * their color, and the endings are ink-3. */
  tone?: TextTone | "ink-4";
}

// On a 14-unit box. The ring's fill: a quarter, a half, three quarters.
const fills: Partial<Record<StageMarkKind, string>> = {
  applied: "M7 7V3.2A3.8 3.8 0 0 1 10.8 7Z",
  assessment: "M7 3.2A3.8 3.8 0 0 1 7 10.8Z",
  interview: "M7 7V3.2A3.8 3.8 0 1 1 3.2 7Z",
};

// Lines inside an ending's ring: Closed's dash, Rejected's ✕, Withdrawn's arrow back.
const lines: Partial<Record<StageMarkKind, string>> = {
  closed: "M4.5 7h5",
  rejected: "M5.1 5.1L8.9 8.9M8.9 5.1L5.1 8.9",
  withdrawn: "M9.3 7H4.8M6.6 5.2L4.8 7L6.6 8.8",
};

const ENDINGS: readonly StageMarkKind[] = ["closed", "rejected", "withdrawn", "ghosted"];

/**
 * Saved is the bookmark, since saving isn't a stage. Every other stage is
 * Pinkslip's ring, which fills as an application advances (Paper "Parts ·
 * Badge and stage rings"): a quarter at Applied, half at Assessment, three
 * quarters while interviewing, full at Offer. Color only where something's
 * happening: Assessment amber, Interviewing blue, Offer green. The endings
 * are grey: Rejected's ring holds an ✕, Withdrawn's an arrow back, Ghosted is
 * the ghost, and Tracker's Closed group a dash. Drawn at the line icons'
 * stroke.
 */
export function StageMark({ stage, size = 14, tone = "ink-2" }: StageMarkProps) {
  const { theme } = useUnistyles();
  const ending = ENDINGS.includes(stage);
  if (stage === "saved") return <Icon name="saved" size={size - 1} tone={tone} />;
  if (stage === "ghosted") return <Icon name="ghosted" size={size} tone="ink-3" />;
  const color = stage === "assessment" ? theme.ui.color["stage-assessment"]
    : stage === "interview" ? theme.ui.color["stage-interview"]
    : stage === "offer" ? theme.ui.color.good
    : theme.ui.color[ending ? "ink-3" : tone];
  // The stroke stays ICON_STROKE points at any size.
  const stroke = ICON_STROKE * (14 / size);
  const fill = fills[stage];
  const line = lines[stage];
  return <Svg width={size} height={size} viewBox="0 0 14 14">
    <Circle cx={7} cy={7} r={5.5} fill="none" stroke={color} strokeWidth={stroke} />
    {fill ? <Path d={fill} fill={color} /> : null}
    {stage === "offer" ? <Circle cx={7} cy={7} r={3.8} fill={color} /> : null}
    {line ? <Path d={line} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" /> : null}
  </Svg>;
}
