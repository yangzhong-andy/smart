"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import ConfirmDialog from "@/components/ConfirmDialog";

type ConfirmType = "danger" | "warning" | "info";

type ConfirmOptions = {
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  type?: ConfirmType;
};

export function useSystemConfirm() {
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<ConfirmOptions>({
    message: "",
    type: "warning",
  });
  const resolverRef = useRef<((ok: boolean) => void) | null>(null);

  const confirm = useCallback((next: ConfirmOptions) => {
    setOptions({
      title: next.title,
      message: next.message,
      confirmText: next.confirmText,
      cancelText: next.cancelText,
      type: next.type ?? "warning",
    });
    setOpen(true);
    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve;
    });
  }, []);

  const closeWith = useCallback((ok: boolean) => {
    setOpen(false);
    const resolve = resolverRef.current;
    resolverRef.current = null;
    resolve?.(ok);
  }, []);

  const dialog = useMemo(
    () => (
      <ConfirmDialog
        open={open}
        title={options.title}
        message={options.message}
        confirmText={options.confirmText}
        cancelText={options.cancelText}
        type={options.type}
        onConfirm={() => closeWith(true)}
        onCancel={() => closeWith(false)}
      />
    ),
    [open, options, closeWith]
  );

  return { confirm, confirmDialog: dialog };
}

