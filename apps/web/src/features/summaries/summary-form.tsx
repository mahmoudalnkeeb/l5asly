import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  FormHelperText,
  IconButton,
  InputBase,
  MenuItem,
  Paper,
  Select,
  Stack,
  Typography,
} from "@mui/material";
import CloseOutlined from "@mui/icons-material/CloseOutlined";
import InsertDriveFileOutlined from "@mui/icons-material/InsertDriveFileOutlined";
import LockOutlined from "@mui/icons-material/LockOutlined";
import {
  useEffect,
  useId,
  useState,
  type DragEvent,
  type ReactNode,
} from "react";
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
} from "@l5asly/contracts";
import {
  Composer,
  ComposerCounter,
  ComposerLine,
  ComposerStrip,
  composerInputSx,
} from "@/components/composer";
import { useNotification } from "@/components/notifications";
import { useViewerProfile } from "@/features/profile/viewer-profile";
import {
  createUploadSummary,
  createUrlSummary,
  getErrorMessage,
  listSummaries,
  precheckVideo,
  previewVideo,
} from "@/lib/api-client";
import { estimateBriefSeconds } from "./brief-estimate";
import { PrecheckResult } from "./precheck-result";
import { getPrecheckQueryKey } from "./precheck-query";
import { VideoPreview, VideoPreviewLoading } from "./video-preview";

// Matches the API's default MAX_UPLOAD_MB, so oversized files are rejected
// before a long upload rather than after it.
const MAX_UPLOAD_BYTES = 1024 * 1024 * 1024;

// Waits for the viewer to stop typing or pasting before asking for a quick check.
const PRECHECK_DELAY_MS = 500;

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

// A short public English clip used by "Try a sample".
const SAMPLE_MEDIA_URL =
  "https://static.deepgram.com/examples/Bueller-Life-moves-pretty-fast.wav";


function hasProfileContent(profile: ViewerProfile): boolean {
  return Object.values(profile).some((field) => field.trim() !== "");
}

