import type { Config } from 'tailwindcss';

// We ship a prebuilt ui/, so our own Tailwind/PostCSS pipeline compiles these
// extensions (the host serves ui/ as-is). Mirror the OWOX design-system tokens so
// the standard `.dm-card` utility classes — bg-muted/50, rounded-md,
// border-gray-200 — resolve on our wrapper <div> exactly as AGENTS.md requires.
export default {
  content: ['./app/**/*.{ts,tsx,html}'],
  theme: {
    extend: {
      colors: {
        // oklch values from upstream packages/ui globals.css; <alpha-value> lets
        // opacity modifiers like `bg-muted/50` work.
        background: 'oklch(1 0 0 / <alpha-value>)',
        foreground: 'oklch(0.3346 0.0123 279.25 / <alpha-value>)',
        muted: 'oklch(0.97 0 0 / <alpha-value>)',
        'muted-foreground': 'oklch(0.5148 0.0128 274.72 / <alpha-value>)',
        border: 'oklch(0.922 0 0 / <alpha-value>)',
      },
      // Design-system radius scale from --radius: 0.625rem, so rounded-md ≈ 8px
      // matches the host's `.dm-card` instead of Tailwind's default 6px.
      borderRadius: {
        sm: 'calc(0.625rem - 4px)',
        md: 'calc(0.625rem - 2px)',
        lg: '0.625rem',
        xl: 'calc(0.625rem + 4px)',
      },
    },
  },
  plugins: [],
} satisfies Config;
