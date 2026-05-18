import { createContext, useContext } from 'react';
import type { ReactNode } from 'react';

export interface ToastContextType {
  showToast: (message: ReactNode, type?: 'info' | 'success' | 'warning' | 'error', duration?: number) => void;
}

export const ToastContext = createContext<ToastContextType | null>(null);

export function useToast(): ToastContextType {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
}
