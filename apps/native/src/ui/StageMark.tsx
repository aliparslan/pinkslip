import Svg, { Circle, Path } from "react-native-svg";
import { useUnistyles } from "react-native-unistyles";
import { Icon, ICON_STROKE } from "./Icon";
import type { StageGroup } from "./stage-group";
import type { TextTone } from "./Text";

export interface StageMarkProps {
  stage: StageGroup;
  size?: number;
  tone?: TextTone | "ink-4";
}

// The ring's fill, on a 14-unit box: a quarter, a half, three quarters.
const fills: Partial<Record<StageGroup, string>> = {
  applied: "M7 7V3.2A3.8 3.8 0 0 1 10.8 7Z",
  assessment: "M7 3.2A3.8 3.8 0 0 1 7 10.8Z",
  interview: "M7 7V3.2A3.8 3.8 0 1 1 3.2 7Z",
};

/**
 * Saved is the bookmark, since saving isn't a stage. Every other stage is
 * Pinkslip's ring, which fills as an application advances (Paper "Parts ·
 * Badge and stage rings"): a quarter at Applied, half at Assessment, three
 * quarters while interviewing, full and green at Offer. Closed is a grey
 * ring with a dash. Drawn at the line icons' stroke.
 */
export function StageMark({ stage, size = 14, tone = "ink-2" }: StageMarkProps) {
  const { theme } = useUnistyles();
  if (stage === "saved") return <Icon name="saved" size={size - 1} tone={tone} />;
  const color = stage === "offer" ? theme.ui.color.good : stage === "closed" ? theme.ui.color["ink-4"] : theme.ui.color[tone];
  // The stroke stays ICON_STROKE points at any size.
  const stroke = ICON_STROKE * (14 / size);
  const fill = fills[stage];
  return <Svg width={size} height={size} viewBox="0 0 14 14">
    <Circle cx={7} cy={7} r={5.5} fill="none" stroke={color} strokeWidth={stroke} />
    {fill ? <Path d={fill} fill={color} /> : null}
    {stage === "offer" ? <Circle cx={7} cy={7} r={3.8} fill={color} /> : null}
    {stage === "closed" ? <Path d="M4.5 7h5" stroke={color} strokeWidth={stroke} strokeLinecap="round" /> : null}
  </Svg>;
}
