import {
  Box,
  Button,
  Chip,
  Container,
  CircularProgress,
  Alert,
  useMediaQuery,
  LinearProgress,
  Paper,
  Skeleton,
  Stack,
  Step,
  StepLabel,
  Stepper,
  Typography,
} from "@mui/material";
import { useQueryClient } from "@tanstack/react-query";
import ArrowBack from "@mui/icons-material/ArrowBack";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { PrecheckResult, SummaryJob } from "@l5asly/contracts";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { getLeadCardShadow } from "@/components/material-theme";
import { formatTimestamp, getContentProps } from "./format";
import { JOB_STEPS } from "./job-steps";
import { getPrecheckQueryKey } from "./precheck-query";
import { SourceDetails } from "./source-details";
import { VerdictScale } from "./verdict-insights";

interface ProcessingStateProps {
  job: SummaryJob;
  isCancelling: boolean;
  onCancel: () => void;
  hasConnectionError?: boolean;
}

export function ProcessingState({
  job,
  isCancelling,
  onCancel,
  hasConnectionError = false,
}: ProcessingStateProps) {
  const [isConfirmingCancel, setIsConfirmingCancel] = useState(false);
  const reduceMotion = useMediaQuery("(prefers-reduced-motion: reduce)");
  const activeStep = JOB_STEPS.findIndex(
    (step) => job.progress < step.endsAtProgress,
  );

  return (
    <Container maxWidth="sm" sx={{ py: { xs: 4, sm: 6 } }}>
      <Button
        component={Link}
        to="/library"
        startIcon={<ArrowBack />}
        sx={{ mb: 2, ml: -1.25 }}
      >
        Library
      </Button>
      <Paper
        variant="outlined"
        sx={(theme) => ({
          p: { xs: 3, sm: 4 },
          boxShadow: getLeadCardShadow(theme.palette.mode),
        })}
      >
        <Stack direction="row" spacing={2} sx={{ alignItems: "center" }}>
          <CircularProgress
            size={32}
            aria-label="Current step in progress"
            sx={{
              flexShrink: 0,
              animation: reduceMotion ? "none" : undefined,
              "& .MuiCircularProgress-circle": {
                animation: reduceMotion ? "none" : undefined,
              },
            }}
          />
          <Typography variant="h1" sx={{ fontSize: "1.75rem" }}>
            {job.status === "queued"
              ? "Waiting to start"
              : "Creating your summary"}
          </Typography>
        </Stack>
        <Box sx={{ mt: 2 }}>
          <SourceDetails source={job.source} />
        </Box>
        <Box sx={{ mt: 4 }} aria-live="polite">
          <Stack
            direction="row"
            spacing={2}
            sx={{ mb: 1.5, justifyContent: "space-between" }}
          >
            <Typography variant="body2">{job.stage}</Typography>
            <Typography variant="body2" sx={{ fontFamily: "var(--font-mono)" }}>
              Step {Math.min(activeStep + 1, JOB_STEPS.length)} /{" "}
              {JOB_STEPS.length}
            </Typography>
          </Stack>
          <LinearProgress
            variant="determinate"
            value={job.progress}
            aria-label="Summary progress"
            sx={{ height: 6, borderRadius: 1 }}
          />
        </Box>
        <Stepper
          activeStep={activeStep === -1 ? JOB_STEPS.length : activeStep}
          alternativeLabel
          sx={{ my: 4 }}
        >
          {JOB_STEPS.map((step) => (
            <Step
              key={step.step}
              completed={job.progress >= step.endsAtProgress}
            >
              <StepLabel>{step.label}</StepLabel>
            </Step>
          ))}
        </Stepper>
        <Stack spacing={0.5} sx={{ mb: 2 }}>
          <Typography variant="body2" color="text.secondary">
            {job.status === "queued"
              ? "Your job is queued. It will start when the current job finishes."
              : "Progress updates when a step finishes. A long video or a detailed answer can take several minutes."}
          </Typography>
          <JobTimers job={job} />
        </Stack>
        {hasConnectionError ? (
          <Alert severity="warning" sx={{ mb: 2 }}>
            Connection interrupted. This is the last known status; reconnecting
            automatically.
          </Alert>
        ) : null}
        <Typography variant="body2" color="text.secondary">
          You can leave this page and return to this job from Library.
        </Typography>
        <Stack direction="row" sx={{ mt: 3, justifyContent: "flex-end" }}>
          <Button
            variant="outlined"
            color="error"
            onClick={() => setIsConfirmingCancel(true)}
            disabled={isCancelling}
          >
            Cancel job
          </Button>
        </Stack>
      </Paper>
      <ConfirmDialog
        open={isConfirmingCancel}
        title="Cancel this job?"
        description="The current result will be discarded."
        confirmLabel="Cancel job"
        pendingLabel="Cancelling…"
        cancelLabel="Keep processing"
        isPending={isCancelling}
        onConfirm={onCancel}
        onClose={() => setIsConfirmingCancel(false)}
      />
      <Stack spacing={2} sx={{ mt: 3 }}>
        <ProvisionalVerdict job={job} />
        {job.options.expectation ? (
          <Paper
            variant="outlined"
            sx={{
              px: 3,
              py: 2,
              display: "grid",
              gridTemplateColumns: { xs: "1fr", sm: "112px minmax(0, 1fr)" },
              columnGap: 1.5,
            }}
          >
            <Typography
              variant="body2"
              color="text.secondary"
              sx={{ fontWeight: 600 }}
            >
              You asked
            </Typography>
            <Typography
              variant="body2"
              {...getContentProps(job.options.expectation)}
            >
              {job.options.expectation}
            </Typography>
          </Paper>
        ) : null}
      </Stack>
    </Container>
  );
}

