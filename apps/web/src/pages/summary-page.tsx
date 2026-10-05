import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, Navigate, useParams } from "react-router-dom";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ProcessingState, ProcessingStateSkeleton } from "@/features/summaries/processing-state";
import { SummaryResult } from "@/features/summaries/summary-result";
import { cancelSummary, getErrorMessage, getSummary } from "@/lib/api-client";

export function SummaryPage() {
  const { summaryId } = useParams();
  const queryClient = useQueryClient();
  const summaryQuery = useQuery({
    queryKey: ["summary", summaryId],
    queryFn: () => getSummary(summaryId ?? ""),
    enabled: Boolean(summaryId),
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === "queued" || status === "processing" ? 900 : false;
    },
  });
  const cancelMutation = useMutation({
    mutationFn: () => cancelSummary(summaryId ?? ""),
    onSuccess: (job) => {
      queryClient.setQueryData(["summary", summaryId], job);
      toast.success("Processing cancelled.");
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  if (!summaryId) {
    return <Navigate to="/" replace />;
  }

  if (summaryQuery.isPending) {
    return <ProcessingStateSkeleton />;
  }

  if (summaryQuery.isError) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 sm:px-6 sm:py-24">
        <h1 className="text-3xl font-bold tracking-[-0.04em]">This summary could not be loaded</h1>
        <p className="mt-3 text-muted-foreground">The job may still be available. Try loading it again before starting over.</p>
        <Alert className="mt-6" variant="destructive">
          <AlertTitle>Could not load this summary</AlertTitle>
          <AlertDescription>{getErrorMessage(summaryQuery.error)}</AlertDescription>
        </Alert>
        <div className="mt-6 flex flex-wrap gap-3">
          <Button onClick={() => void summaryQuery.refetch()}>Try again</Button>
          <Button variant="outline" asChild><Link to="/library">Back to library</Link></Button>
        </div>
      </div>
    );
  }

  const job = summaryQuery.data;
  if (job.status === "queued" || job.status === "processing") {
    return <ProcessingState job={job} isCancelling={cancelMutation.isPending} onCancel={() => cancelMutation.mutate()} />;
  }

  if (job.status === "failed" || job.status === "cancelled") {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 sm:px-6 sm:py-24">
        <p className="font-mono text-xs text-muted-foreground">{job.source.name}</p>
        <h1 className="mt-3 text-3xl font-bold tracking-[-0.04em]">
          {job.status === "failed" ? "This video could not be processed" : "This job was cancelled"}
        </h1>
        <Alert className="mt-6" variant={job.status === "failed" ? "destructive" : "default"}>
          <AlertTitle>{job.status === "failed" ? "Processing failed" : "Processing cancelled"}</AlertTitle>
          <AlertDescription>{job.error ?? "You can return to the form and try again."}</AlertDescription>
        </Alert>
        <div className="mt-6 flex flex-wrap gap-3">
          <Button asChild><Link to="/">Start a new summary</Link></Button>
          <Button variant="outline" asChild><Link to="/library">Back to library</Link></Button>
        </div>
      </div>
    );
  }

  if (!job.result) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 sm:px-6 sm:py-24">
        <Alert variant="destructive"><AlertTitle>Result unavailable</AlertTitle><AlertDescription>The server completed this job without a result.</AlertDescription></Alert>
        <Button className="mt-6" variant="outline" asChild><Link to="/library">Back to library</Link></Button>
      </div>
    );
  }

  return <SummaryResult result={job.result} sourceName={job.source.name} requestedLanguage={job.options.language} />;
}
