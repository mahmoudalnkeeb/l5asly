import { Box, Chip, Stack, Tooltip, Typography } from "@mui/material";
import { alpha } from "@mui/material/styles";

import type { TimelineWindow, VerdictSignals } from "@l5sly/contracts";
import { calculateFocusSeconds, formatTimestamp } from "./format";

const HIGH_SIGNAL = 0.65;
const LOW_SIGNAL = 0.35;

type SignalLevel = "good" | "mixed" | "poor";

interface SignalLabel {
  label: string;
  level: SignalLevel;
}

function describeSignals(signals: VerdictSignals): SignalLabel[] {
  const labels: SignalLabel[] = [];

  if (signals.answersQuestion !== null) {
    if (signals.answersQuestion >= HIGH_SIGNAL) {
      labels.push({ label: "Answers your question", level: "good" });
    } else if (signals.answersQuestion < LOW_SIGNAL) {
      labels.push({ label: "Doesn't answer your question", level: "poor" });
    } else {
      labels.push({ label: "Partly answers your question", level: "mixed" });
    }
  }

  if (signals.informationDensity >= HIGH_SIGNAL) {
    labels.push({ label: "Dense content", level: "good" });
  } else if (signals.informationDensity < LOW_SIGNAL) {
    labels.push({ label: "Light on detail", level: "poor" });
  } else {
    labels.push({ label: "Moderate detail", level: "mixed" });
  }

  if (signals.padding >= HIGH_SIGNAL) {
    labels.push({ label: "Lots of filler", level: "poor" });
  } else if (signals.padding < LOW_SIGNAL) {
    labels.push({ label: "Little filler", level: "good" });
  }

  if (signals.knowledgeGap >= HIGH_SIGNAL) {
    labels.push({ label: "Assumes background you may lack", level: "poor" });
  }

  return labels;
}

const chipColors = {
  good: "success",
  mixed: "default",
  poor: "warning",
} as const;

export function VerdictSignalChips({ signals }: { signals: VerdictSignals }) {
  return (
    <Stack
      component="ul"
      direction="row"
      aria-label="Verdict signals"
      sx={{ flexWrap: "wrap", gap: 0.75, mt: 1.5, p: 0, listStyle: "none" }}
    >
      {describeSignals(signals).map((signal) => (
        <li key={signal.label}>
          <Chip
            size="small"
            variant="outlined"
            color={chipColors[signal.level]}
            label={signal.label}
          />
        </li>
      ))}
    </Stack>
  );
}

export function RelevanceTimeline({
  timeline,
  durationSeconds,
}: {
  timeline: TimelineWindow[];
  durationSeconds: number;
}) {
  const focusSeconds = calculateFocusSeconds(timeline);
  const totalSeconds = Math.max(
    durationSeconds,
    timeline.at(-1)?.endSeconds ?? 0,
  );

  return (
    <Box component="section" aria-labelledby="timeline-title" sx={{ mb: 3 }}>
      <Typography variant="h3" id="timeline-title">
        Where the value is
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
        {focusSeconds > 0 ? (
          <>
            Focus on{" "}
            <bdi dir="ltr" className="font-mono">
              {formatTimestamp(focusSeconds)}
            </bdi>{" "}
            of{" "}
            <bdi dir="ltr" className="font-mono">
              {formatTimestamp(totalSeconds)}
            </bdi>
          </>
        ) : (
          "No part of the video stands out for your goal."
        )}
      </Typography>
      <Box
        role="list"
        aria-label="Relevance by part of the video"
        dir="ltr"
        sx={{
          display: "flex",
          height: 20,
          mt: 1.25,
          borderRadius: 1,
          overflow: "hidden",
          gap: "2px",
        }}
      >
        {timeline.map((window) => {
          const range = `${formatTimestamp(window.startSeconds)}–${formatTimestamp(window.endSeconds)}`;
          const percent = Math.round(window.relevance * 100);
          return (
            <Tooltip
              key={window.startSeconds}
              title={`${range} · ${percent}% relevant`}
            >
              <Box
                role="listitem"
                aria-label={`${range}, ${percent}% relevant`}
                sx={(theme) => ({
                  flexGrow: Math.max(
                    1,
                    window.endSeconds - window.startSeconds,
                  ),
                  flexBasis: 0,
                  bgcolor: alpha(
                    theme.palette.primary.main,
                    0.12 + 0.88 * window.relevance,
                  ),
                })}
              />
            </Tooltip>
          );
        })}
      </Box>
      <Stack
        direction="row"
        dir="ltr"
        sx={{ justifyContent: "space-between", mt: 0.5 }}
      >
        <Typography
          variant="caption"
          color="text.secondary"
          className="font-mono"
        >
          0:00
        </Typography>
        <Typography
          variant="caption"
          color="text.secondary"
          className="font-mono"
        >
          {formatTimestamp(totalSeconds)}
        </Typography>
      </Stack>
    </Box>
  );
}
