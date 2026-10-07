import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Alert,
  AlertTitle,
  Button,
  Container,
  Stack,
  Typography,
} from "@mui/material";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { m } from "motion/react";

import type { SummaryJob } from "@l5asly/contracts";
import { enterAnimation } from "@/components/enter-animation";
import { useNotification } from "@/components/notifications";
import {
  ProcessingState,
  ProcessingStateSkeleton,
} from "@/features/summaries/processing-state";
import { SummaryResult } from "@/features/summaries/summary-result";
import { FailedSummaryState } from "@/features/summaries/failed-summary-state";
import { SourceDetails } from "@/features/summaries/source-details";
import {
  cancelSummary,
  deleteSummary,
  getErrorMessage,
  getSummary,
  retrySummary,
} from "@/lib/api-client";

// Faster than the library because the user is watching this one job.
const ACTIVE_JOB_POLL_MS = 900;

function isJobRunning(job: SummaryJob | undefined): boolean {
  if (!job) {
    return false;
  }
  return job.status === "queued" || job.status === "processing";
}

export function SummaryPage() {
  const { summaryId } = useParams();

  if (!summaryId) {
    return <Navigate to="/" replace />;
  }

  return <SummaryJobView summaryId={summaryId} />;
}

function SummaryJobView({ summaryId }: { summaryId: string }) {
  const queryClient = useQueryClient();
  const notify = useNotification();
  const navigate = useNavigate();
  const summaryQuery = useQuery({
    queryKey: ["summary", summaryId],
    queryFn: ({ signal }) => getSummary(summaryId, signal),
    refetchInterval: (query) =>
      isJobRunning(query.state.data) ? ACTIVE_JOB_POLL_MS : false,
  });

  function notifyError(error: Error): void {
    notify({ severity: "error", message: getErrorMessage(error) });
  }

  const cancelMutation = useMutation({
    mutationFn: () => cancelSummary(summaryId),
    onSuccess: (job) => {
      queryClient.setQueryData(["summary", summaryId], job);
      void queryClient.invalidateQueries({ queryKey: ["summaries"] });
      notify({ severity: "success", message: "Processing cancelled." });
    },
    onError: notifyError,
  });
  const retryMutation = useMutation({
    mutationFn: (file?: File) => retrySummary(summaryId, file),
    onSuccess: (job) => {
      queryClient.setQueryData(["summary", summaryId], job);
      void queryClient.invalidateQueries({ queryKey: ["summaries"] });
      notify({
        severity: "success",
        message: "Retry queued. Available checkpoints will be reused.",
      });
    },
    onError: notifyError,
  });
  const deleteMutation = useMutation({
    mutationFn: () => deleteSummary(summaryId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["summaries"] });
      navigate("/library", { replace: true });
      queryClient.removeQueries({
        queryKey: ["summary", summaryId],
        exact: true,
      });
      notify({
        severity: "success",
        message: "Job and saved processing data deleted.",
      });
    },
    onError: notifyError,
  });

  if (summaryQuery.isPending) {
    return <ProcessingStateSkeleton />;
  }

  if (summaryQuery.isError && !summaryQuery.data) {
    return (
      <Container
        maxWidth="sm"
        component={m.div}
        {...enterAnimation}
        sx={{ py: 6 }}
      >
        <Typography variant="h1">This summary could not be loaded</Typography>
        <Typography color="text.secondary" sx={{ mt: 2 }}>
          Try loading it again before starting over.
        </Typography>
        <Alert sx={{ mt: 3 }} severity="error">
          <AlertTitle>Could not load this summary</AlertTitle>
          {getErrorMessage(summaryQuery.error)}
        </Alert>
        <Stack
          direction="row"
          spacing={2}
          sx={{ mt: 3, flexWrap: "wrap", rowGap: 2 }}
        >
          <Button
            variant="contained"
            onClick={() => void summaryQuery.refetch()}
          >
            Try again
          </Button>
          <Button variant="outlined" component={Link} to="/library">
            Back to library
          </Button>
        </Stack>
      </Container>
    );
  }

  const job = summaryQuery.data;
  if (!job) return <ProcessingStateSkeleton />;
  if (isJobRunning(job)) {
    return (
      <ProcessingState
        job={job}
        isCancelling={cancelMutation.isPending}
        onCancel={() => cancelMutation.mutate()}
        hasConnectionError={summaryQuery.isRefetchError}
      />
    );
  }

  if (job.status === "failed") {
    return (
      <FailedSummaryState
        job={job}
        isRetrying={retryMutation.isPending}
        isDeleting={deleteMutation.isPending}
        onRetry={(file) => retryMutation.mutate(file)}
        onDelete={() => deleteMutation.mutate()}
      />
    );
  }

  if (job.status === "cancelled") {
    return (
      <Container
        maxWidth="sm"
        component={m.div}
        {...enterAnimation}
        sx={{ py: 6 }}
      >
        <SourceDetails source={job.source} />
        <Typography variant="h1" sx={{ mt: 2 }}>
          This job was cancelled
        </Typography>
        <Alert sx={{ mt: 3 }} severity="info">
          <AlertTitle>Processing cancelled</AlertTitle>
          {job.error ?? "You can return to the form and try again."}
        </Alert>
        <Stack
          direction="row"
          spacing={2}
          sx={{ mt: 3, flexWrap: "wrap", rowGap: 2 }}
        >
          <Button variant="contained" component={Link} to="/">
            Start a new summary
          </Button>
          <Button variant="outlined" component={Link} to="/library">
            Back to library
          </Button>
        </Stack>
      </Container>
    );
  }

  if (!job.result) {
    return (
      <Container
        maxWidth="sm"
        component={m.div}
        {...enterAnimation}
        sx={{ py: 6 }}
      >
        <Alert severity="error">
          <AlertTitle>Result unavailable</AlertTitle>The server completed this
          job without a result.
        </Alert>
        <Button
          sx={{ mt: 3 }}
          variant="outlined"
          component={Link}
          to="/library"
        >
          Back to library
        </Button>
      </Container>
    );
  }

  return (
    <SummaryResult
      result={job.result}
      source={job.source}
      requestedLanguage={job.options.language}
      expectation={job.options.expectation}
    />
  );
}
