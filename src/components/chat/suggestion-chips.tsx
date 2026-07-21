import { Pressable, Text, View } from 'react-native';

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
    <View className="flex-row flex-wrap gap-2 px-4 pb-2">
      {chips.map((chip) => (
        <Pressable
          key={chip}
          disabled={disabled}
          onPress={() => onSelect(chip)}
          className={`rounded-full border border-line bg-white px-3 py-2 shadow-sm ${disabled ? 'opacity-50' : ''}`}
        >
          <Text className="text-xs font-semibold text-forest">{chip}</Text>
        </Pressable>
      ))}
    </View>
  );
}
