/**
 * Theme control. The existing setting remains the source of truth.
 */

import React, { useEffect } from 'react';
import { Moon, Sun } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { useIPC } from '../hooks/useIPC';

export const ThemeToggle: React.FC = () => {
  const { settings } = useAppStore();
  const { updateSettings } = useIPC();
  const isDark = settings.theme === 'dark';

  useEffect(() => {
    const root = document.documentElement;
    if (isDark) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [isDark]);

  const toggleTheme = () => {
    void updateSettings({ theme: isDark ? 'light' : 'dark' });
  };

  const label = isDark ? 'Switch to light theme' : 'Switch to dark theme';

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className="icon-btn"
      aria-label={label}
      title={label}
    >
      {isDark ? (
        <Sun className="h-4 w-4" aria-hidden="true" />
      ) : (
        <Moon className="h-4 w-4" aria-hidden="true" />
      )}
    </button>
  );
};
