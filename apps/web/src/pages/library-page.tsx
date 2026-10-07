import { useQuery } from "@tanstack/react-query";
import {
  Alert,
  AlertTitle,
  Box,
  Button,
  Chip,
  Container,
  Divider,
  InputBase,
  LinearProgress,
  List,
  ListItemButton,
  Paper,
  Skeleton,
  Stack,
  Typography,
} from "@mui/material";
import Add from "@mui/icons-material/Add";
import ArrowForward from "@mui/icons-material/ArrowForward";
import SearchOutlined from "@mui/icons-material/SearchOutlined";
import VideoLibraryOutlined from "@mui/icons-material/VideoLibraryOutlined";
import { useDeferredValue, useId, useState } from "react";
import { Link } from "react-router-dom";

import type { SummaryListItem } from "@l5asly/contracts";
import {
  Composer,
  ComposerLine,
  ComposerStrip,
  composerInputSx,
} from "@/components/composer";
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

// Jobs are grouped by what the viewer needs to do next.
type LibraryGroup = "attention" | "active" | "ready";

const groupOfStatus: Record<SummaryStatus, LibraryGroup> = {
  failed: "attention",
  cancelled: "attention",
  queued: "active",
  processing: "active",
  completed: "ready",
};

const GROUPS: { group: LibraryGroup; title: string }[] = [
  { group: "attention", title: "Needs attention" },
  { group: "active", title: "In progress" },
  { group: "ready", title: "Ready to read" },
];

type LibraryFilter = "all" | LibraryGroup;

const FILTERS: { filter: LibraryFilter; label: string }[] = [
  { filter: "all", label: "All" },
  { filter: "active", label: "In progress" },
  { filter: "ready", label: "Ready" },
  { filter: "attention", label: "Needs attention" },
];

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

function matchesSearch(summary: SummaryListItem, search: string): boolean {
  if (!search) {
    return true;
  }
  const text = `${summary.title ?? ""} ${summary.source.name}`;
  return text.toLocaleLowerCase().includes(search.toLocaleLowerCase());
}

function countInFilter(
  summaries: SummaryListItem[],
  filter: LibraryFilter,
): number {
  if (filter === "all") {
    return summaries.length;
  }
  return summaries.filter((summary) => groupOfStatus[summary.status] === filter)
    .length;
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
      <SearchableLibrary summaries={summaries} />
    </>
  );
}

function SearchableLibrary({ summaries }: { summaries: SummaryListItem[] }) {
  const searchInputId = useId();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<LibraryFilter>("all");
  const appliedSearch = useDeferredValue(search.trim());

  const visible = summaries.filter(
    (summary) =>
      (filter === "all" || groupOfStatus[summary.status] === filter) &&
      matchesSearch(summary, appliedSearch),
  );

  function resetSearch(): void {
    setSearch("");
    setFilter("all");
  }

  return (
    <Stack spacing={4}>
      <Composer>
        <ComposerLine
          label={
            <Box
              component="span"
              sx={{ display: "inline-flex", alignItems: "center" }}
            >
              <SearchOutlined fontSize="small" />
              <span className="sr-only">Search your library</span>
            </Box>
          }
          htmlFor={searchInputId}
        >
          <InputBase
            id={searchInputId}
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Find a video by title, channel or file name"
            autoComplete="off"
            sx={composerInputSx}
          />
        </ComposerLine>
        <ComposerStrip>
          <Stack
            direction="row"
            role="group"
            aria-label="Filter by status"
            sx={{ flexWrap: "wrap", gap: 1 }}
          >
            {FILTERS.map((option) => {
              const isSelected = option.filter === filter;
              return (
                <Chip
                  key={option.filter}
                  label={
                    <>
                      {option.label}{" "}
                      <Box
                        component="span"
                        sx={{
                          fontFamily: "var(--font-mono)",
                          color: "text.secondary",
                          ml: 0.5,
                        }}
                      >
                        {countInFilter(summaries, option.filter)}
                      </Box>
                    </>
                  }
                  aria-pressed={isSelected}
                  onClick={() => setFilter(option.filter)}
                  variant={isSelected ? "filled" : "outlined"}
                  sx={{
                    bgcolor: isSelected ? "var(--accent)" : "background.paper",
                    borderRadius: 2,
                  }}
                />
              );
            })}
          </Stack>
        </ComposerStrip>
      </Composer>

      {visible.length === 0 ? (
        <Paper
          variant="outlined"
          sx={{ py: 6, px: 3, textAlign: "center", display: "grid", gap: 1.5 }}
        >
          <Typography sx={{ fontWeight: 600 }}>
            No summaries match{appliedSearch ? ` "${appliedSearch}"` : " this filter"}
          </Typography>
          <Typography color="text.secondary" variant="body2">
            Try part of the title, the channel or the file name.
          </Typography>
          <Box>
            <Button variant="outlined" onClick={resetSearch}>
              Show all summaries
            </Button>
          </Box>
        </Paper>
      ) : null}

      {GROUPS.map(({ group, title }) => {
        const groupSummaries = visible.filter(
          (summary) => groupOfStatus[summary.status] === group,
        );
        if (groupSummaries.length === 0) {
          return null;
        }
        return (
          <LibrarySection
            key={group}
            title={title}
            summaries={groupSummaries}
          />
        );
      })}
    </Stack>
  );
}

