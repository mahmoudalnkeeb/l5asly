import {
  Alert,
  AlertTitle,
  Box,
  Button,
  CircularProgress,
  Container,
  Stack,
  Typography,
} from "@mui/material";
import DeleteOutlined from "@mui/icons-material/DeleteOutlined";
import Replay from "@mui/icons-material/Replay";
import { useState } from "react";
import { Link } from "react-router-dom";
import type { JobStep, SummaryJob } from "@l5sly/contracts";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { findStepForProgress } from "./job-steps";

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
  const retryLabel = retryLabels[job.retryInfo?.fromStep ?? "media"];

  return (
    <Container maxWidth="sm" sx={{ py: { xs: 4, sm: 6 } }}>
      <Typography
        variant="caption"
        color="text.secondary"
        sx={{ fontFamily: "var(--font-mono)", overflowWrap: "anywhere" }}
      >
        {job.source.name}
      </Typography>
      <Typography
        variant="h1"
        sx={{ mt: 2, fontSize: { xs: "1.75rem", sm: "2.25rem" } }}
      >
        Couldn’t finish your summary
      </Typography>
      <Alert severity="error" sx={{ mt: 3 }}>
        <AlertTitle>{stepLabels[failedStep]} failed</AlertTitle>
        {job.error ?? "Processing could not finish. You can retry this job."}
      </Alert>
      {job.errorDetails ? (
        <Box component="ul" sx={{ pl: 3, mt: 2, color: "text.secondary" }}>
          {Object.entries(job.errorDetails).map(([field, issues]) => (
            <Typography component="li" variant="body2" key={field}>
              {field}: {issues.join(", ")}
            </Typography>
          ))}
        </Box>
      ) : null}
      <Typography color="text.secondary" sx={{ mt: 3 }}>
        {job.retryInfo?.reason ??
          "This older job may need to restart from its original source if no checkpoint was saved."}
      </Typography>
      {requiresUpload ? (
        <Box sx={{ mt: 2 }}>
          <Button component="label" variant="outlined" disabled={isBusy}>
            Select the same file
            <input
              className="sr-only"
              type="file"
              accept="video/*,audio/*"
              aria-label="Select media to retry"
              onChange={(event) => setReplacementFile(event.target.files?.[0])}
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
        direction={{ xs: "column", sm: "row" }}
        spacing={1.5}
        sx={{ mt: 3, "& .MuiButton-root": { minHeight: { xs: 48, sm: 40 } } }}
      >
        <Button
          variant="contained"
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
        <Button component={Link} to="/library">
          Library
        </Button>
      </Stack>
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
