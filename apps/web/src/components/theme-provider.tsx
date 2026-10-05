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
import { createMaterialTheme } from "@/components/material-theme";

const THEMES = ["dark", "light", "system"] as const;

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

function resolveTheme(theme: Theme, prefersDark: boolean): "dark" | "light" {
  if (theme === "system") {
    return prefersDark ? "dark" : "light";
  }

  return theme;
}

export function ThemeProvider({
  children,
  defaultTheme = "system",
  storageKey = "l5asly-theme",
}: ThemeProviderProps) {
  const [theme, setThemeState] = useState<Theme>(() => {
    const storedTheme =
      window.localStorage.getItem(storageKey) ??
      window.localStorage.getItem("l5sly-theme");
    return isTheme(storedTheme) ? storedTheme : defaultTheme;
  });
  const prefersDark = useMediaQuery("(prefers-color-scheme: dark)");
  const materialTheme = useMemo(
    () => createMaterialTheme(resolveTheme(theme, prefersDark)),
    [theme, prefersDark],
  );

  useEffect(() => {
    const root = window.document.documentElement;
    const systemTheme = window.matchMedia("(prefers-color-scheme: dark)");

    const applyTheme = () => {
      const resolvedTheme = resolveTheme(theme, systemTheme.matches);
      root.classList.remove("light", "dark");
      root.classList.add(resolvedTheme);
      root.style.colorScheme = resolvedTheme;
    };

    applyTheme();

    if (theme !== "system") {
      return;
    }

    systemTheme.addEventListener("change", applyTheme);
    return () => systemTheme.removeEventListener("change", applyTheme);
  }, [theme]);

  const value = useMemo<ThemeProviderValue>(
    () => ({
      theme,
      setTheme: (nextTheme) => {
        window.localStorage.setItem(storageKey, nextTheme);
        setThemeState(nextTheme);
      },
    }),
    [storageKey, theme],
  );

  return (
    <ThemeProviderContext.Provider value={value}>
      <MaterialThemeProvider theme={materialTheme}>
        <CssBaseline />
        {children}
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
