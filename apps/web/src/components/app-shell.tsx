import {
  AppBar,
  Box,
  Container,
  IconButton,
  Menu,
  MenuItem,
  ListItemIcon,
  Tab,
  Tabs,
  Toolbar,
  Typography,
} from "@mui/material";
import DarkModeOutlined from "@mui/icons-material/DarkModeOutlined";
import LightModeOutlined from "@mui/icons-material/LightModeOutlined";
import SettingsBrightnessOutlined from "@mui/icons-material/SettingsBrightnessOutlined";
import type { SvgIconComponent } from "@mui/icons-material";
import { useState, type ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";

import { LogoMark } from "@/components/logo";
import { useTheme, type Theme } from "@/components/theme-provider";

const NAV_PAGES = [
  { path: "/", label: "Summarize" },
  { path: "/library", label: "Library" },
  { path: "/profile", label: "Profile" },
] as const;

type NavPath = (typeof NAV_PAGES)[number]["path"];

const THEME_OPTIONS: Record<Theme, { label: string; Icon: SvgIconComponent }> =
  {
    light: { label: "Light", Icon: LightModeOutlined },
    dark: { label: "Dark", Icon: DarkModeOutlined },
    system: { label: "System", Icon: SettingsBrightnessOutlined },
  };

const THEME_MENU_ORDER: Theme[] = ["light", "dark", "system"];

// Summary pages are reached from the library, so they highlight Library.
function findActivePage(pathname: string): NavPath {
  if (pathname === "/" || pathname === "/profile") {
    return pathname;
  }
  return "/library";
}

export function AppShell({ children }: { children: ReactNode }) {
  const { theme, setTheme } = useTheme();
  const location = useLocation();
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  const isMenuOpen = menuAnchor !== null;
  const activePage = findActivePage(location.pathname);
  const CurrentThemeIcon = THEME_OPTIONS[theme].Icon;

  function selectTheme(nextTheme: Theme): void {
    setTheme(nextTheme);
    setMenuAnchor(null);
  }

  return (
    <Box sx={{ minHeight: "100dvh" }}>
      <a
        href="#main-content"
        className="fixed left-3 top-3 z-50 -translate-y-20 rounded-lg bg-primary px-4 py-2 text-primary-foreground focus:translate-y-0"
      >
        Skip to content
      </a>
      <AppBar
        position="sticky"
        sx={{ borderBottom: 1, borderColor: "divider" }}
      >
        <Container maxWidth="lg">
          <Toolbar
            disableGutters
            sx={{
              gap: 3,
              flexWrap: { xs: "wrap", sm: "nowrap" },
              py: { xs: 1, sm: 0 },
            }}
          >
            <Box
              component={Link}
              to="/"
              aria-label="L5asly home"
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 0.75,
                textDecoration: "none",
                color: "text.primary",
              }}
            >
              <Box
                component="span"
                sx={{ display: "flex", color: "primary.main" }}
              >
                <LogoMark size={32} />
              </Box>
              <Typography
                component="span"
                sx={{
                  fontSize: "1.25rem",
                  fontWeight: 700,
                  letterSpacing: "-0.02em",
                  lineHeight: 1,
                }}
              >
                L5asly
              </Typography>
            </Box>
            {/* Each tab is a real link, so middle-click and "open in new tab" work. */}
            <Tabs
              value={activePage}
              aria-label="Primary navigation"
              sx={{
                order: { xs: 3, sm: 0 },
                width: { xs: "100%", sm: "auto" },
                flexGrow: { xs: 0, sm: 1 },
              }}
            >
              {NAV_PAGES.map((page) => (
                <Tab
                  key={page.path}
                  value={page.path}
                  label={page.label}
                  component={Link}
                  to={page.path}
                />
              ))}
            </Tabs>
            <IconButton
              aria-label="Choose color theme"
              aria-controls={isMenuOpen ? "theme-menu" : undefined}
              aria-haspopup="menu"
              aria-expanded={isMenuOpen}
              onClick={(event) => setMenuAnchor(event.currentTarget)}
              sx={{ ml: "auto" }}
            >
              <CurrentThemeIcon />
            </IconButton>
            <Menu
              id="theme-menu"
              anchorEl={menuAnchor}
              open={isMenuOpen}
              onClose={() => setMenuAnchor(null)}
            >
              {THEME_MENU_ORDER.map((menuTheme) => {
                const { label, Icon } = THEME_OPTIONS[menuTheme];
                return (
                  <MenuItem
                    key={menuTheme}
                    selected={theme === menuTheme}
                    onClick={() => selectTheme(menuTheme)}
                  >
                    <ListItemIcon>
                      <Icon fontSize="small" />
                    </ListItemIcon>
                    {label}
                  </MenuItem>
                );
              })}
            </Menu>
          </Toolbar>
        </Container>
      </AppBar>
      <Box component="main" id="main-content">
        {children}
      </Box>
    </Box>
  );
}
