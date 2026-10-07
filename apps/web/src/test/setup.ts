import "@testing-library/jest-dom/vitest";
import { MotionGlobalConfig } from "motion/react";

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
