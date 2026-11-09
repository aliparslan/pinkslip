import { afterEach, describe, expect, test } from "bun:test";
import { submitForm } from "../apps/native/autofill/form-filler";

const BFRAME = "https://www.recaptcha.net/recaptcha/enterprise/bframe?hl=en";
const SUCCESS = ".ashby-application-form-success-container";
const FAILURE = ".ashby-application-form-failure-container";

interface FakeFrame { src: string; visibility: string; box: { width: number; height: number; bottom: number } }

/** A page after Submit: `boxes` are what's on it at each poll, in order. */
function page(frames: FakeFrame[], boxes: Array<Record<string, string>>) {
  let polls = 0;
  const button = { type: "submit", offsetParent: {}, click() {}, textContent: "Submit Application", value: "" };
  const now = () => boxes[Math.min(polls, boxes.length - 1)] ?? {};
  const globals = globalThis as unknown as Record<string, unknown>;
  globals.location = { href: "https://jobs.ashbyhq.com/phantom/1/application" };
  globals.getComputedStyle = (frame: FakeFrame) => ({ visibility: frame.visibility });
  globals.document = {
    body: { get innerText() { return ""; } },
    querySelector(selector: string) {
      if (selector === "form") return { querySelectorAll: () => [button] };
      const words = now()[selector];
      return words === undefined ? null : { textContent: words };
    },
    querySelectorAll(selector: string) {
      if (selector === "iframe") {
        polls += 1;
        return frames.map((frame) => ({ src: frame.src, visibility: frame.visibility, getBoundingClientRect: () => frame.box }));
      }
      return [];
    },
  };
}

const hidden: FakeFrame = { src: BFRAME, visibility: "hidden", box: { width: 0, height: 150, bottom: 151 } };

afterEach(() => {
  const globals = globalThis as unknown as Record<string, unknown>;
  delete globals.document;
  delete globals.location;
  delete globals.getComputedStyle;
});

describe("what the page says after Submit", () => {
  test("Google's hidden challenge frame isn't a captcha: the send waits for its answer", async () => {
    page([hidden], [{}, { [SUCCESS]: "Your application was successfully submitted." }]);
    expect((await submitForm()).status).toBe("submitted");
  });

  test("a challenge the person could see is a captcha", async () => {
    page([{ src: BFRAME, visibility: "visible", box: { width: 400, height: 580, bottom: 620 } }], [{}]);
    expect((await submitForm()).status).toBe("captcha");
  });

  test("Ashby refusing on its captcha is a captcha", async () => {
    page([hidden], [{ [FAILURE]: "There was a problem verifying this submission with CAPTCHA. Please try again later." }]);
    expect((await submitForm()).status).toBe("captcha");
  });

  test("Ashby refusing for anything else says why", async () => {
    page([hidden], [{ [FAILURE]: "We couldn't submit your application." }]);
    expect(await submitForm()).toMatchObject({ status: "invalid", errors: ["We couldn't submit your application."] });
  });
});
