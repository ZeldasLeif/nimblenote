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
}

export const LIGHT: Palette = {
  dark: false,
  bg: '#F7F6F3',
  surface: '#FFFFFF',
  surfaceAlt: '#EFEDE8',
  text: '#1B1B1A',
  muted: '#6A6862',
  faint: '#A3A099',
  border: '#E4E1DA',
  accent: '#3D5AFE',
  accentText: '#FFFFFF',
  accentSoft: 'rgba(61, 90, 254, 0.10)',
  warn: '#A15C00',
  danger: '#C62828',
  dangerSoft: 'rgba(198, 40, 40, 0.10)',
  highlight: 'rgba(61, 90, 254, 0.16)',
};

export const DARK: Palette = {
  dark: true,
  bg: '#0E0F11',
  surface: '#17181B',
  surfaceAlt: '#202226',
  text: '#F1F0ED',
  muted: '#A09D96',
  faint: '#66645F',
  border: '#2A2C31',
  accent: '#8C9EFF',
  accentText: '#0E0F11',
  accentSoft: 'rgba(140, 158, 255, 0.14)',
  warn: '#F0B35A',
  danger: '#FF8A80',
  dangerSoft: 'rgba(255, 138, 128, 0.12)',
  highlight: 'rgba(140, 158, 255, 0.22)',
};

export const ThemeContext = createContext<Palette>(LIGHT);
export const useTheme = () => useContext(ThemeContext);

export const SPACE = { xs: 4, s: 8, m: 12, l: 16, xl: 24 };
export const RADIUS = { s: 8, m: 12, l: 16 };
export const TOUCH = 48; // minimum touch target (dp)
