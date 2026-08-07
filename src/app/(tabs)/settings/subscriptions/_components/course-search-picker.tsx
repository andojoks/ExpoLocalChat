import { Pressable, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { PackCourse } from '@/subscription/api';

export function CourseSearchPicker({
  courses,
  selected,
  max,
  search,
  onSearchChange,
  onToggle,
  lockedIds,
  disabled,
}: {
  courses: PackCourse[];
  selected: string[];
  max: number;
  search: string;
  onSearchChange: (q: string) => void;
  onToggle: (id: string) => void;
  /** Course IDs that cannot be deselected (e.g. already on ACTIVE pack). */
  lockedIds?: Set<string> | string[];
  disabled?: boolean;
}) {
  const locked = lockedIds instanceof Set ? lockedIds : new Set(lockedIds || []);
  const q = search.trim().toLowerCase();
  const filtered = q
    ? courses.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          c.code.toLowerCase().includes(q),
      )
    : courses;

  return (
    <View>
      <TextInput
        value={search}
        onChangeText={onSearchChange}
        placeholder="Search courses…"
        placeholderTextColor="#94A3B8"
        className="mb-3 rounded-md border border-line bg-white px-3.5 py-3 text-[15px] text-ink"
        autoCorrect={false}
        autoCapitalize="none"
      />
      <Text className="mb-2 text-sm text-slate-600">
        Selected {selected.length}/{max}
      </Text>
      {filtered.length === 0 ? (
        <Text className="text-sm text-slate-500">No courses match your search.</Text>
      ) : (
        filtered.map((course) => {
          const on = selected.includes(course.id);
          const isLocked = locked.has(course.id) && on;
          const cannotAdd = !on && selected.length >= max;
          return (
            <Pressable
              key={course.id}
              disabled={disabled || cannotAdd || isLocked}
              onPress={() => onToggle(course.id)}
              className={`mb-2 flex-row items-center justify-between rounded-md border px-4 py-3 ${
                on ? 'border-forest bg-white' : 'border-line bg-white'
              } ${cannotAdd || isLocked ? 'opacity-50' : ''}`}
            >
              <View className="mr-3 flex-1">
                <Text className="font-semibold text-ink">{course.name}</Text>
                <Text className="text-xs text-slate-500">{course.code}</Text>
                {isLocked ? (
                  <Text className="mt-0.5 text-xs text-slate-400">Locked until subscription expires</Text>
                ) : null}
              </View>
              <Ionicons
                name={on ? 'checkbox' : 'square-outline'}
                size={22}
                color={on ? '#2563EB' : '#94A3B8'}
              />
            </Pressable>
          );
        })
      )}
    </View>
  );
}
