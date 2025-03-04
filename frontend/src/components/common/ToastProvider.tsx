import React, { createContext, useContext } from 'react';
import { useToast, ToastType } from '../../hooks/useToast';
import ToastContainer from './ToastContainer';

interface ToastContextType {
  showToast: (message: string, type?: ToastType) => number;
  dismissToast: (id: number) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export const useToastContext = () => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToastContext must be used within a ToastProvider');
  }
  return context;
};

interface ToastProviderProps {
  children: React.ReactNode;
}

export const ToastProvider: React.FC<ToastProviderProps> = ({ children }) => {
  const { toasts, showToast, dismissToast } = useToast();
  
  return (
    <ToastContext.Provider value={{ showToast, dismissToast }}>
      {children}
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </ToastContext.Provider>
  );
};