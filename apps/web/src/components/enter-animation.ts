import type { HTMLMotionProps } from "motion/react";

// The app's one entrance: content fades in and rises a few pixels when a page,
// a job state or a result tab first renders. Kept short so it never delays
// reading. ThemeProvider's MotionConfig skips it for reduced-motion users.
export const enterAnimation = {
  initial: { opacity: 0, y: 6 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.22, ease: [0.2, 0, 0, 1] },
} satisfies HTMLMotionProps<"div">;