// A few words from the saved background, so the profile token shows whose
// profile the brief will be written for.
function describeProfile(profile: ViewerProfile): string {
  const firstClause = profile.background.split(/[.,;\n]/)[0]?.trim() ?? "";
  if (!firstClause) {
    return "Saved";
  }
  const withoutArticle = firstClause.replace(/^(i am|i'm|a|an)\s+/i, "");
  return withoutArticle.length > 32
    ? `${withoutArticle.slice(0, 31).trimEnd()}…`
    : withoutArticle;
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

function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

export function SummaryForm() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const notify = useNotification();
  const { profile, storageError } = useViewerProfile();
  const viewerProfile =
    profile && hasProfileContent(profile) ? profile : undefined;
  const urlInputId = useId();
  const questionInputId = useId();
  const fileInputId = useId();
  const sourceErrorId = useId();
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  // The question is sent with the quick check once the viewer leaves the
  // field, rather than on every keystroke.
  const [checkedExpectation, setCheckedExpectation] = useState("");
  const form = useForm<SummaryFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      sourceType: "url",
      language: "English",
      sourceLanguage: "English",
      depth: "quick",
      expectation: "",
      url: "",
    },
  });
  const expectation = form.watch("expectation") ?? "";
  const language = form.watch("language");
  const url = form.watch("url")?.trim() ?? "";
  const file = form.watch("file");
  const sourceError =
    form.formState.errors.url?.message ?? form.formState.errors.file?.message;

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

  // The preview and the quick check read public metadata only; no job is
  // created and nothing is downloaded.
  const checkedUrl = useDebouncedValue(url, PRECHECK_DELAY_MS);
  const canPrecheck = !file && isYouTubeUrl(checkedUrl);
  // Hide earlier results as soon as the link is edited.
  const showPrecheck = canPrecheck && checkedUrl === url;

  const preview = useQuery({
    queryKey: ["video-preview", checkedUrl],
    queryFn: ({ signal }) => previewVideo(checkedUrl, signal),
    enabled: canPrecheck,
    staleTime: Infinity,
    retry: false,
  });
  // The link whose preview has been applied to the form. The quick check waits
  // for it, so it runs once, in the spoken language the preview detected.
  const [previewedUrl, setPreviewedUrl] = useState("");
  // Tracked separately from isDirty, which is false again when the viewer
  // picks the default language on purpose.
  const [hasChosenSpokenLanguage, setHasChosenSpokenLanguage] = useState(false);
  const previewData = preview.data;
  useEffect(() => {
    if (!previewData) return;
    const spokenLanguage = previewData.spokenLanguage;
    if (spokenLanguage && !hasChosenSpokenLanguage) {
      form.setValue("sourceLanguage", spokenLanguage);
      if (!form.getFieldState("language").isDirty) {
        form.setValue("language", spokenLanguage);
      }
    }
    setPreviewedUrl(checkedUrl);
  }, [previewData, checkedUrl, hasChosenSpokenLanguage, form]);
  const isPreviewSettled = preview.isError || previewedUrl === checkedUrl;

  const precheckInput = {
    url: checkedUrl,
    language,
    expectation: toOptionalText(checkedExpectation),
  };
  const precheck = useQuery({
    queryKey: getPrecheckQueryKey(precheckInput),
    queryFn: () => precheckVideo({ ...precheckInput, viewerProfile }),
    enabled: canPrecheck && isPreviewSettled,
    staleTime: Infinity,
    retry: false,
  });

  // Recent briefs show how fast this installation is; the same list backs the
  // library page.
  const recentSummaries = useQuery({
    queryKey: ["summaries"],
    queryFn: ({ signal }) => listSummaries(signal),
    enabled: canPrecheck,
  });

  // A failed preview shows nothing here; the quick check below reports the
  // same metadata failure with its own message.
  let previewContent: ReactNode = null;
  if (showPrecheck && preview.isPending) {
    previewContent = <VideoPreviewLoading />;
  } else if (showPrecheck && preview.isSuccess) {
    const durationSeconds = preview.data.durationSeconds;
    previewContent = (
      <VideoPreview
        preview={preview.data}
        recommendation={
          precheck.isSuccess ? precheck.data.verdict.recommendation : null
        }
        briefEstimateSeconds={
          recentSummaries.data && durationSeconds !== null
            ? estimateBriefSeconds(recentSummaries.data, durationSeconds)
            : null
        }
      />
    );
  }

  const submit = form.handleSubmit((values) => createSummary.mutate(values));

  function selectFile(selected: File | undefined): void {
    if (!selected) return;
    form.setValue("sourceType", "upload");
    form.setValue("file", selected, { shouldValidate: true });
    form.clearErrors("url");
  }

  function removeFile(): void {
    form.setValue("sourceType", "url");
    form.setValue("file", undefined);
    form.clearErrors(["file", "url"]);
  }

  function askQuestion(question: string): void {
    form.setValue("expectation", question, { shouldDirty: true });
    // A picked question is final, so the quick check can use it right away
    // instead of waiting for the field to lose focus.
    setCheckedExpectation(question);
  }

  function trySample(): void {
    removeFile();
    form.setValue("sourceLanguage", "English");
    form.setValue("url", SAMPLE_MEDIA_URL);
    void submit();
  }

  function handleDragOver(event: DragEvent<HTMLElement>): void {
    if (!event.dataTransfer.types.includes("Files")) return;
    event.preventDefault();
    setIsDraggingFile(true);
  }

  function handleDragLeave(event: DragEvent<HTMLElement>): void {
    // dragleave also fires when the pointer moves onto a child element.
    const enteredChild =
      event.relatedTarget instanceof Node &&
      event.currentTarget.contains(event.relatedTarget);
    if (!enteredChild) setIsDraggingFile(false);
  }

  function handleDrop(event: DragEvent<HTMLElement>): void {
    if (!event.dataTransfer.types.includes("Files")) return;
    event.preventDefault();
    setIsDraggingFile(false);
    selectFile(event.dataTransfer.files[0]);
  }

  return (
    <Box
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      sx={{
        position: "relative",
        display: "grid",
        justifyItems: "center",
        gap: 3,
        width: "100%",
        maxWidth: 760,
        mx: "auto",
      }}
    >
      {storageError ? (
        <Alert severity="warning" sx={{ width: "100%" }}>
          {storageError}
        </Alert>
      ) : null}

      <Box sx={{ width: "100%" }}>
        <Composer onSubmit={submit} ariaLabel="Summarize a video">
          <ComposerLine
            label={file ? "File" : "Video"}
            htmlFor={file ? undefined : urlInputId}
            action={
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
                {createSummary.isPending ? "Starting…" : "Summarize"}
              </Button>
            }
            footer={previewContent}
          >
            {file ? (
              <SelectedFile name={file.name} onRemove={removeFile} />
            ) : (
              <Controller
                control={form.control}
                name="url"
                render={({ field, fieldState }) => (
                  <InputBase
                    {...field}
                    id={urlInputId}
                    type="url"
                    placeholder="Paste a YouTube or video link"
                    autoComplete="off"
                    error={Boolean(fieldState.error)}
                    inputProps={{
                      spellCheck: false,
                      "aria-invalid": fieldState.error ? true : undefined,
                      "aria-describedby": fieldState.error
                        ? sourceErrorId
                        : undefined,
                    }}
                    sx={composerInputSx}
                  />
                )}
              />
            )}
          </ComposerLine>

          <ComposerLine
            label="I want to know"
            htmlFor={questionInputId}
            alignTop
            aside={
              <ComposerCounter
                length={expectation.length}
                maxLength={MAX_EXPECTATION_LENGTH}
              />
            }
            footer={
              expectation.trim() === "" ? (
                <SuggestedQuestions onPick={askQuestion} />
              ) : null
            }
          >
            <Controller
              control={form.control}
              name="expectation"
              render={({ field }) => (
                <InputBase
                  {...field}
                  id={questionInputId}
                  multiline
                  maxRows={4}
                  placeholder="e.g. Is this worth watching for a backend developer? (optional)"
                  onBlur={() => {
                    field.onBlur();
                    setCheckedExpectation(field.value ?? "");
                  }}
                  inputProps={{ maxLength: MAX_EXPECTATION_LENGTH, dir: "auto" }}
                  sx={composerInputSx}
                />
              )}
            />
          </ComposerLine>

          <ComposerStrip>
            <Controller
              control={form.control}
              name="sourceLanguage"
              render={({ field }) => (
                <SettingToken
                  label="Spoken in"
                  value={field.value}
                  options={LANGUAGE_OPTIONS}
                  onChange={(value) => {
                    const spokenLanguage = summaryLanguageSchema.parse(value);
                    field.onChange(spokenLanguage);
                    setHasChosenSpokenLanguage(true);
                    // The brief follows the video's language until the
                    // viewer picks a brief language of their own.
                    if (!form.getFieldState("language").isDirty) {
                      form.setValue("language", spokenLanguage);
                    }
                  }}
                />
              )}
            />
            <Controller
              control={form.control}
              name="language"
              render={({ field }) => (
                <SettingToken
                  label="Brief in"
                  value={field.value}
                  options={LANGUAGE_OPTIONS}
                  onChange={(value) =>
                    field.onChange(summaryLanguageSchema.parse(value))
                  }
                />
              )}
            />
            <Controller
              control={form.control}
              name="depth"
              render={({ field }) => (
                <SettingToken
                  label="Depth"
                  value={field.value}
                  options={DEPTH_OPTIONS}
                  onChange={(value) =>
                    field.onChange(summaryDepthSchema.parse(value))
                  }
                />
              )}
            />
            <Button
              component={Link}
              to="/profile"
              size="small"
              sx={{
                ...tokenSx,
                minHeight: 0,
                py: 0.5,
                pr: 1.5,
                fontWeight: 500,
                color: "text.secondary",
                "&:hover": { bgcolor: "background.paper", borderColor: "text.secondary" },
              }}
            >
              Profile{" "}
              <Box
                component="span"
                sx={{ color: "primary.main", fontWeight: 600 }}
              >
                {viewerProfile ? describeProfile(viewerProfile) : "Set up"}
              </Box>
            </Button>
          </ComposerStrip>
        </Composer>
        {sourceError ? (
          <FormHelperText id={sourceErrorId} error sx={{ mx: 2, mt: 1 }}>
            {sourceError}
          </FormHelperText>
        ) : null}
      </Box>

      <Stack
        direction="row"
        sx={{
          flexWrap: "wrap",
          justifyContent: "center",
          alignItems: "center",
          columnGap: 1.5,
          rowGap: 0.5,
          color: "text.secondary",
          typography: "body2",
        }}
      >
        {/* Phones can't drag files, so they only get the file picker. */}
        <Box component="span" sx={{ display: { xs: "none", sm: "inline" } }}>
          or drop a video file anywhere here
        </Box>
        <Box
          component="span"
          aria-hidden
          sx={{ display: { xs: "none", sm: "inline" } }}
        >
          ·
        </Box>
        <Box
          component="label"
          htmlFor={fileInputId}
          sx={{
            color: "primary.main",
            fontWeight: 600,
            cursor: "pointer",
            textDecoration: "underline",
            textUnderlineOffset: 3,
            "&:has(+ input:focus-visible)": {
              outline: "2px solid",
              outlineColor: "primary.main",
              outlineOffset: 2,
            },
          }}
        >
          choose a file
        </Box>
        <input
          id={fileInputId}
          aria-label="Choose a video or audio file"
          className="sr-only"
          type="file"
          accept="video/*,audio/*"
          onChange={(event) => {
            selectFile(event.target.files?.[0]);
            // Lets the same file be chosen again after removing it.
            event.target.value = "";
          }}
        />
        <span aria-hidden>·</span>
        <Button
          size="small"
          onClick={trySample}
          disabled={createSummary.isPending}
          sx={{ minHeight: 0, px: 1 }}
        >
          Try a sample
        </Button>
      </Stack>

      {createSummary.isError ? (
        <Alert severity="error" sx={{ width: "100%" }}>
          {getErrorMessage(createSummary.error)}
        </Alert>
      ) : null}

      <Box sx={{ width: "100%" }}>
        {showPrecheck && precheck.isPending ? <PrecheckLoading /> : null}
        {showPrecheck && precheck.isSuccess ? (
          <PrecheckResult
            result={precheck.data}
            onCreateSummary={() => void submit()}
            isCreating={createSummary.isPending}
          />
        ) : null}
        {showPrecheck && precheck.isError ? (
          <Alert severity="error">{getErrorMessage(precheck.error)}</Alert>
        ) : null}
        {file ? <UploadNote /> : null}
        {!file && !showPrecheck ? <WhatYouGet /> : null}
      </Box>

      <Stack
        direction="row"
        spacing={1}
        sx={{ color: "text.secondary", alignItems: "center", maxWidth: 600 }}
      >
        <LockOutlined sx={{ fontSize: 16, flexShrink: 0 }} />
        <Typography variant="caption">
          Media is deleted after successful processing. Failed-job media is
          available for retries for 24 hours. Deleting the job removes its
          retained media.
        </Typography>
      </Stack>

      {isDraggingFile ? <DropOverlay /> : null}
    </Box>
  );
}

