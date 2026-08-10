import { Platform, Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';

type TabRoute = {
  key: string;
  name: string;
  params?: object;
};

type TabBarProps = {
  state: {
    index: number;
    routes: TabRoute[];
  };
  descriptors: Record<
    string,
    {
      options: {
        title?: string;
        tabBarAccessibilityLabel?: string;
      };
    }
  >;
  navigation: {
    emit: (event: {
      type: string;
      target: string;
      canPreventDefault?: boolean;
    }) => { defaultPrevented: boolean };
    navigate: (name: string, params?: object) => void;
  };
};

/** Absolute href for each tab root — always land here on tab press. */
const TAB_ROOT_HREF: Record<string, string> = {
  index: '/(tabs)',
  packs: '/(tabs)/packs',
  chat: '/(tabs)/chat',
  account: '/(tabs)/account',
};

const TAB_META: Record<
  string,
  {
    label: string;
    icon: keyof typeof Ionicons.glyphMap;
    iconActive: keyof typeof Ionicons.glyphMap;
  }
> = {
  index: {
    label: 'Home',
    icon: 'home-outline',
    iconActive: 'home',
  },
  packs: {
    label: 'Packs',
    icon: 'library-outline',
    iconActive: 'library',
  },
  chat: {
    label: 'Chat',
    icon: 'chatbubbles-outline',
    iconActive: 'chatbubbles',
  },
  account: {
    label: 'Account',
    icon: 'person-outline',
    iconActive: 'person',
  },
};

/** Chip height (matches minHeight on the floating dock). */
export const FLOATING_TAB_CHIP_HEIGHT = 64;
/** Space above / below the chip so it reads as floating (top includes room for upward shadow). */
export const FLOATING_TAB_TOP_GAP = 12;
export const FLOATING_TAB_BOTTOM_GAP = 8;

export function floatingTabSafeBottom(safeBottom: number) {
  return Math.max(safeBottom, Platform.OS === 'android' ? 14 : 8);
}

/**
 * Bottom padding so scroll / fixed footers clear the floating tab chip.
 * Use on tab roots (and nested screens that still show the tab bar).
 */
export function useFloatingTabClearance(extra = 16) {
  const insets = useSafeAreaInsets();
  return (
    FLOATING_TAB_TOP_GAP +
    FLOATING_TAB_CHIP_HEIGHT +
    FLOATING_TAB_BOTTOM_GAP +
    floatingTabSafeBottom(insets.bottom) +
    extra
  );
}

/**
 * Overlay tab dock — content scrolls behind; only the white chip is opaque.
 */
export function AppTabBar({ state, descriptors, navigation }: TabBarProps) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const bottomInset = floatingTabSafeBottom(insets.bottom);

  return (
    <View
      pointerEvents="box-none"
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'transparent',
        paddingHorizontal: 16,
        paddingBottom: bottomInset + FLOATING_TAB_BOTTOM_GAP,
        paddingTop: FLOATING_TAB_TOP_GAP,
      }}
    >
      {/* Dual shadow wrap: outer casts upward, inner casts down + Android elevation.
          Outer needs a solid fill — iOS skips shadows on transparent views. */}
      <View
        style={{
          borderRadius: 24,
          backgroundColor: '#FFFFFF',
          shadowColor: '#0B1424',
          shadowOpacity: 0.16,
          shadowRadius: 14,
          shadowOffset: { width: 0, height: -5 },
        }}
      >
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            minHeight: FLOATING_TAB_CHIP_HEIGHT,
            paddingHorizontal: 6,
            paddingVertical: 6,
            borderRadius: 24,
            backgroundColor: '#FFFFFF',
            borderWidth: 1,
            borderColor: '#E8EEF4',
            shadowColor: '#0B1424',
            shadowOpacity: 0.1,
            shadowRadius: 18,
            shadowOffset: { width: 0, height: 8 },
            elevation: 12,
          }}
        >
          {state.routes.map((route, index) => {
            const focused = state.index === index;
            const { options } = descriptors[route.key];
            const meta = TAB_META[route.name] || {
              label: options.title || route.name,
              icon: 'ellipse-outline' as const,
              iconActive: 'ellipse' as const,
            };

            const onPress = () => {
              const event = navigation.emit({
                type: 'tabPress',
                target: route.key,
                canPreventDefault: true,
              });
              if (event.defaultPrevented) return;

              const href = TAB_ROOT_HREF[route.name];
              if (href) {
                router.navigate(href as never);
                return;
              }
              navigation.navigate(route.name, route.params);
            };

            const onLongPress = () => {
              navigation.emit({
                type: 'tabLongPress',
                target: route.key,
              });
            };

            return (
              <Pressable
                key={route.key}
                accessibilityRole="button"
                accessibilityState={focused ? { selected: true } : {}}
                accessibilityLabel={options.tabBarAccessibilityLabel || meta.label}
                onPress={onPress}
                onLongPress={onLongPress}
                style={{
                  flex: 1,
                  alignItems: 'center',
                  justifyContent: 'center',
                  paddingVertical: 8,
                  paddingHorizontal: 4,
                  borderRadius: 18,
                  backgroundColor: focused ? '#EFF6FF' : 'transparent',
                }}
              >
                <Ionicons
                  name={focused ? meta.iconActive : meta.icon}
                  size={22}
                  color={focused ? '#2563EB' : '#94A3B8'}
                />
                <Text
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.85}
                  style={{
                    marginTop: 3,
                    color: focused ? '#0B1424' : '#94A3B8',
                    fontSize: 10,
                    lineHeight: 12,
                    fontWeight: focused ? '700' : '600',
                    letterSpacing: 0.2,
                    textAlign: 'center',
                    includeFontPadding: false,
                    width: '100%',
                  }}
                >
                  {meta.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>
    </View>
  );
}
