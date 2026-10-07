# Frontend

The web app (`apps/web`) is a React 19 single-page app built with Vite. It uses Material UI for components, Tailwind CSS for a few text utilities, TanStack Query for server state, React Hook Form with Zod for forms, and React Router for navigation.

## Structure

| Path | Contents |
| --- | --- |
| `src/main.tsx` | The provider stack: theme, React Query client, notifications, viewer profile, router |
| `src/app.tsx` | Routes. Every page is lazy-loaded behind a skeleton fallback |
| `src/pages/` | One component per route |
| `src/features/summaries/` | Summary UI: the create form, processing state, result, failure state, verdict insights, formatting helpers |
| `src/features/profile/` | Viewer profile context, stored in `localStorage` |
| `src/components/` | App shell, Material theme, theme provider, notifications, logo |
| `src/lib/api-client.ts` | Every request to the API |

Import with the `@/` alias, which points to `src/`.

## Routes

| Path | Page | Purpose |
| --- | --- | --- |
| `/` | `CreateSummaryPage` | Submit a URL or upload, or run a quick check on a YouTube link |
| `/library` | `LibraryPage` | Recent summaries |
| `/summaries/:summaryId` | `SummaryPage` | Progress, result, or failure with retry and delete |
| `/profile` | `ProfilePage` | Edit the saved viewer profile |

Any other path redirects to `/`.

## Talking to the API

All calls go through `src/lib/api-client.ts`. Components never call `fetch` directly.

- Every response is parsed with the matching schema from `@l5asly/contracts`. A response that doesn't match throws `ApiClientError` with code `INVALID_RESPONSE`, rather than letting a wrong shape reach the UI.
- Error responses are parsed into `ApiClientError` with the server's `code`, `message`, `requestId`, and `details`. The client adds `NETWORK_ERROR` (API unreachable) and `HTTP_ERROR` (an error response without the error envelope).
- `getErrorMessage(error)` gives a message that is safe to show to the user.
- Upload endpoints send `FormData`. The viewer profile is sent as a JSON string, because multipart fields are text.

To add an endpoint call, add a function here that takes and returns contract types, and validates the response with a contract schema.

## Server state

TanStack Query owns everything that comes from the API. The defaults in `main.tsx` are one retry and a 10-second stale time.

- Query keys: `["summaries"]` for the library and `["summary", id]` for one job.
- Progress is polled. `SummaryPage` refetches every 900 ms, and `LibraryPage` every 1.5 s, but only while a job is `queued` or `processing`. Polling stops on its own when nothing is running.
- Mutations (cancel, retry, delete) update the cache with `setQueryData` or invalidate it, then show a notification through `useNotification()`.

## Client-side state

- **Viewer profile:** `ViewerProfileProvider` stores the profile in `localStorage` under `l5asly-viewer-profile` and validates it with `viewerProfileSchema` when reading. Every new job sends a snapshot of the profile. Editing the profile later doesn't change existing jobs.
- **Theme:** `ThemeProvider` stores light or dark mode under `l5asly-theme`. Material UI and Tailwind share the same tokens.

## Forms

`summary-form.tsx` and `profile-page.tsx` use React Hook Form with `zodResolver`. Their schemas are built from contract pieces such as `summaryLanguageSchema` and `MAX_EXPECTATION_LENGTH`, so the browser applies the same limits as the server. Keep the server as the authority: client-side validation exists for quick feedback only.

## Tests

The web tests run in jsdom with Testing Library (`src/test/setup.ts` adds the `jest-dom` matchers and a `matchMedia` stub). They sit next to the code as `*.test.ts(x)`. See [Testing](testing.md).

## Build and serve

`pnpm --filter @l5asly/web build` runs `tsc -b` and `vite build` into `apps/web/dist`. In production, the `web` Docker image (`apps/web/Dockerfile`) serves that folder with nginx, falls back to `index.html` for client routes, and proxies `/api` to the `api` container (`apps/web/nginx.conf`). During development, Vite on port 5173 proxies `/api` to port 4000.
