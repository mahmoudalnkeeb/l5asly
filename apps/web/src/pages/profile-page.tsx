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
import { Controller, useForm } from "react-hook-form";
import { Link } from "react-router-dom";

import { viewerProfileSchema, type ViewerProfile } from "@l5sly/contracts";
import { useNotification } from "@/components/notifications";
import { useViewerProfile } from "@/features/profile/viewer-profile";

export function ProfilePage() {
  const { profile, storageError, saveProfile, clearProfile } =
    useViewerProfile();
  const notify = useNotification();
  const form = useForm<ViewerProfile>({
    resolver: zodResolver(viewerProfileSchema),
    defaultValues: profile ?? {
      background: "",
      knowledge: "",
      goals: "",
      preferences: "",
    },
  });

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
    try {
      clearProfile();
      form.reset({ background: "", knowledge: "", goals: "", preferences: "" });
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
              <Button color="error" onClick={handleClear} disabled={!profile}>
                Clear profile
              </Button>
            </Stack>
          </Stack>
        </Box>
      </Paper>
    </Container>
  );
}
