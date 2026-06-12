export interface DescSection {
  heading: string;
  items: string[];
}

const STOP_HEADINGS = /location|travel|what we offer|benefits|compensation|salary|pay range|pay transparency|equal opportunity|diversity.*(inclusion|equity)|we are proud|notice to|commitment to|do not discriminate/i;
const SKIP_HEADINGS = /who we are|our mission|about (the company|us|twilio)|company description/i;
const OVERVIEW_HEADINGS = /see yourself|about the job|about this role|the role|overview/i;
const RESPONSIBILITY_HEADINGS = /responsibilit|what you.?ll do|in this role/i;
const QUALIFICATION_HEADINGS = /qualif|required|desired|preferred|experience|what you bring|you have/i;

function normalizeText(value: string): string {
  return value.replace(/ /g, " ").replace(/\s+/g, " ").trim();
}

function normalizeHeading(heading: string): string {
  const clean = normalizeText(heading).replace(/[:*]+$/g, "").trim();
  if (OVERVIEW_HEADINGS.test(clean)) return "Overview";
  if (RESPONSIBILITY_HEADINGS.test(clean)) return "Responsibilities";
  if (QUALIFICATION_HEADINGS.test(clean)) {
    if (/desired|preferred/i.test(clean)) return "Preferred";
    if (/required/i.test(clean)) return "Required";
    return "Qualifications";
  }
  return clean;
}

function isHeadingEl(node: Element, root: Element): string | null {
  const tag = node.tagName;
  const text = normalizeText(node.textContent ?? "");
  if (!text || text.length > 110) return null;

  if (/^H[1-6]$/.test(tag)) return text;

  if (tag === "P" && node.children.length <= 2) {
    const strong = node.querySelector("strong, b");
    if (strong) {
      const strongText = normalizeText(strong.textContent ?? "");
      if (strongText.length > 2 && strongText.length >= text.length * 0.65 && text.length < 90) {
        return strongText;
      }
    }
  }

  if ((tag === "STRONG" || tag === "B") && node.parentElement === root && text.length < 90) {
    return text;
  }

  return null;
}

// Some sources (notably Greenhouse) return descriptions as entity-encoded HTML
// (e.g. "&lt;p&gt;…&lt;/p&gt;"), which otherwise renders as literal "<p>" text.
// Decode once when we see encoded tags but no real tags. The guard prevents
// double-decoding content that is already real HTML.
function decodeEntitiesIfEncoded(html: string): string {
  if (!/&lt;\/?[a-z]/i.test(html)) return html;
  if (/<[a-z][\s\S]*>/i.test(html)) return html;
  const textarea = document.createElement("textarea");
  textarea.innerHTML = html;
  return textarea.value;
}

export function parseJobDescription(rawHtml: string): DescSection[] {
  const html = decodeEntitiesIfEncoded(rawHtml);
  const div = document.createElement("div");
  div.innerHTML = html;

  div.querySelectorAll("img, script, style, .content-intro, .content-conclusion").forEach((el) => el.remove());
  div.querySelectorAll('[style*="display: none"], [style*="display:none"]').forEach((el) => el.remove());
  div.querySelectorAll("span").forEach((el) => {
    const t = normalizeText(el.textContent ?? "");
    if (!t || t === ".") el.remove();
  });

  const sections: DescSection[] = [];
  let current: DescSection | null = null;
  let stopped = false;

  function ensureCurrent() {
    if (!current) {
      current = { heading: "Overview", items: [] };
      sections.push(current);
    }
  }

  function addItem(rawText: string) {
    const text = normalizeText(rawText);
    if (!text || text === "." || stopped) return;
    ensureCurrent();
    current?.items.push(text);
  }

  function walk(node: Element) {
    if (stopped) return;
    const text = normalizeText(node.textContent ?? "");
    if (!text || text === ".") return;

    const headingText = isHeadingEl(node, div);
    if (headingText) {
      const normalized = normalizeHeading(headingText);
      if (!normalized || normalized === ".") return;
      if (STOP_HEADINGS.test(normalized)) {
        stopped = true;
        return;
      }
      if (SKIP_HEADINGS.test(normalized)) {
        current = null;
        return;
      }
      current = { heading: normalized, items: [] };
      sections.push(current);
      return;
    }

    if (node.tagName === "UL" || node.tagName === "OL") {
      for (const li of node.querySelectorAll(":scope > li")) {
        addItem(li.textContent ?? "");
      }
      return;
    }

    if (node.tagName === "P") {
      addItem(text);
      return;
    }

    for (const child of node.children) {
      walk(child as Element);
      if (stopped) break;
    }
  }

  for (const child of div.children) {
    walk(child as Element);
    if (stopped) break;
  }

  return sections
    .map((section, index) => ({
      heading: section.heading || (index === 0 ? "Overview" : ""),
      items: [...new Set(section.items)],
    }))
    .filter((section) => section.items.length > 0);
}

const SALARY_PATTERNS = [
  /(?:(?:USD|CAD|GBP|EUR|AUD|SGD|CHF|JPY|NZD)\s*)?(?:\$|£|€|¥)\s*[\d,]+(?:\.\d{2})?(?:\s*[kK])?\s*(?:-|–|—|to)\s*(?:(?:USD|CAD|GBP|EUR|AUD|SGD|CHF|JPY|NZD)\s*)?(?:\$|£|€|¥)\s*[\d,]+(?:\.\d{2})?(?:\s*[kK])?/gi,
  /\$[\d,]+(?:\.\d{2})?(?:\s*[kK])?\s*(?:\/\s*(?:yr|year|annually|annual|hr|hour|hourly))/gi,
];

