import type { Config } from 'tailwindcss';

// Palette + type + shape are the @nalet/design-system tokens (single source of
// truth). Dark terminal aesthetic: canonical hexes, JetBrains Mono headings /
// Inter body, and SQUARE corners (every radius resolves to 0).
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        chino: {
          // canvas
          bg: '#0B0F19', // canvas.bg — primary background
          'bg-2': '#0D1117', // canvas.bg-2 — terminal blocks / recesses
          surface: '#11161F', // canvas.surface — cards, panels
          'surface-2': '#161B26', // canvas.surface-2 — hover on surface
          border: '#1F2633', // canvas.border — hairline dividers
          'border-2': '#2A3142', // canvas.border-2 — heavier dividers
          // foreground
          fg: '#E6E6E6', // foreground.fg — primary text/titles
          text: '#C9D1D9', // foreground.fg-2 — body text, the glyph
          muted: '#AEB8C2', // foreground.fg-muted — labels/meta/captions
          dim: '#6E7787', // foreground.fg-dim — helpers/hints/off
          // brand
          accent: '#58A6FF', // brand.cloud-blue — chevron, links, CTA
          cyan: '#00A4DC', // brand.cloud-cyan — cursor, active stroke
          // signal
          green: '#2EA043',
          amber: '#F2B233',
          red: '#F85149',
        },
      },
      fontFamily: {
        // Body/UI = Inter; headings/display/code = JetBrains Mono (terminal).
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'monospace'],
      },
      // Square/terminal: collapse the whole radius scale to 0 so every
      // rounded-* utility (incl. rounded-full) renders sharp corners.
      borderRadius: {
        none: '0',
        sm: '0',
        DEFAULT: '0',
        md: '0',
        lg: '0',
        xl: '0',
        '2xl': '0',
        '3xl': '0',
        full: '0',
      },
    },
  },
  plugins: [],
} satisfies Config;
