/** @type {import('tailwindcss').Config} */
const rgb = (variable) => `rgb(var(${variable}) / <alpha-value>)`;

module.exports = {
  content: [
    "./renderer/index.html",
    "./renderer/src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        canvas: rgb('--color-canvas'),
        surface: {
          DEFAULT: rgb('--color-surface'),
          2: rgb('--color-surface-2'),
        },
        border: {
          DEFAULT: rgb('--color-border'),
          strong: rgb('--color-border-strong'),
        },
        ink: rgb('--color-ink'),
        muted: rgb('--color-muted'),
        faint: rgb('--color-faint'),
        accent: {
          DEFAULT: rgb('--color-accent'),
          hover: rgb('--color-accent-hover'),
          contrast: rgb('--color-accent-contrast'),
          soft: rgb('--color-accent-soft'),
        },
        success: {
          DEFAULT: rgb('--color-success'),
          soft: rgb('--color-success-soft'),
          contrast: rgb('--color-success-contrast'),
        },
        warning: {
          DEFAULT: rgb('--color-warning'),
          soft: rgb('--color-warning-soft'),
          contrast: rgb('--color-warning-contrast'),
        },
        danger: {
          DEFAULT: rgb('--color-danger'),
          soft: rgb('--color-danger-soft'),
          contrast: rgb('--color-danger-contrast'),
        },
      },
      fontFamily: {
        sans: [
          '-apple-system',
          'BlinkMacSystemFont',
          '"Segoe UI"',
          'Roboto',
          'Oxygen',
          'Ubuntu',
          'Cantarell',
          '"Fira Sans"',
          '"Droid Sans"',
          '"Helvetica Neue"',
          'sans-serif',
        ],
        mono: [
          'ui-monospace',
          'SFMono-Regular',
          'Menlo',
          'Consolas',
          '"Liberation Mono"',
          'monospace',
        ],
      },
      borderRadius: {
        sm: '4px',
        DEFAULT: '6px',
        md: '7px',
        lg: '10px',
        xl: '12px',
      },
      boxShadow: {
        dialog: '0 24px 60px -24px rgb(0 0 0 / 0.42), 0 4px 14px rgb(0 0 0 / 0.10)',
      },
    },
  },
  plugins: [],
};
