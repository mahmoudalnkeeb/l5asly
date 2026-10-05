import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";

import { AppShell } from "@/components/app-shell";
import { Skeleton } from "@/components/ui/skeleton";

const CreateSummaryPage = lazy(async () => {
  const page = await import("@/pages/create-summary-page");
  return { default: page.CreateSummaryPage };
});

const LibraryPage = lazy(async () => {
  const page = await import("@/pages/library-page");
  return { default: page.LibraryPage };
});

const SummaryPage = lazy(async () => {
  const page = await import("@/pages/summary-page");
  return { default: page.SummaryPage };
});

export function App() {
  return (
    <AppShell>
      <Suspense
        fallback={
          <main className="mx-auto w-full max-w-6xl px-5 py-12 sm:px-8">
            <Skeleton className="h-10 w-full max-w-xl" />
            <Skeleton className="mt-4 h-5 w-full max-w-md" />
            <Skeleton className="mt-12 h-96 w-full rounded-2xl" />
          </main>
        }
      >
        <Routes>
          <Route path="/" element={<CreateSummaryPage />} />
          <Route path="/library" element={<LibraryPage />} />
          <Route path="/summaries/:summaryId" element={<SummaryPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </AppShell>
  );
}
