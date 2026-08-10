import type { ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

/** Flat ink nav header — matches Preferences / Subscriptions. */
export function SubInkHeader({
  title,
  subtitle,
  onBack,
  right,
  footer,
  tabs,
  activeTab,
  onTabChange,
}: {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  right?: ReactNode;
  footer?: ReactNode;
  tabs?: Array<{ id: string; label: string }>;
  activeTab?: string;
  onTabChange?: (id: string) => void;
}) {
  const insets = useSafeAreaInsets();

  return (
    <>
      <StatusBar style="light" />
      <LinearGradient
        colors={['#0B1424', '#101C30', '#152844']}
        locations={[0, 0.5, 1]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{
          paddingTop: insets.top + 8,
          paddingBottom: tabs?.length || footer ? 0 : 16,
          paddingHorizontal: 14,
        }}
      >
        <View
          pointerEvents="none"
          className="absolute -right-16 -top-8 h-40 w-40 rounded-full"
          style={{ backgroundColor: 'rgba(37,99,235,0.12)' }}
        />

        <View className="flex-row items-center gap-1">
          {onBack ? (
            <Pressable
              onPress={onBack}
              hitSlop={12}
              className="h-10 w-10 items-center justify-center rounded-full"
              style={{ backgroundColor: 'rgba(255,255,255,0.06)' }}
            >
              <Ionicons name="arrow-back" size={20} color="#F8FAFC" />
            </Pressable>
          ) : null}
          <View className={`min-w-0 flex-1 pr-2 ${onBack ? '' : 'pl-1.5'}`}>
            <Text
              className={`${onBack ? 'text-xl' : 'text-2xl'} font-black text-white`}
              numberOfLines={1}
              style={{ lineHeight: onBack ? 28 : 32, includeFontPadding: false }}
            >
              {title}
            </Text>
            {subtitle ? (
              <Text className="mt-0.5 text-[12px] text-[#94A3B8]" numberOfLines={2}>
                {subtitle}
              </Text>
            ) : null}
          </View>
          {right ? <View className="pr-1">{right}</View> : null}
        </View>

        {footer ? <View className="mt-3">{footer}</View> : null}

        {tabs && tabs.length > 0 && onTabChange ? (
          <View className="mt-3 flex-row">
            {tabs.map((t) => {
              const on = t.id === activeTab;
              return (
                <Pressable
                  key={t.id}
                  onPress={() => onTabChange(t.id)}
                  className={`flex-1 items-center pb-3 ${
                    on ? 'border-b-2 border-[#2563EB]' : 'border-b-2 border-transparent'
                  }`}
                >
                  <Text
                    className={`text-[14px] font-semibold ${
                      on ? 'text-white' : 'text-[#64748B]'
                    }`}
                  >
                    {t.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        ) : null}
      </LinearGradient>
    </>
  );
}

export function SubEyebrow({ children }: { children: string }) {
  return (
    <Text className="mb-3 px-0.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#94A3B8]">
      {children}
    </Text>
  );
}

export function SubCard({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <View
      className={`overflow-hidden rounded-[24px] bg-white ${className}`}
      style={{
        borderWidth: 1,
        borderColor: '#E8EEF4',
        shadowColor: '#0B1424',
        shadowOpacity: 0.05,
        shadowRadius: 16,
        shadowOffset: { width: 0, height: 6 },
        elevation: 2,
      }}
    >
      {children}
    </View>
  );
}

export function SubPrimaryButton({
  label,
  onPress,
  disabled,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      className={`items-center rounded-2xl py-4 ${disabled ? 'bg-slate-300' : 'bg-[#0B1424]'}`}
    >
      <Text className="text-[15px] font-bold text-white">{label}</Text>
    </Pressable>
  );
}

export function SubFooterBar({ children }: { children: ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <View
      className="border-t border-[#E8EEF4] bg-white px-5 pt-3"
      style={{ paddingBottom: Math.max(insets.bottom, 12) }}
    >
      {children}
    </View>
  );
}

export function SubBanner({
  tone,
  icon,
  title,
  body,
}: {
  tone: 'error' | 'info' | 'success';
  icon: keyof typeof Ionicons.glyphMap;
  title?: string;
  body: string;
}) {
  const styles =
    tone === 'error'
      ? { border: '#FECACA', bg: '#FEF2F2', iconBg: '#FEE2E2', icon: '#DC2626', text: '#991B1B' }
      : tone === 'success'
        ? { border: '#A7F3D0', bg: '#ECFDF5', iconBg: '#D1FAE5', icon: '#059669', text: '#065F46' }
        : { border: '#BFDBFE', bg: '#EFF6FF', iconBg: '#DBEAFE', icon: '#2563EB', text: '#1E3A8A' };

  return (
    <View
      className="mx-5 mt-4 flex-row items-start gap-3 rounded-2xl px-3.5 py-3"
      style={{ borderWidth: 1, borderColor: styles.border, backgroundColor: styles.bg }}
    >
      <View
        className="mt-0.5 h-8 w-8 items-center justify-center rounded-xl"
        style={{ backgroundColor: styles.iconBg }}
      >
        <Ionicons name={icon} size={16} color={styles.icon} />
      </View>
      <View className="min-w-0 flex-1">
        {title ? (
          <Text className="text-[13px] font-bold" style={{ color: styles.text }}>
            {title}
          </Text>
        ) : null}
        <Text
          className={`text-[13px] leading-5 ${title ? 'mt-0.5' : ''}`}
          style={{ color: styles.text }}
        >
          {body}
        </Text>
      </View>
    </View>
  );
}

export const SUB_PAGE_BG = '#E8EEF5';
