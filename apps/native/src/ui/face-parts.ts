/**
 * What a face can be made of (owner, 2026-11-08, Paper "Build your face").
 * Hair, hats and beards are left out until their drawing is settled.
 */
export const FACE_PARTS = {
  color: ["pink", "blue", "green", "amber", "violet", "mint", "peach", "stone"],
  eyes: ["dots", "big", "tall", "happy", "wink", "sleepy", "wide"],
  brows: ["none", "flat", "up", "oneUp", "thick"],
  mouth: ["smile", "big", "tongue", "teeth", "smirk", "flat", "oh"],
  glasses: ["none", "round", "square", "shades"],
  extra: ["none", "freckles", "moustache"],
} as const;

export type FacePart = keyof typeof FACE_PARTS;
export type FaceSpec = { [Part in FacePart]: (typeof FACE_PARTS)[Part][number] };

const PARTS = Object.keys(FACE_PARTS) as FacePart[];

/** What VoiceOver says for an option. */
export function faceOptionLabel(option: string): string {
  return option === "oneUp" ? "One up" : option.charAt(0).toUpperCase() + option.slice(1);
}

function hash(seed: string): number {
  let value = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    value = Math.imul(value ^ seed.charCodeAt(index), 16777619);
  }
  return value >>> 0;
}

/** Everyone starts with a plain face of their own, the same one each time. */
export function faceFromSeed(seed: string): FaceSpec {
  const value = hash(seed);
  const plainEyes = FACE_PARTS.eyes.slice(0, 4);
  return {
    color: FACE_PARTS.color[value % FACE_PARTS.color.length]!,
    eyes: plainEyes[(value >>> 8) % plainEyes.length]!,
    brows: "none",
    mouth: "smile",
    glasses: "none",
    extra: "none",
  };
}

/** Shuffle: the parts a face can go without stay off about half the time. */
export function randomFace(random: () => number = Math.random): FaceSpec {
  const pick = <Part extends FacePart>(part: Part): FaceSpec[Part] => {
    const options = FACE_PARTS[part] as unknown as readonly FaceSpec[Part][];
    if (options[0] === ("none" as FaceSpec[Part]) && random() < 0.5) return options[0]!;
    return options[Math.floor(random() * options.length) % options.length]!;
  };
  return {
    color: pick("color"), eyes: pick("eyes"), brows: pick("brows"),
    mouth: pick("mouth"), glasses: pick("glasses"), extra: pick("extra"),
  };
}

/** A saved face, keeping `fallback` for anything missing or no longer offered. */
export function parseFace(raw: string | undefined, fallback: FaceSpec): FaceSpec {
  if (!raw) return fallback;
  let saved: unknown;
  try {
    saved = JSON.parse(raw);
  } catch {
    return fallback;
  }
  if (typeof saved !== "object" || saved === null) return fallback;
  const out = { ...fallback } as Record<FacePart, string>;
  for (const part of PARTS) {
    const value = (saved as Record<string, unknown>)[part];
    if (typeof value === "string" && (FACE_PARTS[part] as readonly string[]).includes(value)) out[part] = value;
  }
  return out as FaceSpec;
}
