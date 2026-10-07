import { Box, Skeleton, Stack, Typography } from "@mui/material";
import SmartDisplayOutlined from "@mui/icons-material/SmartDisplayOutlined";
import { m } from "motion/react";

import type {
  VideoPreview as VideoPreviewData,
  WatchVerdict,
} from "@l5asly/contracts";
import { enterAnimation } from "@/components/enter-animation";
import { formatBriefEstimate } from "./brief-estimate";
import { formatTimestamp, getContentProps } from "./format";
import { PrecheckVerdictChip } from "./precheck-result";

const thumbnailSx = {
  width: 96,
  height: 54,
  flexShrink: 0,
  borderRadius: 1.5,
  bgcolor: "var(--muted)",
} as const;

interface VideoPreviewProps {
  preview: VideoPreviewData;
  // Null until the quick check returns.
  recommendation: WatchVerdict["recommendation"] | null;
  // Null when there are too few finished briefs to estimate from.
  briefEstimateSeconds: number | null;
}

// The pasted link's title, channel and length, shown inside the video line so
// the viewer can tell it's the right video before summarizing. The
// provisional verdict and a time estimate join it as they become known.
export function VideoPreview({
  preview,
  recommendation,
  briefEstimateSeconds,
}: VideoPreviewProps) {
  const details: string[] = [];
  if (preview.channel) {
    details.push(preview.channel);
  }
  if (preview.durationSeconds !== null) {
    details.push(formatTimestamp(preview.durationSeconds));
  }

  return (
    <Stack
      component={m.div}
      {...enterAnimation}
      direction="row"
      spacing={1.5}
      aria-label="Video preview"
      role="group"
      sx={{ alignItems: "center", py: 1 }}
    >
      {preview.thumbnailUrl ? (
        <Box
          component="img"
          src={preview.thumbnailUrl}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
          sx={{ ...thumbnailSx, objectFit: "cover" }}
        />
      ) : (
        <Box
          sx={{
            ...thumbnailSx,
            display: "grid",
            placeItems: "center",
            color: "text.secondary",
          }}
        >
          <SmartDisplayOutlined />
        </Box>
      )}
      <Box sx={{ minWidth: 0, flex: 1 }}>
        <Typography
          variant="body2"
          sx={{
            fontWeight: 600,
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
          }}
          {...getContentProps(preview.title)}
        >
          {preview.title}
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
      {recommendation || briefEstimateSeconds !== null ? (
        <Stack
          spacing={0.5}
          sx={{ alignItems: "flex-end", flexShrink: 0, textAlign: "end" }}
        >
          {recommendation ? (
            <PrecheckVerdictChip recommendation={recommendation} />
          ) : null}
          {briefEstimateSeconds !== null ? (
            <Typography variant="caption" color="text.secondary">
              {formatBriefEstimate(briefEstimateSeconds)}
            </Typography>
          ) : null}
        </Stack>
      ) : null}
    </Stack>
  );
}

export function VideoPreviewLoading() {
  return (
    <Stack
      direction="row"
      spacing={1.5}
      role="status"
      aria-label="Loading video details"
      sx={{ alignItems: "center", py: 1 }}
    >
      <Skeleton variant="rounded" sx={thumbnailSx} />
      <Box sx={{ flex: 1 }}>
        <Skeleton width="70%" />
        <Skeleton width="40%" />
      </Box>
    </Stack>
  );
}
