import { type ReactNode, useCallback, useState } from "react";
import { ToastContext, type ToastContextType } from "./use-toast.js";

interface Toast {
  id: string;
  message: ReactNode;
  type: "info" | "success" | "warning" | "error";
  duration?: number;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const showToast = useCallback(
    (message: ReactNode, type: Toast["type"] = "info", duration: number = 3000) => {
      const id =
        typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : Math.random().toString(36).slice(2);
      const toast: Toast = { id, message, type, duration };

      setToasts((prev) => [...prev, toast]);

      if (duration > 0) {
        setTimeout(() => {
          setToasts((prev) => prev.filter((t) => t.id !== id));
        }, duration);
      }
    },
    [],
  );

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const getToastStyles = (type: Toast["type"]): string => {
    const styles: Record<Toast["type"], string> = {
      info: "bg-blue-500 text-white",
      success: "bg-emerald-500 text-white",
      warning: "bg-amber-500 text-white",
      error: "bg-red-500 text-white",
    };
    return styles[type];
  };

  const getToastIcon = (type: Toast["type"]): string => {
    const icons: Record<Toast["type"], string> = {
      info: "info",
      success: "check_circle",
      warning: "warning",
      error: "error",
    };
    return icons[type];
  };

  const value: ToastContextType = { showToast };

  return (
    <ToastContext.Provider value={value}>
      {children}

      <div className="fixed bottom-20 right-4 z-[100] flex flex-col gap-2">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`${getToastStyles(toast.type)} px-4 py-3 rounded-lg shadow-lg flex items-center gap-2 min-w-64 max-w-md animate-in slide-in-from-right`}
          >
            <span className="material-symbols-outlined text-lg">{getToastIcon(toast.type)}</span>
            <span className="flex-1 text-sm">{toast.message}</span>
            <button
              type="button"
              onClick={() => removeToast(toast.id)}
              className="text-white/80 hover:text-white transition-colors"
            >
              <span className="material-symbols-outlined text-lg">close</span>
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
