import {
  Text as RNText,
  TextInput as RNTextInput,
  StyleSheet,
  type TextInputProps,
  type TextProps,
} from 'react-native';

/** Police pixel unique de l'app (Pokemon Classic, un seul poids). */
export const APP_FONT = 'PokemonClassic';

/**
 * Text/TextInput avec la police pixel imposée. La base est appliquée EN
 * DERNIER : un fontWeight hérité ferait retomber iOS sur la police système.
 */
export function Text({ style, ...props }: TextProps) {
  return <RNText {...props} style={[style, styles.base]} />;
}

export function TextInput({ style, ...props }: TextInputProps) {
  return <RNTextInput {...props} style={[style, styles.base]} />;
}

const styles = StyleSheet.create({
  base: { fontFamily: APP_FONT, fontWeight: 'normal' },
});
