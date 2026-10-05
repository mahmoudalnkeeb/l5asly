import type { ViewerProfile } from "@l5sly/contracts";

export function formatViewerContext(input: {
  viewerProfile?: ViewerProfile;
  expectation?: string;
}): string {
  const profile = input.viewerProfile;
  return JSON.stringify({
    viewerProfile: profile
      ? {
          background: profile.background,
          alreadyKnows: profile.knowledge,
          learningGoals: profile.goals,
          explanationPreferences: profile.preferences,
        }
      : null,
    questionForThisVideo: input.expectation?.trim() || null,
  });
}
