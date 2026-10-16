import { createContext, useContext } from 'react';

export interface Palette {
  dark: boolean;
  bg: string;
  surface: string;
  surfaceAlt: string;
  text: string;
  muted: string;
  faint: string;
  border: string;
  accent: string;
  accentText: string;
  accentSoft: string;
  warn: string;
  danger: string;
  dangerSoft: string;
  highlight: string;
  /** Soft card shadow (CSS box-shadow syntax, supported by React Native's boxShadow style). */
  shadow: string;
  /** Serif for names and titles; Android's built-in serif until Fraunces has loaded. */
  display: string;
  /** System bar strips and window background: a deeper tone of the same paper. */
  chrome: string;
}

// "Calm paper": warm off-white, ink-dark text, one clay-brown accent, shadows instead of borders.
export const LIGHT: Palette = {
  dark: false,
  bg: '#F6F1E7',
  surface: '#FFFCF6',
  surfaceAlt: '#EFE7D8',
  text: '#23201B',
  muted: '#6E6658',
  faint: '#9C9282',
  border: '#E6DCCB',
  accent: '#8A5A2B',
  accentText: '#FFFCF6',
  accentSoft: 'rgba(138, 90, 43, 0.10)',
  warn: '#9A4B0E',
  danger: '#A63A2B',
  dangerSoft: 'rgba(166, 58, 43, 0.10)',
  highlight: 'rgba(138, 90, 43, 0.14)',
  shadow: '0px 1px 2px rgba(60, 45, 20, 0.06), 0px 8px 24px rgba(60, 45, 20, 0.07)',
  display: 'serif',
  chrome: '#E9DFCD',
};

// The same paper at night: warm charcoal, cream text, a lighter clay accent.
export const DARK: Palette = {
  dark: true,
  bg: '#1A1815',
  surface: '#24211C',
  surfaceAlt: '#2E2A24',
  text: '#F2EADB',
  muted: '#B2A792',
  faint: '#7D7463',
  border: '#37322A',
  accent: '#D9A066',
  accentText: '#1A1815',
  accentSoft: 'rgba(217, 160, 102, 0.14)',
  warn: '#E7AE6B',
  danger: '#F08A78',
  dangerSoft: 'rgba(240, 138, 120, 0.12)',
  highlight: 'rgba(217, 160, 102, 0.20)',
  shadow: '0px 1px 2px rgba(0, 0, 0, 0.30), 0px 8px 24px rgba(0, 0, 0, 0.28)',
  display: 'serif',
  chrome: '#12110E',
};

export const DISPLAY_FONT = 'Fraunces_600SemiBold';

export const ThemeContext = createContext<Palette>(LIGHT);
export const useTheme = () => useContext(ThemeContext);

export const SPACE = { xs: 4, s: 8, m: 12, l: 16, xl: 24 };
export const RADIUS = { s: 8, m: 12, l: 16 };
export const TOUCH = 48; // minimum touch target (dp)
