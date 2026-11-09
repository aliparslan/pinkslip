import type { ReactNode } from "react";
import Svg, { Circle, Defs, G, Path, RadialGradient, Rect, Stop } from "react-native-svg";
import type { FacePart, FaceSpec } from "./face-parts";

// The art's own colors, like a company logo's: the same in light and dark.
const INK = "#1C1C20";
const WHITE = "#FFFFFF";
const DISC: Record<FaceSpec["color"], readonly [string, string]> = {
  pink: ["#FFE3EF", "#FFC2DA"],
  blue: ["#DFEBFF", "#BFD6FF"],
  green: ["#DDF5E5", "#B8E8CA"],
  amber: ["#FFF0D6", "#FFDCA8"],
  violet: ["#EBE3FF", "#D4C6FF"],
  mint: ["#D9F5F2", "#B2E8E2"],
  peach: ["#FFE9DE", "#FFCDB8"],
  stone: ["#F1F1F3", "#DCDCE2"],
};

const stroke = (strokeWidth: number) => ({ fill: "none", stroke: INK, strokeWidth, strokeLinecap: "round", strokeLinejoin: "round" }) as const;
const LINE = stroke(2.2);
const THIN = stroke(1.8);
const LIPS = stroke(2.5);
const BROW = stroke(2.8);
const LEFT = 20;
const RIGHT = 36;
const pair = (draw: (x: number) => ReactNode) => <>{draw(LEFT)}{draw(RIGHT)}</>;

function Eyes({ kind }: { kind: FaceSpec["eyes"] }) {
  const happy = (x: number) => <Path d={`M${x - 3.6} 25.4Q${x} 20.4 ${x + 3.6} 25.4`} {...LINE} />;
  switch (kind) {
    case "dots": return pair((x) => <Circle cx={x} cy={24} r={2.5} fill={INK} />);
    case "big": return pair((x) => <Circle cx={x} cy={24} r={3.4} fill={INK} />);
    case "tall": return pair((x) => <Rect x={x - 1.7} y={20.4} width={3.4} height={7.2} rx={1.7} fill={INK} />);
    case "happy": return pair(happy);
    case "wink": return <><Circle cx={LEFT} cy={24} r={2.5} fill={INK} />{happy(RIGHT)}</>;
    case "sleepy": return pair((x) => <>
      <Path d={`M${x - 3.6} 23.4H${x + 3.6}`} {...LINE} />
      <Path d={`M${x - 2.5} 23.4A2.5 2.5 0 0 0 ${x + 2.5} 23.4Z`} fill={INK} />
    </>);
    case "wide": return pair((x) => <>
      <Circle cx={x} cy={24} r={4.4} fill={WHITE} stroke={INK} strokeWidth={2.2} />
      <Circle cx={x} cy={24} r={1.7} fill={INK} />
    </>);
  }
}

function Brows({ kind }: { kind: FaceSpec["brows"] }) {
  switch (kind) {
    case "none": return null;
    case "flat": return pair((x) => <Path d={`M${x - 2.8} 15.4H${x + 2.8}`} {...BROW} />);
    case "up": return pair((x) => <Path d={`M${x - 3} 16.2Q${x} 12.6 ${x + 3} 16.2`} {...BROW} />);
    case "oneUp": return <><Path d="M17.2 15.8H22.8" {...BROW} /><Path d="M33 15.2Q36 11.6 39 15.2" {...BROW} /></>;
    case "thick": return pair((x) => <Path d={`M${x - 3.2} 15.2H${x + 3.2}`} {...stroke(4.4)} />);
  }
}

const OPEN = "M19 32.5H37A9 9 0 0 1 19 32.5Z";

function Mouth({ kind }: { kind: FaceSpec["mouth"] }) {
  switch (kind) {
    case "smile": return <Path d="M20 33Q28 42.6 36 33" {...LIPS} />;
    case "big": return <Path d={OPEN} {...LIPS} />;
    case "tongue": return <><Path d={OPEN} {...LIPS} /><Path d="M23.4 39.6C25 36.8 31 36.8 32.6 39.6" {...THIN} /></>;
    case "teeth": return <><Path d={OPEN} {...LIPS} /><Path d="M20.6 36.6H35.4" {...THIN} /></>;
    case "smirk": return <Path d="M22 36Q29 39 34 33" {...LIPS} />;
    case "flat": return <Path d="M23 36H33" {...LIPS} />;
    case "oh": return <Circle cx={28} cy={36} r={3} fill="none" stroke={INK} strokeWidth={2.4} />;
  }
}