const tokenSx = {
  display: "inline-flex",
  alignItems: "center",
  gap: 0.5,
  pl: 1.5,
  pr: 0.5,
  border: 1,
  borderColor: "divider",
  borderRadius: 999,
  bgcolor: "background.paper",
  color: "text.secondary",
  typography: "body2",
} as const;

interface SettingOption {
  value: string;
  label: string;
}

const LANGUAGE_OPTIONS: SettingOption[] = SUMMARY_LANGUAGES.map(
  (language) => ({ value: language, label: language }),
);

const DEPTH_OPTIONS: SettingOption[] = [
  { value: "quick", label: "Quick read" },
  { value: "detailed", label: "Detailed" },
  { value: "study", label: "Study notes" },
];

interface SettingTokenProps {
  label: string;
  value: string;
  options: SettingOption[];
  onChange: (value: string) => void;
}

// A labelled setting on the composer's strip, read as part of the sentence.
// The label renders inside the Select so the whole pill opens the menu and
// the menu takes the pill's width.
function SettingToken({ label, value, options, onChange }: SettingTokenProps) {
  const labelId = useId();
  return (
    <Select
      variant="standard"
      disableUnderline
      labelId={labelId}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      renderValue={(selected) => (
        <>
          <span id={labelId}>{label}</span>
          <Box
            component="span"
            sx={{ ml: 0.5, fontWeight: 600, color: "text.primary" }}
          >
            {options.find((option) => option.value === selected)?.label ??
              selected}
          </Box>
        </>
      )}
      sx={{
        ...tokenSx,
        pl: 0,
        "&.Mui-focused": { borderColor: "primary.main" },
        "& .MuiSelect-select": { py: 0.5, pl: 1.5, borderRadius: 999 },
        "& .MuiSelect-select:focus": { bgcolor: "transparent" },
      }}
    >
      {options.map((option) => (
        <MenuItem key={option.value} value={option.value}>
          {option.label}
        </MenuItem>
      ))}
    </Select>
  );
}

