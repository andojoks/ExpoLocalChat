import { Pressable, ScrollView, Text } from 'react-native';
import { BRAND_BLUE } from '@/theme/brand';
import { useTheme } from '@/theme/ThemeProvider';
import { LABEL_TEXT_ANDROID } from '@/components/ui/app-text';

const STARTERS = [
  'Show an available paper',
  'Find questions by topic',
  'Explain a listed question',
];

export function SuggestionChips({
  suggestions,
  showStarters,
  disabled,
  onSelect,
}: {
  suggestions: string[];
  showStarters: boolean;
  disabled?: boolean;
  onSelect: (value: string) => void;
}) {
  const { colors } = useTheme();
  const chips = showStarters ? STARTERS : suggestions.slice(0, 4);
  if (!chips.length) return null;

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      style={{ flexGrow: 0, flexShrink: 0 }}
      contentContainerStyle={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingHorizontal: 16,
        paddingTop: 6,
        paddingBottom: 10,
      }}
    >
      {chips.map((chip) => (
        <Pressable
          key={chip}
          disabled={disabled}
          onPress={() => onSelect(chip)}
          className={`${disabled ? 'opacity-50' : ''}`}
          style={{
            borderRadius: 16,
            borderWidth: 1,
            borderColor: colors.selectedBorder,
            backgroundColor: colors.surface,
            paddingHorizontal: 14,
            paddingVertical: 9,
          }}
        >
          <Text
            className="text-[12px] font-semibold"
            numberOfLines={1}
            style={[LABEL_TEXT_ANDROID, { color: BRAND_BLUE }]}
          >
            {chip}
          </Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}
