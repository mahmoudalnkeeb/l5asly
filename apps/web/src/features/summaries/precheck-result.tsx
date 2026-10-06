import { Chip, Paper, Typography } from "@mui/material";

import type { PrecheckResult as PrecheckResultData } from "@l5sly/contracts";
import { formatTimestamp } from "./format";
import { VerdictSignalChips } from "./verdict-insights";

const recommendationLabels: Record<
  PrecheckResultData["verdict"]["recommendation"],
  string
> = {
  watch: "Looks worth watching",
  "watch-key-moments": "Likely worth a partial watch",
  skip: "Likely skip",
};

export function PrecheckResult({ result }: { result: PrecheckResultData }) {
  const details = [result.channel];
  if (result.durationSeconds !== null) {
    details.push(formatTimestamp(result.durationSeconds));
  }

  return (
    <Paper variant="outlined" sx={{ p: 2.5 }} aria-label="Quick check result">
      <Chip
        size="small"
        color={result.verdict.recommendation === "skip" ? "warning" : "primary"}
        variant="outlined"
        label={recommendationLabels[result.verdict.recommendation]}
        sx={{ mb: 1 }}
      />
      <Typography sx={{ fontWeight: 600 }} dir="auto">
        {result.title}
      </Typography>
      <Typography variant="caption" color="text.secondary" dir="auto">
        {details.filter(Boolean).join(" · ")}
      </Typography>
      <Typography variant="body2" sx={{ mt: 1.5 }} dir="auto">
        <strong>{result.verdict.headline}.</strong> {result.verdict.reason}
      </Typography>
      {result.verdict.signals ? (
        <VerdictSignalChips signals={result.verdict.signals} />
      ) : null}
      <Typography
        variant="caption"
        color="text.secondary"
        component="p"
        sx={{ mt: 1.5 }}
      >
        Based on the title, description and chapters only. Create a summary for
        a verdict based on what is actually said.
      </Typography>
    </Paper>
  );
}
