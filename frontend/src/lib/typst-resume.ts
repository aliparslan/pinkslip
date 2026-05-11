type ResumeLine =
  | { kind: "heading"; text: string }
  | { kind: "bullet"; text: string }
  | { kind: "text"; text: string }
  | { kind: "blank" };

interface TailoredResumeTypstOptions {
  companyName?: string | null;
  jobTitle?: string | null;
}

function stripMarkdownInline(input: string) {
  return input
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1 ($2)")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/_([^_]+)_/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .trim();
}

function headingFromLine(line: string) {
  const markdownHeading = line.match(/^#{1,4}\s+(.+)$/);
  if (markdownHeading) return stripMarkdownInline(markdownHeading[1]).replace(/:$/, "");

  const noColon = stripMarkdownInline(line).replace(/:$/, "");
  if (noColon.length > 2 && noColon.length < 64 && /^[A-Z][A-Z0-9/&., +'-]+$/.test(noColon)) {
    return noColon;
  }

  return null;
}

function parseResumeLines(markdown: string): ResumeLine[] {
  return markdown
    .replace(/\r/g, "")
    .split("\n")
    .map((rawLine) => {
      const line = rawLine.trim();
      if (!line) return { kind: "blank" };

      const heading = headingFromLine(line);
      if (heading) return { kind: "heading", text: heading };

      const bullet = line.match(/^[-*\u2022]\s+(.+)$/);
      if (bullet) return { kind: "bullet", text: bullet[1].trim() };

      return { kind: "text", text: line };
    });
}

function escapeTypst(input: string) {
  return stripMarkdownInline(input)
    .replace(/\\/g, String.raw`\\`)
    .replace(/#/g, String.raw`\#`)
    .replace(/\$/g, String.raw`\$`)
    .replace(/%/g, String.raw`\%`)
    .replace(/&/g, String.raw`\&`)
    .replace(/_/g, String.raw`\_`)
    .replace(/\*/g, String.raw`\*`)
    .replace(/\[/g, String.raw`\[`)
    .replace(/\]/g, String.raw`\]`)
    .replace(/@/g, String.raw`\@`);
}

function typstText(input: string) {
  return `[${escapeTypst(input)}]`;
}

function renderTextLine(text: string) {
  if (text.includes("|") || / -- | - /.test(text)) {
    return `#text(weight: "bold")${typstText(text)}`;
  }
  return typstText(text);
}

export function buildTailoredResumeTypst(markdown: string, options: TailoredResumeTypstOptions = {}) {
  const lines = parseResumeLines(markdown);
  const output: string[] = [
    `// Tailored for ${options.companyName ?? "job"} - ${options.jobTitle ?? "role"}`,
    `#set document(title: "Tailored Resume")`,
    `#set page(paper: "us-letter", margin: (x: 0.55in, y: 0.42in))`,
    `#set text(font: ("Arial", "Helvetica", "Liberation Sans"), size: 11pt, lang: "en")`,
    `#set par(leading: 0.42em, spacing: 0.18em)`,
    `#set list(indent: 0.18in, body-indent: 0.12in, spacing: 0.12em)`,
    ``,
    `#let resume-section(title) = {`,
    `  v(0.28em)`,
    `  text(size: 10pt, weight: "bold", tracking: 0.04em)[#title]`,
    `  v(-0.35em)`,
    `  line(length: 100%, stroke: 0.55pt)`,
    `  v(-0.42em)`,
    `}`,
    ``,
  ];

  let seenHeading = false;
  let headerLines: string[] = [];
  let inList = false;

  const closeList = () => {
    if (!inList) return;
    output.push("");
    inList = false;
  };

  const flushHeader = () => {
    if (seenHeading || headerLines.length === 0) return;
    const [name, ...contact] = headerLines;
    output.push(`#align(center)[`);
    output.push(`  #text(size: 18pt, weight: "bold")${typstText(name)}`);
    if (contact.length > 0) {
      output.push(`  #linebreak()`);
      output.push(`  #text(size: 10pt)${typstText(contact.join(" | "))}`);
    }
    output.push(`]`);
    output.push(`#v(-0.55em)`);
    output.push("");
    headerLines = [];
  };

  for (const line of lines) {
    if (line.kind === "blank") {
      closeList();
      if (!seenHeading) flushHeader();
      continue;
    }

    if (line.kind === "heading") {
      closeList();
      flushHeader();
      seenHeading = true;
      output.push(`#resume-section(${JSON.stringify(stripMarkdownInline(line.text).toUpperCase())})`);
      continue;
    }

    if (!seenHeading && line.kind === "text") {
      headerLines.push(line.text);
      continue;
    }

    flushHeader();

    if (line.kind === "bullet") {
      output.push(`- ${escapeTypst(line.text)}`);
      inList = true;
      continue;
    }

    closeList();
    output.push(renderTextLine(line.text));
  }

  closeList();
  flushHeader();

  return output.join("\n").trim() + "\n";
}
