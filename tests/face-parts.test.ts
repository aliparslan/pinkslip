import { describe, expect, test } from "bun:test";
import { FACE_PARTS, faceFromSeed, parseFace, randomFace, type FacePart } from "../apps/native/src/ui/face-parts";

const parts = Object.keys(FACE_PARTS) as FacePart[];
const valid = (face: Record<FacePart, string>) => parts.every((part) => (FACE_PARTS[part] as readonly string[]).includes(face[part]));

describe("a person's face", () => {
  test("the starting face is plain and the same every time", () => {
    const face = faceFromSeed("ada@example.com");
    expect(face).toEqual(faceFromSeed("ada@example.com"));
    expect(valid(face)).toBe(true);
    expect([face.brows, face.glasses, face.extra, face.mouth]).toEqual(["none", "none", "none", "smile"]);
  });

  test("different people can start with different colors", () => {
    const colors = new Set(Array.from({ length: 40 }, (_, index) => faceFromSeed(`person${index}@example.com`).color));
    expect(colors.size).toBeGreaterThan(3);
  });

  test("shuffle only makes faces the picker offers", () => {
    for (const roll of [0, 0.25, 0.49, 0.5, 0.75, 0.999]) expect(valid(randomFace(() => roll))).toBe(true);
    expect(randomFace(() => 0.1).glasses).toBe("none");
  });

  test("a saved face keeps what's still offered and repairs the rest", () => {
    const fallback = faceFromSeed("ada@example.com");
    expect(parseFace(undefined, fallback)).toBe(fallback);
    expect(parseFace("not json", fallback)).toBe(fallback);
    expect(parseFace('"text"', fallback)).toBe(fallback);
    const saved = parseFace(JSON.stringify({ eyes: "wink", mouth: "gone", hair: "curls" }), fallback);
    expect(saved).toEqual({ ...fallback, eyes: "wink" });
  });
});
