/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: '#050508',
        surface: '#10101e',
        surface2: '#16162a',
        border: 'rgba(255,255,255,0.07)',
        text: '#f0f0ff',
        muted: '#6b6b9a',
        piano: '#00f5a0',
        pianoAlt: '#00b4d8',
        guitar: '#7b2fff',
        pink: '#ff2d6b',
        gold: '#ffb700',
      },
      fontFamily: {
        // Display uses Aeonik Pro (licensed, self-host); falls back to Inter
        // then system sans so the layout stays consistent if the font is missing.
        display: ['"Aeonik Pro"', 'Inter', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
        body: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
        // `font-mono` is kept as a class for tabular/label contexts but now
        // resolves to Inter with tabular-nums so we only ship two families.
        mono: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
        // Arial stack is reserved for specific button contexts per design spec.
        button: ['Arial', 'Helvetica', 'sans-serif'],
      },
      boxShadow: {
        glowPiano: '0 0 24px rgba(0,245,160,0.45), 0 0 60px rgba(0,180,216,0.25)',
        glowGuitar: '0 0 24px rgba(123,47,255,0.5), 0 0 60px rgba(255,45,107,0.25)',
      },
      keyframes: {
        shimmer: {
          '0%': { backgroundPosition: '0% 50%' },
          '100%': { backgroundPosition: '200% 50%' },
        },
        pulseRing: {
          '0%': { transform: 'scale(1)', opacity: '0.6' },
          '100%': { transform: 'scale(1.6)', opacity: '0' },
        },
        floaty: {
          '0%,100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-8px)' },
        },
      },
      animation: {
        shimmer: 'shimmer 4s linear infinite',
        pulseRing: 'pulseRing 1.8s ease-out infinite',
        floaty: 'floaty 4s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};
