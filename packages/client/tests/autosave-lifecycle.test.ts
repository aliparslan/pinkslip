import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  flushActiveAutosaves,
  registerAutosaveFlush,
} from "../src/lib/autosave-lifecycle";

const originalDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");

function installEventTargets() {
  const target = {
    addEventListener() {},
    removeEventListener() {},
  };
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: { ...target, visibilityState: "visible" },
  });
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: target,
  });
}

function restoreGlobal(name: "document" | "window", descriptor?: PropertyDescriptor) {
  if (descriptor) Object.defineProperty(globalThis, name, descriptor);
  else delete (globalThis as Record<string, unknown>)[name];
}

describe("autosave navigation lifecycle", () => {
  beforeEach(installEventTargets);

  afterEach(() => {
    restoreGlobal("document", originalDocument);
    restoreGlobal("window", originalWindow);
  });

  test("allows navigation only when every active save succeeds", async () => {
    const unregisterSuccessful = registerAutosaveFlush(async () => true);
    const unregisterFailed = registerAutosaveFlush(async () => false);

    expect(await flushActiveAutosaves()).toBeFalse();

    unregisterFailed();
    expect(await flushActiveAutosaves()).toBeTrue();
    unregisterSuccessful();
  });

  test("waits for an in-flight save before resolving navigation", async () => {
    let finishSave: ((succeeded: boolean) => void) | undefined;
    const unregister = registerAutosaveFlush(() => new Promise<boolean>((resolve) => {
      finishSave = resolve;
    }));
    let navigationResolved = false;

    const navigation = flushActiveAutosaves().then((succeeded) => {
      navigationResolved = true;
      return succeeded;
    });
    await Promise.resolve();

    expect(navigationResolved).toBeFalse();
    finishSave?.(true);
    expect(await navigation).toBeTrue();
    unregister();
  });

  test("treats a thrown save as a navigation failure", async () => {
    const unregister = registerAutosaveFlush(async () => {
      throw new Error("offline");
    });

    expect(await flushActiveAutosaves()).toBeFalse();
    unregister();
  });
});
