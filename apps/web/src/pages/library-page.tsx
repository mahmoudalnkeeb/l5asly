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
import { formatCreatedAt, formatTimestamp } from "@/features/summaries/format";
import { verdictStyles } from "@/features/summaries/verdict-insights";
import { getErrorMessage, listSummaries } from "@/lib/api-client";

const statusLabels: Record<SummaryListItem["status"], string> = {
  queued: "Queued",
  processing: "Processing",
  completed: "Ready",
  failed: "Failed",
  cancelled: "Cancelled",
};

export function LibraryPage() {
  const summariesQuery = useQuery({
    queryKey: ["summaries"],
    queryFn: listSummaries,
    refetchInterval: (query) =>
      query.state.data?.some(
        (item) => item.status === "queued" || item.status === "processing",
      )
        ? 1_500
        : false,
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
      {summariesQuery.isPending ? (
        <Paper variant="outlined" sx={{ p: 3 }}>
          {[0, 1, 2].map((item) => (
            <Box key={item} sx={{ py: 2 }}>
              <Skeleton width={100} />
              <Skeleton height={40} width="75%" />
              <Skeleton width="40%" />
            </Box>
          ))}
        </Paper>
      ) : null}
      {summariesQuery.isError ? (
        <Alert severity="error">
          <AlertTitle>Could not load your library</AlertTitle>
          {getErrorMessage(summariesQuery.error)}
        </Alert>
      ) : null}
      {summariesQuery.data?.length === 0 ? (
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
      ) : null}
      {summariesQuery.data?.length ? (
        <Paper variant="outlined" sx={{ overflow: "hidden" }}>
          <List disablePadding>
            {summariesQuery.data.map((summary, index) => (
              <Box component="li" key={summary.id} sx={{ listStyle: "none" }}>
                <SummaryRow summary={summary} />
                {index < summariesQuery.data.length - 1 ? <Divider /> : null}
              </Box>
            ))}
          </List>
        </Paper>
      ) : null}
    </Container>
  );
}

function SummaryRow({ summary }: { summary: SummaryListItem }) {
  let statusColor: "error" | "success" | "default" = "default";
  if (summary.status === "failed") statusColor = "error";
  if (summary.status === "completed") statusColor = "success";
  let actionLabel = "View details";
  if (summary.status === "completed") actionLabel = "Read summary";
  if (summary.status === "queued" || summary.status === "processing")
    actionLabel = "View progress";

  return (
    <ListItemButton
      component={Link}
      to={`/summaries/${summary.id}`}
      sx={{ display: "flex", gap: 2, p: { xs: 2, sm: 3 } }}
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
            color={statusColor}
          />
          {summary.verdict ? (
            <Chip
              size="small"
              icon={verdictStyles[summary.verdict.recommendation].icon}
              label={verdictStyles[summary.verdict.recommendation].label}
              color={verdictStyles[summary.verdict.recommendation].color}
              sx={{ "& .MuiChip-icon": { fontSize: 16 } }}
            />
          ) : null}
          <Typography
            component="time"
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
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
          {summary.source.type === "upload" ? "Uploaded media" : "Video link"}
          {summary.durationSeconds !== null
            ? ` · ${formatTimestamp(summary.durationSeconds)}`
            : ""}
          {summary.status !== "completed" ? ` · ${summary.stage}` : ""}
        </Typography>
      </Box>
      <ArrowForward
        aria-label={actionLabel}
        fontSize="small"
        sx={{ color: "primary.main", flexShrink: 0 }}
      />
    </ListItemButton>
  );
}
