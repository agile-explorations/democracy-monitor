import type { Config } from 'tailwindcss';

function withAlpha(varName: string) {
  return `rgb(var(${varName}) / <alpha-value>)`;
}

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
          bg: withAlpha('--color-bg'),
          card: withAlpha('--color-card'),
          'text-primary': withAlpha('--color-text-primary'),
          'text-secondary': withAlpha('--color-text-secondary'),
          border: withAlpha('--color-border'),
          accent: withAlpha('--color-accent'),
          muted: withAlpha('--color-muted'),
          'baseline-fill': withAlpha('--color-baseline-fill'),
          'baseline-border': withAlpha('--color-baseline-border'),
        },
        status: {
          stable: withAlpha('--color-status-stable'),
          warning: withAlpha('--color-status-warning'),
          drift: withAlpha('--color-status-drift'),
          capture: withAlpha('--color-status-capture'),
        },
        convergence: {
          stable: withAlpha('--color-convergence-stable'),
          elevated: withAlpha('--color-convergence-elevated'),
          divergent: withAlpha('--color-convergence-divergent'),
          confirmed: withAlpha('--color-convergence-confirmed'),
        },
        source: {
          healthy: withAlpha('--color-source-healthy'),
          degraded: withAlpha('--color-source-degraded'),
          unavailable: withAlpha('--color-source-unavailable'),
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
