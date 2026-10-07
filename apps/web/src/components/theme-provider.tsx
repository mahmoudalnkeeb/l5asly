import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { CssBaseline, useMediaQuery } from "@mui/material";
import { ThemeProvider as MaterialThemeProvider } from "@mui/material/styles";
import { domAnimation, LazyMotion, MotionConfig } from "motion/react";
import { createMaterialTheme } from "@/components/material-theme";

const THEMES = ["dark", "light", "system"] as const;
const LEGACY_STORAGE_KEY = "l5sly-theme";

export type Theme = (typeof THEMES)[number];

interface ThemeProviderProps {
  children: ReactNode;
  defaultTheme?: Theme;
  storageKey?: string;
}

interface ThemeProviderValue {
  theme: Theme;
  setTheme: (theme: Theme) => void;
}

const ThemeProviderContext = createContext<ThemeProviderValue | undefined>(
  undefined,
);

function isTheme(value: string | null): value is Theme {
  return value !== null && THEMES.some((theme) => theme === value);
}

// Storage can be blocked (private browsing, site settings). The theme still
// works for the session; it just is not remembered.
function readStoredTheme(storageKey: string): string | null {
  try {
    return (
      window.localStorage.getItem(storageKey) ??
      window.localStorage.getItem(LEGACY_STORAGE_KEY)
    );
  } catch (error) {
    console.warn("Could not read the saved theme", error);
    return null;
  }
}

function storeTheme(storageKey: string, theme: Theme): void {
  try {
    window.localStorage.setItem(storageKey, theme);
  } catch (error) {
    console.warn("Could not save the theme", error);
  }
}

export function ThemeProvider({
  children,
  defaultTheme = "system",
  storageKey = "l5asly-theme",
}: ThemeProviderProps) {
  const [theme, setThemeState] = useState<Theme>(() => {
    const storedTheme = readStoredTheme(storageKey);
    return isTheme(storedTheme) ? storedTheme : defaultTheme;
  });
  // noSsr reads the media query on the first render, so dark-mode users do not
  // see a light frame before the real preference is known.
  const prefersDark = useMediaQuery("(prefers-color-scheme: dark)", {
    noSsr: true,
  });
  let resolvedTheme: "dark" | "light" = prefersDark ? "dark" : "light";
  if (theme !== "system") {
    resolvedTheme = theme;
  }
  const materialTheme = useMemo(
    () => createMaterialTheme(resolvedTheme),
    [resolvedTheme],
  );

  useEffect(() => {
    const root = window.document.documentElement;
    root.classList.remove("light", "dark");
    root.classList.add(resolvedTheme);
    root.style.colorScheme = resolvedTheme;
  }, [resolvedTheme]);

  const value = useMemo<ThemeProviderValue>(
    () => ({
      theme,
      setTheme: (nextTheme) => {
        storeTheme(storageKey, nextTheme);
        setThemeState(nextTheme);
      },
    }),
    [storageKey, theme],
  );

  return (
    <ThemeProviderContext.Provider value={value}>
      <MaterialThemeProvider theme={materialTheme}>
        <CssBaseline />
        {/* domAnimation is enough for fades and keeps motion's bundle cost low. */}
        <LazyMotion features={domAnimation} strict>
          <MotionConfig reducedMotion="user">{children}</MotionConfig>
        </LazyMotion>
      </MaterialThemeProvider>
    </ThemeProviderContext.Provider>
  );
}

export function useTheme(): ThemeProviderValue {
  const context = useContext(ThemeProviderContext);

  if (!context) {
    throw new Error("useTheme must be used inside ThemeProvider.");
  }

  return context;
}
