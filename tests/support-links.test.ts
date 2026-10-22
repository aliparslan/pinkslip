import { describe, expect, test } from "bun:test";
import { parseSupportLinks } from "../shared/support";
import { deviceRegion } from "../apps/native/src/platform/region";
import {
  defaultSupportPick, supportButtonLabel, supportPickOffered, supportUrl,
} from "../apps/native/src/features/redesign/you/support-facts";

const link = (name: string) => `https://buy.stripe.com/${name}`;

describe("Support Pinkslip's links", () => {
  test("reads the Worker's table, smallest amount first", () => {
    const links = parseSupportLinks({
      once_10: link("o10"), once_3: link("o3"), once_5: link("o5"), once_other: link("other"),
      monthly_5: link("m5"), monthly_3: link("m3"),
    });
    expect(links).toEqual({
      once: [{ dollars: 3, url: link("o3") }, { dollars: 5, url: link("o5") }, { dollars: 10, url: link("o10") }],
      other: link("other"),
      monthly: [{ dollars: 3, url: link("m3") }, { dollars: 5, url: link("m5") }],
    });
  });

  test("takes the same table as a JSON string", () => {
    expect(parseSupportLinks(JSON.stringify({ once_5: link("o5") }))?.once).toEqual([{ dollars: 5, url: link("o5") }]);
  });

  test("drops unknown names, plain http, a monthly Other and zero dollars", () => {
    expect(parseSupportLinks({
      once_5: link("o5"), tip_3: link("t3"), once_4: "http://buy.stripe.com/insecure", monthly_other: link("mo"), once_0: link("o0"), once_7: "not a link",
    })).toEqual({ once: [{ dollars: 5, url: link("o5") }], other: null, monthly: [] });
  });

  test("hides the row with nothing to tip once", () => {
    expect(parseSupportLinks(undefined)).toBeNull();
    expect(parseSupportLinks("")).toBeNull();
    expect(parseSupportLinks("{not json")).toBeNull();
    expect(parseSupportLinks({ monthly_5: link("m5") })).toBeNull();
    expect(parseSupportLinks({ once_other: link("other") })?.other).toBe(link("other"));
  });
});

describe("the Support sheet", () => {
  const links = parseSupportLinks({
    once_3: link("o3"), once_5: link("o5"), once_10: link("o10"), once_other: link("other"), monthly_3: link("m3"), monthly_10: link("m10"),
  })!;

  test("opens on $5, else the middle amount, else Other", () => {
    expect(defaultSupportPick(links, "once")).toBe(5);
    expect(defaultSupportPick(links, "monthly")).toBe(3);
    expect(defaultSupportPick(parseSupportLinks({ once_other: link("other") })!, "once")).toBe("other");
  });

  test("Other is one time only, and switching keeps an amount both offer", () => {
    expect(supportPickOffered(links, "monthly", "other")).toBe(false);
    expect(supportPickOffered(links, "monthly", 3)).toBe(true);
    expect(supportPickOffered(links, "monthly", 5)).toBe(false);
    expect(supportUrl(links, "monthly", 10)).toBe(link("m10"));
    expect(supportUrl(links, "once", "other")).toBe(link("other"));
    expect(supportUrl(links, "monthly", "other")).toBeNull();
  });

  test("the button says the amount and how often", () => {
    expect(supportButtonLabel("once", 5)).toBe("Support with $5");
    expect(supportButtonLabel("monthly", 10)).toBe("Support with $10 a month");
    expect(supportButtonLabel("once", "other")).toBe("Support Pinkslip");
  });
});

describe("the iPhone's region", () => {
  test("comes from the locale's region part", () => {
    expect(deviceRegion("en-US")).toBe("US");
    expect(deviceRegion("en_GB")).toBe("GB");
    expect(deviceRegion("zh-Hant-TW")).toBe("TW");
    expect(deviceRegion("en")).toBeNull();
  });
});
