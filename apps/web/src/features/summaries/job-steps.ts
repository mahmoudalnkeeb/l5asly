import type { JobStep } from "@l5asly/contracts";

interface JobStepDefinition {
  step: JobStep;
  label: string;
  // Job progress is below this value while the step is running.
  endsAtProgress: number;
}

export const JOB_STEPS: JobStepDefinition[] = [
  { step: "media", label: "Prepare media", endsAtProgress: 34 },
  { step: "transcription", label: "Transcribe", endsAtProgress: 68 },
  { step: "summary", label: "Summarize", endsAtProgress: 100 },
];

// Older jobs have no recorded failed step, so infer it from where progress stopped.
export function findStepForProgress(progress: number): JobStep {
  const running = JOB_STEPS.find((step) => progress < step.endsAtProgress);
  return running?.step ?? "summary";
}
