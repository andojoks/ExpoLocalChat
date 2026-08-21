import type { ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/theme/ThemeProvider';

/**
 * Full-bleed screen header: white extends through the status-bar / notch area.
 * Use on every push screen (with `onBack`) and tab roots (large title, no back).
 */
export function AppScreenHeader({
  title,
  subtitle,
  onBack,
  size,
  tabs,
  activeTab,
  onTabChange,
  footer,
  right,
}: {
  title: string;
  subtitle?: string;
  /** When set, shows a transparent back control (push screens). */
  onBack?: () => void;
  /** `large` for tab roots; `nav` for stacked screens. Defaults from `onBack`. */
  size?: 'nav' | 'large';
  tabs?: Array<{ id: string; label: string }>;
  activeTab?: string;
  onTabChange?: (id: string) => void;
  footer?: ReactNode;
  right?: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const variant = size ?? (onBack ? 'nav' : 'large');

  return (
    <View
      className="border-b border-line bg-surface"
      style={{ paddingTop: insets.top, backgroundColor: colors.surface, borderBottomColor: colors.line }}
    >
      {variant === 'large' ? (
        <View className="flex-row items-start gap-3 px-5 pb-3.5 pt-3">
          <View className="min-w-0 flex-1">
            <Text
              className="text-3xl font-black tracking-tight text-ink"
              style={{ lineHeight: 40, includeFontPadding: false }}
            >
              {title}
            </Text>
            {subtitle ? (
              <Text className="mt-1 text-sm leading-5 text-muted">{subtitle}</Text>
            ) : null}
          </View>
          {right ? <View className="pt-1">{right}</View> : null}
        </View>
      ) : (
        <View className="flex-row items-center gap-2 px-3 pb-3.5 pt-2">
          {onBack ? (
            <Pressable
              onPress={onBack}
              hitSlop={12}
              className="h-10 w-10 items-center justify-center bg-transparent"
            >
              <Ionicons name="arrow-back" size={22} color={colors.ink} />
            </Pressable>
          ) : null}
          <View className="min-w-0 flex-1 pr-1">
            <Text
              className="text-xl font-black text-ink"
              numberOfLines={1}
              style={{ lineHeight: 28, includeFontPadding: false }}
            >
              {title}
            </Text>
            {subtitle ? (
              <Text className="text-xs leading-4 text-muted" numberOfLines={2}>
                {subtitle}
              </Text>
            ) : null}
          </View>
          {right ? <View>{right}</View> : null}
        </View>
      )}

      {tabs && tabs.length > 0 && onTabChange ? (
        <View className="flex-row">
          {tabs.map((t) => {
            const on = t.id === activeTab;
            return (
              <Pressable
                key={t.id}
                onPress={() => onTabChange(t.id)}
                className={`flex-1 items-center pb-3 ${
                  on ? 'border-b-2 border-forest' : 'border-b-2 border-transparent'
                }`}
              >
                <Text
                  className={`text-[15px] font-semibold ${
                    on ? 'text-ink' : 'text-subtle'
                  }`}
                  style={{ lineHeight: 22, includeFontPadding: false }}
                >
                  {t.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}

      {footer ? <View>{footer}</View> : null}
    </View>
  );
}
