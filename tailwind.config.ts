import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // Dark palette anchored on the chino brand
        chino: {
          bg: '#0d1117',
          surface: '#161b22',
          border: '#30363d',
          muted: '#8b949e',
          text: '#c9d1d9',
          accent: '#58a6ff',
        },
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'Fira Code', 'ui-monospace', 'monospace'],
      },
    },
  },
  plugins: [],
} satisfies Config;
