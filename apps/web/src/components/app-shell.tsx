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
import { useState, type ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";

import { LogoMark } from "@/components/logo";
import { useTheme, type Theme } from "@/components/theme-provider";

const themeIcons: Record<Theme, ReactNode> = {
  light: <LightModeOutlined />,
  dark: <DarkModeOutlined />,
  system: <SettingsBrightnessOutlined />,
};

export function AppShell({ children }: { children: ReactNode }) {
  const { theme, setTheme } = useTheme();
  const location = useLocation();
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  let activePage = "/library";
  if (location.pathname === "/") activePage = "/";
  if (location.pathname === "/profile") activePage = "/profile";

  function selectTheme(nextTheme: Theme) {
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
              <Tab value="/" label="Summarize" component={Link} to="/" />
              <Tab
                value="/library"
                label="Library"
                component={Link}
                to="/library"
              />
              <Tab
                value="/profile"
                label="Profile"
                component={Link}
                to="/profile"
              />
            </Tabs>
            <IconButton
              aria-label="Choose color theme"
              aria-controls={menuAnchor ? "theme-menu" : undefined}
              aria-haspopup="menu"
              aria-expanded={Boolean(menuAnchor)}
              onClick={(event) => setMenuAnchor(event.currentTarget)}
              sx={{ ml: "auto" }}
            >
              {themeIcons[theme]}
            </IconButton>
            <Menu
              id="theme-menu"
              anchorEl={menuAnchor}
              open={Boolean(menuAnchor)}
              onClose={() => setMenuAnchor(null)}
            >
              <MenuItem
                selected={theme === "light"}
                onClick={() => selectTheme("light")}
              >
                <ListItemIcon>
                  <LightModeOutlined fontSize="small" />
                </ListItemIcon>
                Light
              </MenuItem>
              <MenuItem
                selected={theme === "dark"}
                onClick={() => selectTheme("dark")}
              >
                <ListItemIcon>
                  <DarkModeOutlined fontSize="small" />
                </ListItemIcon>
                Dark
              </MenuItem>
              <MenuItem
                selected={theme === "system"}
                onClick={() => selectTheme("system")}
              >
                <ListItemIcon>
                  <SettingsBrightnessOutlined fontSize="small" />
                </ListItemIcon>
                System
              </MenuItem>
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
