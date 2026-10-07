import { useQuery } from "@tanstack/react-query";
import { Box, Container, Typography } from "@mui/material";
import { m } from "motion/react";

import { enterAnimation } from "@/components/enter-animation";
import { SummaryForm } from "@/features/summaries/summary-form";
import {
  calculateTimeSaved,
  formatSavedTime,
} from "@/features/summaries/time-saved";
import { listSummaries } from "@/lib/api-client";

export function CreateSummaryPage() {
  return (
    <Container
      maxWidth="lg"
      component="section"
      aria-labelledby="create-summary-title"
      sx={{ pt: { xs: 5, sm: 8 }, pb: 8 }}
    >
      <Box sx={{ textAlign: "center", maxWidth: 640, mx: "auto", mb: 4 }}>
        <Typography
          variant="h1"
          id="create-summary-title"
          sx={{
            fontSize: { xs: "2rem", sm: "2.75rem" },
            fontWeight: 600,
            letterSpacing: "-0.025em",
            lineHeight: 1.12,
            textWrap: "balance",
          }}
        >
          Is this video{" "}
          <Box component="span" sx={{ color: "primary.main" }}>
            worth your time?
          </Box>
        </Typography>
        <Typography color="text.secondary" sx={{ mt: 1.5, fontSize: "1.0625rem" }}>
          Paste a link and say what you want from it. You get a verdict in
          seconds and the brief in a few minutes.
        </Typography>
        <TimeSavedNote />
      </Box>
      <SummaryForm />
    </Container>
  );
}

// A reminder of what the skip verdicts have been worth. It stays hidden until
// there's something to show, and when the library can't be loaded.
function TimeSavedNote() {
  // The same recent-jobs list as the library page, which covers the last 30
  // jobs. That's enough for a week of normal use.
  const recentSummaries = useQuery({
    queryKey: ["summaries"],
    queryFn: ({ signal }) => listSummaries(signal),
  });
  if (!recentSummaries.data) {
    return null;
  }

  const timeSaved = calculateTimeSaved(recentSummaries.data, new Date());
  if (timeSaved.skippedVideos === 0 || timeSaved.savedSeconds < 60) {
    return null;
  }

  const videos = timeSaved.skippedVideos === 1 ? "video" : "videos";
  return (
    <Typography
      component={m.p}
      {...enterAnimation}
      variant="body2"
      color="text.secondary"
      sx={{
        display: "inline-block",
        mt: 2,
        px: 1.5,
        py: 0.5,
        border: 1,
        borderColor: "divider",
        borderRadius: 999,
        bgcolor: "background.paper",
      }}
    >
      {timeSaved.skippedVideos} {videos} flagged as skips this week saved you{" "}
      <Box component="strong" sx={{ color: "primary.main", fontWeight: 600 }}>
        {formatSavedTime(timeSaved.savedSeconds)}
      </Box>
    </Typography>
  );
}
