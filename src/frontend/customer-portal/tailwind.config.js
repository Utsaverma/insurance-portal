/* SHARED DESIGN TOKENS — must stay byte-identical between customer-portal and internal-portal.
   Verify with:  diff src/frontend/{customer,internal}-portal/tailwind.config.js  */

/** Colors are stored as space-separated RGB channels in src/index.css so that
 *  Tailwind's <alpha-value> keeps working (e.g. bg-surface/85 + backdrop-blur). */
const t = (v) => `rgb(var(${v}) / <alpha-value>)`

const STATUS_KEYS = [
  'submitted',
  'assigned',
  'under-survey',
  'surveyed',
  'under-adjudication',
  'approved',
  'rejected',
  'paid',
]

// -> { submitted: { soft, fg, line }, assigned: {…}, … }
const statusColors = Object.fromEntries(
  STATUS_KEYS.map((k) => [
    k,
    { soft: t(`--st-${k}-soft`), fg: t(`--st-${k}-fg`), line: t(`--st-${k}-line`) },
  ])
)

const tone = (name) => ({
  soft: t(`--${name}-soft`),
  fg: t(`--${name}-fg`),
  line: t(`--${name}-line`),
  solid: t(`--${name}-solid`),
  'solid-hover': t(`--${name}-solid-hover`),
})

/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        app: t('--app'),
        brand: {
          50: t('--brand-50'),
          100: t('--brand-100'),
          200: t('--brand-200'),
          300: t('--brand-300'),
          400: t('--brand-400'),
          500: t('--brand-500'),
          600: t('--brand-600'),
          700: t('--brand-700'),
          800: t('--brand-800'),
          900: t('--brand-900'),
        },
        surface: {
          DEFAULT: t('--surface'),
          muted: t('--surface-muted'),
          hover: t('--surface-hover'),
        },
        // Named `line` (not `border`) so it never collides with the `border`
        // width utility inside a class string.
        line: { DEFAULT: t('--line'), strong: t('--line-strong') },
        fg: { DEFAULT: t('--fg'), muted: t('--fg-muted'), subtle: t('--fg-subtle') },
        link: { DEFAULT: t('--link'), hover: t('--link-hover') },
        focus: t('--focus'),
        success: tone('success'),
        warning: tone('warning'),
        danger: tone('danger'),
        info: tone('info'),
        status: statusColors,
      },
      borderRadius: { card: '0.75rem', control: '0.5rem' },
      boxShadow: {
        card: 'var(--shadow-card)',
        'card-hover': 'var(--shadow-card-hover)',
        header: 'var(--shadow-header)',
      },
      maxWidth: {
        'content-sm': '42rem',
        'content-md': '56rem',
        'content-lg': '64rem',
        'content-xl': '72rem',
      },
      fontFamily: {
        sans: [
          'ui-sans-serif',
          'system-ui',
          '-apple-system',
          'Segoe UI',
          'Roboto',
          'Helvetica Neue',
          'Arial',
          'sans-serif',
        ],
      },
      keyframes: {
        'fade-in': { from: { opacity: '0' }, to: { opacity: '1' } },
        'slide-up': {
          from: { opacity: '0', transform: 'translateY(4px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        'fade-in': 'fade-in .18s ease-out',
        'slide-up': 'slide-up .2s ease-out',
      },
    },
  },
  plugins: [],
}
