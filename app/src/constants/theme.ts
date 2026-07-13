import { Platform } from 'react-native';

export const Colors = {
  light: {
    text: '#111113',
    textSecondary: '#60646C',
    background: '#F7F7F8',
    card: '#FFFFFF',
    border: '#E0E1E6',
    accent: '#4F6D7A',
    accentText: '#FFFFFF',
    success: '#2E8B57',
    warning: '#C77D1E',
    danger: '#C0392B',
    bark: '#E4572E',
    howl: '#7768AE',
    whine: '#F3A712',
    calm: '#DDE6DD',
  },
  dark: {
    text: '#F2F2F3',
    textSecondary: '#A6ABB3',
    background: '#101114',
    card: '#1C1E22',
    border: '#2E3135',
    accent: '#8FB3C2',
    accentText: '#101114',
    success: '#5DBB85',
    warning: '#E0A458',
    danger: '#E26D5C',
    bark: '#F0704B',
    howl: '#998BD0',
    whine: '#F5BA45',
    calm: '#2A332A',
  },
} as const;

export type ThemeColors = Record<keyof typeof Colors.light, string>;

export const Fonts = Platform.select({
  ios: { sans: 'system-ui', mono: 'ui-monospace' },
  default: { sans: 'normal', mono: 'monospace' },
});

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
} as const;
