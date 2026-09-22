"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/Button";

const THEME_STORAGE_KEY = "parallex.theme";

type Theme = "dark" | "light";

function preferredTheme(): Theme {
  const savedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
  if (savedTheme === "dark" || savedTheme === "light") return savedTheme;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("light");
  const nextTheme = theme === "dark" ? "light" : "dark";

  useEffect(() => {
    const next = preferredTheme();
    applyTheme(next);
    setTheme(next);
  }, []);

  return (
    <Button
      aria-label={`Switch to ${nextTheme} theme`}
      aria-pressed={theme === "dark"}
      className="theme-toggle"
      onClick={() => {
        applyTheme(nextTheme);
        window.localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
        setTheme(nextTheme);
      }}
      size="small"
      title={`Switch to ${nextTheme} theme`}
      variant="quiet"
    >
      {theme === "dark" ? (
        <svg aria-hidden="true" viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2m0 16v2M4.93 4.93l1.41 1.41m11.32 11.32 1.41 1.41M2 12h2m16 0h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
        </svg>
      ) : (
        <svg aria-hidden="true" viewBox="0 0 24 24">
          <path d="M20.8 15.5A8.5 8.5 0 0 1 8.5 3.2 8.5 8.5 0 1 0 20.8 15.5Z" />
        </svg>
      )}
      <span className="sr-only">Switch to {nextTheme} theme</span>
    </Button>
  );
}
