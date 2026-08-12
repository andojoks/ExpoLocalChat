import { Image, type ImageStyle, type StyleProp } from 'react-native';

export const BRAND = {
  blue: '#0548E8',
  blueDeep: '#0439C4',
  navy: '#0B1B4D',
  gold: '#F5C518',
  white: '#FFFFFF',
} as const;

type Variant = 'onBlue' | 'onLight';

const LOGO_SOURCE: Record<Variant, number> = {
  /** White + gold mark on transparent — for blue / dark surfaces. */
  onBlue: require('../../../assets/brand/logo-light-transparent.png'),
  /** Mark badge for light auth surfaces. */
  onLight: require('../../../assets/brand/logo-splash-icon.png'),
};

/**
 * ExpertLearner mark (PNG only — no react-native-svg native module required).
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
  return (
    <Image
      source={LOGO_SOURCE[variant]}
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
