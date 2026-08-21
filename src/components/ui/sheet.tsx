import { useCallback } from 'react';
import { StyleSheet } from 'react-native';
import {
  BottomSheetBackdrop,
  type BottomSheetBackdropProps,
  BottomSheetHandle,
  type BottomSheetHandleProps,
} from '@gorhom/bottom-sheet';
import { useTheme } from '@/theme/ThemeProvider';

export function SheetBackdrop(props: BottomSheetBackdropProps) {
  const { colors } = useTheme();
  return (
    <BottomSheetBackdrop
      {...props}
      disappearsOnIndex={-1}
      appearsOnIndex={0}
      opacity={0.45}
      pressBehavior="close"
      style={[{ backgroundColor: colors.overlay }]}
    />
  );
}

export function useSheetBackdrop() {
  return useCallback(
    (props: BottomSheetBackdropProps) => <SheetBackdrop {...props} />,
    [],
  );
}

export function SheetHandle(props: BottomSheetHandleProps) {
  const { colors } = useTheme();
  return (
    <BottomSheetHandle
      {...props}
      style={styles.handleWrap}
      indicatorStyle={[styles.handle, { backgroundColor: colors.sheetHandle }]}
    />
  );
}

const styles = StyleSheet.create({
  handleWrap: {
    paddingTop: 10,
    paddingBottom: 4,
  },
  handle: {
    width: 40,
    height: 5,
    borderRadius: 999,
  },
});
