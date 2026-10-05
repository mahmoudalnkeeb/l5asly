import type { ReactNode } from "react";
import { Laptop, Moon, Sun } from "lucide-react";
import { NavLink } from "react-router-dom";

import { useTheme } from "@/components/theme-provider";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface AppShellProps {
  children: ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const { setTheme } = useTheme();

  return (
    <div className="min-h-[100dvh]">
      <a
        href="#main-content"
        className="fixed left-3 top-3 z-50 -translate-y-20 rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground focus:translate-y-0"
      >
        Skip to content
      </a>
      <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur-xl supports-[backdrop-filter]:bg-background/82">
        <div className="mx-auto grid h-16 max-w-7xl grid-cols-[1fr_auto_1fr] items-center px-4 sm:px-6 lg:px-8">
          <NavLink to="/" aria-label="L5asly home" className="flex w-fit items-center">
            <span className="flex items-center gap-2.5 text-foreground" aria-hidden="true">
              <svg className="size-8 shrink-0" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
                <defs>
                  <linearGradient id="l5asly-mark" x1="8" y1="6" x2="52" y2="58" gradientUnits="userSpaceOnUse">
                    <stop stopColor="#5BEA8A" />
                    <stop offset="1" stopColor="#00A878" />
                  </linearGradient>
                </defs>
                <path
                  d="M8 16.5C8 8.77 16.45 3.98 23.1 8.02L53.83 26.7C60.06 30.49 60.06 39.51 53.83 43.3L23.1 61.98C16.45 66.02 8 61.23 8 53.5V16.5Z"
                  fill="url(#l5asly-mark)"
                />
                <path d="M19 27.5H42M19 35H36M19 42.5H30" stroke="white" strokeWidth="4.5" strokeLinecap="round" />
              </svg>
              <span className="font-sans text-xl font-bold tracking-[-0.04em]">L5asly</span>
            </span>
          </NavLink>

          <nav className="hidden h-full items-stretch gap-4 sm:flex" aria-label="Primary navigation">
            <NavLink
              to="/"
              className={({ isActive }) => `relative flex items-center px-3 text-sm font-semibold transition-colors after:absolute after:inset-x-3 after:bottom-0 after:h-0.5 after:origin-center after:scale-x-0 after:bg-primary after:transition-transform hover:text-foreground ${isActive ? "text-foreground after:scale-x-100" : "text-muted-foreground"}`}
            >
              Summarize
            </NavLink>
            <NavLink
              to="/library"
              className={({ isActive }) => `relative flex items-center px-3 text-sm font-semibold transition-colors after:absolute after:inset-x-3 after:bottom-0 after:h-0.5 after:origin-center after:scale-x-0 after:bg-primary after:transition-transform hover:text-foreground ${isActive ? "text-foreground after:scale-x-100" : "text-muted-foreground"}`}
            >
              Library
            </NavLink>
          </nav>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon" className="justify-self-end" aria-label="Choose color theme">
                <Sun className="size-4 dark:hidden" />
                <Moon className="hidden size-4 dark:block" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setTheme("light")}><Sun />Light</DropdownMenuItem>
              <DropdownMenuItem onClick={() => setTheme("dark")}><Moon />Dark</DropdownMenuItem>
              <DropdownMenuItem onClick={() => setTheme("system")}><Laptop />System</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <nav className="grid h-12 grid-cols-2 border-t px-3 sm:hidden" aria-label="Primary navigation">
          <NavLink
            to="/"
            className={({ isActive }) => `relative my-1.5 flex items-center justify-center text-sm font-semibold transition-colors after:absolute after:inset-x-1/4 after:bottom-0 after:h-0.5 after:origin-center after:scale-x-0 after:bg-primary after:transition-transform ${isActive ? "text-foreground after:scale-x-100" : "text-muted-foreground"}`}
          >
            Summarize
          </NavLink>
          <NavLink
            to="/library"
            className={({ isActive }) => `relative my-1.5 flex items-center justify-center text-sm font-semibold transition-colors after:absolute after:inset-x-1/4 after:bottom-0 after:h-0.5 after:origin-center after:scale-x-0 after:bg-primary after:transition-transform ${isActive ? "text-foreground after:scale-x-100" : "text-muted-foreground"}`}
          >
            Library
          </NavLink>
        </nav>
      </header>

      <main id="main-content">{children}</main>
    </div>
  );
}
