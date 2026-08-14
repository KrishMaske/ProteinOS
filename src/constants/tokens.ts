import { Platform } from 'react-native';

export const palette = {
  ink: '#100E0C',
  surfaceDark: '#191612',
  raisedDark: '#24201B',
  paper: '#F5F1EA',
  surfaceLight: '#FCFAF6',
  raisedLight: '#EDE6DB',
  brown: '#D3A170',
  brownDark: '#71462D',
  brownSoftDark: '#33261B',
  brownSoftLight: '#EAD9C7',
  blue: '#6BA7FF',
  coral: '#FF7B66',
  violet: '#A88BFF',
  mutedDark: '#A69D92',
  mutedLight: '#70675D',
  lineDark: '#332E27',
  lineLight: '#DDD4C8',
  danger: '#FF665C',
  warning: '#F2BD49',
};

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, huge: 48 };
export const radius = { sm: 10, md: 16, lg: 24, pill: 999 };
export const fonts = {
  regular: Platform.select({ ios: 'System', android: 'sans-serif', default: 'system-ui' }),
  mono: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
};
