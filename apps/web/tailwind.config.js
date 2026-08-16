/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}', '../../packages/design-system/src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"PingFang SC"', '"Microsoft YaHei"', '"Source Han Sans SC"', '"Noto Sans CJK SC"', '-apple-system', 'sans-serif'],
        mono: ['"SF Mono"', '"JetBrains Mono"', 'Consolas', 'monospace'],
      },
      keyframes: {
        fadeIn: { from: { opacity: '0' }, to: { opacity: '1' } },
        popIn: {
          from: { opacity: '0', transform: 'translate(-50%,-50%) scale(0.97)' },
          to: { opacity: '1', transform: 'translate(-50%,-50%) scale(1)' },
        },
      },
    },
  },
  plugins: [],
};
