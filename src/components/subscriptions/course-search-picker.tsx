import { Pressable, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { PackCourse } from '@/subscription/api';
import { BRAND_BLUE } from '@/theme/brand';
import { useTheme } from '@/theme/ThemeProvider';
import { LABEL_TEXT_ANDROID } from '@/components/ui/app-text';
import { INPUT_CARET, inputFocusChrome, useInputFocus } from '@/components/ui/input-focus';

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
  const { colors, isDark } = useTheme();
  const searchFocus = useInputFocus();
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
      <View
        collapsable={false}
        className="mb-3 flex-row items-center gap-2 px-3.5 py-3"
        style={inputFocusChrome(searchFocus.focused, colors, { isDark, radius: 16 })}
      >
        <Ionicons name="search" size={18} color={colors.subtle} />
        <TextInput
          {...INPUT_CARET}
          value={search}
          onChangeText={onSearchChange}
          onFocus={searchFocus.onFocus}
          onBlur={searchFocus.onBlur}
          placeholder="Search courses…"
          placeholderTextColor={colors.subtle}
          className="flex-1 text-[15px] text-ink"
          autoCorrect={false}
          autoCapitalize="none"
        />
        {search ? (
          <Pressable onPress={() => onSearchChange('')} hitSlop={8}>
            <Ionicons name="close-circle" size={18} color={colors.subtle} />
          </Pressable>
        ) : null}
      </View>

      <View className="mb-3 flex-row items-center justify-between px-0.5">
        <Text
          className="text-[12px] font-semibold uppercase text-subtle"
          style={[LABEL_TEXT_ANDROID, { letterSpacing: 1.3 }]}
        >
          Courses
        </Text>
        <Text
          className="text-[13px] font-semibold"
          numberOfLines={1}
          style={[LABEL_TEXT_ANDROID, { color: BRAND_BLUE }]}
        >
          {selected.length}/{max}
        </Text>
      </View>

      {filtered.length === 0 ? (
        <View className="items-center rounded-[24px] border border-dashed border-line bg-surface/70 px-5 py-8">
          <Text className="text-center text-[14px] text-muted">
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
                className="flex-row items-center gap-3 rounded-[20px] bg-surface px-4 py-3.5"
                style={{
                  borderWidth: 1,
                  borderColor: on ? colors.selectedBorder : colors.line,
                  opacity: cannotAdd || isLocked ? 0.55 : 1,
                  backgroundColor: on ? colors.selectedBg : colors.surface,
                }}
              >
                <View
                  className="h-10 w-10 items-center justify-center rounded-[14px]"
                  style={{ backgroundColor: on ? colors.iconBg : colors.surfaceMuted }}
                >
                  <Ionicons
                    name={on ? 'checkmark' : 'book-outline'}
                    size={18}
                    color={on ? BRAND_BLUE : colors.muted}
                  />
                </View>
                <View className="mr-2 min-w-0 flex-1">
                  <Text className="text-[15px] font-semibold text-ink">{course.name}</Text>
                  <Text className="mt-0.5 text-[12px] text-muted">{course.code}</Text>
                  {isLocked ? (
                    <Text className="mt-0.5 text-[11px] text-subtle">
                      Locked until subscription expires
                    </Text>
                  ) : null}
                </View>
                <Ionicons
                  name={on ? 'checkbox' : 'square-outline'}
                  size={22}
                  color={on ? BRAND_BLUE : colors.subtle}
                />
              </Pressable>
            );
          })}
        </View>
      )}
    </View>
  );
}
