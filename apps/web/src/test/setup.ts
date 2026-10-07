import "@testing-library/jest-dom/vitest";
import { configure } from "@testing-library/react";
import { MotionGlobalConfig } from "motion/react";

// The default one-second wait is too tight on a busy machine for flows that
// load a lazy page, or wait for the link debounce and two lookups in a row.
configure({ asyncUtilTimeout: 3_000 });

// jsdom has no animation frames, so entrances would stay at opacity 0.
MotionGlobalConfig.skipAnimations = true;

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => undefined,
    removeListener: () => undefined,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    dispatchEvent: () => false,
  }),
});
