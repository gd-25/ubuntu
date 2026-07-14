import {
  Text as RNText,
  TextInput as RNTextInput,
  StyleSheet,
  type TextInputProps,
  type TextProps,
} from 'react-native';

/** App-wide font (single 400 weight — hierarchy comes from sizes). */
export const APP_FONT = 'Questrial_400Regular';

/** Drop-in replacements for RN Text/TextInput with the app font applied. */
export function Text({ style, ...props }: TextProps) {
  return <RNText {...props} style={[styles.base, style]} />;
}

export function TextInput({ style, ...props }: TextInputProps) {
  return <RNTextInput {...props} style={[styles.base, style]} />;
}

const styles = StyleSheet.create({
  base: { fontFamily: APP_FONT },
});
