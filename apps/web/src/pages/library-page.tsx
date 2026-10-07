import { useQuery } from "@tanstack/react-query";
import {
  Alert,
  AlertTitle,
  Box,
  Button,
  Chip,
  Container,
  Divider,
  List,
  ListItemButton,
  Paper,
  Skeleton,
  Stack,
  Typography,
} from "@mui/material";
import Add from "@mui/icons-material/Add";
import ArrowForward from "@mui/icons-material/ArrowForward";
import VideoLibraryOutlined from "@mui/icons-material/VideoLibraryOutlined";
import { Link } from "react-router-dom";

import type { SummaryListItem } from "@l5sly/contracts";
import {
  formatCreatedAt,
  formatTimestamp,
  getContentProps,
} from "@/features/summaries/format";
import {
  sourceTypeIcons,
  sourceTypeLabels,
} from "@/features/summaries/source-details";
import { verdictStyles } from "@/features/summaries/verdict-insights";
import { getErrorMessage, listSummaries } from "@/lib/api-client";

type SummaryStatus = SummaryListItem["status"];

const statusLabels: Record<SummaryStatus, string> = {
  queued: "Queued",
  processing: "Processing",
  completed: "Ready",
  failed: "Failed",
  cancelled: "Cancelled",
};

const statusColors: Record<SummaryStatus, "error" | "success" | "default"> = {
  queued: "default",
  processing: "default",
  completed: "success",
  failed: "error",
  cancelled: "default",
};

const actionLabels: Record<SummaryStatus, string> = {
  queued: "View progress",
  processing: "View progress",
  completed: "Read summary",
  failed: "View details",
  cancelled: "View details",
};

// Polls only while a job is still running, so an idle library stays quiet.
const ACTIVE_JOB_POLL_MS = 1_500;

function hasActiveJobs(summaries: SummaryListItem[] | undefined): boolean {
  if (!summaries) {
    return false;
  }
  return summaries.some(
    (summary) =>
      summary.status === "queued" || summary.status === "processing",
  );
}

export function LibraryPage() {
  const summariesQuery = useQuery({
    queryKey: ["summaries"],
    queryFn: ({ signal }) => listSummaries(signal),
    refetchInterval: (query) =>
      hasActiveJobs(query.state.data) ? ACTIVE_JOB_POLL_MS : false,
  });

  return (
    <Container maxWidth="lg" sx={{ pt: { xs: 3, sm: 5 }, pb: 8 }}>
      <Stack
        direction={{ xs: "column", sm: "row" }}
        spacing={2}
        sx={{
          mb: 3,
          justifyContent: "space-between",
          alignItems: { sm: "center" },
        }}
      >
        <Typography variant="h1">Library</Typography>
        <Button variant="contained" component={Link} to="/" startIcon={<Add />}>
          New summary
        </Button>
      </Stack>
      <LibraryContent
        summaries={summariesQuery.data}
        isPending={summariesQuery.isPending}
        error={summariesQuery.error}
      />
    </Container>
  );
}

interface LibraryContentProps {
  summaries: SummaryListItem[] | undefined;
  isPending: boolean;
  error: Error | null;
}

function LibraryContent({ summaries, isPending, error }: LibraryContentProps) {
  if (isPending) {
    return <LibrarySkeleton />;
  }

  if (!summaries) {
    return (
      <Alert severity="error">
        <AlertTitle>Could not load your library</AlertTitle>
        {getErrorMessage(error)}
      </Alert>
    );
  }

  if (summaries.length === 0) {
    return <EmptyLibrary />;
  }

  return (
    <>
      {/* A failed refresh keeps showing the last list it loaded. */}
      {error ? (
        <Alert severity="warning" sx={{ mb: 2 }}>
          Could not refresh your library. {getErrorMessage(error)}
        </Alert>
      ) : null}
      <Paper variant="outlined" sx={{ overflow: "hidden" }}>
        <List disablePadding>
          {summaries.map((summary, index) => (
            <Box component="li" key={summary.id} sx={{ listStyle: "none" }}>
              <SummaryRow summary={summary} />
              {index < summaries.length - 1 ? <Divider /> : null}
            </Box>
          ))}
        </List>
      </Paper>
    </>
  );
}

