'use client';

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

type ToastType = 'info' | 'success' | 'warning' | 'error';

export interface ToastOptions {
  message: string;
  type?: ToastType;
  durationMs?: number; // 0 disables auto-dismiss
  actionLabel?: string;
  onAction?: () => void;
  scrollToId?: string; // scroll to element with this id on click
  dismissOnClick?: boolean; // allow card click to dismiss (default true)
  onDismiss?: () => void;
}

export interface Toast extends Required<Omit<ToastOptions, 'durationMs' | 'type'>> {
  id: string;
  type: ToastType;
  durationMs: number;
  closing?: boolean;
}

interface ToastContextValue {
  showToast: (options: ToastOptions) => string;
  dismissToast: (id: string) => void;
  clearToasts: () => void;
  toasts: Toast[];
}

const ToastContext = createContext<ToastContextValue | null>(null);

const DEFAULT_DURATION = 5000;
const WARNING_DURATION = 8000;

export const ToastProvider = ({ children }: { children: React.ReactNode }) => {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const finalizeDismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => {
      const target = prev.find((t) => t.id === id);
      if (target) {
        target.onDismiss?.();
      }
      return prev.map((toast) =>
        toast.id === id ? { ...toast, closing: true } : toast
      );
    });
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
    // allow exit animation before removal
    setTimeout(() => finalizeDismiss(id), 180);
  }, [finalizeDismiss]);

  const showToast = useCallback((options: ToastOptions): string => {
    const id = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2);
    const type = options.type ?? 'info';
    const durationMs =
      options.durationMs ??
      (type === 'warning' ? WARNING_DURATION : DEFAULT_DURATION);

    const newToast: Toast = {
      id,
      message: options.message,
      type,
      durationMs,
      actionLabel: options.actionLabel ?? '',
      onAction: options.onAction ?? (() => {}),
      scrollToId: options.scrollToId ?? '',
      dismissOnClick: options.dismissOnClick ?? true,
      onDismiss: options.onDismiss ?? (() => {})
    };

    setToasts((prev) => [...prev, newToast]); // FIFO stacking from top

    if (durationMs > 0) {
      const timer = setTimeout(() => dismissToast(id), durationMs);
      timers.current.set(id, timer);
    }

    return id;
  }, [dismissToast]);

  const clearToasts = useCallback(() => {
    timers.current.forEach((timer) => clearTimeout(timer));
    timers.current.clear();
    setToasts([]);
  }, []);

  useEffect(() => {
    return () => {
      timers.current.forEach((timer) => clearTimeout(timer));
      timers.current.clear();
    };
  }, []);

  const value = useMemo<ToastContextValue>(() => ({
    showToast,
    dismissToast,
    clearToasts,
    toasts
  }), [showToast, dismissToast, clearToasts, toasts]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastViewport />
    </ToastContext.Provider>
  );
};

export const useToast = (): ToastContextValue => {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return ctx;
};

const ToastViewport = () => {
  const { toasts, dismissToast } = useToast();

  const handleClick = (toast: Toast) => {
    if (toast.dismissOnClick === false) return;
    if (toast.scrollToId) {
      const target = document.getElementById(toast.scrollToId);
      if (target) {
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }
    dismissToast(toast.id);
  };

  const iconForType: Record<ToastType, string> = {
    info: 'ℹ️',
    success: '✅',
    warning: '⚠️',
    error: '❌'
  };

  const bgForType: Record<ToastType, string> = {
    info: 'bg-white border border-[var(--brand-blue)]/30',
    success: 'bg-white border border-[var(--brand-green)]/30',
    warning: 'bg-white border border-[var(--brand-gold)]/40',
    error: 'bg-white border border-[var(--brand-red)]/30'
  };

  const accentForType: Record<ToastType, string> = {
    info: 'text-[var(--brand-blue)]',
    success: 'text-[var(--brand-green)]',
    warning: 'text-[var(--brand-gold)]',
    error: 'text-[var(--brand-red)]'
  };

  return (
    <div className="fixed top-4 right-4 z-[9999] space-y-3 max-w-md w-[320px] toast-viewport">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`rounded-lg shadow-xl p-4 flex items-start gap-3 cursor-pointer transition-all duration-300 ${
            toast.closing ? 'toast-exit' : 'toast-enter'
          } ${bgForType[toast.type]}`}
          onClick={() => handleClick(toast)}
        >
          <div className={`text-xl ${accentForType[toast.type]}`}>
            {iconForType[toast.type]}
          </div>
          <div className="flex-1">
            <p className="text-sm text-gray-900">{toast.message}</p>
            {toast.actionLabel && toast.onAction && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  toast.onAction?.();
                  dismissToast(toast.id);
                }}
                className="mt-2 inline-flex items-center px-3 py-1 text-xs font-semibold text-white bg-[var(--brand-navy)] hover:bg-[var(--brand-navy)]/90 rounded transition-colors"
              >
                {toast.actionLabel}
              </button>
            )}
          </div>
          <button
            onClick={(e) => {
              e.stopPropagation();
              dismissToast(toast.id);
            }}
            className="text-gray-400 hover:text-gray-600"
            aria-label="Dismiss toast"
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
};

