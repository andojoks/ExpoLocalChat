import {
  Platform,
  Text,
  type StyleProp,
  type TextProps,
  type TextStyle,
} from 'react-native';

/**
 * Android (esp. API 35+) can under-measure shrink-wrapped Text width, so the
 * last glyph clips ("Previous" → "Previou", "5/6" → "5/") or multi-word labels
 * wrap after the first word. Force stable metrics for UI chrome labels.
 */
export const LABEL_TEXT_ANDROID: TextStyle =
  Platform.OS === 'android'
    ? { includeFontPadding: false, flexShrink: 0, paddingRight: 2 }
    : { flexShrink: 0 };

type LabelProps = TextProps & {
  className?: string;
  style?: StyleProp<TextStyle>;
};

/** Full-width centered label for primary/secondary buttons. */
export function ButtonLabel({ children, className, style, ...rest }: LabelProps) {
  return (
    <Text
      numberOfLines={1}
      ellipsizeMode="tail"
      className={className}
      style={[
        LABEL_TEXT_ANDROID,
        { width: '100%', textAlign: 'center' },
        style,
      ]}
      {...rest}
    >
      {children}
    </Text>
  );
}

/** Single-line label for links / chips (no forced full width). */
export function InlineLabel({ children, className, style, ...rest }: LabelProps) {
  return (
    <Text
      numberOfLines={1}
      ellipsizeMode="tail"
      className={className}
      style={[LABEL_TEXT_ANDROID, style]}
      {...rest}
    >
      {children}
    </Text>
  );
}
