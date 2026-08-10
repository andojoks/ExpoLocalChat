import { useCallback } from 'react';
import { StyleSheet } from 'react-native';
import {
  BottomSheetBackdrop,
  type BottomSheetBackdropProps,
  BottomSheetHandle,
  type BottomSheetHandleProps,
} from '@gorhom/bottom-sheet';

export const SHEET_BG = '#F8FAFC';
export const SHEET_HANDLE = '#CBD5E1';

export function SheetBackdrop(props: BottomSheetBackdropProps) {
  return (
    <BottomSheetBackdrop
      {...props}
      disappearsOnIndex={-1}
      appearsOnIndex={0}
      opacity={0.45}
      pressBehavior="close"
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
  return (
    <BottomSheetHandle
      {...props}
      style={styles.handleWrap}
      indicatorStyle={styles.handle}
    />
  );
}

const styles = StyleSheet.create({
  handleWrap: {
    paddingTop: 10,
    paddingBottom: 4,
  },
  handle: {
    backgroundColor: SHEET_HANDLE,
    width: 40,
    height: 5,
    borderRadius: 999,
  },
});
