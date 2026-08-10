import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  Dimensions,
  FlatList,
  Image,
  Pressable,
  Text,
  View,
  type ViewToken,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { useFonts, Sora_600SemiBold, Sora_700Bold } from '@expo-google-fonts/sora';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import { ExpertLearnerLogo } from '@/components/brand/expert-learner-logo';
import { setOnboardingComplete } from '@/onboarding/storage';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
const H_PAD = 24;
const FOOTER_RESERVE = 128;
/** Art size — capped so title + body stay on-screen on short phones. */
const ART = Math.min(SCREEN_W - H_PAD * 2, SCREEN_H * 0.38, 340);

const INK = ['#0B1424', '#101C30', '#152844'] as const;

type Slide =
  | { id: 'hero'; kind: 'hero' }
  | {
      id: string;
      kind: 'visual';
      title: string;
      body: string;
      image: number;
    };

const SLIDES: Slide[] = [
  { id: 'hero', kind: 'hero' },
  {
    id: 'papers',
    kind: 'visual',
    title: 'Past papers, clearer.',
    body: 'Browse structured questions with rendered math and diagrams — ready for focused practice.',
    image: require('../../../assets/brand/onboard-papers.png'),
  },
  {
    id: 'packs',
    kind: 'visual',
    title: 'Packs that travel with you.',
    body: 'Download your courses once and study offline. Your progress stays with you.',
    image: require('../../../assets/brand/onboard-packs.png'),
  },
  {
    id: 'tutor',
    kind: 'visual',
    title: 'Your private study tutor.',
    body: 'Chat with an on-device tutor that knows your packs — no account required for every answer.',
    image: require('../../../assets/brand/onboard-tutor.png'),
  },
];

function InkAtmosphere() {
  return (
    <>
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          right: -80,
          top: 40,
          height: 220,
          width: 220,
          borderRadius: 999,
          backgroundColor: 'rgba(37,99,235,0.16)',
        }}
      />
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          left: -90,
          bottom: 120,
          height: 200,
          width: 200,
          borderRadius: 999,
          backgroundColor: 'rgba(37,99,235,0.1)',
        }}
      />
    </>
  );
}

function SlideShell({
  topInset,
  bottomInset,
  children,
}: {
  topInset: number;
  bottomInset: number;
  children: ReactNode;
}) {
  return (
    <View style={{ width: SCREEN_W, flex: 1 }}>
      <LinearGradient
        colors={[...INK]}
        locations={[0, 0.45, 1]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 }}
      />
      <InkAtmosphere />
      <View
        style={{
          flex: 1,
          paddingTop: topInset + 8,
          paddingBottom: bottomInset + FOOTER_RESERVE,
          paddingHorizontal: H_PAD,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {children}
      </View>
    </View>
  );
}

function HeroSlide({
  topInset,
  bottomInset,
}: {
  topInset: number;
  bottomInset: number;
}) {
  const logoSize = Math.min(96, SCREEN_W * 0.26);
  return (
    <SlideShell topInset={topInset} bottomInset={bottomInset}>
      <View style={{ alignItems: 'center', maxWidth: 360 }}>
        <ExpertLearnerLogo size={logoSize} variant="onBlue" />
        <Text
          style={{
            marginTop: 28,
            fontFamily: 'Sora_700Bold',
            fontSize: 11,
            letterSpacing: 2.4,
            textTransform: 'uppercase',
            color: '#64748B',
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
          Learn Smarter.{'\n'}
          <Text style={{ color: '#93C5FD' }}>Grow Faster.</Text>
        </Text>
        <Text
          style={{
            marginTop: 16,
            fontFamily: 'Sora_600SemiBold',
            fontSize: 15,
            lineHeight: 22,
            color: '#94A3B8',
            textAlign: 'center',
          }}
        >
          Exam packs, offline study, and a private tutor — built for how you actually learn.
        </Text>
      </View>
    </SlideShell>
  );
}

function VisualSlide({
  title,
  body,
  image,
  topInset,
  bottomInset,
}: {
  title: string;
  body: string;
  image: number;
  topInset: number;
  bottomInset: number;
}) {
  return (
    <SlideShell topInset={topInset} bottomInset={bottomInset}>
      <View style={{ alignItems: 'center', width: '100%', maxWidth: 400 }}>
        <Image
          source={image}
          style={{
            width: ART,
            height: ART,
            borderRadius: 28,
            backgroundColor: '#152844',
            borderWidth: 1,
            borderColor: 'rgba(148,163,184,0.18)',
          }}
          resizeMode="cover"
        />
        <Text
          style={{
            fontFamily: 'Sora_700Bold',
            fontSize: 26,
            lineHeight: 32,
            color: '#FFFFFF',
            textAlign: 'center',
            marginTop: 28,
            letterSpacing: -0.3,
            paddingHorizontal: 8,
          }}
        >
          {title}
        </Text>
        <Text
          style={{
            fontFamily: 'Sora_600SemiBold',
            fontSize: 15,
            lineHeight: 22,
            color: '#94A3B8',
            textAlign: 'center',
            marginTop: 12,
            paddingHorizontal: 12,
          }}
        >
          {body}
        </Text>
      </View>
    </SlideShell>
  );
}

function ProgressDots({ count, index }: { count: number; index: number }) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 7,
        height: 8,
      }}
    >
      {Array.from({ length: count }).map((_, i) => {
        const on = i === index;
        return (
          <View
            key={i}
            style={{
              height: 6,
              width: on ? 20 : 6,
              borderRadius: 99,
              backgroundColor: on ? '#93C5FD' : 'rgba(148,163,184,0.35)',
            }}
          />
        );
      })}
    </View>
  );
}

