import { useQuery } from "@tanstack/react-query";
import { ArrowRight, FileVideo, Link2, Plus } from "lucide-react";
import { Link } from "react-router-dom";

import type { SummaryListItem } from "@l5sly/contracts";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCreatedAt, formatTimestamp } from "@/features/summaries/format";
import { getErrorMessage, listSummaries } from "@/lib/api-client";

const statusLabels: Record<SummaryListItem["status"], string> = {
  queued: "Queued",
  processing: "Processing",
  completed: "Ready",
  failed: "Failed",
  cancelled: "Cancelled",
};

export function LibraryPage() {
  const summariesQuery = useQuery({
    queryKey: ["summaries"],
    queryFn: listSummaries,
    refetchInterval: (query) => query.state.data?.some((item) => item.status === "queued" || item.status === "processing") ? 1_500 : false,
  });

  return (
    <section className="mx-auto max-w-6xl px-4 pb-20 pt-9 sm:px-6 sm:pt-12 lg:px-8 lg:pt-14">
      <header className="mb-9 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-4xl font-bold tracking-[-0.045em] sm:text-5xl">Your summaries</h1>
          <p className="mt-3 text-muted-foreground">Finished briefs and active jobs appear here.</p>
        </div>
        <Button className="w-full sm:w-auto" asChild><Link to="/"><Plus />New summary</Link></Button>
      </header>

      {summariesQuery.isPending ? <LibrarySkeleton /> : null}

      {summariesQuery.isError ? (
        <Alert variant="destructive">
          <AlertTitle>Could not load your library</AlertTitle>
          <AlertDescription>{getErrorMessage(summariesQuery.error)}</AlertDescription>
        </Alert>
      ) : null}

      {summariesQuery.data?.length === 0 ? <EmptyLibrary /> : null}

      {summariesQuery.data?.length ? (
        <Card className="gap-0 overflow-hidden py-0">
          {summariesQuery.data.map((summary, index) => (
            <SummaryRow
              key={summary.id}
              summary={summary}
              hasDivider={index < summariesQuery.data.length - 1}
            />
          ))}
        </Card>
      ) : null}
    </section>
  );
}

const statusStyles: Record<SummaryListItem["status"], string> = {
  queued: "bg-muted text-muted-foreground",
  processing: "bg-accent text-accent-foreground",
  completed: "bg-secondary text-secondary-foreground",
  failed: "bg-destructive text-white",
  cancelled: "border-border bg-transparent text-muted-foreground",
};

function SummaryRow({ summary, hasDivider }: { summary: SummaryListItem; hasDivider: boolean }) {
  const actionLabel = getActionLabel(summary.status);
  const SourceIcon = summary.source.type === "upload" ? FileVideo : Link2;

  return (
    <Link
      to={`/summaries/${summary.id}`}
      className={`group grid gap-5 px-5 py-5 transition-colors hover:bg-muted/40 focus-visible:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:px-6 sm:py-6 ${hasDivider ? "border-b" : ""}`}
    >
      <div className="min-w-0">
        <div className="flex items-center justify-between gap-4 sm:justify-start">
          <Badge className={statusStyles[summary.status]}>{statusLabels[summary.status]}</Badge>
          <time className="font-mono text-xs text-muted-foreground">{formatCreatedAt(summary.createdAt)}</time>
        </div>
        <h2 className="mt-4 text-xl font-bold leading-snug tracking-[-0.025em] sm:text-2xl">
          {summary.title ?? summary.source.name}
        </h2>
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground">
          <span className="inline-flex items-center gap-1.5"><SourceIcon className="size-4" />{summary.source.type === "upload" ? "Uploaded media" : "Video link"}</span>
          {summary.durationSeconds !== null ? <span className="font-mono text-xs tabular-nums">{formatTimestamp(summary.durationSeconds)}</span> : null}
          <span>{summary.stage}</span>
        </div>
      </div>
      <span className="inline-flex items-center gap-2 self-end text-sm font-semibold sm:self-center">
        {actionLabel}<ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
      </span>
    </Link>
  );
}

function getActionLabel(status: SummaryListItem["status"]): string {
  if (status === "completed") {
    return "Read brief";
  }

  if (status === "queued" || status === "processing") {
    return "View progress";
  }

  return "View details";
}

function EmptyLibrary() {
  return (
    <Card className="border-dashed">
      <CardContent className="grid min-h-96 place-items-center p-8 text-center">
        <div>
          <span className="mx-auto mb-6 grid size-14 place-items-center rounded-xl bg-muted"><FileVideo className="size-6" /></span>
          <h2 className="text-2xl font-bold tracking-[-0.035em]">No saved summaries yet</h2>
          <p className="mx-auto mt-3 max-w-md leading-7 text-muted-foreground">
            Process a video to start a searchable library of ideas, notes, and watch verdicts.
          </p>
          <Button className="mt-6" variant="outline" asChild><Link to="/">Summarize a video</Link></Button>
        </div>
      </CardContent>
    </Card>
  );
}

function LibrarySkeleton() {
  return (
    <Card className="gap-0 overflow-hidden py-0">
      {[0, 1, 2].map((item) => (
        <CardContent key={item} className={`space-y-4 p-6 ${item < 2 ? "border-b" : ""}`}>
          <div className="flex justify-between"><Skeleton className="h-5 w-20" /><Skeleton className="h-4 w-28" /></div>
          <Skeleton className="h-7 w-3/4" />
          <Skeleton className="h-5 w-2/5" />
        </CardContent>
      ))}
    </Card>
  );
}
