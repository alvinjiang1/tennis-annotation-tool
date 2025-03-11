import { useState, useCallback, useEffect } from 'react';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

interface Toast {
  id: number;
  message: string;
  type: ToastType;
}

export const useToast = () => {
  const [toasts, setToasts] = useState<Toast[]>([]);
  
  // Auto-dismiss toasts after a delay
  useEffect(() => {
    if (toasts.length === 0) return;
    
    const timer = setTimeout(() => {
      setToasts(currentToasts => currentToasts.slice(1));
    }, 5000);
    
    return () => clearTimeout(timer);
  }, [toasts]);
  
  const showToast = useCallback((message: string, type: ToastType = 'info') => {
    const id = Date.now();
    setToasts(currentToasts => [...currentToasts, { id, message, type }]);
    return id;
  }, []);
  
  const dismissToast = useCallback((id: number) => {
    setToasts(currentToasts => currentToasts.filter(toast => toast.id !== id));
  }, []);
  
  return {
    toasts,
    showToast,
    dismissToast
  };
};