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

export function parseJobDescription(html: string): DescSection[] {
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

export function extractSalaryFromHtml(html: string | null | undefined): string | null {
  if (!html) return null;
  const div = document.createElement("div");
  div.innerHTML = html;
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
  div.innerHTML = html;
  return normalizeText(div.textContent ?? "");
}
