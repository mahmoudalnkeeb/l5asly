import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Box,
  Button,
  CircularProgress,
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
import { useId } from "react";
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
  type SummaryJob,
  type SummaryOptions,
  type ViewerProfile,
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
import { UploadDropzone } from "./upload-dropzone";

// Matches the API's default MAX_UPLOAD_MB, so oversized files are rejected
// before a long upload rather than after it.
const MAX_UPLOAD_BYTES = 1024 * 1024 * 1024;

// The file picker filters by type, but drag and drop does not. Some systems
// report no type for valid containers such as .mkv; the server checks those.
function isMediaFile(file: File): boolean {
  return (
    file.type === "" ||
    file.type.startsWith("video/") ||
    file.type.startsWith("audio/")
  );
}

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
    if (values.sourceType === "upload") {
      if (!values.file || !isMediaFile(values.file)) {
        context.addIssue({
          code: "custom",
          path: ["file"],
          message: "Choose a video or audio file.",
        });
      } else if (values.file.size > MAX_UPLOAD_BYTES) {
        context.addIssue({
          code: "custom",
          path: ["file"],
          message:
            "This file is larger than 1 GB. Choose a smaller file or paste a link instead.",
        });
      }
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

// A short public English clip used by "Try a sample".
const SAMPLE_MEDIA_URL =
  "https://static.deepgram.com/examples/Bueller-Life-moves-pretty-fast.wav";

function hasProfileContent(profile: ViewerProfile): boolean {
  return Object.values(profile).some((field) => field.trim() !== "");
}

function toOptionalText(text: string | undefined): string | undefined {
  if (text === undefined || text.trim() === "") {
    return undefined;
  }
  return text;
}

// The form schema has already required the chosen source, so a missing file
// or link here is a programming error rather than a user mistake.
function startSummary(
  values: SummaryFormValues,
  viewerProfile: ViewerProfile | undefined,
): Promise<SummaryJob> {
  const options: SummaryOptions = {
    language: values.language,
    sourceLanguage: values.sourceLanguage,
    viewerProfile,
    depth: values.depth,
    expectation: toOptionalText(values.expectation),
  };

  if (values.sourceType === "upload") {
    if (!values.file) {
      throw new Error("An upload summary was submitted without a file.");
    }
    return createUploadSummary({ file: values.file, options });
  }

  if (!values.url) {
    throw new Error("A link summary was submitted without a URL.");
  }
  return createUrlSummary({ url: values.url, ...options });
}

const depthDescriptions = {
  quick: "Key points and recommended moments.",
  detailed: "More context and supporting notes.",
  study: "A full brief for review and reference.",
} as const;

export function SummaryForm() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const notify = useNotification();
  const { profile, storageError } = useViewerProfile();
  const viewerProfile =
    profile && hasProfileContent(profile) ? profile : undefined;
  const advancedOptionsId = useId();
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
  const fileName = form.watch("file")?.name;
  const canPrecheck = sourceType === "url" && isYouTubeUrl(url);

  const createSummary = useMutation({
    mutationFn: (values: SummaryFormValues) =>
      startSummary(values, viewerProfile),
    onSuccess: (job) => {
      // The library can be cached for a few seconds; make sure it shows this job.
      void queryClient.invalidateQueries({ queryKey: ["summaries"] });
      navigate(`/summaries/${job.id}`);
    },
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
        expectation: toOptionalText(form.getValues("expectation")),
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
  }

  function trySample(): void {
    form.setValue("sourceLanguage", "English");
    form.setValue("sourceType", "url");
    form.setValue("url", SAMPLE_MEDIA_URL);
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
              <UploadDropzone
                fileName={fileName}
                errorMessage={form.formState.errors.file?.message}
                onFileChange={handleFile}
              />
            ) : (
              <Controller
                control={form.control}
                name="url"
                render={({ field, fieldState }) => (
                  <TextField
                    {...field}
                    label="Video URL"
                    type="url"
                    placeholder="https://youtube.com/watch?v=…"
                    autoComplete="off"
                    slotProps={{ htmlInput: { spellCheck: false } }}
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
                aria-controls={`${advancedOptionsId}-content`}
                id={`${advancedOptionsId}-heading`}
              >
                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                  Advanced options
                </Typography>
              </AccordionSummary>
              <AccordionDetails id={`${advancedOptionsId}-content`}>
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
