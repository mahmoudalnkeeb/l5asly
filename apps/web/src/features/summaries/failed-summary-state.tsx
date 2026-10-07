import {
  Alert,
  AlertTitle,
  Box,
  Button,
  Chip,
  CircularProgress,
  Container,
  Paper,
  Stack,
  Step,
  StepLabel,
  Stepper,
  Typography,
} from "@mui/material";
import ArrowBack from "@mui/icons-material/ArrowBack";
import DeleteOutlined from "@mui/icons-material/DeleteOutlined";
import Replay from "@mui/icons-material/Replay";
import { useState } from "react";
import { Link } from "react-router-dom";
import type { JobStep, SummaryJob } from "@l5asly/contracts";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { getLeadCardShadow } from "@/components/material-theme";
import { findStepForProgress, JOB_STEPS } from "./job-steps";
import { SourceDetails } from "./source-details";

const retryLabels: Record<JobStep, string> = {
  media: "Retry processing",
  transcription: "Retry transcription",
  summary: "Retry summary",
};
const stepLabels: Record<JobStep, string> = {
  media: "Media preparation",
  transcription: "Transcription",
  summary: "Summary generation",
};

type CheckpointState = "saved" | "rerun" | "failed" | "not-started";

const checkpointCaptions: Record<CheckpointState, string> = {
  saved: "Saved, reused on retry",
  rerun: "Runs again on retry",
  failed: "Failed",
  "not-started": "Not started",
};

// Explains, per step, what a retry keeps and what it redoes.
function describeCheckpoint(
  stepIndex: number,
  failedIndex: number,
  retryFromIndex: number,
): CheckpointState {
  if (stepIndex === failedIndex) return "failed";
  if (stepIndex > failedIndex) return "not-started";
  return stepIndex < retryFromIndex ? "saved" : "rerun";
}

interface FailedSummaryStateProps {
  job: SummaryJob;
  isRetrying: boolean;
  isDeleting: boolean;
  // The file is only passed when the saved media expired and must be re-uploaded.
  onRetry: (file?: File) => void;
  onDelete: () => void;
}

export function FailedSummaryState({
  job,
  isRetrying,
  isDeleting,
  onRetry,
  onDelete,
}: FailedSummaryStateProps) {
  const [replacementFile, setReplacementFile] = useState<File>();
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const isBusy = isRetrying || isDeleting;
  const requiresUpload = job.retryInfo?.requiresUpload ?? false;
  const failedStep = job.failedStep ?? findStepForProgress(job.progress);
  const retryFromStep = job.retryInfo?.fromStep ?? "media";
  const retryLabel = retryLabels[retryFromStep];
  const failedIndex = JOB_STEPS.findIndex((step) => step.step === failedStep);
  const retryFromIndex = JOB_STEPS.findIndex(
    (step) => step.step === retryFromStep,
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
      <Chip
        size="small"
        variant="outlined"
        color="error"
        label="Failed"
        sx={{ mb: 2, display: "flex", width: "fit-content" }}
      />
      <SourceDetails source={job.source} />
      <Typography
        variant="h1"
        sx={{ mt: 2, fontSize: { xs: "1.75rem", sm: "2.25rem" } }}
      >
        Couldn’t finish your summary
      </Typography>

      <Paper
        variant="outlined"
        sx={(theme) => ({
          mt: 3,
          p: { xs: 2.5, sm: 3 },
          display: "grid",
          gap: 3,
          boxShadow: getLeadCardShadow(theme.palette.mode),
        })}
      >
        <Alert severity="error">
          <AlertTitle>{stepLabels[failedStep]} failed</AlertTitle>
          {job.error ?? "Processing could not finish. You can retry this job."}
        </Alert>
        {job.errorDetails ? (
          <Box component="ul" sx={{ pl: 3, m: 0, color: "text.secondary" }}>
            {Object.entries(job.errorDetails).map(([field, issues]) => (
              <Typography component="li" variant="body2" key={field}>
                {field}: {issues.join(", ")}
              </Typography>
            ))}
          </Box>
        ) : null}

        <Stepper alternativeLabel>
          {JOB_STEPS.map((step, index) => {
            const state = describeCheckpoint(
              index,
              failedIndex,
              retryFromIndex,
            );
            return (
              <Step key={step.step} completed={state === "saved"}>
                <StepLabel
                  error={state === "failed"}
                  optional={
                    <Typography
                      variant="caption"
                      color={state === "failed" ? "error" : "text.secondary"}
                      sx={{ display: "block" }}
                    >
                      {checkpointCaptions[state]}
                    </Typography>
                  }
                >
                  {step.label}
                </StepLabel>
              </Step>
            );
          })}
        </Stepper>

        <Typography color="text.secondary">
          {job.retryInfo?.reason ??
            "This older job may need to restart from its original source if no checkpoint was saved."}
        </Typography>

        {requiresUpload ? (
          <Box>
            <Button component="label" variant="outlined" disabled={isBusy}>
              Select the same file
              <input
                className="sr-only"
                type="file"
                accept="video/*,audio/*"
                aria-label="Select media to retry"
                onChange={(event) =>
                  setReplacementFile(event.target.files?.[0])
                }
                disabled={isBusy}
              />
            </Button>
            {replacementFile ? (
              <Typography
                variant="body2"
                sx={{ mt: 1, overflowWrap: "anywhere" }}
              >
                {replacementFile.name}
              </Typography>
            ) : null}
          </Box>
        ) : null}

        <Stack
          direction={{ xs: "column-reverse", sm: "row" }}
          sx={{
            gap: 1.5,
            justifyContent: "space-between",
            "& .MuiButton-root": { minHeight: { xs: 48, sm: 40 } },
          }}
        >
          <Button
            color="error"
            startIcon={
              isDeleting ? (
                <CircularProgress size={18} color="inherit" />
              ) : (
                <DeleteOutlined />
              )
            }
            onClick={() => setIsConfirmingDelete(true)}
            disabled={isBusy}
          >
            {isDeleting ? "Deleting…" : "Delete job"}
          </Button>
          <Button
            variant="contained"
            size="large"
            startIcon={
              isRetrying ? (
                <CircularProgress size={18} color="inherit" />
              ) : (
                <Replay />
              )
            }
            onClick={() => onRetry(replacementFile)}
            disabled={isBusy || (requiresUpload && !replacementFile)}
          >
            {isRetrying ? "Retrying…" : retryLabel}
          </Button>
        </Stack>
      </Paper>

      <Typography
        variant="caption"
        color="text.secondary"
        sx={{ display: "block", mt: 2 }}
      >
        Retry uses this job’s original question and profile. Delete removes the
        job, checkpoints, and retained media.
      </Typography>
      <ConfirmDialog
        open={isConfirmingDelete}
        title="Delete this job?"
        description="The job, its saved checkpoints, and any retained media are removed permanently. This cannot be undone."
        confirmLabel="Delete permanently"
        pendingLabel="Deleting…"
        cancelLabel="Keep job"
        isPending={isDeleting}
        onConfirm={onDelete}
        onClose={() => setIsConfirmingDelete(false)}
      />
    </Container>
  );
}
