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
import { getLeadCardShadow } from "@/components/material-theme";
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
      sx={{ flexWrap: "wrap", gap: 0.75, m: 0, p: 0, listStyle: "none" }}
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
  // Short name on the three-step verdict scale.
  scaleLabel: string;
  color: "success" | "primary" | "warning";
  icon: ReactElement;
}

type Recommendation = WatchVerdict["recommendation"];

export const verdictStyles: Record<Recommendation, VerdictStyle> = {
  watch: {
    label: "Worth watching",
    scaleLabel: "Watch it",
    color: "success",
    icon: <PlayCircleOutlined />,
  },
  "watch-key-moments": {
    label: "Key moments only",
    scaleLabel: "Key moments",
    color: "primary",
    icon: <FastForwardOutlined />,
  },
  skip: {
    label: "Brief is enough",
    scaleLabel: "Skip it",
    color: "warning",
    icon: <ArticleOutlined />,
  },
};

const SCALE_ORDER: Recommendation[] = ["watch", "watch-key-moments", "skip"];

interface VerdictScaleProps {
  recommendation: Recommendation;
  // A quick check reads only public metadata, so its scale is drawn lighter.
  isProvisional?: boolean;
}

// Shows the verdict as one position on a fixed watch → skip scale, so every
// verdict reads the same way wherever it appears.
export function VerdictScale({
  recommendation,
  isProvisional = false,
}: VerdictScaleProps) {
  const verdictStyle = verdictStyles[recommendation];
  return (
    <Box
      role="img"
      aria-label={`Verdict: ${verdictStyle.label}`}
      sx={{
        display: "grid",
        gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
        border: 1,
        borderStyle: isProvisional ? "dashed" : "solid",
        borderColor: "divider",
        borderRadius: 2,
        overflow: "hidden",
      }}
    >
      {SCALE_ORDER.map((option) => {
        const isSelected = option === recommendation;
        return (
          <Box
            key={option}
            aria-hidden
            sx={(theme) => ({
              py: 1,
              px: 0.5,
              textAlign: "center",
              fontSize: "0.8125rem",
              fontWeight: 600,
              color: isSelected ? "text.primary" : "text.secondary",
              bgcolor: isSelected
                ? alpha(
                    theme.palette[verdictStyle.color].main,
                    isProvisional ? 0.12 : 0.2,
                  )
                : "transparent",
              "& + &": { borderInlineStart: 1, borderColor: "divider" },
            })}
          >
            {verdictStyles[option].scaleLabel}
          </Box>
        );
      })}
    </Box>
  );
}

interface AnswerPanelProps {
  verdict: WatchVerdict;
  viewerAnswer: string;
  // The question asked when the job was created, if any.
  expectation?: string;
  // Results created before the timeline feature have none.
  timeline?: TimelineWindow[];
  durationSeconds: number;
  onSelectTime: (seconds: number) => void;
}

// Answers the question the viewer came with, then the app's core question:
// is the video worth watching, and which parts.
export function AnswerPanel({
  verdict,
  viewerAnswer,
  expectation,
  timeline,
  durationSeconds,
  onSelectTime,
}: AnswerPanelProps) {
  const verdictStyle = verdictStyles[verdict.recommendation];
  const hasTimeline = timeline !== undefined && timeline.length > 0;

  return (
    <Paper
      variant="outlined"
      component="section"
      aria-label="Answer and verdict"
      sx={(theme) => ({
        mb: 4,
        boxShadow: getLeadCardShadow(theme.palette.mode),
      })}
    >
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: { xs: "1fr", sm: "112px minmax(0, 1fr)" },
          columnGap: 1.5,
          rowGap: 0.25,
          px: { xs: 2.5, sm: 3 },
          py: 1.75,
          borderBottom: "1px dashed",
          borderColor: "divider",
        }}
      >
        <Typography
          variant="body2"
          color="text.secondary"
          sx={{ fontWeight: 600 }}
        >
          {expectation ? "You asked" : "Your goals"}
        </Typography>
        {expectation ? (
          <Typography variant="body2" {...getContentProps(expectation)}>
            {expectation}
          </Typography>
        ) : (
          <Typography variant="body2" color="text.secondary">
            No question for this video, so the brief follows your profile.
          </Typography>
        )}
      </Box>

      <Stack spacing={2.5} sx={{ p: { xs: 2.5, sm: 3 } }}>
        <Typography
          {...getContentProps(viewerAnswer)}
          sx={{
            fontSize: { xs: "1.125rem", sm: "1.25rem" },
            fontWeight: 500,
            lineHeight: 1.55,
            maxWidth: "62ch",
          }}
        >
          {viewerAnswer}
        </Typography>

        <Box>
          <Stack
            direction="row"
            spacing={1}
            sx={{
              alignItems: "center",
              mb: 1.5,
              color: `${verdictStyle.color}.main`,
            }}
          >
            {verdictStyle.icon}
            <Typography variant="body2" sx={{ fontWeight: 700 }}>
              {verdictStyle.label}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              · {Math.round(verdict.confidence * 100)}% confidence
            </Typography>
          </Stack>
          <VerdictScale recommendation={verdict.recommendation} />
        </Box>

        <Box>
          <Typography
            variant="h2"
            {...getContentProps(verdict.headline)}
            sx={{ fontSize: { xs: "1.125rem", sm: "1.25rem" } }}
          >
            {verdict.headline}
          </Typography>
          <Typography
            color="text.secondary"
            {...getContentProps(verdict.reason)}
            sx={{ mt: 0.5 }}
          >
            {verdict.reason}
          </Typography>
        </Box>

        {verdict.signals ? (
          <VerdictSignalChips signals={verdict.signals} />
        ) : null}

        {hasTimeline ? (
          <RelevanceTimeline
            timeline={timeline}
            durationSeconds={durationSeconds}
            onSelectTime={onSelectTime}
          />
        ) : null}
      </Stack>
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
    <Box
      role="group"
      aria-labelledby={titleId}
      sx={{ minWidth: 0, pt: 2.5, borderTop: 1, borderColor: "divider" }}
    >
      <Stack
        direction="row"
        sx={{
          justifyContent: "space-between",
          alignItems: "baseline",
          flexWrap: "wrap",
          columnGap: 2,
        }}
      >
        <Typography variant="h3" id={titleId}>
          Where the value is
        </Typography>
        <Typography variant="body2" color="text.secondary">
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
      </Stack>
      <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
        Darker parts matter more to you. Choose one to read it in the
        transcript.
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
