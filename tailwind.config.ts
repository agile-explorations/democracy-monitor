import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx}',
    './components/**/*.{js,ts,jsx,tsx}',
    './lib/**/*.{ts,tsx}',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        dm: {
          bg: 'var(--color-bg)',
          card: 'var(--color-card)',
          'text-primary': 'var(--color-text-primary)',
          'text-secondary': 'var(--color-text-secondary)',
          border: 'var(--color-border)',
          accent: 'var(--color-accent)',
          muted: 'var(--color-muted)',
          'baseline-fill': 'var(--color-baseline-fill)',
          'baseline-border': 'var(--color-baseline-border)',
        },
        status: {
          stable: 'var(--color-status-stable)',
          warning: 'var(--color-status-warning)',
          drift: 'var(--color-status-drift)',
          capture: 'var(--color-status-capture)',
        },
      },
      maxWidth: {
        content: '1200px',
      },
    },
  },
  plugins: [],
};
export default config;
