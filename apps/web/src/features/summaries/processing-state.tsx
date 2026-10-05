import { Check, Clock3, FileText, LoaderCircle, Upload } from "lucide-react";
import { useState } from "react";

import type { SummaryJob } from "@l5sly/contracts";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";

interface ProcessingStateProps {
  job: SummaryJob;
  isCancelling: boolean;
  onCancel: () => void;
}

const processingSteps = [
  { label: "Prepare media", threshold: 34, icon: Upload },
  { label: "Create transcript", threshold: 68, icon: FileText },
  { label: "Write the brief", threshold: 100, icon: Clock3 },
];

export function ProcessingState({ job, isCancelling, onCancel }: ProcessingStateProps) {
  const [isConfirmingCancel, setIsConfirmingCancel] = useState(false);
  const activeStepLabel = processingSteps.find((step) => job.progress < step.threshold)?.label;

  return (
    <div className="grid min-h-[calc(100dvh-7rem)] place-items-center px-4 py-10 sm:min-h-[calc(100dvh-4rem)] sm:px-6 sm:py-14">
      <Card className="w-full max-w-2xl shadow-[0_24px_70px_-48px_oklch(0.25_0.04_140_/_0.32)]">
        <CardContent className="p-6 sm:p-10">
          <div className="flex items-start gap-4">
            <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-accent text-accent-foreground">
              <LoaderCircle className="size-5 animate-spin motion-reduce:animate-none" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-ring">Building your brief</p>
              <h1 className="mt-2 text-3xl font-bold leading-tight tracking-[-0.04em] sm:text-4xl">
                Finding the parts worth your time.
              </h1>
              <p className="mt-3 truncate font-mono text-xs text-muted-foreground">{job.source.name}</p>
            </div>
          </div>

          <div className="mt-9" aria-live="polite">
            <div className="flex items-end justify-between gap-4">
              <div>
                <p className="font-semibold">{job.stage}</p>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">
                  The brief takes the longest. You can leave this page and return from Library.
                </p>
              </div>
              <span className="shrink-0 font-mono text-xs font-medium tabular-nums">{job.progress}%</span>
            </div>
            <Progress className="mt-4 h-2.5" value={job.progress} aria-label="Summary progress" />
          </div>

          <ol className="mt-8 grid gap-3 sm:grid-cols-3">
            {processingSteps.map((step) => {
              const isComplete = job.progress >= step.threshold;
              const isActive = !isComplete && activeStepLabel === step.label;
              const StepIcon = isComplete ? Check : step.icon;

              return (
                <li
                  key={step.label}
                  className={`flex items-center gap-3 rounded-xl border px-3 py-3 text-sm font-semibold ${isActive ? "border-ring bg-accent/10" : "bg-muted/25 text-muted-foreground"}`}
                >
                  <span className={`grid size-8 shrink-0 place-items-center rounded-lg ${isComplete ? "bg-primary text-primary-foreground" : isActive ? "bg-accent text-accent-foreground" : "bg-muted"}`}>
                    <StepIcon className="size-4" />
                  </span>
                  {step.label}
                </li>
              );
            })}
          </ol>

          <div className="mt-8 border-t pt-6">
            {isConfirmingCancel ? (
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-muted-foreground">Cancel this job? The current result will be discarded.</p>
                <div className="flex gap-2">
                  <Button type="button" variant="outline" onClick={() => setIsConfirmingCancel(false)} disabled={isCancelling}>Keep processing</Button>
                  <Button type="button" variant="destructive" onClick={onCancel} disabled={isCancelling}>
                    {isCancelling ? "Cancelling" : "Yes, cancel"}
                  </Button>
                </div>
              </div>
            ) : (
              <Button type="button" variant="ghost" className="px-0 text-muted-foreground hover:bg-transparent hover:text-destructive" onClick={() => setIsConfirmingCancel(true)}>
                Cancel job
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export function ProcessingStateSkeleton() {
  return (
    <div className="grid min-h-[calc(100dvh-7rem)] place-items-center px-4 py-10 sm:min-h-[calc(100dvh-4rem)] sm:px-6 sm:py-14">
      <Card className="w-full max-w-2xl">
        <CardContent className="space-y-7 p-6 sm:p-10">
          <div className="flex gap-4">
            <Skeleton className="size-12 rounded-xl" />
            <div className="flex-1 space-y-3">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-10 w-4/5" />
              <Skeleton className="h-4 w-2/5" />
            </div>
          </div>
          <Skeleton className="h-5 w-3/5" />
          <Skeleton className="h-2.5 w-full" />
          <div className="grid gap-3 sm:grid-cols-3">
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
