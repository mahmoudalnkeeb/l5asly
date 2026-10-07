import type { SummaryResult } from "@l5asly/contracts";

function guidanceLines(result: SummaryResult): string[] {
  const guidance = result.personalizedGuidance;
  if (!guidance) return [];

  const lines = ["VIEWING PLAN", guidance.relevance, ""];
  if (guidance.prerequisites.length) {
    lines.push("PREPARATION");
    for (const item of guidance.prerequisites) {
      lines.push(`- ${item.topic} (${item.status}): ${item.reason}`);
    }
    lines.push("");
  }
  if (guidance.nextSteps.length) {
    lines.push("NEXT STEPS");
    for (const step of guidance.nextSteps) {
      lines.push(`- ${step}`);
    }
    lines.push("");
  }
  return lines;
}

// Plain text copied to the clipboard by "Copy summary".
export function buildSummaryText(result: SummaryResult): string {
  const lines = [
    result.title,
    "",
    result.overview,
    "",
    "DIRECT ANSWER",
    result.viewerAnswer,
    "",
    ...guidanceLines(result),
  ];
  for (const section of result.sections) {
    lines.push(section.title, section.body, "");
  }
  return lines.join("\n");
}

// Plain text saved by "Download notes".
export function buildNotesText(result: SummaryResult): string {
  const lines = [
    result.title,
    "",
    "WATCH VERDICT",
    `${result.verdict.headline}: ${result.verdict.reason}`,
    "",
    "DIRECT ANSWER",
    result.viewerAnswer,
    "",
    ...guidanceLines(result),
  ];
  if (result.caveats.length) {
    lines.push("CAVEATS");
    for (const caveat of result.caveats) {
      lines.push(`- ${caveat}`);
    }
    lines.push("");
  }
  lines.push("KEY NOTES");
  for (const note of result.notes) {
    lines.push(`- ${note.title}: ${note.detail}`);
  }
  return lines.join("\n");
}

const MAX_FILE_NAME_LENGTH = 80;

// Names the download after the video, keeping only characters that are safe in
// file names on every desktop OS.
export function buildNotesFileName(title: string): string {
  const safeTitle = title
    .replace(/[\/:*?"<>|\p{Cc}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_FILE_NAME_LENGTH)
    .trim();
  return safeTitle ? `${safeTitle} - notes.txt` : "l5asly-notes.txt";
}
