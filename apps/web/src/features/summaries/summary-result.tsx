import { ArrowLeft, Check, Clipboard, Download, FileVideo, Search, TriangleAlert } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";

import type { SummaryLanguage, SummaryResult as SummaryResultData } from "@l5sly/contracts";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatTimestamp } from "@/features/summaries/format";

interface SummaryResultProps {
  result: SummaryResultData;
  sourceName: string;
  requestedLanguage: SummaryLanguage;
}

const verdictLabels: Record<SummaryResultData["verdict"]["recommendation"], string> = {
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

function formatLanguageLabel(sourceLanguage: string, requestedLanguage: SummaryLanguage): string {
  const normalizedLanguage = sourceLanguage.trim().toLocaleLowerCase();
  if (!normalizedLanguage || normalizedLanguage === "unknown") {
    return requestedLanguage;
  }

  const languageCode = normalizedLanguage.split("-")[0] ?? normalizedLanguage;
  return languageLabels[normalizedLanguage] ?? languageLabels[languageCode] ?? sourceLanguage;
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
      <mark key={`${matchStart}-${matchEnd}`} className="rounded-sm bg-accent px-0.5 text-accent-foreground">
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

export function SummaryResult({ result, sourceName, requestedLanguage }: SummaryResultProps) {
  const [search, setSearch] = useState("");
  const matchingTranscript = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    if (!query) {
      return result.transcript;
    }
    return result.transcript.filter((segment) => segment.text.toLocaleLowerCase().includes(query));
  }, [result.transcript, search]);
  const recommendedMomentsByStart = useMemo(
    () => new Map(result.recommendedMoments.map((moment) => [moment.startSeconds, moment])),
    [result.recommendedMoments],
  );

  async function copySummary(): Promise<void> {
    const text = [
      result.title,
      "",
      result.overview,
      "",
      "DIRECT ANSWER",
      result.viewerAnswer,
      "",
      ...result.sections.flatMap((section) => [section.title, section.body, ""]),
    ].join("\n");
    await navigator.clipboard.writeText(text);
    toast.success("Summary copied to your clipboard.");
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
      ...(result.caveats.length ? ["CAVEATS", ...result.caveats.map((caveat) => `- ${caveat}`), ""] : []),
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
    <div className="mx-auto max-w-7xl px-4 pb-20 pt-6 sm:px-6 lg:px-8">
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <Button variant="ghost" className="w-fit px-0 hover:bg-transparent" asChild><Link to="/library"><ArrowLeft />Back to library</Link></Button>
        <div className="grid grid-cols-2 gap-2 sm:flex">
          <Button variant="outline" onClick={() => void copySummary()}><Clipboard />Copy summary</Button>
          <Button onClick={downloadNotes}><Download />Download notes</Button>
        </div>
      </div>

      <header className="border-b pb-9">
        <p className="flex max-w-full items-center gap-2 truncate text-sm text-muted-foreground">
          <FileVideo className="size-4 shrink-0" />
          <span className="truncate font-mono text-xs">{sourceName}</span>
        </p>
        <div className="mt-5 grid items-end gap-8 lg:grid-cols-[minmax(0,1.45fr)_minmax(19rem,0.55fr)] lg:gap-14">
          <div>
            <h1 className="max-w-4xl text-4xl font-bold leading-[1.04] tracking-[-0.05em] sm:text-5xl lg:text-[3.5rem]">
            {result.title}
            </h1>
            <div className="mt-5 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <span className="font-mono text-xs tabular-nums">{formatTimestamp(result.durationSeconds)}</span>
              <span aria-hidden="true">/</span>
              <span>{formatLanguageLabel(result.sourceLanguage, requestedLanguage)}</span>
            </div>
          </div>

          <Card className="gap-4 border-border/80 bg-accent/10 py-5">
            <CardHeader className="gap-3">
              <Badge className="w-fit bg-accent text-accent-foreground hover:bg-accent">
                <Check />{verdictLabels[result.verdict.recommendation]}
              </Badge>
              <CardTitle className="text-2xl leading-tight tracking-[-0.03em]">{result.verdict.headline}</CardTitle>
            </CardHeader>
            <CardContent className="text-sm leading-6 text-muted-foreground">{result.verdict.reason}</CardContent>
          </Card>
        </div>
      </header>

      <Tabs defaultValue="summary" className="mt-6">
        <TabsList variant="line" className="w-full justify-start overflow-x-auto overflow-y-hidden">
          <TabsTrigger value="summary">Summary</TabsTrigger>
          <TabsTrigger value="notes">Notes</TabsTrigger>
          <TabsTrigger value="transcript">Transcript</TabsTrigger>
        </TabsList>

        <TabsContent value="summary" className="mt-8">
          <div className="grid items-start gap-12 lg:grid-cols-[minmax(0,1fr)_21rem] lg:gap-16">
            <article className="max-w-3xl">
              <section className="rounded-2xl border border-primary/20 bg-primary/5 px-6 py-7 sm:px-8 sm:py-8">
                <h2 className="text-sm font-bold text-primary">Direct answer</h2>
                <p className="mt-4 text-2xl font-semibold leading-[1.25] tracking-[-0.025em] sm:text-[1.8rem]">{result.viewerAnswer}</p>
              </section>

              <section className="mt-11">
                <h2 className="text-xl font-bold tracking-[-0.03em]">Summary</h2>
                <p className="mt-3 max-w-[65ch] text-base leading-7 text-muted-foreground sm:text-lg sm:leading-8">{result.overview}</p>
              </section>
              {result.sections.map((section) => (
                <section key={section.title} className="mt-9 border-t pt-8">
                  <h2 className="text-2xl font-bold tracking-[-0.035em]">{section.title}</h2>
                  <p className="mt-3 max-w-[65ch] text-base leading-7 text-muted-foreground sm:text-lg sm:leading-8">{section.body}</p>
                </section>
              ))}

              {result.caveats.length ? (
                <Alert className="mt-10">
                  <TriangleAlert />
                  <AlertTitle>What to keep in mind</AlertTitle>
                  <AlertDescription>
                    <ul className="grid list-disc gap-2 pl-4">
                      {result.caveats.map((caveat) => <li key={caveat}>{caveat}</li>)}
                    </ul>
                  </AlertDescription>
                </Alert>
              ) : null}
            </article>

            <aside className="lg:sticky lg:top-24" aria-labelledby="moments-title">
              <h2 id="moments-title" className="text-xl font-bold tracking-[-0.03em]">Recommended moments</h2>
              {result.recommendedMoments.length ? (
                <Card className="mt-4 gap-0 overflow-hidden py-0">
                  {result.recommendedMoments.map((moment, index) => (
                    <div key={`${moment.startSeconds}-${moment.title}`} className={`grid grid-cols-[3.25rem_1fr] gap-3 p-4 ${index < result.recommendedMoments.length - 1 ? "border-b" : ""}`}>
                      <time className="pt-0.5 font-mono text-xs font-medium tabular-nums text-ring">{formatTimestamp(moment.startSeconds)}</time>
                      <div>
                        <p className="font-semibold">{moment.title}</p>
                        <p className="mt-1 text-sm leading-6 text-muted-foreground">{moment.reason}</p>
                      </div>
                    </div>
                  ))}
                </Card>
              ) : <p className="mt-4 rounded-xl border border-dashed p-5 text-sm text-muted-foreground">No specific moments were identified.</p>}
            </aside>
          </div>
        </TabsContent>

        <TabsContent value="notes" className="mt-8">
          <section className="max-w-5xl">
            <h2 className="text-2xl font-bold tracking-[-0.035em]">Key notes</h2>
            <p className="mt-2 text-muted-foreground">The claims, context, and takeaways worth keeping.</p>
            <div className="mt-7 grid border-t sm:grid-cols-2 sm:gap-x-10">
              {result.notes.map((note) => (
                <article key={`${note.category}-${note.title}`} className="border-b py-6">
                  <p className="text-sm font-bold text-ring">{note.category}</p>
                  <h3 className="mt-2 text-xl font-bold tracking-[-0.025em]">{note.title}</h3>
                  <p className="mt-2 leading-7 text-muted-foreground">{note.detail}</p>
                </article>
              ))}
            </div>
          </section>
        </TabsContent>

        <TabsContent value="transcript" className="mt-8">
          <div className="mb-8 grid items-end gap-5 sm:grid-cols-[1fr_minmax(16rem,22rem)]">
            <div>
              <h2 className="text-2xl font-bold tracking-[-0.035em]">Transcript</h2>
              <p className="mt-2 text-muted-foreground">
                {search ? `${matchingTranscript.length} of ${result.transcript.length} segments match.` : `${result.transcript.length} timestamped segments.`}
              </p>
            </div>
            <label className="grid gap-2 text-sm font-medium" htmlFor="transcript-search">
              Search transcript
              <span className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="transcript-search"
                  className="pl-9"
                  type="search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search words or phrases"
                />
              </span>
            </label>
          </div>

          <div className="max-w-4xl">
            {matchingTranscript.map((segment) => {
              const recommendedMoment = recommendedMomentsByStart.get(segment.startSeconds);

              return (
                <div
                  key={`${segment.startSeconds}-${segment.endSeconds}`}
                  className={`grid grid-cols-[4rem_1fr] gap-4 border-b py-5 sm:grid-cols-[5rem_1fr] sm:gap-6 ${recommendedMoment ? "my-2 rounded-xl bg-accent/10 px-4 py-4" : ""}`}
                >
                  <time className={`font-mono text-xs tabular-nums ${recommendedMoment ? "font-semibold text-primary" : "text-muted-foreground"}`}>
                    {formatTimestamp(segment.startSeconds)}
                  </time>
                  <div>
                    {recommendedMoment ? <p className="mb-2 text-sm font-semibold text-primary">{recommendedMoment.title}</p> : null}
                    <p className="leading-7 text-muted-foreground">{highlightTranscriptText(segment.text, search)}</p>
                  </div>
                </div>
              );
            })}
            {!matchingTranscript.length ? (
              <p className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">No transcript lines match that search.</p>
            ) : null}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
