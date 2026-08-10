import { Image, type ImageStyle, type StyleProp } from 'react-native';

export const BRAND = {
  blue: '#2563EB',
  blueDeep: '#1D4ED8',
  navy: '#0B1B4D',
  gold: '#F5C518',
  white: '#FFFFFF',
} as const;

type Variant = 'onBlue' | 'onLight';

/**
 * ExpertLearner mark (PNG only — no react-native-svg native module required).
 * onBlue / onLight both use the brand splash mark; on light surfaces it reads as
 * the blue app-icon chip from the brand board.
 */
export function ExpertLearnerLogo({
  size = 96,
  variant = 'onBlue',
  style,
}: {
  size?: number;
  variant?: Variant;
  style?: StyleProp<ImageStyle>;
}) {
  // Splash mark already includes blue field + white E + gold L.
  // Works on blue screens and as a badge on light auth screens.
  void variant;
  return (
    <Image
      source={require('../../../assets/brand/logo-splash-icon.png')}
      style={[
        {
          width: size,
          height: size,
          borderRadius: variant === 'onLight' ? size * 0.22 : 0,
        },
        style,
      ]}
      resizeMode="contain"
      accessibilityLabel="ExpertLearner"
    />
  );
}
