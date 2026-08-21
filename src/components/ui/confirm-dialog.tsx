import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import {
  BottomSheetModal,
  BottomSheetView,
} from '@gorhom/bottom-sheet';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { SheetHandle, useSheetBackdrop } from '@/components/ui/sheet';
import { useTheme } from '@/theme/ThemeProvider';
import { BRAND_BLUE } from '@/theme/brand';

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
 *
 * Important: buttons only call `dismiss()`. Parent state is synced from
 * `onDismiss` so a late dismiss animation cannot clobber a subsequent open.
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
  const { colors } = useTheme();
  const ref = useRef<BottomSheetModal>(null);
  const renderBackdrop = useSheetBackdrop();

  /** Tracks what the next `onDismiss` should report to the parent. */
  const pendingRef = useRef<'none' | 'cancel' | 'confirm'>('none');
  /** Mirrors `visible` for dismiss handlers without stale closures. */
  const visibleRef = useRef(visible);
  visibleRef.current = visible;

  const onCancelRef = useRef(onCancel);
  const onConfirmRef = useRef(onConfirm);
  onCancelRef.current = onCancel;
  onConfirmRef.current = onConfirm;

  useEffect(() => {
    if (visible) {
      pendingRef.current = 'none';
      // Defer present so it runs after any in-flight dismiss from a prior close.
      const id = requestAnimationFrame(() => {
        ref.current?.present();
      });
      return () => cancelAnimationFrame(id);
    }
    ref.current?.dismiss();
  }, [visible]);

  const handleDismiss = useCallback(() => {
    const action = pendingRef.current;
    pendingRef.current = 'none';

    if (action === 'confirm') {
      onConfirmRef.current();
      return;
    }

    // Swipe / backdrop / cancel button / controlled `visible=false`.
    // Only notify parent when it still thinks we're open — prevents a late
    // dismiss from wiping a brand-new `ask()` that already set visible=true.
    if (action === 'cancel' || visibleRef.current) {
      onCancelRef.current();
    }
  }, []);

  const requestClose = useCallback((action: 'cancel' | 'confirm') => {
    pendingRef.current = action;
    ref.current?.dismiss();
  }, []);

  const resolvedIcon =
    icon || (destructive ? 'warning-outline' : 'help-circle-outline');

  return (
    <BottomSheetModal
      ref={ref}
      enableDynamicSizing
      enablePanDownToClose
      onDismiss={handleDismiss}
      backdropComponent={renderBackdrop}
      handleComponent={SheetHandle}
      backgroundStyle={{
        backgroundColor: colors.sheetBg,
        borderTopLeftRadius: 28,
        borderTopRightRadius: 28,
      }}
    >
      <BottomSheetView
        style={{
          paddingHorizontal: 20,
          paddingBottom: Math.max(insets.bottom, 16),
        }}
      >
        <View className="mb-4 items-center pt-1">
          <View
            className="mb-3 h-14 w-14 items-center justify-center rounded-2xl"
            style={{
              backgroundColor: destructive ? colors.dangerBg : colors.iconBg,
            }}
          >
            <Ionicons
              name={resolvedIcon}
              size={26}
              color={destructive ? colors.danger : BRAND_BLUE}
            />
          </View>
          <Text className="text-center text-[20px] font-black tracking-tight text-ink">
            {title}
          </Text>
          <Text className="mt-2 text-center text-[14px] leading-6 text-muted">
            {message}
          </Text>
        </View>

        <View className="gap-2.5">
          <Pressable
            onPress={() => requestClose('confirm')}
            className="rounded-2xl py-4"
            style={{ backgroundColor: destructive ? '#B4534B' : '#0548E8' }}
          >
            <Text
              numberOfLines={1}
              className="text-[15px] font-bold text-white"
              style={{ width: '100%', textAlign: 'center', flexShrink: 0 }}
            >
              {confirmLabel}
            </Text>
          </Pressable>
          <Pressable
            onPress={() => requestClose('cancel')}
            className="rounded-2xl border border-line bg-surface py-4"
          >
            <Text
              numberOfLines={1}
              className="text-[15px] font-semibold text-ink"
              style={{ width: '100%', textAlign: 'center', flexShrink: 0 }}
            >
              {cancelLabel}
            </Text>
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
  const [session, setSession] = useState<(ConfirmRequest & { id: number }) | null>(
    null,
  );
  const onConfirmRef = useRef<(() => void) | null>(null);
  const idRef = useRef(0);

  const ask = useCallback((opts: ConfirmRequest, onConfirm: () => void) => {
    onConfirmRef.current = onConfirm;
    idRef.current += 1;
    // New id remounts BottomSheetModal so present() always starts clean.
    setSession({ ...opts, id: idRef.current });
  }, []);

  const close = useCallback(() => {
    setSession(null);
    onConfirmRef.current = null;
  }, []);

  const handleConfirm = useCallback(() => {
    const fn = onConfirmRef.current;
    setSession(null);
    onConfirmRef.current = null;
    fn?.();
  }, []);

  const dialog = session ? (
    <ConfirmDialog
      key={session.id}
      visible
      title={session.title}
      message={session.message}
      cancelLabel={session.cancelLabel}
      confirmLabel={session.confirmLabel}
      destructive={session.destructive}
      icon={session.icon}
      onCancel={close}
      onConfirm={handleConfirm}
    />
  ) : null;

  return { ask, dialog, open: session != null, close };
}
