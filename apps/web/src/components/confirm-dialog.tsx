import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
} from "@mui/material";
import { useId } from "react";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel: string;
  // Only for actions that wait on the server; synchronous actions omit both.
  isPending?: boolean;
  pendingLabel?: string;
  onConfirm: () => void;
  onClose: () => void;
}

// Confirmation for destructive actions. The dialog stays open while the action
// runs so a failure leaves the user where they started.
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel,
  isPending = false,
  pendingLabel,
  onConfirm,
  onClose,
}: ConfirmDialogProps) {
  const titleId = useId();
  let actionLabel = confirmLabel;
  if (isPending && pendingLabel) {
    actionLabel = pendingLabel;
  }

  return (
    <Dialog
      open={open}
      onClose={() => {
        if (!isPending) onClose();
      }}
      aria-labelledby={titleId}
    >
      <DialogTitle id={titleId}>{title}</DialogTitle>
      <DialogContent>
        <DialogContentText>{description}</DialogContentText>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={isPending}>
          {cancelLabel}
        </Button>
        <Button
          color="error"
          variant="contained"
          onClick={onConfirm}
          disabled={isPending}
        >
          {actionLabel}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
