import type { Config } from 'tailwindcss'

// Theme tokens follow shadcn/ui CSS-variable convention.
// All component colors use semantic names; no hex literals in components.
const config: Config = {
  darkMode: ['class'],
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './features/**/*.{ts,tsx}',
  ],
  theme: {
    container: {
      center: true,
      padding: '2rem',
      screens: { '2xl': '1400px' },
    },
    extend: {
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'system-ui', 'sans-serif'],
      },
      // Typography scale — single source of truth (DESIGN_INVARIANTS.md #12).
      // Components reference these utilities; no ad-hoc `text-[NNpx]`.
      fontSize: {
        display: ['var(--font-size-display)', { lineHeight: 'var(--line-height-tight)', letterSpacing: '-0.02em' }],
        h1: ['var(--font-size-h1)', { lineHeight: 'var(--line-height-tight)', letterSpacing: '-0.02em' }],
        h2: ['var(--font-size-h2)', { lineHeight: 'var(--line-height-snug)', letterSpacing: '-0.01em' }],
        h3: ['var(--font-size-h3)', { lineHeight: 'var(--line-height-snug)' }],
        h4: ['var(--font-size-h4)', { lineHeight: 'var(--line-height-snug)' }],
        body: ['var(--font-size-body)', { lineHeight: 'var(--line-height-normal)' }],
        small: ['var(--font-size-small)', { lineHeight: 'var(--line-height-normal)' }],
        micro: ['var(--font-size-micro)', { lineHeight: 'var(--line-height-normal)' }],
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
}

export default config
