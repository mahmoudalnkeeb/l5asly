import { useId } from "react";

// Geometry on a 48-unit grid, shared with public/favicon.svg. The triangle's
// centroid sits on the vertical center line so the play shape looks balanced,
// and the round stroke softens its corners. The three bars are cut out with a
// mask, so they always show the background behind the mark.
const TRIANGLE_POINTS = "16,10 16,38 41,24";
const SUMMARY_BARS = "M19 18.5H27.5M19 24H32.5M19 29.5H24.5";

export function LogoMark({ size = 28 }: { size?: number }) {
  const maskId = useId();

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <mask
        id={maskId}
        maskUnits="userSpaceOnUse"
        x="0"
        y="0"
        width="48"
        height="48"
      >
        <rect width="48" height="48" fill="white" />
        <path
          d={SUMMARY_BARS}
          stroke="black"
          strokeWidth="3.5"
          strokeLinecap="round"
        />
      </mask>
      <polygon
        points={TRIANGLE_POINTS}
        fill="currentColor"
        stroke="currentColor"
        strokeWidth="6"
        strokeLinejoin="round"
        mask={`url(#${maskId})`}
      />
    </svg>
  );
}
