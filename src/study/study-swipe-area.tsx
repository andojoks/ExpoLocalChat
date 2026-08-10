import { useMemo, type ReactNode } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { runOnJS } from 'react-native-reanimated';

const MIN_DISTANCE = 56;
const MIN_VELOCITY = 450;

type StudySwipeAreaProps = {
  children: ReactNode;
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  enabled?: boolean;
  style?: StyleProp<ViewStyle>;
  className?: string;
};

/**
 * Horizontal swipe → next (left) / previous (right).
 * Vertical scroll still wins via failOffsetY. WebView also posts swipe messages separately.
 */
export function StudySwipeArea({
  children,
  onSwipeLeft,
  onSwipeRight,
  enabled = true,
  style,
  className,
}: StudySwipeAreaProps) {
  const gesture = useMemo(() => {
    const goLeft = () => onSwipeLeft?.();
    const goRight = () => onSwipeRight?.();

    return Gesture.Pan()
      .enabled(enabled && Boolean(onSwipeLeft || onSwipeRight))
      .activeOffsetX([-24, 24])
      .failOffsetY([-18, 18])
      .onEnd((e) => {
        'worklet';
        const dx = e.translationX;
        const vx = e.velocityX;
        const strong =
          Math.abs(dx) >= MIN_DISTANCE || Math.abs(vx) >= MIN_VELOCITY;
        if (!strong) return;
        if (Math.abs(dx) < Math.abs(e.translationY)) return;
        if (dx < 0) runOnJS(goLeft)();
        else runOnJS(goRight)();
      });
  }, [enabled, onSwipeLeft, onSwipeRight]);

  if (!enabled) {
    return (
      <View style={style} className={className}>
        {children}
      </View>
    );
  }

  return (
    <GestureDetector gesture={gesture}>
      <View style={[{ flex: 1 }, style]} className={className}>
        {children}
      </View>
    </GestureDetector>
  );
}
