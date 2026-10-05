import {
  Alert,
  AlertTitle,
  Box,
  Button,
  Chip,
  Container,
  Divider,
  InputAdornment,
  List,
  ListItem,
  ListItemText,
  Paper,
  Stack,
  Tab,
  Tabs,
  TextField,
  Typography,
} from "@mui/material";
import ArrowBack from "@mui/icons-material/ArrowBack";
import ContentCopyOutlined from "@mui/icons-material/ContentCopyOutlined";
import DownloadOutlined from "@mui/icons-material/DownloadOutlined";
import SearchOutlined from "@mui/icons-material/SearchOutlined";
import { useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";

import type {
  SummaryLanguage,
  SummaryResult as SummaryResultData,
} from "@l5sly/contracts";
import { useNotification } from "@/components/notifications";
import { formatTimestamp } from "@/features/summaries/format";

interface SummaryResultProps {
  result: SummaryResultData;
  sourceName: string;
  requestedLanguage: SummaryLanguage;
}

const verdictLabels: Record<
  SummaryResultData["verdict"]["recommendation"],
  string
> = {
  watch: "Worth watching",
  "watch-key-moments": "Key moments only",
  skip: "Brief is enough",
};

const languageLabels: Record<string, string> = {
  ar: "Arabic",
  arabic: "Arabic",
  en: "English",
  english: "English",
  es: "Spanish",
  french: "French",
  fr: "French",
  spanish: "Spanish",
};

function formatLanguageLabel(
  sourceLanguage: string,
  requestedLanguage: SummaryLanguage,
): string {
  const normalizedLanguage = sourceLanguage.trim().toLocaleLowerCase();
  if (!normalizedLanguage || normalizedLanguage === "unknown") {
    return requestedLanguage;
  }

  const languageCode = normalizedLanguage.split("-")[0] ?? normalizedLanguage;
  return (
    languageLabels[normalizedLanguage] ??
    languageLabels[languageCode] ??
    sourceLanguage
  );
}

function getContentProps(text: string): { dir: "rtl" | "auto"; lang?: "ar" } {
  if (/\p{Script=Arabic}/u.test(text)) {
    return { dir: "rtl", lang: "ar" };
  }
  return { dir: "auto" };
}

function highlightTranscriptText(text: string, search: string): ReactNode {
  const query = search.trim();
  if (!query) {
    return text;
  }

  const lowerText = text.toLocaleLowerCase();
  const lowerQuery = query.toLocaleLowerCase();
  const parts: ReactNode[] = [];
  let cursor = 0;
  let matchStart = lowerText.indexOf(lowerQuery, cursor);

  while (matchStart !== -1) {
    if (matchStart > cursor) {
      parts.push(text.slice(cursor, matchStart));
    }

    const matchEnd = matchStart + query.length;
    parts.push(
      <mark
        key={`${matchStart}-${matchEnd}`}
        className="rounded-sm bg-accent px-0.5 text-accent-foreground"
      >
        {text.slice(matchStart, matchEnd)}
      </mark>,
    );
    cursor = matchEnd;
    matchStart = lowerText.indexOf(lowerQuery, cursor);
  }

  if (!parts.length) {
    return text;
  }

  if (cursor < text.length) {
    parts.push(text.slice(cursor));
  }

  return parts;
}

function guidanceExport(result: SummaryResultData): string[] {
  const guidance = result.personalizedGuidance;
  if (!guidance) return [];
  return [
    "VIEWING PLAN",
    guidance.relevance,
    "",
    ...(guidance.prerequisites.length
      ? [
          "PREPARATION",
          ...guidance.prerequisites.map(
            (item) => `- ${item.topic} (${item.status}): ${item.reason}`,
          ),
          "",
        ]
      : []),
    ...(guidance.nextSteps.length
      ? ["NEXT STEPS", ...guidance.nextSteps.map((step) => `- ${step}`), ""]
      : []),
  ];
}

export function SummaryResult({
  result,
  sourceName,
  requestedLanguage,
}: SummaryResultProps) {
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState("summary");
  const notify = useNotification();
  const matchingTranscript = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    if (!query) {
      return result.transcript;
    }
    return result.transcript.filter((segment) =>
      segment.text.toLocaleLowerCase().includes(query),
    );
  }, [result.transcript, search]);

  async function copySummary(): Promise<void> {
    const text = [
      result.title,
      "",
      result.overview,
      "",
      "DIRECT ANSWER",
      result.viewerAnswer,
      "",
      ...guidanceExport(result),
      ...result.sections.flatMap((section) => [
        section.title,
        section.body,
        "",
      ]),
    ].join("\n");
    try {
      await navigator.clipboard.writeText(text);
      notify({ severity: "success", message: "Summary copied." });
    } catch {
      notify({
        severity: "error",
        message:
          "Could not copy the summary. Check your browser's clipboard permission.",
      });
    }
  }

  function downloadNotes(): void {
    const text = [
      result.title,
      "",
      "WATCH VERDICT",
      `${result.verdict.headline}: ${result.verdict.reason}`,
      "",
      "DIRECT ANSWER",
      result.viewerAnswer,
      "",
      ...guidanceExport(result),
      ...(result.caveats.length
        ? ["CAVEATS", ...result.caveats.map((caveat) => `- ${caveat}`), ""]
        : []),
      "KEY NOTES",
      ...result.notes.map((note) => `- ${note.title}: ${note.detail}`),
    ].join("\n");
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "l5asly-notes.txt";
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <Container
      maxWidth="lg"
      sx={{
        pt: 3,
        pb: 8,
        "& [dir]": { overflowWrap: "anywhere", textAlign: "start" },
      }}
    >
      <Stack
        direction={{ xs: "column", sm: "row" }}
        spacing={1}
        sx={{ mb: 3, justifyContent: "space-between" }}
      >
        <Button
          component={Link}
          to="/library"
          startIcon={<ArrowBack />}
          sx={{ alignSelf: "flex-start" }}
        >
          Library
        </Button>
        <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
          <Button
            variant="outlined"
            startIcon={<ContentCopyOutlined />}
            onClick={() => void copySummary()}
          >
            Copy summary
          </Button>
          <Button
            variant="contained"
            startIcon={<DownloadOutlined />}
            onClick={downloadNotes}
          >
            Download notes
          </Button>
        </Stack>
      </Stack>

      <Box component="header" sx={{ mb: 3 }}>
        <Typography
          variant="caption"
          color="text.secondary"
          {...getContentProps(sourceName)}
          sx={{ overflowWrap: "anywhere", fontFamily: "var(--font-mono)" }}
        >
          {sourceName}
        </Typography>
        <Typography
          variant="h1"
          {...getContentProps(result.title)}
          sx={{
            mt: 1,
            maxWidth: 900,
            fontSize: { xs: "1.75rem", sm: "2.25rem" },
          }}
        >
          {result.title}
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5 }}>
          <bdi dir="ltr" className="font-mono">
            {formatTimestamp(result.durationSeconds)}
          </bdi>{" "}
          · {formatLanguageLabel(result.sourceLanguage, requestedLanguage)}
        </Typography>
      </Box>

      <Tabs
        value={tab}
        onChange={(_, value: string) => setTab(value)}
        aria-label="Summary views"
        variant="scrollable"
        scrollButtons="auto"
        sx={{ borderBottom: 1, borderColor: "divider", mb: 3 }}
      >
        <Tab
          id="summary-tab"
          aria-controls="summary-panel"
          value="summary"
          label="Summary"
        />
        <Tab
          id="notes-tab"
          aria-controls="notes-panel"
          value="notes"
          label="Notes"
        />
        <Tab
          id="transcript-tab"
          aria-controls="transcript-panel"
          value="transcript"
          label="Transcript"
        />
      </Tabs>

      {tab === "summary" ? (
        <Box
          role="tabpanel"
          id="summary-panel"
          aria-labelledby="summary-tab"
          sx={{
            display: "grid",
            gridTemplateColumns: { xs: "1fr", md: "minmax(0, 1fr) 300px" },
            gap: 4,
            alignItems: "start",
          }}
        >
          <Box component="article" sx={{ minWidth: 0 }}>
            <Paper sx={{ p: 3, bgcolor: "action.selected", mb: 4 }}>
              <Typography variant="h3" color="primary">
                Direct answer
              </Typography>
              <Typography
                {...getContentProps(result.viewerAnswer)}
                sx={{
                  mt: 1,
                  fontSize: "1.25rem",
                  fontWeight: 500,
                  lineHeight: 1.6,
                }}
              >
                {result.viewerAnswer}
              </Typography>
            </Paper>
            {result.personalizedGuidance ? (
              <Box
                component="section"
                aria-labelledby="viewing-plan-title"
                sx={{ mb: 4 }}
              >
                <Typography variant="h2" id="viewing-plan-title">
                  Your viewing plan
                </Typography>
                <Typography
                  {...getContentProps(result.personalizedGuidance.relevance)}
                  color="text.secondary"
                  sx={{ mt: 1.5 }}
                >
                  {result.personalizedGuidance.relevance}
                </Typography>
                {result.personalizedGuidance.prerequisites.length ? (
                  <Box sx={{ mt: 2 }}>
                    <Typography variant="h3">Before watching</Typography>
                    {result.personalizedGuidance.prerequisites.map((item) => (
                      <Box key={item.topic} sx={{ mt: 1.5 }}>
                        <Stack
                          direction="row"
                          sx={{
                            gap: 1,
                            alignItems: "baseline",
                            flexWrap: "wrap",
                          }}
                        >
                          <Typography
                            {...getContentProps(item.topic)}
                            sx={{ fontWeight: 600 }}
                          >
                            {item.topic}
                          </Typography>
                          <Chip
                            size="small"
                            variant="outlined"
                            label={
                              item.status === "already-known"
                                ? "Already familiar"
                                : "Prepare first"
                            }
                          />
                        </Stack>
                        <Typography
                          {...getContentProps(item.reason)}
                          variant="body2"
                          color="text.secondary"
                          sx={{ mt: 0.5 }}
                        >
                          {item.reason}
                        </Typography>
                      </Box>
                    ))}
                  </Box>
                ) : null}
                {result.personalizedGuidance.nextSteps.length ? (
                  <>
                    <Typography variant="h3" sx={{ mt: 2 }}>
                      Next steps
                    </Typography>
                    <Box
                      component="ul"
                      {...getContentProps(
                        result.personalizedGuidance.nextSteps.join(" "),
                      )}
                      sx={{
                        mt: 1,
                        mb: 0,
                        paddingInlineStart: 3,
                        listStyleType: "disc",
                      }}
                    >
                      {result.personalizedGuidance.nextSteps.map((step) => (
                        <Box
                          component="li"
                          key={step}
                          sx={{ "& + li": { mt: 1 } }}
                        >
                          {step}
                        </Box>
                      ))}
                    </Box>
                  </>
                ) : null}
              </Box>
            ) : null}
            <Typography variant="h2">Summary</Typography>
            <Typography
              {...getContentProps(result.overview)}
              color="text.secondary"
              sx={{ mt: 1.5, mb: 3 }}
            >
              {result.overview}
            </Typography>
            {result.sections.map((section) => (
              <Box component="section" key={section.title} sx={{ mb: 3 }}>
                <Typography variant="h3" {...getContentProps(section.title)}>
                  {section.title}
                </Typography>
                <Typography
                  color="text.secondary"
                  {...getContentProps(section.body)}
                  sx={{ mt: 1 }}
                >
                  {section.body}
                </Typography>
              </Box>
            ))}
            {result.caveats.length ? (
              <Alert severity="warning">
                <AlertTitle>What to keep in mind</AlertTitle>
                <Box
                  component="ul"
                  {...getContentProps(result.caveats.join(" "))}
                  sx={{
                    m: 0,
                    paddingInlineStart: 3,
                    paddingInlineEnd: 0,
                    listStyleType: "disc",
                  }}
                >
                  {result.caveats.map((caveat) => (
                    <Box
                      component="li"
                      key={caveat}
                      sx={{ "& + li": { mt: 1 } }}
                    >
                      {caveat}
                    </Box>
                  ))}
                </Box>
              </Alert>
            ) : null}
          </Box>
          <Box
            component="aside"
            sx={{ position: { md: "sticky" }, top: 88, minWidth: 0 }}
          >
            <Paper variant="outlined" sx={{ p: 2.5, mb: 3 }}>
              <Chip
                size="small"
                color="primary"
                variant="outlined"
                label={verdictLabels[result.verdict.recommendation]}
                sx={{ mb: 1.5 }}
              />
              <Typography
                variant="h3"
                {...getContentProps(result.verdict.headline)}
              >
                {result.verdict.headline}
              </Typography>
              <Typography
                variant="body2"
                color="text.secondary"
                {...getContentProps(result.verdict.reason)}
                sx={{ mt: 1 }}
              >
                {result.verdict.reason}
              </Typography>
            </Paper>
            <Typography variant="h3" id="moments-title">
              Recommended moments
            </Typography>
            <List aria-labelledby="moments-title" disablePadding sx={{ mt: 1 }}>
              {result.recommendedMoments.map((moment) => (
                <ListItem
                  key={`${moment.startSeconds}-${moment.title}`}
                  disableGutters
                  alignItems="flex-start"
                  {...getContentProps(`${moment.title} ${moment.reason}`)}
                  sx={{ gap: 1.5 }}
                >
                  <Typography
                    component="time"
                    dir="ltr"
                    lang="en"
                    color="primary"
                    sx={{
                      pt: 1,
                      fontFamily: "var(--font-mono)",
                      fontSize: 12,
                      whiteSpace: "nowrap",
                      flexShrink: 0,
                      unicodeBidi: "isolate",
                    }}
                  >
                    {formatTimestamp(moment.startSeconds)}
                  </Typography>
                  <ListItemText
                    primary={moment.title}
                    secondary={moment.reason}
                    slotProps={{
                      primary: {
                        variant: "body2",
                        ...getContentProps(moment.title),
                        sx: { fontWeight: 600 },
                      },
                      secondary: {
                        variant: "body2",
                        ...getContentProps(moment.reason),
                        sx: { mt: 0.5 },
                      },
                    }}
                  />
                </ListItem>
              ))}
            </List>
            {!result.recommendedMoments.length ? (
              <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
                No specific moments identified.
              </Typography>
            ) : null}
          </Box>
        </Box>
      ) : null}

      {tab === "notes" ? (
        <Box
          role="tabpanel"
          id="notes-panel"
          aria-labelledby="notes-tab"
          sx={{ maxWidth: 800 }}
        >
          <Typography variant="h2" sx={{ mb: 2 }}>
            Key notes
          </Typography>
          {!result.notes.length ? (
            <Typography color="text.secondary">
              No additional source notes for this answer.
            </Typography>
          ) : null}
          {result.notes.map((note) => (
            <Box
              component="article"
              key={`${note.category}-${note.title}`}
              sx={{ py: 2 }}
            >
              <Typography
                variant="caption"
                color="primary"
                {...getContentProps(note.category)}
              >
                {note.category}
              </Typography>
              <Typography
                variant="h3"
                {...getContentProps(note.title)}
                sx={{ mt: 0.5 }}
              >
                {note.title}
              </Typography>
              <Typography
                color="text.secondary"
                {...getContentProps(note.detail)}
                sx={{ mt: 1, mb: 2 }}
              >
                {note.detail}
              </Typography>
              <Divider />
            </Box>
          ))}
        </Box>
      ) : null}

      {tab === "transcript" ? (
        <Box
          role="tabpanel"
          id="transcript-panel"
          aria-labelledby="transcript-tab"
        >
          <Stack
            direction={{ xs: "column", sm: "row" }}
            spacing={2}
            sx={{ mb: 3, justifyContent: "space-between" }}
          >
            <Box>
              <Typography variant="h2">Transcript</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                {search
                  ? `${matchingTranscript.length} of ${result.transcript.length} segments match.`
                  : `${result.transcript.length} timestamped segments.`}
              </Typography>
            </Box>
            <TextField
              label="Search transcript"
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search words or phrases"
              sx={{ width: { xs: "100%", sm: 320 } }}
              slotProps={{
                htmlInput: { dir: "auto" },
                input: {
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchOutlined fontSize="small" />
                    </InputAdornment>
                  ),
                },
              }}
            />
          </Stack>
          <Box sx={{ maxWidth: 900 }}>
            {matchingTranscript.map((segment) => {
              const recommendedMoment = result.recommendedMoments.find(
                (moment) =>
                  moment.startSeconds >= segment.startSeconds &&
                  moment.startSeconds < segment.endSeconds,
              );
              return (
                <Box
                  key={`${segment.startSeconds}-${segment.endSeconds}`}
                  dir={getContentProps(segment.text).dir}
                  sx={{
                    display: "grid",
                    gridTemplateColumns: "64px minmax(0, 1fr)",
                    gap: 2,
                    p: 2,
                    mb: 1,
                    borderRadius: 2,
                    bgcolor: recommendedMoment
                      ? "action.selected"
                      : "transparent",
                    borderBottom: 1,
                    borderColor: "divider",
                  }}
                >
                  <Typography
                    component="time"
                    dir="ltr"
                    lang="en"
                    variant="caption"
                    color={recommendedMoment ? "primary" : "text.secondary"}
                    sx={{
                      fontFamily: "var(--font-mono)",
                      pt: 0.5,
                      whiteSpace: "nowrap",
                      unicodeBidi: "isolate",
                    }}
                  >
                    {formatTimestamp(segment.startSeconds)}
                  </Typography>
                  <Box sx={{ minWidth: 0 }}>
                    {recommendedMoment ? (
                      <Typography
                        variant="body2"
                        color="primary"
                        sx={{ mb: 1, fontWeight: 600 }}
                        {...getContentProps(recommendedMoment.title)}
                      >
                        {recommendedMoment.title}
                      </Typography>
                    ) : null}
                    <Typography
                      color="text.secondary"
                      {...getContentProps(segment.text)}
                    >
                      {highlightTranscriptText(segment.text, search)}
                    </Typography>
                  </Box>
                </Box>
              );
            })}
            {!matchingTranscript.length ? (
              <Typography color="text.secondary" sx={{ py: 4 }}>
                No transcript lines match that search.
              </Typography>
            ) : null}
          </Box>
        </Box>
      ) : null}
    </Container>
  );
}
