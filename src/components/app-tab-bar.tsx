import { Platform, Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

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

const ACTIVE = '#2563EB';
const INACTIVE = '#64748B';
const ICON_SIZE = 24;

const TAB_META: Record<
  string,
  { label: string; icon: keyof typeof Ionicons.glyphMap }
> = {
  index: { label: 'Chat', icon: 'chatbubbles-outline' },
  packs: { label: 'Packs', icon: 'library-outline' },
  settings: { label: 'Settings', icon: 'settings-outline' },
};

/**
 * Custom tab bar so we fully own layout + safe-area padding.
 * Default RN tab bar often clips labels when a fixed height is combined with
 * system inset padding (iOS home indicator, Android gesture/3-button nav).
 */
export function AppTabBar({ state, descriptors, navigation }: TabBarProps) {
  const insets = useSafeAreaInsets();
  // Always clear the system gesture / nav bar. Floor covers devices that report 0.
  const bottomInset = Math.max(
    insets.bottom,
    Platform.OS === 'android' ? 16 : 10,
  );

  return (
    <View
      style={{
        backgroundColor: '#F8FAFC',
        borderTopWidth: 1,
        borderTopColor: '#E2E8F0',
        paddingBottom: bottomInset,
        paddingTop: 10,
        // No fixed height — height = content + inset, so labels never get squeezed.
      }}
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'flex-end',
          minHeight: 48,
        }}
      >
        {state.routes.map((route, index) => {
          const focused = state.index === index;
          const { options } = descriptors[route.key];
          const meta = TAB_META[route.name] || {
            label: options.title || route.name,
            icon: 'ellipse-outline' as const,
          };
          const color = focused ? ACTIVE : INACTIVE;

          const onPress = () => {
            const event = navigation.emit({
              type: 'tabPress',
              target: route.key,
              canPreventDefault: true,
            });
            if (!focused && !event.defaultPrevented) {
              navigation.navigate(route.name, route.params);
            }
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
                paddingHorizontal: 4,
                gap: 4,
              }}
            >
              <Ionicons name={meta.icon} size={ICON_SIZE} color={color} />
              <Text
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.85}
                style={{
                  color,
                  fontSize: 10,
                  lineHeight: 13,
                  fontWeight: '500',
                  letterSpacing: 0.1,
                  textAlign: 'center',
                  includeFontPadding: false,
                  paddingBottom: 1,
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
  );
}
