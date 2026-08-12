import { Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  Extrapolation,
  interpolate,
  interpolateColor,
  type SharedValue,
  useAnimatedStyle,
} from 'react-native-reanimated';
import { ExpertLearnerLogo } from '@/components/brand/expert-learner-logo';
import { BRAND_HEADER_GRADIENT } from '@/theme/brand';
import { LABEL_TEXT_ANDROID } from '@/components/ui/app-text';

function greetingForHour(hour: number) {
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

/** Expanded / collapsed heights for the sticky home header. */
export function homeHeaderHeights(topInset: number) {
  // Brand row (~56) + greeting + name + paddings — keep in sync with layout below.
  const expanded = topInset + 12 + 126 + 28;
  const collapsed = topInset + 8 + 40 + 14;
  return {
    expanded,
    collapsed,
    delta: Math.max(1, expanded - collapsed),
  };
}

export function HomeWelcome({
  name,
  initial,
  topInset,
  scrollY,
}: {
  name: string;
  initial: string;
  topInset: number;
  scrollY: SharedValue<number>;
}) {
  const greeting = greetingForHour(new Date().getHours());
  const { expanded, collapsed, delta } = homeHeaderHeights(topInset);

  const shellStyle = useAnimatedStyle(() => {
    const y = Math.max(0, scrollY.value);
    const height = interpolate(
      y,
      [0, delta],
      [expanded, collapsed],
      Extrapolation.CLAMP,
    );
    const radius = interpolate(y, [0, delta], [32, 0], Extrapolation.CLAMP);
    return {
      height,
      borderBottomLeftRadius: radius,
      borderBottomRightRadius: radius,
    };
  });

  const padStyle = useAnimatedStyle(() => {
    const y = Math.max(0, scrollY.value);
    return {
      paddingTop: interpolate(
        y,
        [0, delta],
        [topInset + 12, topInset + 8],
        Extrapolation.CLAMP,
      ),
      paddingBottom: interpolate(y, [0, delta], [28, 14], Extrapolation.CLAMP),
    };
  });

  const brandRowStyle = useAnimatedStyle(() => {
    const y = Math.max(0, scrollY.value);
    return {
      minHeight: interpolate(y, [0, delta], [56, 40], Extrapolation.CLAMP),
    };
  });

  const logoStyle = useAnimatedStyle(() => {
    const y = Math.max(0, scrollY.value);
    const scale = interpolate(y, [0, delta], [1, 32 / 44], Extrapolation.CLAMP);
    return { transform: [{ scale }] };
  });

  /** Eyebrow → page title (matches SubInkHeader presence when collapsed). */
  const brandLabelStyle = useAnimatedStyle(() => {
    const y = Math.max(0, scrollY.value);
    return {
      fontSize: interpolate(y, [0, delta], [11, 20], Extrapolation.CLAMP),
      lineHeight: interpolate(y, [0, delta], [14, 28], Extrapolation.CLAMP),
      letterSpacing: interpolate(y, [0, delta], [2.4, -0.35], Extrapolation.CLAMP),
      color: interpolateColor(
        y,
        [0, delta],
        ['rgba(255,255,255,0.65)', '#FFFFFF'],
      ),
    };
  });

  const brandEyebrowWeightStyle = useAnimatedStyle(() => {
    const y = Math.max(0, scrollY.value);
    return {
      opacity: interpolate(y, [0, delta * 0.4], [1, 0], Extrapolation.CLAMP),
    };
  });

  const brandTitleWeightStyle = useAnimatedStyle(() => {
    const y = Math.max(0, scrollY.value);
    return {
      opacity: interpolate(y, [delta * 0.25, delta * 0.7], [0, 1], Extrapolation.CLAMP),
    };
  });

  const heroStyle = useAnimatedStyle(() => {
    const y = Math.max(0, scrollY.value);
    return {
      opacity: interpolate(y, [0, delta * 0.55], [1, 0], Extrapolation.CLAMP),
      transform: [
        {
          translateY: interpolate(y, [0, delta], [0, -16], Extrapolation.CLAMP),
        },
      ],
    };
  });

  const avatarStyle = useAnimatedStyle(() => {
    const y = Math.max(0, scrollY.value);
    return {
      opacity: interpolate(y, [0, delta * 0.45], [1, 0], Extrapolation.CLAMP),
      transform: [
        {
          scale: interpolate(y, [0, delta], [1, 0.72], Extrapolation.CLAMP),
        },
      ],
    };
  });

  const washStyle = useAnimatedStyle(() => {
    const y = Math.max(0, scrollY.value);
    return {
      opacity: interpolate(y, [0, delta], [1, 0.35], Extrapolation.CLAMP),
    };
  });

  return (
    <Animated.View
      pointerEvents="box-none"
      style={[
        {
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          zIndex: 20,
          overflow: 'hidden',
        },
        shellStyle,
      ]}
    >
      <LinearGradient
        colors={[...BRAND_HEADER_GRADIENT]}
        locations={[0, 0.5, 1]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ flex: 1 }}
      >
        <Animated.View
          pointerEvents="none"
          style={[
            {
              position: 'absolute',
              right: -80,
              top: -24,
              height: 208,
              width: 208,
              borderRadius: 999,
              backgroundColor: 'rgba(255,255,255,0.14)',
            },
            washStyle,
          ]}
        />
        <Animated.View
          pointerEvents="none"
          style={[
            {
              position: 'absolute',
              left: -96,
              bottom: 32,
              height: 176,
              width: 176,
              borderRadius: 999,
              backgroundColor: 'rgba(255,255,255,0.08)',
            },
            washStyle,
          ]}
        />

        <Animated.View style={[{ flex: 1, paddingHorizontal: 22 }, padStyle]}>
          <Animated.View
            style={[
              {
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
              },
              brandRowStyle,
            ]}
          >
            <View
              style={{
                minWidth: 0,
                flex: 1,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 8,
                paddingRight: 12,
              }}
            >
              <Animated.View
                style={[
                  {
                    width: 44,
                    height: 44,
                    alignItems: 'center',
                    justifyContent: 'center',
                  },
                  logoStyle,
                ]}
              >
                <ExpertLearnerLogo size={44} variant="onBlue" />
              </Animated.View>
              <View style={{ minWidth: 0, flexShrink: 1, justify: 'relative' }}>
                <Animated.Text
                  numberOfLines={1}
                  style={[
                    LABEL_TEXT_ANDROID,
                    {
                      fontWeight: '600',
                      textTransform: 'uppercase',
                    },
                    brandLabelStyle,
                    brandEyebrowWeightStyle,
                  ]}
                >
                  ExpertLearner
                </Animated.Text>
                <Animated.Text
                  numberOfLines={1}
                  style={[
                    LABEL_TEXT_ANDROID,
                    {
                      position: 'absolute',
                      left: 0,
                      right: 0,
                      top: 0,
                      fontWeight: '900',
                    },
                    brandLabelStyle,
                    brandTitleWeightStyle,
                  ]}
                >
                  ExpertLearner
                </Animated.Text>
              </View>
            </View>

            <Animated.View
              style={[
                {
                  height: 56,
                  width: 56,
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: 999,
                  borderWidth: 1,
                  borderColor: 'rgba(255,255,255,0.35)',
                  backgroundColor: 'rgba(255,255,255,0.14)',
                },
                avatarStyle,
              ]}
            >
              <Text className="text-lg font-black text-white">{initial}</Text>
            </Animated.View>
          </Animated.View>

          <Animated.View style={heroStyle}>
            <Text className="mt-3 text-[13px] font-medium text-white/85">{greeting}</Text>
            <Text
              className="mt-1 text-[34px] font-black tracking-tight text-white"
              numberOfLines={1}
              style={[LABEL_TEXT_ANDROID, { letterSpacing: -0.8 }]}
            >
              {name}
            </Text>
          </Animated.View>
        </Animated.View>
      </LinearGradient>
    </Animated.View>
  );
}
