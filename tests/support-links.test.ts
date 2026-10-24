import { describe, expect, test } from "bun:test";
import { parseSupportLinks, supportAmountAllowed, supportOffer } from "../shared/support";
import { deviceRegion } from "../apps/native/src/platform/region";
import {
  defaultSupportPick, supportAmounts, supportButtonLabel, supportDollars, supportOffersMonthly, supportOtherOffered, supportPickOffered, supportTarget,
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
  const links = { ...parseSupportLinks({
    once_3: link("o3"), once_5: link("o5"), once_10: link("o10"), once_other: link("other"), monthly_3: link("m3"), monthly_10: link("m10"),
  })!, checkout: null };
  const checkout = supportOffer(undefined, true)!;

  test("with Stripe checkout, both list $3, $5 and $10, and Other is typed in either", () => {
    expect(supportAmounts(checkout, "once")).toEqual([3, 5, 10]);
    expect(supportAmounts(checkout, "monthly")).toEqual([3, 5, 10]);
    expect(supportOffersMonthly(checkout)).toBe(true);
    expect(supportOtherOffered(checkout, "monthly")).toBe(true);
    expect(defaultSupportPick(checkout, "once")).toBe(5);
  });

  test("with checkout, the button makes a page for the amount picked or typed", () => {
    expect(supportTarget(checkout, "once", 5, null)).toEqual({ kind: "checkout", dollars: 5, monthly: false });
    expect(supportTarget(checkout, "monthly", "other", 7)).toEqual({ kind: "checkout", dollars: 7, monthly: true });
    expect(supportTarget(checkout, "once", "other", null)).toBeNull();
    expect(supportButtonLabel("monthly", supportDollars(checkout, "other", 7))).toBe("Support with $7 a month");
    expect(supportButtonLabel("once", supportDollars(checkout, "other", null))).toBe("Support Pinkslip");
  });

  test("with only links, Other is one time and Stripe asks the amount", () => {
    expect(defaultSupportPick(links, "monthly")).toBe(3);
    expect(supportPickOffered(links, "monthly", "other")).toBe(false);
    expect(supportPickOffered(links, "monthly", 5)).toBe(false);
    expect(supportTarget(links, "monthly", 10, null)).toEqual({ kind: "link", url: link("m10") });
    expect(supportTarget(links, "once", "other", 9)).toEqual({ kind: "link", url: link("other") });
    expect(supportButtonLabel("once", supportDollars(links, "other", 9))).toBe("Support Pinkslip");
    expect(supportButtonLabel("once", supportDollars(links, 5, null))).toBe("Support with $5");
  });

  test("a lone link where Stripe asks the amount lists nothing", () => {
    const lone = { ...parseSupportLinks({ once_other: link("other") })!, checkout: null };
    expect(supportAmounts(lone, "once")).toEqual([]);
    expect(defaultSupportPick(lone, "once")).toBe("other");
    expect(supportOffersMonthly(lone)).toBe(false);
  });

  test("a Worker from before checkout leaves the field out, and the sheet reads that as links only", () => {
    // What the live Worker sent on 2026-10-24: the lone link, no `checkout` key.
    const older = parseSupportLinks({ once_other: link("other") })! as Parameters<typeof supportOffersMonthly>[0];
    expect(supportOffersMonthly(older)).toBe(false);
    expect(supportOtherOffered(older, "monthly")).toBe(false);
    expect(supportOtherOffered(older, "once")).toBe(true);
    expect(supportTarget(older, "once", "other", null)).toEqual({ kind: "link", url: link("other") });
  });
});

describe("the tip amounts the Worker takes", () => {
  test("whole dollars from $1 to $500", () => {
    for (const dollars of [1, 7, 500]) expect(supportAmountAllowed(dollars)).toBe(true);
    for (const dollars of [0, 501, 2.5, "7", null]) expect(supportAmountAllowed(dollars)).toBe(false);
  });

  test("the offer keeps the links for older builds and adds checkout once Stripe is set up", () => {
    expect(supportOffer(undefined, false)).toBeNull();
    expect(supportOffer({ once_other: link("other") }, false)).toEqual({ once: [], other: link("other"), monthly: [], checkout: null });
    expect(supportOffer({ once_other: link("other") }, true)?.checkout).toEqual({ amounts: [3, 5, 10], min: 1, max: 500 });
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
