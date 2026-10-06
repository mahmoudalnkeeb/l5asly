import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Box,
  Button,
  CircularProgress,
  FormHelperText,
  MenuItem,
  Paper,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";
import ExpandMore from "@mui/icons-material/ExpandMore";
import LinkOutlined from "@mui/icons-material/LinkOutlined";
import LockOutlined from "@mui/icons-material/LockOutlined";
import UploadFileOutlined from "@mui/icons-material/UploadFileOutlined";
import { useId, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { Link, useNavigate } from "react-router-dom";
import { z } from "zod";

import {
  MAX_EXPECTATION_LENGTH,
  SUMMARY_LANGUAGES,
  isYouTubeHostname,
  isYouTubeUrl,
  summaryDepthSchema,
  summaryLanguageSchema,
} from "@l5sly/contracts";
import { useNotification } from "@/components/notifications";
import { useViewerProfile } from "@/features/profile/viewer-profile";
import {
  createUploadSummary,
  createUrlSummary,
  getErrorMessage,
  precheckVideo,
} from "@/lib/api-client";
import { PrecheckResult } from "./precheck-result";

const formSchema = z
  .object({
    language: summaryLanguageSchema,
    sourceLanguage: summaryLanguageSchema,
    depth: summaryDepthSchema,
    expectation: z.string().trim().max(MAX_EXPECTATION_LENGTH).optional(),
    sourceType: z.enum(["upload", "url"]),
    url: z.string().trim().optional(),
    file: z.instanceof(File).optional(),
  })
  .superRefine((values, context) => {
    if (values.sourceType === "upload" && !values.file) {
      context.addIssue({
        code: "custom",
        path: ["file"],
        message: "Choose a video or audio file.",
      });
    }
    if (values.sourceType === "url") {
      const parsedUrl = z.url().safeParse(values.url);
      const isHttpUrl =
        parsedUrl.success &&
        (parsedUrl.data.startsWith("http://") ||
          parsedUrl.data.startsWith("https://"));
      const isMalformedYouTubeUrl =
        isHttpUrl &&
        isYouTubeHostname(parsedUrl.data) &&
        !isYouTubeUrl(parsedUrl.data);
      if (!isHttpUrl || isMalformedYouTubeUrl) {
        context.addIssue({
          code: "custom",
          path: ["url"],
          message: "Enter a YouTube link or complete HTTP/HTTPS video URL.",
        });
      }
    }
  });

type SummaryFormValues = z.infer<typeof formSchema>;

// Both form columns open with a header row of this height so the upload box
// and the question field below them start on the same line.
const FORM_HEADER_HEIGHT = 48;

const depthDescriptions = {
  quick: "Key points and recommended moments.",
  detailed: "More context and supporting notes.",
  study: "A full brief for review and reference.",
} as const;

export function SummaryForm() {
  const navigate = useNavigate();
  const notify = useNotification();
  const { profile, storageError } = useViewerProfile();
  const viewerProfile =
    profile && Object.values(profile).some((value) => value.trim())
      ? profile
      : undefined;
  const fileInputId = useId();
  const [fileName, setFileName] = useState<string>();
  const [isDragging, setIsDragging] = useState(false);
  const form = useForm<SummaryFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      sourceType: "upload",
      language: "English",
      sourceLanguage: "English",
      depth: "quick",
      expectation: "",
      url: "",
    },
  });
  const sourceType = form.watch("sourceType");
  const expectation = form.watch("expectation") ?? "";
  const depth = form.watch("depth");
  const url = form.watch("url")?.trim() ?? "";
  const canPrecheck = sourceType === "url" && isYouTubeUrl(url);

  const createSummary = useMutation({
    mutationFn: async (values: SummaryFormValues) => {
      if (values.sourceType === "upload" && values.file) {
        return createUploadSummary({
          file: values.file,
          options: {
            language: values.language,
            sourceLanguage: values.sourceLanguage,
            viewerProfile,
            depth: values.depth,
            expectation: values.expectation,
          },
        });
      }
      return createUrlSummary({
        url: values.url ?? "",
        language: values.language,
        sourceLanguage: values.sourceLanguage,
        viewerProfile,
        depth: values.depth,
        expectation: values.expectation,
      });
    },
    onSuccess: (job) => navigate(`/summaries/${job.id}`),
    onError: (error) =>
      notify({ severity: "error", message: getErrorMessage(error) }),
  });

  // Fast verdict from public metadata; no job is created and nothing is downloaded.
  const precheck = useMutation({
    mutationFn: (videoUrl: string) =>
      precheckVideo({
        url: videoUrl,
        language: form.getValues("language"),
        viewerProfile,
        expectation: form.getValues("expectation") || undefined,
      }),
  });
  // Hide an earlier result once the link is edited.
  const isPrecheckForCurrentUrl = precheck.variables === url;

  function selectSource(value: unknown): void {
    if (value !== "upload" && value !== "url") return;
    form.setValue("sourceType", value);
    form.clearErrors(["file", "url"]);
  }

  function handleFile(file: File | undefined): void {
    form.setValue("file", file, { shouldValidate: true });
    setFileName(file?.name);
  }

  function trySample(): void {
    form.setValue("sourceLanguage", "English");
    form.setValue("sourceType", "url");
    form.setValue(
      "url",
      "https://static.deepgram.com/examples/Bueller-Life-moves-pretty-fast.wav",
    );
    void form.handleSubmit((values) => createSummary.mutate(values))();
  }

  return (
    <Paper variant="outlined" sx={{ p: { xs: 2.5, sm: 4 } }}>
      <Box
        component="form"
        noValidate
        onSubmit={form.handleSubmit((values) => createSummary.mutate(values))}
      >
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: {
              xs: "minmax(0, 1fr)",
              md: "repeat(2, minmax(0, 1fr))",
            },
            gap: { xs: 3, md: 5 },
            alignItems: "start",
          }}
        >
          <Stack
            component="section"
            aria-label="Video input"
            spacing={3}
            sx={{ minWidth: 0 }}
          >
            <ToggleButtonGroup
              exclusive
              value={sourceType}
              onChange={(_, value: unknown) => selectSource(value)}
              aria-label="Video source"
              sx={{
                alignSelf: "flex-start",
                height: FORM_HEADER_HEIGHT,
                width: { xs: "100%", sm: "auto" },
              }}
            >
              <ToggleButton
                value="upload"
                sx={{
                  gap: 1,
                  px: { xs: 1.5, sm: 2.5 },
                  whiteSpace: "nowrap",
                  flex: { xs: 1, sm: "initial" },
                }}
              >
                <UploadFileOutlined fontSize="small" />
                Upload video
              </ToggleButton>
              <ToggleButton
                value="url"
                sx={{
                  gap: 1,
                  px: { xs: 1.5, sm: 2.5 },
                  whiteSpace: "nowrap",
                  flex: { xs: 1, sm: "initial" },
                }}
              >
                <LinkOutlined fontSize="small" />
                Paste a link
              </ToggleButton>
            </ToggleButtonGroup>

            {sourceType === "upload" ? (
              <Box>
                <Box
                  component="label"
                  htmlFor={fileInputId}
                  onDragOver={(event) => {
                    event.preventDefault();
                    setIsDragging(true);
                  }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={(event) => {
                    event.preventDefault();
                    setIsDragging(false);
                    handleFile(event.dataTransfer.files[0]);
                  }}
                  sx={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    width: "100%",
                    minHeight: { xs: 184, md: 200 },
                    gap: 1,
                    p: 3,
                    border: "1px dashed",
                    borderColor: form.formState.errors.file
                      ? "error.main"
                      : "primary.main",
                    borderRadius: 2,
                    bgcolor: isDragging ? "action.selected" : "action.hover",
                    textAlign: "center",
                    cursor: "pointer",
                    "&:hover": { bgcolor: "action.selected" },
                    "&:focus-within": {
                      outline: "2px solid",
                      outlineColor: "primary.main",
                      outlineOffset: 3,
                    },
                  }}
                >
                  <UploadFileOutlined
                    sx={{ fontSize: 32, color: "primary.main", mb: 1 }}
                  />
                  <Typography
                    sx={{
                      fontWeight: 600,
                      maxWidth: "100%",
                      overflowWrap: "anywhere",
                    }}
                  >
                    {fileName ?? "Drop your video here"}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {fileName ? "Choose another file" : "or choose a file"}
                  </Typography>
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{ fontFamily: "var(--font-mono)" }}
                  >
                    MP4, MOV, WebM · Up to 1 GB
                  </Typography>
                  <input
                    id={fileInputId}
                    aria-label="Choose a video or audio file"
                    className="sr-only"
                    type="file"
                    accept="video/*,audio/*"
                    onChange={(event) => handleFile(event.target.files?.[0])}
                  />
                </Box>
                {form.formState.errors.file ? (
                  <FormHelperText error>
                    {form.formState.errors.file.message}
                  </FormHelperText>
                ) : null}
              </Box>
            ) : (
              <Controller
                control={form.control}
                name="url"
                render={({ field, fieldState }) => (
                  <TextField
                    {...field}
                    label="Video URL"
                    type="url"
                    placeholder="https://youtube.com/watch?v=..."
                    error={Boolean(fieldState.error)}
                    helperText={
                      fieldState.error?.message ??
                      "YouTube or a public video/audio link."
                    }
                  />
                )}
              />
            )}

            <Controller
              control={form.control}
              name="sourceLanguage"
              render={({ field, fieldState }) => (
                <TextField
                  {...field}
                  select
                  label="Video language"
                  error={Boolean(fieldState.error)}
                  helperText={
                    fieldState.error?.message ??
                    "Choose the spoken language. The transcript stays in that language."
                  }
                >
                  {SUMMARY_LANGUAGES.map((language) => (
                    <MenuItem key={language} value={language}>
                      {language}
                    </MenuItem>
                  ))}
                </TextField>
              )}
            />
            <Stack
              direction="row"
              spacing={1}
              sx={{ color: "text.secondary", alignItems: "center" }}
            >
              <LockOutlined sx={{ fontSize: 16 }} />
              <Typography variant="caption">
                Media is deleted after successful processing. Failed-job media
                is available for retries for 24 hours. Deleting the job removes
                its retained media.
              </Typography>
            </Stack>
          </Stack>
          <Stack
            component="section"
            aria-label="Summary preferences"
            spacing={3}
            sx={{ minWidth: 0 }}
          >
            {storageError ? (
              <Alert severity="warning">{storageError}</Alert>
            ) : null}
            <Stack
              direction="row"
              sx={{
                minHeight: FORM_HEADER_HEIGHT,
                alignItems: "center",
                justifyContent: "space-between",
                gap: 1,
              }}
            >
              <Typography variant="body2" color="text.secondary">
                {viewerProfile
                  ? "Using your saved background, knowledge and goals."
                  : "Add your background and goals for a tailored summary."}
              </Typography>
              <Button
                component={Link}
                to="/profile"
                size="small"
                sx={{ flexShrink: 0 }}
              >
                {viewerProfile ? "Edit profile" : "Set up profile"}
              </Button>
            </Stack>
            <Controller
              control={form.control}
              name="expectation"
              render={({ field, fieldState }) => (
                <TextField
                  {...field}
                  multiline
                  minRows={3}
                  label="Your question (optional)"
                  placeholder="e.g. Is this worth watching for a backend developer?"
                  error={Boolean(fieldState.error)}
                  slotProps={{
                    htmlInput: {
                      maxLength: MAX_EXPECTATION_LENGTH,
                      dir: "auto",
                    },
                  }}
                  helperText={
                    <Box
                      component="span"
                      sx={{
                        display: "flex",
                        justifyContent: "space-between",
                        gap: 2,
                      }}
                    >
                      <span>
                        {fieldState.error?.message ??
                          "We'll prioritize this in your summary."}
                      </span>
                      <span>
                        {expectation.length} / {MAX_EXPECTATION_LENGTH}
                      </span>
                    </Box>
                  }
                />
              )}
            />

            <Accordion>
              <AccordionSummary
                expandIcon={<ExpandMore />}
                aria-controls="advanced-options-content"
                id="advanced-options-heading"
              >
                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                  Advanced options
                </Typography>
              </AccordionSummary>
              <AccordionDetails id="advanced-options-content">
                <Box
                  sx={{
                    display: "grid",
                    gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" },
                    gap: 3,
                  }}
                >
                  <Controller
                    control={form.control}
                    name="language"
                    render={({ field, fieldState }) => (
                      <TextField
                        {...field}
                        select
                        label="Summary language"
                        error={Boolean(fieldState.error)}
                        helperText={
                          fieldState.error?.message ??
                          "Written summary language; independent of the video."
                        }
                      >
                        {SUMMARY_LANGUAGES.map((language) => (
                          <MenuItem key={language} value={language}>
                            {language}
                          </MenuItem>
                        ))}
                      </TextField>
                    )}
                  />
                  <Controller
                    control={form.control}
                    name="depth"
                    render={({ field, fieldState }) => (
                      <TextField
                        {...field}
                        select
                        label="Summary depth"
                        error={Boolean(fieldState.error)}
                        helperText={
                          fieldState.error?.message ?? depthDescriptions[depth]
                        }
                      >
                        <MenuItem value="quick">Quick read</MenuItem>
                        <MenuItem value="detailed">Detailed</MenuItem>
                        <MenuItem value="study">Study notes</MenuItem>
                      </TextField>
                    )}
                  />
                </Box>
              </AccordionDetails>
            </Accordion>

            {createSummary.isError ? (
              <Alert severity="error">
                {getErrorMessage(createSummary.error)}
              </Alert>
            ) : null}

            {canPrecheck && isPrecheckForCurrentUrl && precheck.isSuccess ? (
              <PrecheckResult result={precheck.data} />
            ) : null}
            {canPrecheck && isPrecheckForCurrentUrl && precheck.isError ? (
              <Alert severity="error">{getErrorMessage(precheck.error)}</Alert>
            ) : null}

            <Stack
              direction={{ xs: "column", sm: "row" }}
              spacing={1.5}
              sx={{ alignItems: { sm: "center" } }}
            >
              <Button
                type="submit"
                variant="contained"
                size="large"
                disabled={createSummary.isPending}
                startIcon={
                  createSummary.isPending ? (
                    <CircularProgress size={18} color="inherit" />
                  ) : undefined
                }
              >
                {createSummary.isPending ? "Starting…" : "Create summary"}
              </Button>
              {canPrecheck ? (
                <Button
                  variant="outlined"
                  size="large"
                  onClick={() => precheck.mutate(url)}
                  disabled={precheck.isPending || createSummary.isPending}
                  startIcon={
                    precheck.isPending ? (
                      <CircularProgress size={18} color="inherit" />
                    ) : undefined
                  }
                >
                  {precheck.isPending ? "Checking…" : "Quick check"}
                </Button>
              ) : null}
              <Button
                variant="text"
                onClick={trySample}
                disabled={createSummary.isPending}
              >
                Try a sample
              </Button>
            </Stack>
          </Stack>
        </Box>
      </Box>
    </Paper>
  );
}
