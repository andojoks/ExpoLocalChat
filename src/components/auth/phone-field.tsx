import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { CountryCode } from 'libphonenumber-js';
import {
  DEFAULT_PHONE_COUNTRY,
  listCountryDialOptions,
  type CountryDialOption,
} from '@/auth/phone';

type PhoneFieldProps = {
  label?: string;
  country: CountryCode;
  nationalNumber: string;
  onCountryChange: (country: CountryCode) => void;
  onNationalChange: (national: string) => void;
  placeholder?: string;
};

const SHEET_MAX = Math.min(Dimensions.get('window').height * 0.78, 640);

export function PhoneField({
  label = 'Phone (optional)',
  country,
  nationalNumber,
  onCountryChange,
  onNationalChange,
  placeholder = '801 234 5678',
}: PhoneFieldProps) {
  const insets = useSafeAreaInsets();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [query, setQuery] = useState('');
  const slide = useRef(new Animated.Value(SHEET_MAX)).current;
  const fade = useRef(new Animated.Value(0)).current;

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
    if (pickerOpen) {
      Animated.parallel([
        Animated.timing(fade, { toValue: 1, duration: 220, useNativeDriver: true }),
        Animated.spring(slide, {
          toValue: 0,
          damping: 22,
          stiffness: 220,
          mass: 0.9,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      slide.setValue(SHEET_MAX);
      fade.setValue(0);
    }
  }, [pickerOpen, fade, slide]);

  function closePicker() {
    Animated.parallel([
      Animated.timing(fade, { toValue: 0, duration: 180, useNativeDriver: true }),
      Animated.timing(slide, { toValue: SHEET_MAX, duration: 200, useNativeDriver: true }),
    ]).start(({ finished }) => {
      if (finished) {
        setPickerOpen(false);
        setQuery('');
      }
    });
  }

  function pick(option: CountryDialOption) {
    onCountryChange(option.code);
    closePicker();
  }

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

      <Modal
        visible={pickerOpen}
        transparent
        animationType="none"
        onRequestClose={closePicker}
        statusBarTranslucent
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          className="flex-1 justify-end"
        >
          <Animated.View
            style={{ opacity: fade }}
            className="absolute inset-0 bg-black/45"
          >
            <Pressable className="flex-1" onPress={closePicker} />
          </Animated.View>

          <Animated.View
            style={{
              transform: [{ translateY: slide }],
              maxHeight: SHEET_MAX,
              paddingBottom: Math.max(insets.bottom, 12),
            }}
            className="rounded-t-[28px] bg-[#F8FAFC]"
          >
            <View className="items-center pt-3 pb-1">
              <View className="h-1.5 w-10 rounded-full bg-slate-300" />
            </View>

            <View className="flex-row items-center justify-between px-5 pb-2 pt-2">
              <Text className="text-lg font-bold text-ink">Select country</Text>
              <Pressable
                onPress={closePicker}
                hitSlop={10}
                className="h-9 w-9 items-center justify-center rounded-full bg-white"
              >
                <Ionicons name="close" size={18} color="#0B1424" />
              </Pressable>
            </View>

            <View className="px-5 pb-3">
              <View className="flex-row items-center gap-2 rounded-2xl border border-line bg-white px-3.5 py-3">
                <Ionicons name="search" size={18} color="#94A3B8" />
                <TextInput
                  placeholder="Search country, code, or +dial"
                  placeholderTextColor="#94A3B8"
                  value={query}
                  onChangeText={setQuery}
                  autoCapitalize="none"
                  autoCorrect={false}
                  className="flex-1 text-[15px] text-ink"
                />
                {query ? (
                  <Pressable onPress={() => setQuery('')} hitSlop={8}>
                    <Ionicons name="close-circle" size={18} color="#94A3B8" />
                  </Pressable>
                ) : null}
              </View>
            </View>

            <FlatList
              data={filtered}
              keyExtractor={(item) => item.code}
              keyboardShouldPersistTaps="handled"
              style={{ maxHeight: SHEET_MAX - 160 }}
              contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 8 }}
              ListEmptyComponent={
                <View className="items-center px-6 py-10">
                  <Text className="text-[14px] text-slate-500">No countries match “{query}”</Text>
                </View>
              }
              renderItem={({ item }) => {
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
              }}
            />
          </Animated.View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}
