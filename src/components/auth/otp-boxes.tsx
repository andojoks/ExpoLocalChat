import { useEffect, useRef, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';

export function OtpBoxes({
  value,
  onChange,
  length = 6,
}: {
  value: string;
  onChange: (next: string) => void;
  length?: number;
}) {
  const refs = useRef<Array<TextInput | null>>([]);
  const { colors } = useTheme();
  const digits = value.padEnd(length, ' ').slice(0, length).split('');

  useEffect(() => {
    refs.current[0]?.focus();
  }, []);

  function setAt(index: number, char: string) {
    const cleaned = char.replace(/\D/g, '');
    const next = value.split('');
    while (next.length < length) next.push('');
    if (!cleaned) {
      next[index] = '';
      onChange(next.join('').replace(/\s/g, '').slice(0, length));
      return;
    }
    if (cleaned.length > 1) {
      const pasted = cleaned.slice(0, length);
      onChange(pasted);
      refs.current[Math.min(pasted.length, length - 1)]?.focus();
      return;
    }
    next[index] = cleaned;
    onChange(next.join('').replace(/\s/g, '').slice(0, length));
    if (index < length - 1) refs.current[index + 1]?.focus();
  }

  return (
    <View className="mb-4 flex-row justify-between gap-2">
      {digits.map((d, i) => (
        <TextInput
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          keyboardType="number-pad"
          maxLength={length}
          value={d.trim()}
          onChangeText={(t) => setAt(i, t)}
          onKeyPress={({ nativeEvent }) => {
            if (nativeEvent.key === 'Backspace' && !digits[i].trim() && i > 0) {
              refs.current[i - 1]?.focus();
            }
          }}
          className="h-14 flex-1 text-center text-xl font-bold text-ink"
          style={{
            borderRadius: 16,
            borderWidth: 1,
            borderColor: colors.line,
            backgroundColor: colors.surface,
          }}
        />
      ))}
    </View>
  );
}

export function ResendCooldown({
  onResend,
  seconds = 45,
}: {
  onResend: () => Promise<void> | void;
  seconds?: number;
}) {
  const [left, setLeft] = useState(seconds);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (left <= 0) return;
    const t = setTimeout(() => setLeft((x) => x - 1), 1000);
    return () => clearTimeout(t);
  }, [left]);

  return (
    <Pressable
      disabled={left > 0 || busy}
      onPress={async () => {
        setBusy(true);
        try {
          await onResend();
          setLeft(seconds);
        } finally {
          setBusy(false);
        }
      }}
      className="items-center py-2"
    >
      {left > 0 ? (
        <View className="flex-row items-center justify-center">
          <Text className="text-sm font-semibold text-subtle">Resend code in </Text>
          {/* Fixed slot so 60→9 doesn't reflow/flash the centered label. */}
          <Text
            className="text-sm font-semibold text-subtle"
            style={{
              minWidth: 44,
              textAlign: 'left',
              fontVariant: ['tabular-nums'],
            }}
          >
            {left}s
          </Text>
        </View>
      ) : (
        <Text className={`text-sm font-semibold ${busy ? 'text-subtle' : 'text-[#0548E8]'}`}>
          {busy ? 'Sending…' : 'Resend code'}
        </Text>
      )}
    </Pressable>
  );
}
