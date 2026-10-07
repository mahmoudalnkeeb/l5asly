import { Box, Button, Chip, Paper, Stack, Typography } from "@mui/material";
import ArrowForward from "@mui/icons-material/ArrowForward";

import type { PrecheckResult as PrecheckResultData } from "@l5asly/contracts";
import { formatTimestamp, getContentProps } from "./format";
import { VerdictScale, VerdictSignalChips } from "./verdict-insights";

const recommendationLabels: Record<
  PrecheckResultData["verdict"]["recommendation"],
  string
> = {
  watch: "Looks worth watching",
  "watch-key-moments": "Likely worth a partial watch",
  skip: "Likely skip",
};

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
  const details: string[] = [];
  if (result.channel) {
    details.push(result.channel);
  }
  if (result.durationSeconds !== null) {
    details.push(formatTimestamp(result.durationSeconds));
  }

  return (
    <Paper
      variant="outlined"
      component="section"
      aria-label="Quick check result"
      sx={{ p: { xs: 2.5, sm: 3 }, display: "grid", gap: 2 }}
    >
      <Box>
        <Chip
          size="small"
          variant="outlined"
          color={result.verdict.recommendation === "skip" ? "warning" : "primary"}
          label={recommendationLabels[result.verdict.recommendation]}
          sx={{ mb: 1.25 }}
        />
        <Typography sx={{ fontWeight: 600 }} {...getContentProps(result.title)}>
          {result.title}
        </Typography>
        {details.length ? (
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ fontFamily: "var(--font-mono)" }}
            {...getContentProps(details.join(" · "))}
          >
            {details.join(" · ")}
          </Typography>
        ) : null}
      </Box>
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
