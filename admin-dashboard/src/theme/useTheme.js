import { useEffect, useState } from 'react';

const STORAGE_KEY = 'dashboardTheme';

function initialTheme() {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === 'light' || stored === 'dark') return stored;
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

// Applies the theme before first paint so pages don't flash light.
document.documentElement.dataset.theme = initialTheme();

export default function useTheme() {
  const [theme, setTheme] = useState(() => document.documentElement.dataset.theme);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
  }, [theme]);

  const toggle = () =>
    setTheme((current) => {
      const next = current === 'dark' ? 'light' : 'dark';
      localStorage.setItem(STORAGE_KEY, next);
      return next;
    });

  return { theme, toggle };
}
