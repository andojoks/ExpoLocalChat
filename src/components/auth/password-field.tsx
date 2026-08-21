import { useState } from 'react';
import { Pressable, Text, TextInput, View, type TextInputProps } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { scorePassword, type PasswordStrength } from '@/auth/password-strength';
import { useTheme } from '@/theme/ThemeProvider';

type AuthPasswordFieldProps = Omit<TextInputProps, 'secureTextEntry'> & {
  label: string;
  showStrength?: boolean;
};

export function AuthPasswordField({
  label,
  showStrength,
  value,
  ...props
}: AuthPasswordFieldProps) {
  const [visible, setVisible] = useState(false);
  const { colors } = useTheme();
  const strength: PasswordStrength = scorePassword(String(value ?? ''));

  return (
    <View className="mb-3.5">
      <Text className="mb-1.5 px-0.5 text-[11px] font-semibold uppercase text-subtle" style={{ letterSpacing: 1.5 }}>
        {label}
      </Text>
      <View
        className="flex-row items-center"
        style={{
          borderWidth: 1,
          borderColor: colors.line,
          backgroundColor: colors.surface,
          borderRadius: 16,
        }}
      >
        <TextInput
          placeholderTextColor={colors.subtle}
          className="flex-1 px-4 py-3.5 text-[15px] text-ink"
          secureTextEntry={!visible}
          value={value}
          autoCapitalize="none"
          autoCorrect={false}
          {...props}
        />
        <Pressable
          onPress={() => setVisible((v) => !v)}
          accessibilityRole="button"
          accessibilityLabel={visible ? 'Hide password' : 'Show password'}
          className="px-3.5 py-3.5"
          hitSlop={8}
        >
          <Ionicons name={visible ? 'eye-off' : 'eye'} size={20} color={colors.muted} />
        </Pressable>
      </View>
      {showStrength ? <PasswordStrengthMeter strength={strength} /> : null}
    </View>
  );
}

export function PasswordStrengthMeter({ strength }: { strength: PasswordStrength }) {
  const { colors } = useTheme();
  if (strength.level === 'empty') {
    return (
      <View className="mt-2">
        <View className="flex-row gap-1">
          {[0, 1, 2, 3].map((i) => (
            <View key={i} className="h-1.5 flex-1 rounded-full bg-line" />
          ))}
        </View>
      </View>
    );
  }

  return (
    <View className="mt-2">
      <View className="flex-row gap-1">
        {[0, 1, 2, 3].map((i) => {
          const filled = i < strength.score;
          return (
            <View
              key={i}
              className="h-1.5 flex-1 rounded-full"
              style={{ backgroundColor: filled ? strength.color : colors.controlOff }}
            />
          );
        })}
      </View>
      {strength.label ? (
        <Text className="mt-1.5 text-xs font-semibold" style={{ color: strength.color }}>
          {strength.label}
        </Text>
      ) : null}
    </View>
  );
}
