import {
  Box,
  Button,
  Container,
  CircularProgress,
  Alert,
  useMediaQuery,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
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
import { formatTimestamp } from "./format";

interface ProcessingStateProps {
  job: SummaryJob;
  isCancelling: boolean;
  onCancel: () => void;
  hasConnectionError?: boolean;
}

const processingSteps = [
  { label: "Prepare media", threshold: 34 },
  { label: "Transcribe", threshold: 68 },
  { label: "Summarize", threshold: 100 },
];

export function ProcessingState({
  job,
  isCancelling,
  onCancel,
  hasConnectionError = false,
}: ProcessingStateProps) {
  const [isConfirmingCancel, setIsConfirmingCancel] = useState(false);
  const [now, setNow] = useState(Date.now());
  const reduceMotion = useMediaQuery("(prefers-reduced-motion: reduce)");
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
  const activeStep = processingSteps.findIndex(
    (step) => job.progress < step.threshold,
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
              Step {Math.min(activeStep + 1, processingSteps.length)} /{" "}
              {processingSteps.length}
            </Typography>
          </Stack>
          <LinearProgress
            variant="determinate"
            value={job.progress}
            aria-label="Summary progress"
            sx={{ height: 6, borderRadius: 3 }}
          />
        </Box>
        <Stepper
          activeStep={activeStep === -1 ? processingSteps.length : activeStep}
          alternativeLabel
          sx={{ my: 4 }}
        >
          {processingSteps.map((step) => (
            <Step key={step.label} completed={job.progress >= step.threshold}>
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
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ fontFamily: "var(--font-mono)" }}
          >
            Attempt {job.attempt ?? 1} ·{" "}
            {job.attempt && job.attempt > 1 ? "Job age" : "Elapsed"}{" "}
            {formatTimestamp(elapsed)} · Current step{" "}
            {formatTimestamp(stepElapsed)}
          </Typography>
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
      <Dialog
        open={isConfirmingCancel}
        onClose={() => {
          if (!isCancelling) setIsConfirmingCancel(false);
        }}
        aria-labelledby="cancel-dialog-title"
      >
        <DialogTitle id="cancel-dialog-title">Cancel this job?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            The current result will be discarded.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => setIsConfirmingCancel(false)}
            disabled={isCancelling}
          >
            Keep processing
          </Button>
          <Button
            color="error"
            variant="contained"
            onClick={onCancel}
            disabled={isCancelling}
          >
            {isCancelling ? "Cancelling…" : "Cancel job"}
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
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
