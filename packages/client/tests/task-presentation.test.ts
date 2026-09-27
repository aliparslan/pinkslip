import { afterAll, beforeAll, describe, expect, test } from "bun:test";

const runtime = globalThis as unknown as Record<string, unknown>;
const previousState = runtime["$state"];
const previousWindow = runtime["window"];

beforeAll(() => {
  Object.defineProperty(globalThis, "$state", {
    configurable: true,
    writable: true,
    value: <T>(value: T) => value,
  });
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    writable: true,
    value: globalThis,
  });
});

afterAll(() => {
  if (previousState === undefined) Reflect.deleteProperty(globalThis, "$state");
  else Object.defineProperty(globalThis, "$state", { configurable: true, writable: true, value: previousState });
  if (previousWindow === undefined) Reflect.deleteProperty(globalThis, "window");
  else Object.defineProperty(globalThis, "window", { configurable: true, writable: true, value: previousWindow });
});

describe("SavePresentation persistence state", () => {
  test("a failed save remains dirty until a later save succeeds", async () => {
    const { SavePresentation } = await import("../src/lib/task-presentation.svelte");
    const presentation = new SavePresentation();

    presentation.markDirty();
    const failedGeneration = presentation.begin();
    presentation.fail(failedGeneration, "Network unavailable.");

    expect(presentation.phase).toBe("error");
    expect(presentation.hasUnsavedChanges).toBe(true);

    const retryGeneration = presentation.begin();
    expect(presentation.phase).toBe("dirty");
    presentation.succeed(retryGeneration, "2026-08-16T00:00:00.000Z");

    expect(presentation.hasUnsavedChanges).toBe(false);
    presentation.destroy();
  });

  test("hydrating a saved draft clears dirty and error state", async () => {
    const { SavePresentation } = await import("../src/lib/task-presentation.svelte");
    const presentation = new SavePresentation();

    presentation.markDirty();
    const generation = presentation.begin();
    presentation.fail(generation, "Network unavailable.");
    presentation.hydrate("2026-08-16T00:00:00.000Z");

    expect(presentation.phase).toBe("clean");
    expect(presentation.hasUnsavedChanges).toBe(false);
    expect(presentation.errorMessage).toBeNull();
    presentation.destroy();
  });
});
