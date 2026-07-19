import { Platform } from 'react-native';

/**
 * Palette rétro « jeu Game Boy Advance » : tons parchemin le jour,
 * nuit bleutée le soir. Les clés restent celles de l'ancien thème
 * pour ne pas casser les écrans existants.
 */
export const Colors = {
  light: {
    text: '#2A2A33',
    textSecondary: '#6B6555',
    background: '#E8DFC8',
    card: '#F8F4E0',
    cardAlt: '#DCD2B4',
    border: '#33323E',
    accent: '#C84C34',
    accentText: '#F8F4E0',
    success: '#3C8C50',
    warning: '#C08828',
    danger: '#B03028',
    bark: '#D85C30',
    howl: '#7858B0',
    whine: '#D89820',
    calm: '#A8C890',
  },
  dark: {
    text: '#EFEADB',
    textSecondary: '#9C99A8',
    background: '#171928',
    card: '#232842',
    cardAlt: '#10121F',
    border: '#6E7494',
    accent: '#E06048',
    accentText: '#171928',
    success: '#58B070',
    warning: '#D8A040',
    danger: '#E05848',
    bark: '#F07048',
    howl: '#9880D8',
    whine: '#E8B040',
    calm: '#2E4030',
  },
} as const;

export type ThemeColors = Record<keyof typeof Colors.light, string>;

export const Fonts = Platform.select({
  ios: { sans: 'PokemonClassic', mono: 'PokemonClassic' },
  default: { sans: 'PokemonClassic', mono: 'PokemonClassic' },
});

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
} as const;
