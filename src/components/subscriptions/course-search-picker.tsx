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
      <View className="mb-3 flex-row items-center gap-2 rounded-2xl border border-[#E8EEF4] bg-white px-3.5 py-3">
        <Ionicons name="search" size={18} color="#94A3B8" />
        <TextInput
          value={search}
          onChangeText={onSearchChange}
          placeholder="Search courses…"
          placeholderTextColor="#94A3B8"
          className="flex-1 text-[15px] text-ink"
          autoCorrect={false}
          autoCapitalize="none"
        />
        {search ? (
          <Pressable onPress={() => onSearchChange('')} hitSlop={8}>
            <Ionicons name="close-circle" size={18} color="#94A3B8" />
          </Pressable>
        ) : null}
      </View>

      <View className="mb-3 flex-row items-center justify-between px-0.5">
        <Text className="text-[12px] font-semibold uppercase tracking-[0.12em] text-[#94A3B8]">
          Courses
        </Text>
        <Text className="text-[13px] font-semibold text-[#2563EB]">
          {selected.length}/{max}
        </Text>
      </View>

      {filtered.length === 0 ? (
        <View className="items-center rounded-[24px] border border-dashed border-[#E2E8F0] bg-white/70 px-5 py-8">
          <Text className="text-center text-[14px] text-slate-500">
            No courses match your search.
          </Text>
        </View>
      ) : (
        <View className="gap-2.5">
          {filtered.map((course) => {
            const on = selected.includes(course.id);
            const isLocked = locked.has(course.id) && on;
            const cannotAdd = !on && selected.length >= max;
            return (
              <Pressable
                key={course.id}
                disabled={disabled || cannotAdd || isLocked}
                onPress={() => onToggle(course.id)}
                className="flex-row items-center gap-3 rounded-[20px] bg-white px-4 py-3.5"
                style={{
                  borderWidth: 1,
                  borderColor: on ? '#BFDBFE' : '#E8EEF4',
                  opacity: cannotAdd || isLocked ? 0.55 : 1,
                  backgroundColor: on ? '#F8FBFF' : '#FFFFFF',
                }}
              >
                <View
                  className="h-10 w-10 items-center justify-center rounded-[14px]"
                  style={{ backgroundColor: on ? '#EFF6FF' : '#F1F5F9' }}
                >
                  <Ionicons
                    name={on ? 'checkmark' : 'book-outline'}
                    size={18}
                    color={on ? '#2563EB' : '#64748B'}
                  />
                </View>
                <View className="mr-2 min-w-0 flex-1">
                  <Text className="text-[15px] font-semibold text-ink">{course.name}</Text>
                  <Text className="mt-0.5 text-[12px] text-slate-500">{course.code}</Text>
                  {isLocked ? (
                    <Text className="mt-0.5 text-[11px] text-slate-400">
                      Locked until subscription expires
                    </Text>
                  ) : null}
                </View>
                <Ionicons
                  name={on ? 'checkbox' : 'square-outline'}
                  size={22}
                  color={on ? '#2563EB' : '#94A3B8'}
                />
              </Pressable>
            );
          })}
        </View>
      )}
    </View>
  );
}
