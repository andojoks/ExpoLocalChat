import { useEffect } from 'react';
import { Dimensions, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFonts, Sora_700Bold } from '@expo-google-fonts/sora';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { ExpertLearnerLogo } from '@/components/brand/expert-learner-logo';
import { BRAND_BLUE, BRAND_GOLD, BRAND_HEADER_GRADIENT } from '@/theme/brand';
import { useBrandEdgeChrome } from '@/theme/use-brand-edge-chrome';

const { width: SCREEN_W } = Dimensions.get('window');
const LOGO_SIZE = Math.min(192, SCREEN_W * 0.52);
const TRACK_MAX_W = 320;
const BAR_W = 96;

/** Indeterminate gold bar that sweeps along the track. */
function LinearLoader() {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withRepeat(
      withTiming(1, { duration: 1200, easing: Easing.inOut(Easing.ease) }),
      -1,
      false,
    );
  }, [progress]);

  const barStyle = useAnimatedStyle(() => {
    // Travel from just left of track to just right of track.
    const travel = TRACK_MAX_W + BAR_W;
    const x = -BAR_W + progress.value * travel;
    return {
      transform: [{ translateX: x }],
    };
  });

  return (
    <View
      style={{
        width: '100%',
        maxWidth: TRACK_MAX_W,
        height: 4,
        borderRadius: 999,
        backgroundColor: 'rgba(255,255,255,0.22)',
        overflow: 'hidden',
      }}
    >
      <Animated.View
        style={[
          {
            position: 'absolute',
            top: 0,
            bottom: 0,
            width: BAR_W,
            borderRadius: 999,
            backgroundColor: BRAND_GOLD,
          },
          barStyle,
        ]}
      />
    </View>
  );
}

/**
 * Welcome-styled hold screen while one-time bootstrap / session restore runs.
 */
export function BootstrapSetupScreen() {
  const insets = useSafeAreaInsets();
  const [fontsLoaded] = useFonts({ Sora_700Bold });
  useBrandEdgeChrome();

  if (!fontsLoaded) {
    return <View style={{ flex: 1, backgroundColor: BRAND_BLUE }} />;
  }

  return (
    <View style={{ flex: 1, backgroundColor: BRAND_BLUE }}>
      <StatusBar style="light" translucent />
      <LinearGradient
        colors={[...BRAND_HEADER_GRADIENT]}
        locations={[0, 0.45, 1]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 }}
      />
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          right: -64,
          top: 96,
          height: 288,
          width: 288,
          borderRadius: 999,
          backgroundColor: 'rgba(255,255,255,0.12)',
        }}
      />
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          left: -80,
          bottom: 128,
          height: 256,
          width: 256,
          borderRadius: 999,
          backgroundColor: 'rgba(255,255,255,0.08)',
        }}
      />

      <View
        style={{
          flex: 1,
          paddingTop: insets.top + 16,
          paddingBottom: insets.bottom,
          paddingHorizontal: 24,
        }}
      >
        <View
          style={{
            flex: 1,
            alignItems: 'center',
            justifyContent: 'center',
            paddingHorizontal: 8,
          }}
        >
          <ExpertLearnerLogo size={LOGO_SIZE} variant="onBlue" />

          <Text
            style={{
              marginTop: 28,
              fontFamily: 'Sora_700Bold',
              fontSize: 11,
              letterSpacing: 2.4,
              textTransform: 'uppercase',
              color: 'rgba(255,255,255,0.7)',
              textAlign: 'center',
            }}
          >
            ExpertLearner
          </Text>

          <Text
            style={{
              marginTop: 16,
              fontFamily: 'Sora_700Bold',
              fontSize: 34,
              lineHeight: 42,
              color: '#FFFFFF',
              textAlign: 'center',
              letterSpacing: -0.5,
            }}
          >
            Setup in progress
          </Text>

          <Text
            style={{
              marginTop: 14,
              color: 'rgba(255,255,255,0.78)',
              fontSize: 16,
              lineHeight: 24,
              textAlign: 'center',
              maxWidth: 320,
            }}
          >
            One-time setup for this device. It only takes a moment the first time you open the
            app.
          </Text>

          <View style={{ marginTop: 36, width: '100%', maxWidth: TRACK_MAX_W, alignItems: 'center' }}>
            <LinearLoader />
          </View>
        </View>
      </View>
    </View>
  );
}
