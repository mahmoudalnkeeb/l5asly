import {
  Box,
  ButtonBase,
  Chip,
  Paper,
  Stack,
  Tooltip,
  Typography,
} from "@mui/material";
import { alpha } from "@mui/material/styles";
import ArticleOutlined from "@mui/icons-material/ArticleOutlined";
import FastForwardOutlined from "@mui/icons-material/FastForwardOutlined";
import PlayCircleOutlined from "@mui/icons-material/PlayCircleOutlined";
import { useId, type ReactElement } from "react";

import type {
  TimelineWindow,
  VerdictSignals,
  WatchVerdict,
} from "@l5sly/contracts";
import {
  calculateFocusSeconds,
  formatTimestamp,
  getContentProps,
} from "./format";

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

interface VerdictStyle {
  label: string;
  color: "success" | "primary" | "warning";
  icon: ReactElement;
}

export const verdictStyles: Record<
  WatchVerdict["recommendation"],
  VerdictStyle
> = {
  watch: {
    label: "Worth watching",
    color: "success",
    icon: <PlayCircleOutlined />,
  },
  "watch-key-moments": {
    label: "Key moments only",
    color: "primary",
    icon: <FastForwardOutlined />,
  },
  skip: {
    label: "Brief is enough",
    color: "warning",
    icon: <ArticleOutlined />,
  },
};

interface VerdictPanelProps {
  verdict: WatchVerdict;
  // Results created before the timeline feature have none.
  timeline?: TimelineWindow[];
  durationSeconds: number;
  onSelectTime: (seconds: number) => void;
}

// The verdict answers the app's core question, so it leads the result page.
export function VerdictPanel({
  verdict,
  timeline,
  durationSeconds,
  onSelectTime,
}: VerdictPanelProps) {
  const verdictStyle = verdictStyles[verdict.recommendation];
  const hasTimeline = timeline !== undefined && timeline.length > 0;

  return (
    <Paper
      component="section"
      aria-label="Watch verdict"
      sx={(theme) => ({
        p: { xs: 2.5, sm: 3 },
        mb: 3,
        bgcolor: alpha(theme.palette[verdictStyle.color].main, 0.1),
        display: "grid",
        gridTemplateColumns: {
          xs: "minmax(0, 1fr)",
          md: hasTimeline ? "minmax(0, 1fr) minmax(0, 360px)" : "1fr",
        },
        gap: { xs: 3, md: 5 },
        alignItems: "start",
      })}
    >
      <Box sx={{ minWidth: 0 }}>
        <Stack
          direction="row"
          spacing={1}
          sx={{ alignItems: "center", color: `${verdictStyle.color}.main` }}
        >
          {verdictStyle.icon}
          <Typography variant="body2" sx={{ fontWeight: 700 }}>
            {verdictStyle.label}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            · {Math.round(verdict.confidence * 100)}% confidence
          </Typography>
        </Stack>
        <Typography
          variant="h2"
          {...getContentProps(verdict.headline)}
          sx={{ mt: 1, fontSize: { xs: "1.25rem", sm: "1.5rem" } }}
        >
          {verdict.headline}
        </Typography>
        <Typography
          color="text.secondary"
          {...getContentProps(verdict.reason)}
          sx={{ mt: 1 }}
        >
          {verdict.reason}
        </Typography>
        {verdict.signals ? (
          <VerdictSignalChips signals={verdict.signals} />
        ) : null}
      </Box>
      {hasTimeline ? (
        <RelevanceTimeline
          timeline={timeline}
          durationSeconds={durationSeconds}
          onSelectTime={onSelectTime}
        />
      ) : null}
    </Paper>
  );
}

interface RelevanceTimelineProps {
  timeline: TimelineWindow[];
  durationSeconds: number;
  onSelectTime: (seconds: number) => void;
}

function RelevanceTimeline({
  timeline,
  durationSeconds,
  onSelectTime,
}: RelevanceTimelineProps) {
  const titleId = useId();
  const focusSeconds = calculateFocusSeconds(timeline);
  const totalSeconds = Math.max(
    durationSeconds,
    timeline.at(-1)?.endSeconds ?? 0,
  );

  return (
    <Box role="group" aria-labelledby={titleId} sx={{ minWidth: 0 }}>
      <Typography variant="h3" id={titleId}>
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
        sx={{ display: "flex", height: 28, mt: 1.5, gap: "3px" }}
      >
        {timeline.map((window) => {
          const range = `${formatTimestamp(window.startSeconds)}–${formatTimestamp(window.endSeconds)}`;
          const percent = Math.round(window.relevance * 100);
          return (
            <Box
              key={window.startSeconds}
              role="listitem"
              aria-label={`${range}, ${percent}% relevant`}
              sx={{
                flexGrow: Math.max(1, window.endSeconds - window.startSeconds),
                flexBasis: 0,
                display: "flex",
              }}
            >
              <Tooltip title={`${range} · ${percent}% relevant`}>
                <ButtonBase
                  aria-label={`Jump to transcript at ${formatTimestamp(window.startSeconds)}`}
                  onClick={() => onSelectTime(window.startSeconds)}
                  sx={(theme) => ({
                    flex: 1,
                    borderRadius: 1,
                    bgcolor: alpha(
                      theme.palette.primary.main,
                      0.12 + 0.88 * window.relevance,
                    ),
                    transition: theme.transitions.create("transform"),
                    "&:hover": { transform: "scaleY(1.15)" },
                    "&.Mui-focusVisible": {
                      outline: "2px solid",
                      outlineColor: "primary.main",
                      outlineOffset: 2,
                    },
                  })}
                />
              </Tooltip>
            </Box>
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
