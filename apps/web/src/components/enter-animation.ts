import type { HTMLMotionProps } from "motion/react";

export const enterAnimation = {
  initial: { opacity: 0, y: 6 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.22, ease: [0.2, 0, 0, 1] },
} satisfies HTMLMotionProps<"div">;
