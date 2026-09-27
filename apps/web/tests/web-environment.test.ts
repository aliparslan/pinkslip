import { describe, expect, test } from "bun:test";
import {
  requestWaitingWebUpdate,
  resolveNotificationCapability,
  webUpdateCheckDue,
  type NotificationCapabilityInputs,
} from "../src/lib/web-environment";

const supported: NotificationCapabilityInputs = {
  isIosBrowser: false,
  displayMode: "browser",
  serviceWorkerSupported: true,
  pushManagerSupported: true,
  notificationsSupported: true,
  permission: "default",
  hasSubscription: false,
};

describe("web notification capability", () => {
  test("requires installation in iOS browser mode before checking push APIs", () => {
    expect(resolveNotificationCapability({
      ...supported,
      isIosBrowser: true,
      serviceWorkerSupported: false,
    })).toBe("requires-install");
  });

  test("allows an installed iOS web app to use normal capability detection", () => {
    expect(resolveNotificationCapability({
      ...supported,
      isIosBrowser: true,
      displayMode: "standalone",
    })).toBe("promptable");
  });

  test("distinguishes unavailable, promptable, denied, disabled, and enabled", () => {
    expect(resolveNotificationCapability({
      ...supported,
      pushManagerSupported: false,
    })).toBe("unsupported");
    expect(resolveNotificationCapability(supported)).toBe("promptable");
    expect(resolveNotificationCapability({
      ...supported,
      permission: "denied",
    })).toBe("denied");
    expect(resolveNotificationCapability({
      ...supported,
      permission: "granted",
    })).toBe("disabled");
    expect(resolveNotificationCapability({
      ...supported,
      permission: "granted",
      hasSubscription: true,
    })).toBe("enabled");
  });
});

describe("web update policy", () => {
  test("immediately activates a waiting update only for an already-controlled app", () => {
    const messages: unknown[] = [];
    const registration = {
      waiting: { postMessage: (message: unknown) => messages.push(message) },
    };

    expect(requestWaitingWebUpdate(registration, false)).toBeFalse();
    expect(messages).toEqual([]);
    expect(requestWaitingWebUpdate(registration, true)).toBeTrue();
    expect(messages).toEqual([{ type: "SKIP_WAITING" }]);
    expect(requestWaitingWebUpdate({ waiting: null }, true)).toBeFalse();
  });

  test("checks at startup and throttles repeat foreground checks", () => {
    const fiveMinutes = 5 * 60 * 1_000;
    expect(webUpdateCheckDue(10_000, 10_001, true)).toBeTrue();
    expect(webUpdateCheckDue(10_000, 10_000 + fiveMinutes - 1)).toBeFalse();
    expect(webUpdateCheckDue(10_000, 10_000 + fiveMinutes)).toBeTrue();
  });
});
