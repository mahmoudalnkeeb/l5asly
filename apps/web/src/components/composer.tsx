import { Box, Paper, Typography } from "@mui/material";
import type { FormEventHandler, ReactNode } from "react";

import { getLeadCardShadow } from "./material-theme";

// The sentence-style card that leads the create, library and profile pages:
// labelled lines separated by dashed rules, with an optional settings strip.

interface ComposerProps {
  children: ReactNode;
  // Set when the card is a form, so the submit button can live inside a line.
  onSubmit?: FormEventHandler<HTMLFormElement>;
  ariaLabel?: string;
  maxWidth?: number;
}

export function Composer({
  children,
  onSubmit,
  ariaLabel,
  maxWidth,
}: ComposerProps) {
  return (
    <Paper
      variant="outlined"
      component={onSubmit ? "form" : "div"}
      noValidate={onSubmit ? true : undefined}
      onSubmit={onSubmit}
      aria-label={ariaLabel}
      sx={(theme) => ({
        width: "100%",
        maxWidth,
        boxShadow: getLeadCardShadow(theme.palette.mode),
        transition: theme.transitions.create("border-color"),
        "&:focus-within": { borderColor: "primary.main" },
        "& .composer-line + .composer-line": {
          borderTop: "1px dashed",
          borderColor: "divider",
        },
      })}
    >
      {children}
    </Paper>
  );
}

interface ComposerLineProps {
  label: ReactNode;
  // Points the visible label at its input; omit when the label is decorative.
  htmlFor?: string;
  children: ReactNode;
  // A button at the end of the line. It takes its own full-width row on phones.
  action?: ReactNode;
  // Small text such as a character count. It stays beside the input.
  aside?: ReactNode;
  // Multiline inputs keep the label beside their first line.
  alignTop?: boolean;
  // Extra content under the input, such as a preview of what was entered.
  footer?: ReactNode;
}

export function ComposerLine({
  label,
  htmlFor,
  children,
  action,
  aside,
  alignTop = false,
  footer,
}: ComposerLineProps) {
  const trailing = action ?? aside;
  return (
    <Box
      className="composer-line"
      sx={{
        display: "grid",
        gridTemplateColumns: {
          xs: "minmax(0, 1fr) auto",
          sm: "auto minmax(0, 1fr) auto",
        },
        alignItems: alignTop ? "start" : "center",
        columnGap: 1.5,
        py: 1.25,
        pl: { xs: 1.75, sm: 2.25 },
        pr: 1.25,
      }}
    >
      <Typography
        component={htmlFor ? "label" : "span"}
        htmlFor={htmlFor}
        variant="body2"
        sx={{
          gridColumn: { xs: "1 / -1", sm: "auto" },
          minWidth: { sm: 112 },
          pt: { xs: 0.5, sm: alignTop ? 1.25 : 0 },
          color: "text.secondary",
          fontWeight: 600,
          whiteSpace: "nowrap",
        }}
      >
        {label}
      </Typography>
      <Box sx={{ minWidth: 0 }}>{children}</Box>
      {trailing ? (
        <Box
          sx={{
            pt: alignTop ? 1.25 : 0,
            "& > .MuiButton-root": { width: { xs: "100%", sm: "auto" } },
            gridColumn: { xs: action ? "1 / -1" : "auto", sm: "auto" },
          }}
        >
          {trailing}
        </Box>
      ) : null}
      {footer ? (
        <Box sx={{ gridColumn: { xs: "1 / -1", sm: "2 / -1" }, minWidth: 0 }}>
          {footer}
        </Box>
      ) : null}
    </Box>
  );
}

export function ComposerCounter({
  length,
  maxLength,
}: {
  length: number;
  maxLength: number;
}) {
  return (
    <Typography
      variant="caption"
      color="text.secondary"
      aria-hidden
      sx={{
        fontFamily: "var(--font-mono)",
        fontVariantNumeric: "tabular-nums",
        whiteSpace: "nowrap",
        pr: 1,
      }}
    >
      {length} / {maxLength}
    </Typography>
  );
}

export function ComposerStrip({ children }: { children: ReactNode }) {
  return (
    <Box
      sx={{
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        gap: 1,
        px: { xs: 1.75, sm: 2.25 },
        py: 1.25,
        borderTop: 1,
        borderColor: "divider",
        bgcolor: "var(--muted)",
        // Matches the large Paper radius so the strip fills the card's corners.
        borderEndStartRadius: "12px",
        borderEndEndRadius: "12px",
      }}
    >
      {children}
    </Box>
  );
}

// Styles shared by the borderless inputs that sit inside composer lines.
export const composerInputSx = {
  width: "100%",
  fontSize: "1rem",
  py: 0.75,
  "& input::placeholder, & textarea::placeholder": { opacity: 0.7 },
} as const;
