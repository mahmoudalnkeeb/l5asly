import { zodResolver } from "@hookform/resolvers/zod";
import {
  Alert,
  Box,
  Button,
  Chip,
  Container,
  InputBase,
  Paper,
  Stack,
  Typography,
} from "@mui/material";
import LockOutlined from "@mui/icons-material/LockOutlined";
import { useEffect, useId, useState } from "react";
import { Controller, useForm } from "react-hook-form";

import { viewerProfileSchema, type ViewerProfile } from "@l5sly/contracts";
import {
  Composer,
  ComposerCounter,
  ComposerLine,
  ComposerStrip,
  composerInputSx,
} from "@/components/composer";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { useNotification } from "@/components/notifications";
import { useViewerProfile } from "@/features/profile/viewer-profile";

const EMPTY_PROFILE: ViewerProfile = {
  background: "",
  knowledge: "",
  goals: "",
  preferences: "",
};

interface ProfileFieldConfig {
  name: keyof ViewerProfile;
  // Each label starts a sentence that the field completes.
  label: string;
  placeholder: string;
  // What the field changes in a brief, shown beside the form.
  effect: string;
  // Matches the limits in viewerProfileSchema.
  maxLength: number;
}

const PROFILE_FIELDS: ProfileFieldConfig[] = [
  {
    name: "background",
    label: "I am",
    placeholder: "e.g. a backend developer with two years of experience",
    effect: "Sets the level of explanation.",
    maxLength: 500,
  },
  {
    name: "knowledge",
    label: "I already know",
    placeholder:
      "e.g. Node.js, SQL and REST APIs. New to React and content management systems.",
    effect: "Skips what you know and flags what to learn first.",
    maxLength: 1000,
  },
  {
    name: "goals",
    label: "I want to",
    placeholder:
      "e.g. build production-ready APIs and understand architectural trade-offs",
    effect:
      "Guides every new summary. Your question for a video takes priority.",
    maxLength: 1000,
  },
  {
    name: "preferences",
    label: "Explain things",
    placeholder:
      "e.g. with practical examples, prerequisites and pitfalls. Optional.",
    effect: "Shapes the tone and format of the brief.",
    maxLength: 500,
  },
];

