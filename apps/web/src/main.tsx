import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter } from "react-router-dom";

import { App } from "@/app";
import { ThemeProvider } from "@/components/theme-provider";
import { NotificationProvider } from "@/components/notifications";
import { ViewerProfileProvider } from "@/features/profile/viewer-profile";
import "@/index.css";

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("The root application element is missing.");
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 10_000,
    },
  },
});

createRoot(rootElement).render(
  <StrictMode>
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <NotificationProvider>
          <ViewerProfileProvider>
            <BrowserRouter>
              <App />
            </BrowserRouter>
          </ViewerProfileProvider>
        </NotificationProvider>
      </QueryClientProvider>
    </ThemeProvider>
  </StrictMode>,
);
