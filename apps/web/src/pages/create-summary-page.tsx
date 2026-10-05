import { SummaryForm } from "@/features/summaries/summary-form";

export function CreateSummaryPage() {
  return (
    <section className="mx-auto max-w-7xl px-4 pb-20 pt-7 sm:px-6 sm:pt-9 lg:px-8 lg:pt-10">
      <div className="mb-6 max-w-3xl">
        <p className="mb-3 font-mono text-[0.6875rem] font-medium uppercase tracking-[0.12em] text-ring">Video intelligence, without the detour</p>
        <h1 className="max-w-3xl text-4xl font-bold leading-[1.04] tracking-[-0.05em] sm:text-5xl lg:text-[3.5rem]">
          Know what a video says before you watch it.
        </h1>
        <p className="mt-4 max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg">
          Upload a video or paste a link. Get the key points, transcript, timestamps, and a clear watch verdict.
        </p>
      </div>
      <SummaryForm />
    </section>
  );
}
