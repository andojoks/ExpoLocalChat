import { useCallback, useMemo, useRef, useState } from 'react';
import { Keyboard, Pressable, Text, TextInput, View } from 'react-native';
import {
  BottomSheetFlatList,
  BottomSheetModal,
  BottomSheetTextInput,
} from '@gorhom/bottom-sheet';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { CountryCode } from 'libphonenumber-js';
import {
  countryFlagEmoji,
  DEFAULT_PHONE_COUNTRY,
  listCountryDialOptions,
  type CountryDialOption,
} from '@/auth/phone';
import { SheetHandle, useSheetBackdrop } from '@/components/ui/sheet';
import { INPUT_CARET, inputFocusChrome, useInputFocus } from '@/components/ui/input-focus';
import { BRAND_BLUE } from '@/theme/brand';
import { useTheme } from '@/theme/ThemeProvider';

type PhoneFieldProps = {
  label?: string;
  country: CountryCode;
  nationalNumber: string;
  onCountryChange: (country: CountryCode) => void;
  onNationalChange: (national: string) => void;
  placeholder?: string;
};

export function PhoneField({
  label = 'Phone (optional)',
  country,
  nationalNumber,
  onCountryChange,
  onNationalChange,
  placeholder = '801 234 5678',
}: PhoneFieldProps) {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const sheetRef = useRef<BottomSheetModal>(null);
  const numberInputRef = useRef<TextInput>(null);
  const renderBackdrop = useSheetBackdrop();
  const [query, setQuery] = useState('');
  const numberFocus = useInputFocus();
  const searchFocus = useInputFocus();
  const snapPoints = useMemo(() => ['78%', '94%'], []);
  const pickerOpenRef = useRef(false);

  const countries = useMemo(() => listCountryDialOptions(), []);
  const selected = countries.find((c) => c.code === country) ?? {
    code: DEFAULT_PHONE_COUNTRY,
    callingCode: '+237',
    name: 'Cameroon',
    label: 'Cameroon',
    flag: countryFlagEmoji(DEFAULT_PHONE_COUNTRY),
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase().replace(/^\+/, '');
    if (!q) return countries;
    return countries.filter((c) => {
      const name = c.name.toLowerCase();
      const iso = c.code.toLowerCase();
      const dial = c.callingCode.replace('+', '');
      return name.includes(q) || iso.includes(q) || dial.includes(q);
    });
  }, [countries, query]);

  const closePicker = useCallback(() => {
    pickerOpenRef.current = false;
    setQuery('');
  }, []);

  const handleDismiss = useCallback(() => {
    if (!pickerOpenRef.current) return;
    closePicker();
  }, [closePicker]);

  const requestClosePicker = useCallback(() => {
    sheetRef.current?.dismiss();
  }, []);

  function openPicker() {
    numberInputRef.current?.blur();
    Keyboard.dismiss();
    setQuery('');
    pickerOpenRef.current = true;
    sheetRef.current?.present();
  }

  function pick(option: CountryDialOption) {
    onCountryChange(option.code);
    requestClosePicker();
  }

  const renderItem = useCallback(
    ({ item }: { item: CountryDialOption }) => {
      const active = item.code === country;
      const countryName = item.name || item.label || item.code;
      return (
        <Pressable
          onPress={() => pick(item)}
          className="mb-2 flex-row items-center gap-3 rounded-[20px] px-3.5 py-3.5"
          style={{
            backgroundColor: active ? colors.selectedBg : colors.surface,
            borderWidth: 1,
            borderColor: active ? colors.selectedBorder : colors.line,
          }}
        >
          <Text style={{ fontSize: 28, lineHeight: 34, flexShrink: 0 }}>
            {item.flag}
          </Text>
          <View style={{ flex: 1, minWidth: 0, marginRight: 10 }}>
            <Text
              style={{
                fontSize: 15,
                lineHeight: 20,
                fontWeight: '600',
                color: colors.ink,
                width: '100%',
              }}
            >
              {countryName}
            </Text>
            <Text
              style={{
                marginTop: 2,
                fontSize: 12,
                lineHeight: 16,
                fontWeight: '600',
                color: colors.muted,
              }}
            >
              {item.code}
            </Text>
          </View>
          <View style={{ flexShrink: 0, marginLeft: 4, minWidth: 64, alignItems: 'flex-end' }}>
            <Text
              style={{
                fontSize: 14,
                lineHeight: 20,
                fontWeight: '600',
                color: active ? BRAND_BLUE : colors.ink,
                includeFontPadding: false,
                textAlign: 'right',
              }}
            >
              {`${item.callingCode}\u00A0`}
            </Text>
          </View>
        </Pressable>
      );
    },
    [country, colors],
  );

  return (
    <View className="mb-3.5">
      <Text
        className="mb-1.5 px-0.5 text-[11px] font-semibold uppercase text-subtle"
        style={{ letterSpacing: 1.5 }}
      >
        {label}
      </Text>

      {/* Combined field: flag picker (left) + national number */}
      <View collapsable={false} style={inputFocusChrome(numberFocus.focused, colors, { isDark })}>
        <View className="flex-row items-center overflow-hidden" style={{ borderRadius: 15 }}>
        <Pressable
          onPress={openPicker}
          accessibilityRole="button"
          accessibilityLabel={`Country ${selected.name}, ${selected.callingCode}`}
          className="flex-row items-center gap-2 px-3.5 py-3.5"
          style={{
            flexGrow: 0,
            flexShrink: 0,
            minWidth: 124,
            borderRightWidth: 1,
            borderRightColor: colors.line,
            backgroundColor: colors.surfaceMuted,
          }}
        >
          <Text style={{ fontSize: 22, lineHeight: 26 }}>{selected.flag}</Text>
          <Text
            className="text-[15px] font-semibold text-ink"
            style={{ flexShrink: 0 }}
          >
            {selected.callingCode}
          </Text>
          <Ionicons name="chevron-down" size={14} color={colors.muted} />
        </Pressable>
        <TextInput
          ref={numberInputRef}
          {...INPUT_CARET}
          placeholderTextColor={colors.subtle}
          className="min-w-0 flex-1 px-3.5 py-3.5 text-[15px] text-ink"
          keyboardType="phone-pad"
          value={nationalNumber}
          onChangeText={onNationalChange}
          onFocus={numberFocus.onFocus}
          onBlur={numberFocus.onBlur}
          placeholder={placeholder}
        />
        </View>
      </View>

      <BottomSheetModal
        ref={sheetRef}
        snapPoints={snapPoints}
        enableDynamicSizing={false}
        enablePanDownToClose
        keyboardBehavior="extend"
        keyboardBlurBehavior="none"
        android_keyboardInputMode="adjustResize"
        onDismiss={handleDismiss}
        backdropComponent={renderBackdrop}
        handleComponent={SheetHandle}
        backgroundStyle={{
          backgroundColor: colors.sheetBg,
          borderTopLeftRadius: 28,
          borderTopRightRadius: 28,
        }}
      >
        <View className="flex-row items-center justify-between px-5 pb-3 pt-1">
          <View className="min-w-0 flex-1 pr-3">
            <Text
              className="text-[11px] font-semibold uppercase text-subtle"
              style={{ letterSpacing: 1.6 }}
            >
              Phone
            </Text>
            <Text
              numberOfLines={1}
              className="mt-1 text-[22px] font-black tracking-tight text-ink"
              style={{ flexShrink: 1 }}
            >
              Select country
            </Text>
          </View>
          <Pressable
            onPress={requestClosePicker}
            hitSlop={10}
            className="h-10 w-10 items-center justify-center rounded-full bg-surface"
            style={{ borderWidth: 1, borderColor: colors.line }}
          >
            <Ionicons name="close" size={18} color={colors.ink} />
          </Pressable>
        </View>

        <View className="px-5 pb-3">
          <View
            collapsable={false}
            className="flex-row items-center gap-2.5 px-3.5 py-3"
            style={inputFocusChrome(searchFocus.focused, colors, { isDark })}
          >
            <Ionicons name="search" size={18} color={colors.subtle} />
            <BottomSheetTextInput
              {...INPUT_CARET}
              placeholder="Search country or dial code"
              placeholderTextColor={colors.subtle}
              value={query}
              onChangeText={setQuery}
              onFocus={searchFocus.onFocus}
              onBlur={searchFocus.onBlur}
              autoCapitalize="none"
              autoCorrect={false}
              style={{ flex: 1, fontSize: 15, color: colors.ink, padding: 0 }}
            />
            {query ? (
              <Pressable onPress={() => setQuery('')} hitSlop={8}>
                <Ionicons name="close-circle" size={18} color={colors.subtle} />
              </Pressable>
            ) : null}
          </View>
        </View>

        <BottomSheetFlatList
          data={filtered}
          keyExtractor={(item: CountryDialOption) => item.code}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{
            paddingHorizontal: 16,
            paddingBottom: Math.max(insets.bottom, 20) + 8,
          }}
          ListEmptyComponent={
            <View className="items-center px-6 py-12">
              <View
                className="mb-3 h-12 w-12 items-center justify-center rounded-2xl"
                style={{ backgroundColor: colors.iconBg }}
              >
                <Ionicons name="globe-outline" size={22} color={colors.subtle} />
              </View>
              <Text className="text-center text-[14px] text-muted">
                No countries match “{query}”
              </Text>
            </View>
          }
          renderItem={renderItem}
        />
      </BottomSheetModal>
    </View>
  );
}
