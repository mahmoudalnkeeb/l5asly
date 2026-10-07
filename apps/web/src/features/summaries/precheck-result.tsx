import { Box, Button, Chip, Paper, Stack, Typography } from "@mui/material";
import ArrowForward from "@mui/icons-material/ArrowForward";
import { m } from "motion/react";

import type { PrecheckResult as PrecheckResultData } from "@l5asly/contracts";
import { enterAnimation } from "@/components/enter-animation";
import { getContentProps } from "./format";
import { VerdictScale, VerdictSignalChips } from "./verdict-insights";

type Recommendation = PrecheckResultData["verdict"]["recommendation"];

const recommendationLabels: Record<Recommendation, string> = {
  watch: "Looks worth watching",
  "watch-key-moments": "Likely worth a partial watch",
  skip: "Likely skip",
};

// The provisional verdict, shown beside the video preview once the quick
// check returns.
export function PrecheckVerdictChip({
  recommendation,
}: {
  recommendation: Recommendation;
}) {
  return (
    <Chip
      size="small"
      variant="outlined"
      color={recommendation === "skip" ? "warning" : "primary"}
      label={recommendationLabels[recommendation]}
    />
  );
}

interface PrecheckResultProps {
  result: PrecheckResultData;
  // Starts the full summary for the same link.
  onCreateSummary: () => void;
  isCreating: boolean;
}

export function PrecheckResult({
  result,
  onCreateSummary,
  isCreating,
}: PrecheckResultProps) {
  // The title, length and verdict label are already in the video preview above.
  return (
    <Paper
      variant="outlined"
      component={m.section}
      {...enterAnimation}
      aria-label="Quick check result"
      sx={{ p: { xs: 2.5, sm: 3 }, display: "grid", gap: 2 }}
    >
      <VerdictScale
        recommendation={result.verdict.recommendation}
        isProvisional
      />
      <Typography variant="body2" {...getContentProps(result.verdict.reason)}>
        <strong>{result.verdict.headline}.</strong> {result.verdict.reason}
      </Typography>
      {result.verdict.signals ? (
        <VerdictSignalChips signals={result.verdict.signals} />
      ) : null}
      <Stack
        direction={{ xs: "column", sm: "row" }}
        sx={{
          gap: 1.5,
          pt: 2,
          borderTop: 1,
          borderColor: "divider",
          justifyContent: "space-between",
          alignItems: { sm: "center" },
        }}
      >
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ maxWidth: "48ch" }}
        >
          Based on the title, description and chapters only. Create a summary
          for a verdict based on what is actually said.
        </Typography>
        <Button
          endIcon={<ArrowForward />}
          onClick={onCreateSummary}
          disabled={isCreating}
          sx={{ flexShrink: 0, alignSelf: { xs: "flex-start", sm: "auto" } }}
        >
          Get the full brief
        </Button>
      </Stack>
    </Paper>
  );
}
