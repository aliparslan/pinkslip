import { describe, expect, it } from "bun:test";
import { decodeEntities, parseJobDescription } from "../packages/core/src/job-description";

describe("parseJobDescription", () => {
  it("turns headings, paragraphs, and lists into blocks", () => {
    const blocks = parseJobDescription(
      "<h3>What you'll do</h3><p>Build <strong>things</strong> people use.</p><ul><li>Ship features</li><li><p>Review code</p></li></ul>",
    );
    expect(blocks).toEqual([
      { kind: "heading", runs: [{ text: "What you'll do" }] },
      { kind: "paragraph", runs: [{ text: "Build " }, { text: "things", bold: true }, { text: " people use." }] },
      { kind: "list", ordered: false, items: [[{ text: "Ship features" }], [{ text: "Review code" }]] },
    ]);
  });

  it("reads a short bold paragraph as a heading", () => {
    expect(parseJobDescription("<p><strong>Requirements</strong></p><p>A degree.</p>")[0]).toEqual({
      kind: "heading",
      runs: [{ text: "Requirements" }],
    });
  });

  it("decodes entity-encoded postings once", () => {
    const blocks = parseJobDescription("&lt;p&gt;Pay: $160K &amp;amp; equity&lt;/p&gt;");
    expect(blocks).toEqual([{ kind: "paragraph", runs: [{ text: "Pay: $160K & equity" }] }]);
  });

  it("splits on line breaks and keeps safe links", () => {
    const blocks = parseJobDescription('Line one<br>Line <a href="https://example.com">two</a><br/><a href="javascript:x">three</a>');
    expect(blocks).toEqual([
      { kind: "paragraph", runs: [{ text: "Line one" }] },
      { kind: "paragraph", runs: [{ text: "Line " }, { text: "two", href: "https://example.com" }] },
      { kind: "paragraph", runs: [{ text: "three" }] },
    ]);
  });

  it("keeps nested lists one level deep, in order", () => {
    const blocks = parseJobDescription("<ul><li>A<ul><li>B</li></ul></li><li>C</li></ul>");
    expect(blocks).toEqual([{ kind: "list", ordered: false, items: [[{ text: "A" }], [{ text: "B" }], [{ text: "C" }]] }]);
  });

  it("drops a first heading that repeats the title or a stock label", () => {
    const blocks = parseJobDescription("<h2>Software Engineer, New Grad</h2><p>Hello.</p>", { title: "Software Engineer, New Grad" });
    expect(blocks).toEqual([{ kind: "paragraph", runs: [{ text: "Hello." }] }]);
    expect(parseJobDescription("<h2>About the role</h2><p>Hi.</p>")).toEqual([{ kind: "paragraph", runs: [{ text: "Hi." }] }]);
  });

  it("ignores scripts, styles, comments, and empty input", () => {
    expect(parseJobDescription("<style>p{}</style><!-- x --><script>alert(1)</script><p>Ok</p>")).toEqual([
      { kind: "paragraph", runs: [{ text: "Ok" }] },
    ]);
    expect(parseJobDescription(null)).toEqual([]);
    expect(parseJobDescription("   ")).toEqual([]);
  });

  it("decodes named and numeric entities", () => {
    expect(decodeEntities("It&rsquo;s &#36;95&#x2F;hr &mdash; &unknown;")).toBe("It’s $95/hr — &unknown;");
  });
});