function LibrarySkeleton() {
  return (
    <Paper variant="outlined" sx={{ p: 3 }}>
      {[0, 1, 2].map((placeholderRow) => (
        <Box key={placeholderRow} sx={{ py: 2 }}>
          <Skeleton width={100} />
          <Skeleton height={40} width="75%" />
          <Skeleton width="40%" />
        </Box>
      ))}
    </Paper>
  );
}

function EmptyLibrary() {
  return (
    <Paper variant="outlined" sx={{ py: 8, px: 3, textAlign: "center" }}>
      <VideoLibraryOutlined
        sx={{ fontSize: 40, color: "text.secondary", mb: 2 }}
      />
      <Typography variant="h2">No summaries yet</Typography>
      <Typography color="text.secondary" sx={{ mt: 1, mb: 3 }}>
        Your completed summaries and active jobs will appear here.
      </Typography>
      <Button component={Link} to="/" variant="contained">
        Summarize a video
      </Button>
    </Paper>
  );
}

function SummaryRow({ summary }: { summary: SummaryListItem }) {
  const verdictStyle = summary.verdict
    ? verdictStyles[summary.verdict.recommendation]
    : null;
  const details = [
    sourceTypeLabels[summary.source.type],
  ];
  if (summary.durationSeconds !== null) {
    details.push(formatTimestamp(summary.durationSeconds));
  }
  if (summary.status !== "completed") {
    details.push(summary.stage);
  }

  return (
    <ListItemButton
      component={Link}
      to={`/summaries/${summary.id}`}
      sx={{ display: "flex", gap: 2, p: { xs: 2, sm: 3 }, borderRadius: 0 }}
    >
      <Box sx={{ minWidth: 0, flex: 1 }}>
        <Stack
          direction="row"
          sx={{
            alignItems: "center",
            flexWrap: "wrap",
            columnGap: 1.5,
            rowGap: 1,
          }}
        >
          <Chip
            label={statusLabels[summary.status]}
            size="small"
            variant="outlined"
            color={statusColors[summary.status]}
          />
          {verdictStyle ? (
            <Chip
              size="small"
              icon={verdictStyle.icon}
              label={verdictStyle.label}
              color={verdictStyle.color}
              sx={{ "& .MuiChip-icon": { fontSize: 16 } }}
            />
          ) : null}
          <Typography
            component="time"
            dateTime={summary.createdAt}
            variant="caption"
            color="text.secondary"
            sx={{ fontFamily: "var(--font-mono)" }}
          >
            {formatCreatedAt(summary.createdAt)}
          </Typography>
        </Stack>
        <Typography
          variant="h3"
          dir="auto"
          sx={{ mt: 1.5, overflowWrap: "anywhere" }}
        >
          {summary.title ?? summary.source.name}
        </Typography>
        {summary.title ? (
          <Typography
            variant="body2"
            color="text.secondary"
            {...getContentProps(summary.source.name)}
            sx={{ mt: 0.5, overflowWrap: "anywhere" }}
          >
            {summary.source.name}
          </Typography>
        ) : null}
        <Typography
          variant="body2"
          color="text.secondary"
          sx={{ mt: 1, display: "flex", alignItems: "center", gap: 0.75 }}
        >
          <Box
            component="span"
            aria-hidden
            sx={{
              display: "inline-flex",
              fontSize: 16,
              color:
                summary.source.type === "youtube"
                  ? "error.main"
                  : "primary.main",
            }}
          >
            {sourceTypeIcons[summary.source.type]}
          </Box>
          <span>{details.join(" · ")}</span>
        </Typography>
      </Box>
      {/* Icons are aria-hidden, so the action is spelled out for screen readers. */}
      <span className="sr-only">{actionLabels[summary.status]}</span>
      <ArrowForward
        fontSize="small"
        sx={{ color: "primary.main", flexShrink: 0 }}
      />
    </ListItemButton>
  );
}
