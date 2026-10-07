import { zodResolver } from "@hookform/resolvers/zod";
import {
  Alert,
  Box,
  Button,
  Container,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { Link } from "react-router-dom";

import { viewerProfileSchema, type ViewerProfile } from "@l5sly/contracts";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { useNotification } from "@/components/notifications";
import { useViewerProfile } from "@/features/profile/viewer-profile";

const EMPTY_PROFILE: ViewerProfile = {
  background: "",
  knowledge: "",
  goals: "",
  preferences: "",
};

export function ProfilePage() {
  const { profile, storageError, saveProfile, clearProfile } =
    useViewerProfile();
  const notify = useNotification();
  const [isConfirmingClear, setIsConfirmingClear] = useState(false);
  const form = useForm<ViewerProfile>({
    resolver: zodResolver(viewerProfileSchema),
    defaultValues: profile ?? EMPTY_PROFILE,
  });
  const { reset } = form;
  const { isDirty } = form.formState;

  // Show a profile saved from another tab, unless that would discard edits
  // the user is making here.
  useEffect(() => {
    if (!isDirty) {
      reset(profile ?? EMPTY_PROFILE);
    }
  }, [profile, isDirty, reset]);

  function handleSave(values: ViewerProfile): void {
    try {
      saveProfile(values);
      form.reset(values);
      notify({
        severity: "success",
        message: "Profile saved. New summaries will use these preferences.",
      });
    } catch {
      notify({
        severity: "error",
        message:
          "Could not save your profile. Check your browser's storage settings.",
      });
    }
  }

  function handleClear(): void {
    setIsConfirmingClear(false);
    try {
      clearProfile();
      form.reset(EMPTY_PROFILE);
      notify({
        severity: "success",
        message: "Profile removed. New summaries will use only your question.",
      });
    } catch {
      notify({
        severity: "error",
        message:
          "Could not remove your profile. Check your browser's storage settings.",
      });
    }
  }

  return (
    <Container maxWidth="md" sx={{ py: 4 }}>
      <Typography variant="h1">Your summary profile</Typography>
      <Typography color="text.secondary" sx={{ mt: 1, mb: 3 }}>
        Tell L5asly what you know and what matters to you. Save it once, edit it
        anytime.
      </Typography>
      <Paper variant="outlined" sx={{ p: { xs: 2.5, sm: 4 } }}>
        <Box
          component="form"
          noValidate
          onSubmit={form.handleSubmit(handleSave)}
        >
          <Stack spacing={3}>
            {storageError ? (
              <Alert severity="warning">{storageError}</Alert>
            ) : null}
            <Controller
              control={form.control}
              name="background"
              render={({ field, fieldState }) => (
                <TextField
                  {...field}
                  multiline
                  minRows={2}
                  label="Role or background"
                  placeholder="e.g. Backend developer with two years of experience"
                  error={Boolean(fieldState.error)}
                  helperText={
                    fieldState.error?.message ??
                    "Helps set the level of explanation."
                  }
                  slotProps={{ htmlInput: { maxLength: 500, dir: "auto" } }}
                />
              )}
            />
            <Controller
              control={form.control}
              name="knowledge"
              render={({ field, fieldState }) => (
                <TextField
                  {...field}
                  multiline
                  minRows={3}
                  label="What you already know"
                  placeholder="e.g. Node.js, SQL and REST APIs. New to React and content management systems."
                  error={Boolean(fieldState.error)}
                  helperText={
                    fieldState.error?.message ??
                    "Include skills you know and topics that are new to you."
                  }
                  slotProps={{ htmlInput: { maxLength: 1000, dir: "auto" } }}
                />
              )}
            />
            <Controller
              control={form.control}
              name="goals"
              render={({ field, fieldState }) => (
                <TextField
                  {...field}
                  multiline
                  minRows={3}
                  label="What you want to learn"
                  placeholder="e.g. Build production-ready APIs and understand architectural trade-offs."
                  error={Boolean(fieldState.error)}
                  helperText={
                    fieldState.error?.message ??
                    "These goals guide every new summary. Your question for a video takes priority."
                  }
                  slotProps={{ htmlInput: { maxLength: 1000, dir: "auto" } }}
                />
              )}
            />
            <Controller
              control={form.control}
              name="preferences"
              render={({ field, fieldState }) => (
                <TextField
                  {...field}
                  multiline
                  minRows={2}
                  label="Explanation preferences"
                  placeholder="e.g. Practical examples, prerequisites, pitfalls, and concrete next steps. Explain Arabic in Egyptian dialect."
                  error={Boolean(fieldState.error)}
                  helperText={
                    fieldState.error?.message ??
                    "Optional. Keep personal or sensitive information out of your profile."
                  }
                  slotProps={{ htmlInput: { maxLength: 500, dir: "auto" } }}
                />
              )}
            />
            <Typography variant="body2" color="text.secondary">
              Saved in this browser, not an account. Your profile is sent to the
              summary and verdict providers with each new job. Each job keeps a
              copy of the profile it used. Editing it does not change existing
              summaries.
            </Typography>
            <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
              <Button type="submit" variant="contained">
                Save profile
              </Button>
              <Button component={Link} to="/">
                Summarize a video
              </Button>
              <Button
                color="error"
                onClick={() => setIsConfirmingClear(true)}
                disabled={!profile}
              >
                Clear profile
              </Button>
            </Stack>
          </Stack>
        </Box>
      </Paper>
      <ConfirmDialog
        open={isConfirmingClear}
        title="Clear your profile?"
        description="Your saved background, knowledge, goals and preferences are removed from this browser. Existing summaries keep the profile they used."
        confirmLabel="Clear profile"
        pendingLabel="Clearing…"
        cancelLabel="Keep profile"
        isPending={false}
        onConfirm={handleClear}
        onClose={() => setIsConfirmingClear(false)}
      />
    </Container>
  );
}
