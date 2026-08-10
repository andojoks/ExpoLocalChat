import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import {
  BottomSheetFlatList,
  BottomSheetModal,
  BottomSheetTextInput,
} from '@gorhom/bottom-sheet';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { CountryCode } from 'libphonenumber-js';
import {
  DEFAULT_PHONE_COUNTRY,
  listCountryDialOptions,
  type CountryDialOption,
} from '@/auth/phone';
import { SHEET_BG, SheetHandle, useSheetBackdrop } from '@/components/ui/sheet';

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
  const insets = useSafeAreaInsets();
  const sheetRef = useRef<BottomSheetModal>(null);
  const renderBackdrop = useSheetBackdrop();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [query, setQuery] = useState('');
  const snapPoints = useMemo(() => ['72%', '92%'], []);

  const countries = useMemo(() => listCountryDialOptions(), []);
  const selected = countries.find((c) => c.code === country) ?? {
    code: DEFAULT_PHONE_COUNTRY,
    callingCode: '+237',
    name: 'Cameroon',
    label: 'Cameroon',
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

  useEffect(() => {
    if (pickerOpen) sheetRef.current?.present();
    else sheetRef.current?.dismiss();
  }, [pickerOpen]);

  const closePicker = useCallback(() => {
    setPickerOpen(false);
    setQuery('');
  }, []);

  function pick(option: CountryDialOption) {
    onCountryChange(option.code);
    closePicker();
  }

  const renderItem = useCallback(
    ({ item }: { item: CountryDialOption }) => {
      const active = item.code === country;
      return (
        <Pressable
          onPress={() => pick(item)}
          className={`mb-1.5 flex-row items-center gap-3 rounded-2xl px-3.5 py-3.5 ${
            active ? 'bg-[#EFF6FF]' : 'bg-white'
          }`}
          style={{
            borderWidth: 1,
            borderColor: active ? '#BFDBFE' : '#E2E8F0',
          }}
        >
          <View className="h-10 w-10 items-center justify-center rounded-xl bg-[#0B1424]/5">
            <Text className="text-[12px] font-black text-[#0B1424]">{item.code}</Text>
          </View>
          <View className="min-w-0 flex-1">
            <Text className="text-[15px] font-semibold text-ink" numberOfLines={1}>
              {item.name}
            </Text>
            <Text className="mt-0.5 text-[12px] text-slate-500">
              {item.code} · {item.callingCode}
            </Text>
          </View>
          {active ? (
            <Ionicons name="checkmark-circle" size={20} color="#2563EB" />
          ) : (
            <Text className="text-[14px] font-semibold text-slate-500">
              {item.callingCode}
            </Text>
          )}
        </Pressable>
      );
    },
    [country],
  );

  return (
    <View className="mb-3.5">
      <Text className="mb-1.5 px-0.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#94A3B8]">
        {label}
      </Text>
      <View className="flex-row items-center gap-2">
        <Pressable
          onPress={() => setPickerOpen(true)}
          className="min-w-[108px] flex-row items-center justify-center gap-1 px-2.5 py-3.5"
          style={{
            borderRadius: 16,
            borderWidth: 1,
            borderColor: '#E8EEF4',
            backgroundColor: '#FFFFFF',
          }}
        >
          <Text className="text-[15px] font-semibold text-ink">
            {selected.code} {selected.callingCode}
          </Text>
          <Ionicons name="chevron-down" size={14} color="#64748B" />
        </Pressable>
        <TextInput
          placeholderTextColor="#94A3B8"
          className="flex-1 px-4 py-3.5 text-[15px] text-ink"
          style={{
            borderRadius: 16,
            borderWidth: 1,
            borderColor: '#E8EEF4',
            backgroundColor: '#FFFFFF',
          }}
          keyboardType="phone-pad"
          value={nationalNumber}
          onChangeText={onNationalChange}
          placeholder={placeholder}
        />
      </View>

      <BottomSheetModal
        ref={sheetRef}
        snapPoints={snapPoints}
        enableDynamicSizing={false}
        enablePanDownToClose
        keyboardBehavior="extend"
        keyboardBlurBehavior="restore"
        android_keyboardInputMode="adjustResize"
        onDismiss={closePicker}
        backdropComponent={renderBackdrop}
        handleComponent={SheetHandle}
        backgroundStyle={{
          backgroundColor: SHEET_BG,
          borderTopLeftRadius: 28,
          borderTopRightRadius: 28,
        }}
      >
        <View className="flex-row items-center justify-between px-5 pb-2 pt-1">
          <Text className="text-lg font-bold text-ink">Select country</Text>
          <Pressable
            onPress={closePicker}
            hitSlop={10}
            className="h-9 w-9 items-center justify-center rounded-2xl bg-white"
            style={{ borderWidth: 1, borderColor: '#E8EEF4' }}
          >
            <Ionicons name="close" size={18} color="#0B1424" />
          </Pressable>
        </View>

        <View className="px-5 pb-3">
          <View className="flex-row items-center gap-2 rounded-2xl border border-line bg-white px-3.5 py-3">
            <Ionicons name="search" size={18} color="#94A3B8" />
            <BottomSheetTextInput
              placeholder="Search country, code, or +dial"
              placeholderTextColor="#94A3B8"
              value={query}
              onChangeText={setQuery}
              autoCapitalize="none"
              autoCorrect={false}
              style={{ flex: 1, fontSize: 15, color: '#0B1424', padding: 0 }}
            />
            {query ? (
              <Pressable onPress={() => setQuery('')} hitSlop={8}>
                <Ionicons name="close-circle" size={18} color="#94A3B8" />
              </Pressable>
            ) : null}
          </View>
        </View>

        <BottomSheetFlatList
          data={filtered}
          keyExtractor={(item: CountryDialOption) => item.code}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{
            paddingHorizontal: 12,
            paddingBottom: Math.max(insets.bottom, 16),
          }}
          ListEmptyComponent={
            <View className="items-center px-6 py-10">
              <Text className="text-[14px] text-slate-500">
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
