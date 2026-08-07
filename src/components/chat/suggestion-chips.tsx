import { Pressable, ScrollView, Text } from 'react-native';

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
        paddingTop: 4,
        paddingBottom: 8,
      }}
    >
      {chips.map((chip) => (
        <Pressable
          key={chip}
          disabled={disabled}
          onPress={() => onSelect(chip)}
          className={`rounded-xl border border-line bg-white px-3.5 py-2 ${disabled ? 'opacity-50' : ''}`}
        >
          <Text className="text-xs font-semibold text-forest" numberOfLines={1}>
            {chip}
          </Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}
