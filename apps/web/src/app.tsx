import { lazy, Suspense } from "react";
import { m } from "motion/react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";

import { AppShell } from "@/components/app-shell";
import { enterAnimation } from "@/components/enter-animation";
import { ErrorBoundary } from "@/components/error-boundary";
import { Container, Skeleton } from "@mui/material";

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

const ProfilePage = lazy(async () => {
  const page = await import("@/pages/profile-page");
  return { default: page.ProfilePage };
});

export function App() {
  const location = useLocation();

  return (
    <AppShell>
      <ErrorBoundary resetKey={location.pathname}>
        {/* Wraps Suspense so the page fades in once, together with its skeleton. */}
        <m.div key={location.pathname} {...enterAnimation}>
          <Suspense
            fallback={
              <Container maxWidth="lg" sx={{ py: 5 }}>
                <Skeleton height={56} width="75%" />
                <Skeleton height={28} width="50%" />
                <Skeleton variant="rounded" height={360} sx={{ mt: 4 }} />
              </Container>
            }
          >
            <Routes>
              <Route path="/" element={<CreateSummaryPage />} />
              <Route path="/library" element={<LibraryPage />} />
              <Route path="/profile" element={<ProfilePage />} />
              <Route path="/summaries/:summaryId" element={<SummaryPage />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
        </m.div>
      </ErrorBoundary>
    </AppShell>
  );
}
