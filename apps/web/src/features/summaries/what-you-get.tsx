import { Box, Typography } from "@mui/material";
import { AnimatePresence, m, useReducedMotion } from "motion/react";
import { useEffect, useState, type ReactNode } from "react";

// Counts up once per interval while running. Each demo derives its frame from
// the count, so there's one timer per demo and no state to reset.
function useTicker(intervalMs: number, isRunning: boolean): number {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!isRunning) return;
    const timer = window.setInterval(() => setTick((count) => count + 1), intervalMs);
    return () => window.clearInterval(timer);
  }, [intervalMs, isRunning]);
  return tick;
}

const VERDICTS = ["Watch it", "Key moments", "Skip it"] as const;

function VerdictDemo({ isAnimated }: { isAnimated: boolean }) {
  const tick = useTicker(2200, isAnimated);
  const verdict = VERDICTS[tick % VERDICTS.length];
  return (
    <Box sx={{ height: 26 }}>
      <AnimatePresence mode="wait" initial={false}>
        <Box
          key={verdict}
          component={m.span}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.2 }}
          sx={{
            display: "inline-block",
            px: 1.25,
            py: 0.25,
            borderRadius: 999,
            border: 1,
            borderColor: verdict === "Skip it" ? "warning.main" : "primary.main",
            color: verdict === "Skip it" ? "warning.main" : "primary.main",
            typography: "caption",
            fontWeight: 600,
          }}
        >
          {verdict}
        </Box>
      </AnimatePresence>
    </Box>
  );
}

const BRIEF_ANSWER = "Yes. Minutes 6 to 14 cover it.";
// Ticks spent showing the full answer before it types out again.
const BRIEF_PAUSE_TICKS = 40;

function BriefDemo({ isAnimated }: { isAnimated: boolean }) {
  const tick = useTicker(55, isAnimated);
  const cycleLength = BRIEF_ANSWER.length + BRIEF_PAUSE_TICKS;
  const typedLength = isAnimated
    ? Math.min(tick % cycleLength, BRIEF_ANSWER.length)
    : BRIEF_ANSWER.length;
  return (
    <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
      {BRIEF_ANSWER.slice(0, typedLength)}
      {isAnimated ? (
        <Box
          component="span"
          sx={{
            display: "inline-block",
            width: "1px",
            height: "1em",
            ml: "1px",
            verticalAlign: "text-bottom",
            bgcolor: "text.secondary",
          }}
        />
      ) : null}
    </Typography>
  );
}

const TRANSCRIPT_LINES = [
  { time: "06:12", text: "Here's the part that matters." },
  { time: "06:40", text: "Start with the slow query log." },
  { time: "07:05", text: "Then add the missing index." },
] as const;

function TranscriptDemo({ isAnimated }: { isAnimated: boolean }) {
  const tick = useTicker(1600, isAnimated);
  const activeLine = tick % TRANSCRIPT_LINES.length;
  return (
    <Box sx={{ display: "grid", gap: 0.25 }}>
      {TRANSCRIPT_LINES.map((line, index) => (
        <Typography
          key={line.time}
          variant="caption"
          sx={{
            display: "block",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            color: index === activeLine ? "text.primary" : "text.secondary",
            opacity: index === activeLine ? 1 : 0.6,
            transition: "color 300ms, opacity 300ms",
          }}
        >
          <Box component="span" sx={{ fontFamily: "var(--font-mono)", mr: 0.75 }}>
            {line.time}
          </Box>
          {line.text}
        </Typography>
      ))}
    </Box>
  );
}

interface Benefit {
  title: string;
  detail: string;
  demo: (isAnimated: boolean) => ReactNode;
}

const BENEFITS: Benefit[] = [
  {
    title: "A verdict in seconds",
    detail:
      "Paste a YouTube link to see watch, key moments or skip before you start.",
    demo: (isAnimated) => <VerdictDemo isAnimated={isAnimated} />,
  },
  {
    title: "A brief that answers you",
    detail: "Your question first, then what the video actually says.",
    demo: (isAnimated) => <BriefDemo isAnimated={isAnimated} />,
  },
  {
    title: "The full transcript",
    detail: "Timestamped, in the language the video is spoken in.",
    demo: (isAnimated) => <TranscriptDemo isAnimated={isAnimated} />,
  },
];

// The three things a summary gives, each with a small looping example. The
// examples are decorative, so screen readers skip them, and they hold still
// when the viewer asks for reduced motion.
export function WhatYouGet() {
  const isAnimated = !useReducedMotion();
  return (
    <Box
      component="ul"
      aria-label="What you get"
      sx={{
        display: "grid",
        gridTemplateColumns: { xs: "1fr", sm: "repeat(3, minmax(0, 1fr))" },
        gap: 1.5,
        m: 0,
        p: 0,
        listStyle: "none",
      }}
    >
      {BENEFITS.map((benefit) => (
        <Box
          component="li"
          key={benefit.title}
          sx={{
            display: "flex",
            flexDirection: "column",
            gap: 1.5,
            border: "1px dashed",
            borderColor: "divider",
            borderRadius: 3,
            px: 2,
            py: 1.75,
          }}
        >
          <Typography variant="body2" sx={{ fontWeight: 600 }}>
            {benefit.title}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
            {benefit.detail}
          </Typography>
          <Box
            aria-hidden
            data-testid="benefit-demo"
            sx={{
              mt: "auto",
              pt: 1.25,
              borderTop: "1px dashed",
              borderColor: "divider",
              minHeight: 64,
            }}
          >
            {benefit.demo(isAnimated)}
          </Box>
        </Box>
      ))}
    </Box>
  );
}