/* ATS feeds disagree on range punctuation ("$114,000 - $184,000",
   "$114,000—$184,000", "120K to 150K"); normalize every range to a bare
   en dash so adjacent feed rows always match. */
export function normalizeSalaryText(salary: string | null | undefined): string | null {
  if (!salary) return null;
  const cleaned = salary.replace(/\s+/g, " ").trim();
  if (!cleaned) return null;
  return cleaned
    .replace(/(\d[\d,.]*(?:\s?[kK])?)(?:\s+to\s+|\s*[-–—]\s*)([$£€¥]?\s?\d)/g, "$1–$2")
    .replace(/([$£€¥])\s+(\d)/g, "$1$2");
}

export function extractSalaryFromHtml(html: string | null | undefined): string | null {
  if (!html) return null;
  const div = document.createElement("div");
  div.innerHTML = decodeEntitiesIfEncoded(html);
  const text = normalizeText(div.textContent ?? "");
  if (!text) return null;

  const matches: string[] = [];
  for (const pattern of SALARY_PATTERNS) {
    const found = text.match(pattern);
    if (!found) continue;
    for (const match of found) {
      const cleaned = normalizeText(match);
      const numbers = cleaned.match(/[\d,]+/g) ?? [];
      const maxValue = Math.max(...numbers.map((value) => parseInt(value.replace(/,/g, ""), 10)));
      if (Number.isFinite(maxValue) && maxValue >= 1000) {
        matches.push(cleaned);
      }
    }
  }

  const unique = [...new Set(matches)];
  if (unique.length === 0) return null;
  return unique.slice(0, 2).join(" · ");
}

export function extractPlainTextFromHtml(html: string | null | undefined): string {
  if (!html) return "";
  const div = document.createElement("div");
  div.innerHTML = decodeEntitiesIfEncoded(html);
  return normalizeText(div.textContent ?? "");
}

const ALLOWED_TAGS = new Set([
  "A",
  "B",
  "BR",
  "DIV",
  "EM",
  "H1",
  "H2",
  "H3",
  "H4",
  "H5",
  "H6",
  "I",
  "LI",
  "OL",
  "P",
  "SECTION",
  "SPAN",
  "STRONG",
  "U",
  "UL",
]);

const BLOCK_TAGS = new Set(["DIV", "P", "SECTION", "UL", "OL", "LI", "H1", "H2", "H3", "H4", "H5", "H6"]);

function unwrapElement(el: Element) {
  const parent = el.parentNode;
  if (!parent) return;
  while (el.firstChild) parent.insertBefore(el.firstChild, el);
  parent.removeChild(el);
}

function isBoilerplateBlock(text: string): boolean {
  return /equal opportunity|reasonable accommodation|pay transparency|privacy notice|applicant privacy|do not discriminate|diversity and inclusion|diversity, equity/i.test(text);
}

// Only treat a block as removable boilerplate when it is *mostly* boilerplate.
// Otherwise an outer container that merely contains an EEO paragraph (common with
// Greenhouse, which wraps the whole posting in one <div>) would delete the entire
// description. Containers that wrap substantial non-boilerplate content are kept;
// the boilerplate paragraphs inside them get removed individually.
function blockIsMostlyBoilerplate(el: Element): boolean {
  const text = normalizeText(el.textContent ?? "");
  if (!isBoilerplateBlock(text)) return false;
  for (const child of Array.from(
    el.querySelectorAll("p, li, ul, ol, div, section, h1, h2, h3, h4, h5, h6")
  )) {
    const childText = normalizeText(child.textContent ?? "");
    if (childText.length > 40 && !isBoilerplateBlock(childText)) {
      return false;
    }
  }
  return true;
}

function sanitizeUrl(value: string): string | null {
  try {
    const url = new URL(value, window.location.origin);
    if (url.protocol === "http:" || url.protocol === "https:" || url.protocol === "mailto:") {
      return url.href;
    }
  } catch {
    return null;
  }
  return null;
}

export function sanitizeJobDescriptionHtml(html: string | null | undefined): string {
  if (!html) return "";

  const template = document.createElement("template");
  template.innerHTML = decodeEntitiesIfEncoded(html);

  template.content.querySelectorAll("script, style, iframe, object, embed, img, video, audio, form, input, button").forEach((el) => {
    el.remove();
  });

  for (const el of Array.from(template.content.querySelectorAll("*"))) {
    // Skip elements already removed via an ancestor in a previous iteration.
    if (!template.content.contains(el)) continue;

    if (BLOCK_TAGS.has(el.tagName) && blockIsMostlyBoilerplate(el)) {
      el.remove();
      continue;
    }

    if (!ALLOWED_TAGS.has(el.tagName)) {
      unwrapElement(el);
      continue;
    }

    // Capture the link target BEFORE stripping attributes — otherwise the href is
    // already gone and the link resolves to the app's own origin.
    const originalHref = el.tagName === "A" ? el.getAttribute("href") : null;

    for (const attr of Array.from(el.attributes)) {
      el.removeAttribute(attr.name);
    }

    if (el.tagName === "A") {
      const href = originalHref ? sanitizeUrl(originalHref) : null;
      if (href) {
        el.setAttribute("href", href);
        el.setAttribute("target", "_blank");
        el.setAttribute("rel", "noopener noreferrer");
      } else {
        unwrapElement(el);
      }
    }
  }

  template.content.querySelectorAll("p, li, h1, h2, h3, h4, h5, h6").forEach((el) => {
    if (!normalizeText(el.textContent ?? "")) el.remove();
  });

  return template.innerHTML.trim();
}
