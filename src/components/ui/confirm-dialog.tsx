import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import {
  BottomSheetModal,
  BottomSheetView,
} from '@gorhom/bottom-sheet';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { SHEET_BG, SheetHandle, useSheetBackdrop } from '@/components/ui/sheet';

export type ConfirmDialogProps = {
  visible: boolean;
  title: string;
  message: string;
  /** Defaults to "Cancel" */
  cancelLabel?: string;
  /** Defaults to "Confirm" */
  confirmLabel?: string;
  /** Destructive styling for the confirm action (logout, delete, …) */
  destructive?: boolean;
  icon?: keyof typeof Ionicons.glyphMap;
  onCancel: () => void;
  onConfirm: () => void;
};

/**
 * Confirmation as a @gorhom/bottom-sheet modal.
 * Prefer this over `Alert.alert` for Cancel + Confirm flows.
 */
export function ConfirmDialog({
  visible,
  title,
  message,
  cancelLabel = 'Cancel',
  confirmLabel = 'Confirm',
  destructive = false,
  icon,
  onCancel,
  onConfirm,
}: ConfirmDialogProps) {
  const insets = useSafeAreaInsets();
  const ref = useRef<BottomSheetModal>(null);
  const renderBackdrop = useSheetBackdrop();

  useEffect(() => {
    if (visible) ref.current?.present();
    else ref.current?.dismiss();
  }, [visible]);

  const resolvedIcon =
    icon || (destructive ? 'warning-outline' : 'help-circle-outline');

  return (
    <BottomSheetModal
      ref={ref}
      enableDynamicSizing
      enablePanDownToClose
      onDismiss={onCancel}
      backdropComponent={renderBackdrop}
      handleComponent={SheetHandle}
      backgroundStyle={{ backgroundColor: SHEET_BG, borderTopLeftRadius: 28, borderTopRightRadius: 28 }}
    >
      <BottomSheetView
        style={{ paddingHorizontal: 20, paddingBottom: Math.max(insets.bottom, 16) }}
      >
        <View className="mb-4 items-center pt-1">
          <View
            className="mb-3 h-14 w-14 items-center justify-center rounded-2xl"
            style={{
              backgroundColor: destructive ? '#FEF2F2' : '#EFF6FF',
            }}
          >
            <Ionicons
              name={resolvedIcon}
              size={26}
              color={destructive ? '#B4534B' : '#2563EB'}
            />
          </View>
          <Text className="text-center text-[20px] font-black tracking-tight text-ink">
            {title}
          </Text>
          <Text className="mt-2 text-center text-[14px] leading-6 text-slate-500">
            {message}
          </Text>
        </View>

        <View className="gap-2.5">
          <Pressable
            onPress={onConfirm}
            className="items-center rounded-2xl py-4"
            style={{ backgroundColor: destructive ? '#B4534B' : '#0B1424' }}
          >
            <Text className="text-[15px] font-bold text-white">{confirmLabel}</Text>
          </Pressable>
          <Pressable
            onPress={onCancel}
            className="items-center rounded-2xl border border-[#E8EEF4] bg-white py-4"
          >
            <Text className="text-[15px] font-semibold text-ink">{cancelLabel}</Text>
          </Pressable>
        </View>
      </BottomSheetView>
    </BottomSheetModal>
  );
}

export type ConfirmRequest = {
  title: string;
  message: string;
  cancelLabel?: string;
  confirmLabel?: string;
  destructive?: boolean;
  icon?: keyof typeof Ionicons.glyphMap;
};

/**
 * Imperative-friendly state helper for ConfirmDialog.
 * Example:
 * ```tsx
 * const confirm = useConfirmDialog();
 * confirm.ask({ title, message, destructive: true }, () => doThing());
 * return <><Screen/>{confirm.dialog}</>
 * ```
 */
export function useConfirmDialog() {
  const [open, setOpen] = useState(false);
  const [request, setRequest] = useState<ConfirmRequest | null>(null);
  const onConfirmRef = useRef<(() => void) | null>(null);

  const ask = useCallback((opts: ConfirmRequest, onConfirm: () => void) => {
    onConfirmRef.current = onConfirm;
    setRequest(opts);
    setOpen(true);
  }, []);

  const close = useCallback(() => {
    setOpen(false);
    onConfirmRef.current = null;
  }, []);

  const handleConfirm = useCallback(() => {
    const fn = onConfirmRef.current;
    setOpen(false);
    onConfirmRef.current = null;
    fn?.();
  }, []);

  const dialog = request ? (
    <ConfirmDialog
      visible={open}
      title={request.title}
      message={request.message}
      cancelLabel={request.cancelLabel}
      confirmLabel={request.confirmLabel}
      destructive={request.destructive}
      icon={request.icon}
      onCancel={close}
      onConfirm={handleConfirm}
    />
  ) : null;

  return { ask, dialog, open, close };
}
