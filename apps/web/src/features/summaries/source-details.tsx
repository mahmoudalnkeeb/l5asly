import { Box, Link, Stack, Typography } from "@mui/material";
import HeadphonesOutlined from "@mui/icons-material/HeadphonesOutlined";
import MovieOutlined from "@mui/icons-material/MovieOutlined";
import OpenInNew from "@mui/icons-material/OpenInNew";
import UploadFileOutlined from "@mui/icons-material/UploadFileOutlined";
import YouTube from "@mui/icons-material/YouTube";
import type { ReactNode } from "react";

import type { SourceType, SummarySource } from "@l5asly/contracts";
import { getContentProps } from "./format";

export const sourceTypeLabels: Record<SourceType, string> = {
  upload: "Uploaded file",
  youtube: "YouTube video",
  public_video: "Video link",
  public_audio: "Audio link",
};

export const sourceTypeIcons: Record<SourceType, ReactNode> = {
  upload: <UploadFileOutlined fontSize="inherit" />,
  youtube: <YouTube fontSize="inherit" />,
  public_video: <MovieOutlined fontSize="inherit" />,
  public_audio: <HeadphonesOutlined fontSize="inherit" />,
};

// Identifies where a summary came from and, for links, leads back to the original media.
export function SourceDetails({ source }: { source: SummarySource }) {
  return (
    <Stack
      direction="row"
      spacing={1.5}
      sx={{ alignItems: "flex-start", minWidth: 0 }}
    >
      <Box
        aria-hidden
        sx={{
          display: "grid",
          placeItems: "center",
          flexShrink: 0,
          width: 36,
          height: 36,
          borderRadius: 1,
          border: 1,
          borderColor: "divider",
          color: source.type === "youtube" ? "error.main" : "primary.main",
          fontSize: 20,
        }}
      >
        {sourceTypeIcons[source.type]}
      </Box>
      <Box sx={{ minWidth: 0 }}>
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{
            display: "block",
            fontFamily: "var(--font-mono)",
            letterSpacing: "0.06em",
            textTransform: "uppercase",
          }}
        >
          {sourceTypeLabels[source.type]}
        </Typography>
        <Typography
          variant="body2"
          {...getContentProps(source.name)}
          sx={{ fontWeight: 600, overflowWrap: "anywhere" }}
        >
          {source.name}
        </Typography>
        {source.type !== "upload" ? (
          <Link
            href={source.url}
            target="_blank"
            rel="noopener noreferrer"
            variant="caption"
            title={source.url}
            dir="ltr"
            sx={{
              display: "inline-flex",
              alignItems: "center",
              gap: 0.5,
              maxWidth: "100%",
              mt: 0.25,
              fontFamily: "var(--font-mono)",
            }}
          >
            <Box
              component="span"
              sx={{
                minWidth: 0,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {source.url}
            </Box>
            <OpenInNew sx={{ fontSize: 14, flexShrink: 0 }} />
            <Box component="span" className="sr-only">
              (opens in a new tab)
            </Box>
          </Link>
        ) : null}
      </Box>
    </Stack>
  );
}