function LibrarySection({
  title,
  summaries,
}: {
  title: string;
  summaries: SummaryListItem[];
}) {
  const titleId = useId();
  return (
    <Box component="section" aria-labelledby={titleId}>
      <Stack
        direction="row"
        spacing={1.25}
        sx={{ alignItems: "baseline", mb: 1 }}
      >
        <Typography
          id={titleId}
          variant="h2"
          sx={{
            fontSize: "0.8125rem",
            fontWeight: 600,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            color: "text.secondary",
          }}
        >
          {title}
        </Typography>
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ fontFamily: "var(--font-mono)" }}
        >
          {summaries.length}
        </Typography>
      </Stack>
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
    </Box>
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
  const isActive =
    summary.status === "queued" || summary.status === "processing";
  const details = [sourceTypeLabels[summary.source.type]];
  if (summary.durationSeconds !== null) {
    details.push(formatTimestamp(summary.durationSeconds));
  }

  return (
    <ListItemButton
      component={Link}
      to={`/summaries/${summary.id}`}
      sx={{
        display: "grid",
        gridTemplateColumns: {
          xs: "minmax(0, 1fr) auto",
          md: "minmax(0, 1fr) minmax(0, 220px) auto",
        },
        alignItems: "center",
        columnGap: 3,
        rowGap: 1.5,
        p: { xs: 2, sm: 3 },
        borderRadius: 0,
        "&:hover .row-arrow": { transform: "translateX(4px)" },
      }}
    >
      <Box sx={{ minWidth: 0 }}>
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
      <Box
        sx={{
          minWidth: 0,
          gridColumn: { xs: "1 / 2", md: "auto" },
          gridRow: { xs: 2, md: "auto" },
          display: summary.status === "completed" ? { xs: "none", md: "block" } : "block",
        }}
      >
        <RowStatus summary={summary} isActive={isActive} />
      </Box>
      {/* Icons are aria-hidden, so the action is spelled out for screen readers. */}
      <span className="sr-only">{actionLabels[summary.status]}</span>
      <ArrowForward
        fontSize="small"
        className="row-arrow"
        sx={(theme) => ({
          color: "primary.main",
          gridRow: { xs: "1 / span 2", md: "auto" },
          gridColumn: { xs: 2, md: "auto" },
          transition: theme.transitions.create("transform", {
            duration: theme.transitions.duration.shorter,
          }),
        })}
      />
    </ListItemButton>
  );
}

function RowStatus({
  summary,
  isActive,
}: {
  summary: SummaryListItem;
  isActive: boolean;
}) {
  if (isActive) {
    return (
      <Stack spacing={0.75}>
        <LinearProgress
          variant={summary.status === "queued" ? "indeterminate" : "determinate"}
          value={summary.progress}
          aria-label={`${summary.title ?? summary.source.name} progress`}
          sx={{ height: 6, borderRadius: 1 }}
        />
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ fontFamily: "var(--font-mono)" }}
        >
          {summary.status === "queued"
            ? "Waiting for the current job"
            : `${summary.stage} · ${summary.progress}%`}
        </Typography>
      </Stack>
    );
  }

  if (summary.status === "failed") {
    return (
      <Typography variant="caption" color="error">
        Open to see what went wrong and retry.
      </Typography>
    );
  }

  if (summary.status === "cancelled") {
    return (
      <Typography variant="caption" color="text.secondary">
        Cancelled before it finished.
      </Typography>
    );
  }

  return summary.verdict ? (
    <Typography
      variant="caption"
      color="text.secondary"
      {...getContentProps(summary.verdict.headline)}
      sx={{ display: "block" }}
    >
      {summary.verdict.headline}
    </Typography>
  ) : null;
}