export function ProfilePage() {
  const { profile, storageError, saveProfile, clearProfile } =
    useViewerProfile();
  const notify = useNotification();
  const idPrefix = useId();
  const [isConfirmingClear, setIsConfirmingClear] = useState(false);
  const form = useForm<ViewerProfile>({
    resolver: zodResolver(viewerProfileSchema),
    defaultValues: profile ?? EMPTY_PROFILE,
  });
  const { reset } = form;
  const { isDirty } = form.formState;
  const values = form.watch();

  // Show a profile saved from another tab, unless that would discard edits
  // the user is making here.
  useEffect(() => {
    if (!isDirty) {
      reset(profile ?? EMPTY_PROFILE);
    }
  }, [profile, isDirty, reset]);

  function handleSave(nextProfile: ViewerProfile): void {
    try {
      saveProfile(nextProfile);
      reset(nextProfile);
      notify({
        severity: "success",
        message: "Profile saved. New summaries will use these preferences.",
      });
    } catch (error) {
      console.warn("Could not save the viewer profile", error);
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
      reset(EMPTY_PROFILE);
      notify({
        severity: "success",
        message: "Profile removed. New summaries will use only your question.",
      });
    } catch (error) {
      console.warn("Could not remove the viewer profile", error);
      notify({
        severity: "error",
        message:
          "Could not remove your profile. Check your browser's storage settings.",
      });
    }
  }

  return (
    <Container maxWidth="lg" sx={{ pt: { xs: 3, sm: 5 }, pb: 8 }}>
      <Typography variant="h1">Your profile</Typography>
      <Typography color="text.secondary" sx={{ mt: 1, mb: 3, maxWidth: "62ch" }}>
        Every brief is written for this person. A question you ask about a
        specific video wins over these goals.
      </Typography>
      {storageError ? (
        <Alert severity="warning" sx={{ mb: 3 }}>
          {storageError}
        </Alert>
      ) : null}
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: {
            xs: "minmax(0, 1fr)",
            md: "minmax(0, 1fr) minmax(0, 320px)",
          },
          gap: 3,
          alignItems: "start",
        }}
      >
        <Composer
          onSubmit={form.handleSubmit(handleSave)}
          ariaLabel="Your profile"
        >
          {PROFILE_FIELDS.map((profileField) => {
            const inputId = `${idPrefix}-${profileField.name}`;
            return (
              <ComposerLine
                key={profileField.name}
                label={profileField.label}
                htmlFor={inputId}
                alignTop
                aside={
                  <ComposerCounter
                    length={values[profileField.name].length}
                    maxLength={profileField.maxLength}
                  />
                }
              >
                <Controller
                  control={form.control}
                  name={profileField.name}
                  render={({ field, fieldState }) => (
                    <>
                      <InputBase
                        {...field}
                        id={inputId}
                        multiline
                        minRows={profileField.name === "background" ? 1 : 2}
                        placeholder={profileField.placeholder}
                        error={Boolean(fieldState.error)}
                        inputProps={{
                          maxLength: profileField.maxLength,
                          dir: "auto",
                        }}
                        sx={composerInputSx}
                      />
                      {fieldState.error ? (
                        <Typography variant="caption" color="error">
                          {fieldState.error.message}
                        </Typography>
                      ) : null}
                    </>
                  )}
                />
              </ComposerLine>
            );
          })}
          <ComposerStrip>
            <Stack
              direction="row"
              spacing={0.75}
              sx={{ alignItems: "center", color: "text.secondary" }}
            >
              <LockOutlined sx={{ fontSize: 16 }} />
              <Typography variant="caption">
                Saved in this browser only. No account, no sync.
              </Typography>
            </Stack>
            <Box sx={{ flex: 1 }} />
            {isDirty ? (
              <Chip size="small" color="warning" label="Unsaved changes" />
            ) : null}
            <Button
              color="error"
              onClick={() => setIsConfirmingClear(true)}
              disabled={!profile}
            >
              Clear profile
            </Button>
            <Button type="submit" variant="contained" disabled={!isDirty}>
              Save profile
            </Button>
          </ComposerStrip>
        </Composer>

        <Paper
          variant="outlined"
          component="aside"
          aria-labelledby={`${idPrefix}-effects`}
          sx={{ p: 2.5, display: "grid", gap: 2 }}
        >
          <Typography variant="h3" id={`${idPrefix}-effects`}>
            How each line changes a brief
          </Typography>
          <Box
            component="dl"
            sx={{ m: 0, display: "grid", gap: 1.5, "& dd": { m: 0 } }}
          >
            {PROFILE_FIELDS.map((profileField) => (
              <Box key={profileField.name}>
                <Typography component="dt" variant="body2" sx={{ fontWeight: 600 }}>
                  {profileField.label}…
                </Typography>
                <Typography component="dd" variant="body2" color="text.secondary">
                  {profileField.effect}
                </Typography>
              </Box>
            ))}
          </Box>
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ pt: 2, borderTop: 1, borderColor: "divider" }}
          >
            Your profile is sent to the summary and verdict providers with each
            new job, so keep personal or sensitive details out of it. Each job
            keeps a copy of the profile it used; editing it does not change
            existing summaries.
          </Typography>
        </Paper>
      </Box>
      <ConfirmDialog
        open={isConfirmingClear}
        title="Clear your profile?"
        description="Your saved background, knowledge, goals and preferences are removed from this browser. Existing summaries keep the profile they used."
        confirmLabel="Clear profile"
        cancelLabel="Keep profile"
        onConfirm={handleClear}
        onClose={() => setIsConfirmingClear(false)}
      />
    </Container>
  );
}
