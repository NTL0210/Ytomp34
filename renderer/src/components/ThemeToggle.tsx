/**
 * ThemeToggle Component
 * Displays light/dark theme toggle button with Sun/Moon icons
 * Applies theme to document root immediately
 * Validates: Requirements 13.1, 13.2, 13.3, 13.4, 13.5, 18.1, 18.2, 18.4
 */

import React, { useEffect } from 'react';
import { Sun, Moon } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { useIPC } from '../hooks/useIPC';

export const ThemeToggle: React.FC = () => {
  const { settings } = useAppStore();
  const { updateSettings } = useIPC();

  // Apply theme to document root on mount and when theme changes
  useEffect(() => {
    const root = document.documentElement;
    if (settings.theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [settings.theme]);

  const toggleTheme = () => {
    const newTheme = settings.theme === 'light' ? 'dark' : 'light';
    updateSettings({ theme: newTheme });
  };

  return (
    <button
      onClick={toggleTheme}
      className="p-2 rounded-lg bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
      aria-label="Toggle theme"
    >
      {settings.theme === 'light' ? (
        <Moon className="w-5 h-5 text-gray-800 dark:text-gray-200" />
      ) : (
        <Sun className="w-5 h-5 text-gray-800 dark:text-gray-200" />
      )}
    </button>
  );
};
