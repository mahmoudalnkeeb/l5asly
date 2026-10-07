import { Box, InputAdornment, Stack, TextField, Typography } from "@mui/material";
import SearchOutlined from "@mui/icons-material/SearchOutlined";
import type { ReactNode } from "react";

import type {
  RecommendedMoment,
  SummaryResult,
  TranscriptSegment,
} from "@l5asly/contracts";
import { formatTimestamp, getContentProps } from "./format";

export interface TranscriptRow {
  // Position in the full transcript; stays stable while search filters rows.
  index: number;
  segment: TranscriptSegment;
  moment: RecommendedMoment | null;
}

export function getSegmentElementId(index: number): string {
  return `segment-${index}`;
}

// Pairs each segment with the recommended moment that starts inside it. Runs
// once per result instead of once per segment on every render.
export function buildTranscriptRows(result: SummaryResult): TranscriptRow[] {
  return result.transcript.map((segment, index) => {
    const moment = result.recommendedMoments.find(
      (candidate) =>
        candidate.startSeconds >= segment.startSeconds &&
        candidate.startSeconds < segment.endSeconds,
    );
    return { index, segment, moment: moment ?? null };
  });
}

export function filterTranscriptRows(
  rows: TranscriptRow[],
  query: string,
): TranscriptRow[] {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  if (!normalizedQuery) {
    return rows;
  }
  return rows.filter((row) =>
    row.segment.text.toLocaleLowerCase().includes(normalizedQuery),
  );
}

function highlightTranscriptText(text: string, search: string): ReactNode {
  const query = search.trim();
  if (!query) {
    return text;
  }

  const lowerText = text.toLocaleLowerCase();
  const lowerQuery = query.toLocaleLowerCase();
  const parts: ReactNode[] = [];
  let cursor = 0;
  let matchStart = lowerText.indexOf(lowerQuery, cursor);

  while (matchStart !== -1) {
    if (matchStart > cursor) {
      parts.push(text.slice(cursor, matchStart));
    }

    const matchEnd = matchStart + query.length;
    parts.push(
      <mark
        key={`${matchStart}-${matchEnd}`}
        className="rounded-sm bg-accent px-0.5 text-accent-foreground"
      >
        {text.slice(matchStart, matchEnd)}
      </mark>,
    );
    cursor = matchEnd;
    matchStart = lowerText.indexOf(lowerQuery, cursor);
  }

  if (!parts.length) {
    return text;
  }

  if (cursor < text.length) {
    parts.push(text.slice(cursor));
  }

  return parts;
}

interface TranscriptPanelProps {
  rows: TranscriptRow[];
  totalSegments: number;
  search: string;
  // The search text the visible rows were filtered with. It can lag behind
  // `search` while typing so the field stays responsive on long transcripts.
  appliedSearch: string;
  onSearchChange: (search: string) => void;
  jumpedSegment: number | null;
}

export function TranscriptPanel({
  rows,
  totalSegments,
  search,
  appliedSearch,
  onSearchChange,
  jumpedSegment,
}: TranscriptPanelProps) {
  return (
    <>
      <Stack
        direction={{ xs: "column", sm: "row" }}
        spacing={2}
        sx={{ mb: 3, justifyContent: "space-between" }}
      >
        <Box>
          <Typography variant="h2">Transcript</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            {appliedSearch
              ? `${rows.length} of ${totalSegments} segments match.`
              : `${totalSegments} timestamped segments.`}
          </Typography>
        </Box>
        <TextField
          label="Search transcript"
          type="search"
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Search words or phrases"
          sx={{ width: { xs: "100%", sm: 320 } }}
          slotProps={{
            htmlInput: { dir: "auto" },
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <SearchOutlined fontSize="small" />
                </InputAdornment>
              ),
            },
          }}
        />
      </Stack>
      <Box sx={{ maxWidth: 900 }}>
        {rows.map(({ index, segment, moment }) => (
          <Box
            key={`${segment.startSeconds}-${segment.endSeconds}`}
            id={getSegmentElementId(index)}
            tabIndex={-1}
            dir={getContentProps(segment.text).dir}
            sx={{
              outline: index === jumpedSegment ? "2px solid" : "none",
              outlineColor: "primary.main",
              scrollMarginTop: 96,
              // Lets the browser skip layout for off-screen segments of long
              // transcripts without a virtualization library.
              contentVisibility: "auto",
              containIntrinsicSize: "auto 96px",
              display: "grid",
              gridTemplateColumns: "64px minmax(0, 1fr)",
              gap: 2,
              p: 2,
              mb: 1,
              borderRadius: 2,
              bgcolor: moment ? "action.selected" : "transparent",
              borderBottom: 1,
              borderColor: "divider",
            }}
          >
            <Typography
              component="time"
              dir="ltr"
              lang="en"
              variant="caption"
              color={moment ? "primary" : "text.secondary"}
              sx={{
                fontFamily: "var(--font-mono)",
                pt: 0.5,
                whiteSpace: "nowrap",
                unicodeBidi: "isolate",
              }}
            >
              {formatTimestamp(segment.startSeconds)}
            </Typography>
            <Box sx={{ minWidth: 0 }}>
              {moment ? (
                <Typography
                  variant="body2"
                  color="primary"
                  sx={{ mb: 1, fontWeight: 600 }}
                  {...getContentProps(moment.title)}
                >
                  {moment.title}
                </Typography>
              ) : null}
              <Typography
                color="text.secondary"
                {...getContentProps(segment.text)}
              >
                {highlightTranscriptText(segment.text, appliedSearch)}
              </Typography>
            </Box>
          </Box>
        ))}
        {!rows.length ? (
          <Typography color="text.secondary" sx={{ py: 4 }}>
            No transcript lines match that search.
          </Typography>
        ) : null}
      </Box>
    </>
  );
}
