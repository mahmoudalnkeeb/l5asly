import {
  Box,
  Button,
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
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { SummaryJob } from "@l5sly/contracts";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { formatTimestamp } from "./format";
import { JOB_STEPS } from "./job-steps";

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
    <Container maxWidth="sm" sx={{ py: { xs: 4, sm: 8 } }}>
      <Paper variant="outlined" sx={{ p: { xs: 3, sm: 4 } }}>
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
        <Typography
          variant="body2"
          color="text.secondary"
          sx={{ mt: 1, overflowWrap: "anywhere" }}
        >
          {job.source.name}
        </Typography>
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
        <Stack direction="row" sx={{ mt: 3, justifyContent: "space-between" }}>
          <Button component={Link} to="/library" variant="outlined">
            Go to library
          </Button>
          <Button
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
    </Container>
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