function Glasses({ kind }: { kind: FaceSpec["glasses"] }) {
  switch (kind) {
    case "none": return null;
    case "round": return <G {...LINE}>
      <Circle cx={LEFT} cy={24} r={6.4} /><Circle cx={RIGHT} cy={24} r={6.4} />
      <Path d="M26.4 23.4Q28 22.4 29.6 23.4M13.6 23L9.5 21.5M42.4 23L46.5 21.5" />
    </G>;
    case "square": return <G {...LINE}>
      <Rect x={13.4} y={18.6} width={13} height={10.8} rx={3} /><Rect x={29.6} y={18.6} width={13} height={10.8} rx={3} />
      <Path d="M26.4 23H29.6M13.4 22.4L9.5 21.5M42.6 22.4L46.5 21.5" />
    </G>;
    case "shades": return <>
      <Path d="M12.6 19.4H26.6V24.4A5.4 5.4 0 0 1 21.2 29.8H18A5.4 5.4 0 0 1 12.6 24.4Z" fill={INK} />
      <Path d="M29.4 19.4H43.4V24.4A5.4 5.4 0 0 1 38 29.8H34.8A5.4 5.4 0 0 1 29.4 24.4Z" fill={INK} />
      <Path d="M26.6 21.4H29.4M12.6 21H9.5M43.4 21H46.5" {...LINE} />
    </>;
  }
}

const FRECKLES = [[12.6, 27.4], [16, 29], [12.8, 30.6], [43.4, 27.4], [40, 29], [43.2, 30.6]] as const;

function Extra({ kind }: { kind: FaceSpec["extra"] }) {
  switch (kind) {
    case "none": return null;
    case "freckles": return <>{FRECKLES.map(([x, y]) => <Circle key={`${x},${y}`} cx={x} cy={y} r={1} fill={INK} />)}</>;
    case "moustache": return <Path fill={INK}
      d="M28 29.4C25 27.2 20 27.6 17 30.4C16.4 31 15.6 30.8 15.2 30.2C15.6 32.8 19.6 33.4 23 32.2C25 31.5 26.8 31 28 30.4C29.2 31 31 31.5 33 32.2C36.4 33.4 40.4 32.8 40.8 30.2C40.4 30.8 39.6 31 39 30.4C36 27.6 31 27.2 28 29.4Z" />;
  }
}

/**
 * A person's face (owner, 2026-11-08, Paper "Build your face"): ink features
 * on a soft circle. With `focus`, the other features step back so the part
 * being chosen is the one you see.
 */
export function Face({ spec, size, focus }: { spec: FaceSpec; size: number; focus?: FacePart }) {
  const weight = (part: FacePart) => (focus && focus !== "color" && focus !== part ? 0.28 : 1);
  const [from, to] = DISC[spec.color];
  // Brows clear a pair of glasses, and a mouth clears a moustache.
  const browLift = spec.glasses === "none" ? 0 : -2.6;
  const mouthDrop = spec.extra === "moustache" ? 3 : 0;
  return <Svg width={size} height={size} viewBox="0 0 56 56">
    <Defs>
      <RadialGradient id="disc" cx="30%" cy="25%" r="85%">
        <Stop offset="0" stopColor={from} />
        <Stop offset="1" stopColor={to} />
      </RadialGradient>
    </Defs>
    <Circle cx={28} cy={28} r={28} fill="url(#disc)" />
    <G opacity={weight("eyes")}><Eyes kind={spec.eyes} /></G>
    <G opacity={weight("brows")} transform={`translate(0 ${browLift})`}><Brows kind={spec.brows} /></G>
    <G opacity={weight("mouth")} transform={`translate(0 ${mouthDrop})`}><Mouth kind={spec.mouth} /></G>
    <G opacity={weight("extra")}><Extra kind={spec.extra} /></G>
    <G opacity={weight("glasses")}><Glasses kind={spec.glasses} /></G>
  </Svg>;
}
