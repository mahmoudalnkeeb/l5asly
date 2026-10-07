import { Box, Button, Container, Stack, Tab, Tabs, Typography } from "@mui/material";
import ArrowBack from "@mui/icons-material/ArrowBack";
import ContentCopyOutlined from "@mui/icons-material/ContentCopyOutlined";
import DownloadOutlined from "@mui/icons-material/DownloadOutlined";
import {
  useDeferredValue,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { Link, useSearchParams } from "react-router-dom";

import type {
  SummaryLanguage,
  SummaryResult as SummaryResultData,
} from "@l5sly/contracts";
import { useNotification } from "@/components/notifications";
import {
  formatLanguageLabel,
  formatTimestamp,
  getContentProps,
} from "./format";
import { NotesPanel } from "./notes-panel";
import {
  buildNotesFileName,
  buildNotesText,
  buildSummaryText,
} from "./summary-export";
import { SummaryPanel } from "./summary-panel";
import {
  buildTranscriptRows,
  filterTranscriptRows,
  getSegmentElementId,
  TranscriptPanel,
} from "./transcript-panel";
import { VerdictPanel } from "./verdict-insights";

// Icon-only on phones so the actions share one row with the back link.
const compactActionSx = {
  minWidth: { xs: 44, sm: 64 },
  px: { xs: 1.25, sm: 3 },
  "& .MuiButton-startIcon": {
    ml: { xs: 0, sm: "-4px" },
    mr: { xs: 0, sm: 1 },
  },
} as const;

const RESULT_TABS = [
  { value: "summary", label: "Summary" },
  { value: "notes", label: "Notes" },
  { value: "transcript", label: "Transcript" },
] as const;

type ResultTab = (typeof RESULT_TABS)[number]["value"];

function isResultTab(value: unknown): value is ResultTab {
  return RESULT_TABS.some((tab) => tab.value === value);
}

// Each click creates a new request, so jumping to the same segment twice still
// scrolls the second time.
interface JumpRequest {
  id: number;
  segmentIndex: number;
}

interface SummaryResultProps {
  result: SummaryResultData;
  sourceName: string;
  requestedLanguage: SummaryLanguage;
}

export function SummaryResult({
  result,
  sourceName,
  requestedLanguage,
}: SummaryResultProps) {
  const notify = useNotification();
  const idPrefix = useId();
  // The open tab lives in the URL so a transcript view can be linked to.
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get("tab");
  const tab: ResultTab = isResultTab(tabParam) ? tabParam : "summary";
  const [search, setSearch] = useState("");
  const appliedSearch = useDeferredValue(search);
  const [jumpRequest, setJumpRequest] = useState<JumpRequest | null>(null);
  const handledJumpId = useRef<number | null>(null);

  const transcriptRows = useMemo(() => buildTranscriptRows(result), [result]);
  const visibleRows = useMemo(
    () => filterTranscriptRows(transcriptRows, appliedSearch),
    [transcriptRows, appliedSearch],
  );

  // Runs again as the tab and the cleared search render, and scrolls once the
  // target segment is on the page.
  useEffect(() => {
    if (tab !== "transcript" || jumpRequest === null) return;
    if (handledJumpId.current === jumpRequest.id) return;
    const element = document.getElementById(
      getSegmentElementId(jumpRequest.segmentIndex),
    );
    if (!element) return;

    handledJumpId.current = jumpRequest.id;
    const prefersReducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    element.scrollIntoView({
      behavior: prefersReducedMotion ? "auto" : "smooth",
      block: "center",
    });
    element.focus({ preventScroll: true });
  }, [tab, jumpRequest, visibleRows]);

  function selectTab(nextTab: ResultTab): void {
    setSearchParams(
      (previous) => {
        const next = new URLSearchParams(previous);
        if (nextTab === "summary") {
          next.delete("tab");
        } else {
          next.set("tab", nextTab);
        }
        return next;
      },
      { replace: true },
    );
  }

  function jumpToTranscript(seconds: number): void {
    // Segments are in time order; use the last one that starts at or before
    // the chosen time.
    let segmentIndex = 0;
    for (const [index, segment] of result.transcript.entries()) {
      if (segment.startSeconds > seconds) {
        break;
      }
      segmentIndex = index;
    }
    setSearch("");
    setJumpRequest((previous) => ({
      id: (previous?.id ?? 0) + 1,
      segmentIndex,
    }));
    selectTab("transcript");
  }

  async function copySummary(): Promise<void> {
    try {
      await navigator.clipboard.writeText(buildSummaryText(result));
      notify({ severity: "success", message: "Summary copied." });
    } catch (error) {
      console.warn("Could not copy the summary to the clipboard", error);
      notify({
        severity: "error",
        message:
          "Could not copy the summary. Check your browser's clipboard permission.",
      });
    }
  }

  function downloadNotes(): void {
    const blob = new Blob([buildNotesText(result)], {
      type: "text/plain;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = buildNotesFileName(result.title);
    link.click();
    // Safari and Firefox read the URL after click() returns; revoking it
    // straight away can cancel the download.
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function getTabId(value: ResultTab): string {
    return `${idPrefix}-${value}-tab`;
  }

  function getPanelId(value: ResultTab): string {
    return `${idPrefix}-${value}-panel`;
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
        direction="row"
        spacing={1}
        sx={{ mb: 3, justifyContent: "space-between", alignItems: "center" }}
      >
        <Button component={Link} to="/library" startIcon={<ArrowBack />}>
          Library
        </Button>
        <Stack direction="row" spacing={1}>
          {/* Labels collapse to icons on phones; aria-label keeps the name stable. */}
          <Button
            variant="outlined"
            aria-label="Copy summary"
            startIcon={<ContentCopyOutlined />}
            onClick={() => void copySummary()}
            sx={compactActionSx}
          >
            <Box
              component="span"
              sx={{ display: { xs: "none", sm: "inline" } }}
            >
              Copy summary
            </Box>
          </Button>
          <Button
            variant="contained"
            aria-label="Download notes"
            startIcon={<DownloadOutlined />}
            onClick={downloadNotes}
            sx={compactActionSx}
          >
            <Box
              component="span"
              sx={{ display: { xs: "none", sm: "inline" } }}
            >
              Download notes
            </Box>
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

      <VerdictPanel
        verdict={result.verdict}
        timeline={result.timeline}
        durationSeconds={result.durationSeconds}
        onSelectTime={jumpToTranscript}
      />

      <Tabs
        value={tab}
        onChange={(_, value: unknown) => {
          if (isResultTab(value)) selectTab(value);
        }}
        aria-label="Summary views"
        variant="scrollable"
        scrollButtons="auto"
        sx={{ borderBottom: 1, borderColor: "divider", mb: 3 }}
      >
        {RESULT_TABS.map((option) => (
          <Tab
            key={option.value}
            id={getTabId(option.value)}
            // Only the open panel is rendered, so only its tab points at it.
            aria-controls={
              option.value === tab ? getPanelId(option.value) : undefined
            }
            value={option.value}
            label={option.label}
          />
        ))}
      </Tabs>

      <Box
        role="tabpanel"
        id={getPanelId(tab)}
        aria-labelledby={getTabId(tab)}
      >
        {tab === "summary" ? (
          <SummaryPanel result={result} onSelectTime={jumpToTranscript} />
        ) : null}
        {tab === "notes" ? <NotesPanel notes={result.notes} /> : null}
        {tab === "transcript" ? (
          <TranscriptPanel
            rows={visibleRows}
            totalSegments={result.transcript.length}
            search={search}
            appliedSearch={appliedSearch}
            onSearchChange={setSearch}
            jumpedSegment={jumpRequest?.segmentIndex ?? null}
          />
        ) : null}
      </Box>
    </Container>
  );
}