function SelectedFile({
  name,
  onRemove,
}: {
  name: string;
  onRemove: () => void;
}) {
  return (
    <Stack direction="row" spacing={1} sx={{ alignItems: "center", minWidth: 0 }}>
      <InsertDriveFileOutlined
        fontSize="small"
        sx={{ color: "primary.main", flexShrink: 0 }}
      />
      <Typography
        sx={{
          minWidth: 0,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {name}
      </Typography>
      <IconButton size="small" aria-label="Remove file" onClick={onRemove}>
        <CloseOutlined fontSize="small" />
      </IconButton>
    </Stack>
  );
}

function PrecheckLoading() {
  return (
    <Paper
      variant="outlined"
      role="status"
      sx={{
        p: 3,
        display: "flex",
        gap: 1.5,
        alignItems: "center",
        color: "text.secondary",
      }}
    >
      <CircularProgress size={16} color="inherit" />
      <Typography variant="body2">
        Checking the title, description and chapters…
      </Typography>
    </Paper>
  );
}

function UploadNote() {
  return (
    <Paper variant="outlined" sx={{ p: 3 }}>
      <Typography variant="body2">
        Uploads skip the quick check, since a file has no public title or
        chapter list to read. Summarize to transcribe it and get the full
        verdict.
      </Typography>
    </Paper>
  );
}

// Questions that work for most videos, for viewers who aren't sure what to ask.
const SUGGESTED_QUESTIONS = [
  "What are the main takeaways?",
  "Is it beginner friendly?",
  "Is there a practical demo?",
  "Is any of it outdated?",
] as const;

function SuggestedQuestions({
  onPick,
}: {
  onPick: (question: string) => void;
}) {
  return (
    <Stack
      direction="row"
      role="group"
      aria-label="Suggested questions"
      sx={{ flexWrap: "wrap", gap: 0.75, pb: 0.75 }}
    >
      {SUGGESTED_QUESTIONS.map((question) => (
        <Chip
          key={question}
          label={question}
          size="small"
          variant="outlined"
          onClick={() => onPick(question)}
          sx={{ borderRadius: 999, color: "text.secondary" }}
        />
      ))}
    </Stack>
  );
}

const PROMISES = [
  {
    title: "A verdict in seconds",
    detail:
      "Paste a YouTube link to see watch, key moments or skip before you start.",
  },
  {
    title: "A brief that answers you",
    detail: "Your question first, then what the video actually says.",
  },
  {
    title: "The full transcript",
    detail: "Timestamped, in the language the video is spoken in.",
  },
] as const;

function WhatYouGet() {
  return (
    <Box
      component="ul"
      aria-label="What you get"
      sx={{
        display: "grid",
        gridTemplateColumns: { xs: "1fr", sm: "repeat(3, minmax(0, 1fr))" },
        gap: 1.5,
        m: 0,
        p: 0,
        listStyle: "none",
      }}
    >
      {PROMISES.map((promise) => (
        <Box
          component="li"
          key={promise.title}
          sx={{
            border: "1px dashed",
            borderColor: "divider",
            borderRadius: 3,
            px: 2,
            py: 1.75,
          }}
        >
          <Typography variant="body2" sx={{ fontWeight: 600 }}>
            {promise.title}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
            {promise.detail}
          </Typography>
        </Box>
      ))}
    </Box>
  );
}

function DropOverlay() {
  return (
    <Box
      aria-hidden
      sx={(theme) => ({
        position: "absolute",
        inset: -16,
        zIndex: 2,
        display: "grid",
        placeItems: "center",
        textAlign: "center",
        border: "2px dashed",
        borderColor: "primary.main",
        borderRadius: 3,
        bgcolor: `color-mix(in srgb, ${theme.palette.background.default} 90%, transparent)`,
        // The overlay must not swallow the drop or the leave events.
        pointerEvents: "none",
      })}
    >
      <Box>
        <Typography variant="h2" color="primary">
          Drop to summarize
        </Typography>
        <Typography color="text.secondary">
          Video or audio, up to 1 GB
        </Typography>
      </Box>
    </Box>
  );
}
