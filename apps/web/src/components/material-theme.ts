import { createTheme } from "@mui/material/styles";

// One radius scale for the whole app. `sx` borderRadius numbers multiply the
// 4px base, so 1 = small, 2 = medium, 3 = large.
const RADIUS = {
  small: 4, // inputs, chips, progress bars, timeline segments
  medium: 8, // buttons, list rows, alerts, interactive tiles
  large: 12, // cards and page surfaces
} as const;

export function createMaterialTheme(mode: "light" | "dark") {
  const isDark = mode === "dark";
  const theme = createTheme({
    palette: {
      mode,
      primary: {
        main: isDark ? "#9cd5aa" : "#286b43",
        contrastText: isDark ? "#103821" : "#ffffff",
      },
      background: {
        default: isDark ? "#121512" : "#f6f8f4",
        paper: isDark ? "#1b211c" : "#ffffff",
      },
      text: {
        primary: isDark ? "#e2e8df" : "#1a211b",
        secondary: isDark ? "#b8c4b9" : "#536056",
      },
      divider: isDark ? "#3c483e" : "#dce4db",
      error: { main: isDark ? "#ffb4ab" : "#ba1a1a" },
      success: { main: isDark ? "#9cd5aa" : "#286b43" },
    },
    shape: { borderRadius: RADIUS.small },
    typography: {
      fontFamily: '"IBM Plex Sans", "IBM Plex Sans Arabic", sans-serif',
      h1: {
        fontSize: "2.25rem",
        fontWeight: 500,
        lineHeight: 1.2,
        letterSpacing: "-0.02em",
      },
      h2: {
        fontSize: "1.5rem",
        fontWeight: 500,
        lineHeight: 1.3,
        letterSpacing: "-0.01em",
      },
      h3: { fontSize: "1.125rem", fontWeight: 600, lineHeight: 1.4 },
      body1: { fontSize: "1rem", lineHeight: 1.6 },
      body2: { fontSize: "0.875rem", lineHeight: 1.5 },
      button: { textTransform: "none", fontWeight: 600, letterSpacing: 0 },
    },
    components: {
      MuiTypography: {
        styleOverrides: {
          root: {
            '&[lang|="ar"]': {
              fontFamily: '"IBM Plex Sans Arabic", "IBM Plex Sans", sans-serif',
              letterSpacing: "normal",
            },
          },
        },
      },
      MuiAlert: {
        styleOverrides: {
          message: {
            flex: "1 1 0%",
            minWidth: 0,
            overflow: "visible",
            overflowWrap: "anywhere",
          },
          root: { borderRadius: RADIUS.medium },
        },
      },
      MuiButton: {
        defaultProps: { disableElevation: true },
        styleOverrides: {
          root: {
            borderRadius: RADIUS.medium,
            minHeight: 40,
            paddingInline: 20,
          },
          sizeLarge: { minHeight: 48 },
        },
      },
      MuiPaper: {
        defaultProps: { elevation: 0 },
        styleOverrides: {
          root: { backgroundImage: "none" },
          rounded: { borderRadius: RADIUS.large },
        },
      },
      MuiAppBar: { defaultProps: { elevation: 0, color: "inherit" } },
      MuiTextField: { defaultProps: { fullWidth: true, variant: "outlined" } },
      MuiOutlinedInput: {
        styleOverrides: { root: { borderRadius: RADIUS.small } },
      },
      MuiTab: {
        styleOverrides: {
          root: { textTransform: "none", minHeight: 56, fontWeight: 600 },
        },
      },
      MuiTabs: {
        styleOverrides: {
          indicator: { height: 3, borderRadius: "3px 3px 0 0" },
        },
      },
      MuiToggleButton: {
        styleOverrides: {
          root: {
            textTransform: "none",
            fontWeight: 500,
            minHeight: 44,
            paddingInline: 20,
          },
        },
      },
      MuiAccordion: {
        defaultProps: { disableGutters: true, elevation: 0 },
        styleOverrides: {
          root: {
            backgroundColor: "transparent",
            "&::before": { display: "none" },
          },
        },
      },
      MuiAccordionSummary: {
        styleOverrides: { root: { paddingInline: 0, minHeight: 48 } },
      },
      MuiAccordionDetails: {
        styleOverrides: { root: { padding: "8px 0 16px" } },
      },
      MuiChip: {
        styleOverrides: {
          root: { fontWeight: 500, borderRadius: RADIUS.small },
        },
      },
      MuiToggleButtonGroup: {
        styleOverrides: { root: { borderRadius: RADIUS.medium } },
      },
      MuiListItemButton: {
        styleOverrides: { root: { borderRadius: RADIUS.medium } },
      },
    },
  });
  const { palette } = theme;
  theme.components = {
    ...theme.components,
    MuiCssBaseline: {
      styleOverrides: {
        ":root": {
          "--background": palette.background.default,
          "--foreground": palette.text.primary,
          "--card": palette.background.paper,
          "--card-foreground": palette.text.primary,
          "--primary": palette.primary.main,
          "--primary-foreground": palette.primary.contrastText,
          "--muted": isDark ? "#252e27" : "#edf2eb",
          "--muted-foreground": palette.text.secondary,
          "--accent": isDark ? "#2d5137" : "#d6ebd9",
          "--accent-foreground": palette.text.primary,
          "--border": palette.divider,
          "--ring": palette.primary.main,
        },
        body: { minWidth: 0 },
        ":lang(ar)": {
          fontFamily: '"IBM Plex Sans Arabic", "IBM Plex Sans", sans-serif',
        },
        "@media (prefers-reduced-motion: reduce)": {
          "*, *::before, *::after": {
            animationDuration: "0.01ms !important",
            transitionDuration: "0.01ms !important",
          },
        },
      },
    },
  };
  return theme;
}