// Shows the quick check's verdict, when this browser ran one for the same link
// and options, so the viewer has an answer while the full summary runs.
function ProvisionalVerdict({ job }: { job: SummaryJob }) {
  const queryClient = useQueryClient();
  if (job.source.type !== "youtube") {
    return null;
  }
  const precheck = queryClient.getQueryData<PrecheckResult>(
    getPrecheckQueryKey({
      url: job.source.url,
      language: job.options.language,
      expectation: job.options.expectation,
    }),
  );
  if (!precheck) {
    return null;
  }

  return (
    <Paper
      variant="outlined"
      component="section"
      aria-label="Provisional verdict"
      sx={{ p: 3, display: "grid", gap: 1.5 }}
    >
      <Stack
        direction="row"
        sx={{ justifyContent: "space-between", alignItems: "center", gap: 1 }}
      >
        <Typography variant="h3">While you wait</Typography>
        <Chip size="small" variant="outlined" label="Provisional" />
      </Stack>
      <VerdictScale
        recommendation={precheck.verdict.recommendation}
        isProvisional
      />
      <Typography
        variant="body2"
        color="text.secondary"
        {...getContentProps(precheck.verdict.reason)}
      >
        <Box component="strong" sx={{ color: "text.primary" }}>
          {precheck.verdict.headline}.
        </Box>{" "}
        {precheck.verdict.reason}
      </Typography>
      <Typography variant="caption" color="text.secondary">
        From the quick check of the title and chapters. The final verdict
        replaces this once the transcript is read.
      </Typography>
    </Paper>
  );
}

// Ticks every second on its own so the rest of the card does not re-render.
function JobTimers({ job }: { job: SummaryJob }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  const elapsed = Math.max(
    0,
    Math.floor((now - Date.parse(job.createdAt)) / 1000),
  );
  const stepElapsed = Math.max(
    0,
    Math.floor((now - Date.parse(job.stageStartedAt ?? job.updatedAt)) / 1000),
  );
  const isRetry = job.attempt !== undefined && job.attempt > 1;

  return (
    <Typography
      variant="caption"
      color="text.secondary"
      sx={{ fontFamily: "var(--font-mono)" }}
    >
      Attempt {job.attempt ?? 1} · {isRetry ? "Job age" : "Elapsed"}{" "}
      {formatTimestamp(elapsed)} · Current step {formatTimestamp(stepElapsed)}
    </Typography>
  );
}

export function ProcessingStateSkeleton() {
  return (
    <Container maxWidth="sm" sx={{ py: 8 }}>
      <Paper variant="outlined" sx={{ p: 4 }}>
        <Skeleton height={44} width="80%" />
        <Skeleton width="60%" />
        <Skeleton height={8} sx={{ mt: 4 }} />
        <Skeleton height={70} sx={{ mt: 3 }} />
      </Paper>
    </Container>
  );
}