export default function OnboardingScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const listRef = useRef<FlatList<Slide>>(null);
  const [index, setIndex] = useState(0);
  const ctaScale = useSharedValue(1);

  const [fontsLoaded] = useFonts({
    Sora_600SemiBold,
    Sora_700Bold,
  });

  const finish = useCallback(async () => {
    await setOnboardingComplete();
    router.replace('/(auth)/welcome');
  }, [router]);

  const goNext = useCallback(() => {
    if (index >= SLIDES.length - 1) {
      void finish();
      return;
    }
    listRef.current?.scrollToIndex({ index: index + 1, animated: true });
  }, [finish, index]);

  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      const first = viewableItems[0];
      if (first?.index != null) setIndex(first.index);
    },
  ).current;

  const viewabilityConfig = useMemo(
    () => ({ viewAreaCoveragePercentThreshold: 55 }),
    [],
  );

  const ctaStyle = useAnimatedStyle(() => ({
    transform: [{ scale: ctaScale.value }],
  }));

  if (!fontsLoaded) {
    return <View style={{ flex: 1, backgroundColor: '#0B1424' }} />;
  }

  const last = index === SLIDES.length - 1;
  const bottomPad = Math.max(insets.bottom, 12) + 10;

  return (
    <View style={{ flex: 1, backgroundColor: '#0B1424' }}>
      <StatusBar style="light" translucent />

      <View
        style={{
          position: 'absolute',
          top: insets.top + 8,
          right: 16,
          zIndex: 20,
        }}
      >
        <Pressable onPress={() => void finish()} hitSlop={12} style={{ padding: 8 }}>
          <Text
            style={{
              fontFamily: 'Sora_600SemiBold',
              fontSize: 14,
              color: '#94A3B8',
            }}
          >
            Skip
          </Text>
        </Pressable>
      </View>

      <FlatList
        ref={listRef}
        data={SLIDES}
        keyExtractor={(item) => item.id}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        bounces={false}
        style={{ flex: 1 }}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
        getItemLayout={(_, i) => ({
          length: SCREEN_W,
          offset: SCREEN_W * i,
          index: i,
        })}
        renderItem={({ item }) =>
          item.kind === 'hero' ? (
            <HeroSlide topInset={insets.top} bottomInset={bottomPad} />
          ) : (
            <VisualSlide
              title={item.title}
              body={item.body}
              image={item.image}
              topInset={insets.top}
              bottomInset={bottomPad}
            />
          )
        }
      />

      <View
        style={{
          paddingHorizontal: H_PAD,
          paddingTop: 12,
          paddingBottom: bottomPad,
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
        }}
      >
        <ProgressDots count={SLIDES.length} index={index} />
        <Animated.View style={[{ marginTop: 16 }, ctaStyle]}>
          <Pressable
            onPressIn={() => {
              ctaScale.value = withSpring(0.97, { damping: 18 });
            }}
            onPressOut={() => {
              ctaScale.value = withSpring(1, { damping: 14 });
            }}
            onPress={goNext}
            style={{
              alignItems: 'center',
              borderRadius: 16,
              backgroundColor: '#FFFFFF',
              paddingVertical: 16,
            }}
          >
            <Text
              style={{
                fontFamily: 'Sora_700Bold',
                fontSize: 16,
                color: '#0B1424',
              }}
            >
              {last ? 'Get started' : 'Continue'}
            </Text>
          </Pressable>
        </Animated.View>
      </View>
    </View>
  );
}
