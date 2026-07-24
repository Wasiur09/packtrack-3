/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';

export type ToastType = 'success' | 'error' | 'info';

export interface ToastItem {
  id: string;
  msg: string;
  type: ToastType;
}

let toastListeners: Array<(toast: ToastItem) => void> = [];

export function emitToast(msg: string, type: ToastType = 'info') {
  const item: ToastItem = {
    id: Math.random().toString(36).substr(2, 9),
    msg,
    type
  };
  toastListeners.forEach(listener => listener(item));
}

export default function ToastContainer() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  useEffect(() => {
    const handleToast = (item: ToastItem) => {
      setToasts(prev => [...prev, item]);
      setTimeout(() => {
        setToasts(prev => prev.filter(t => t.id !== item.id));
      }, 4000);
    };

    toastListeners.push(handleToast);
    return () => {
      toastListeners = toastListeners.filter(l => l !== handleToast);
    };
  }, []);

  const titles = { success: 'Success', error: 'Error', info: 'Info' };
  const borderColors = {
    success: 'border-l-brand-green',
    error: 'border-l-brand-red',
    info: 'border-l-brand-blue'
  };

  return (
    <div className="fixed top-5 right-5 z-50 flex flex-col gap-2 max-w-sm pointer-events-none">
      {toasts.map(t => (
        <div
          key={t.id}
          className={`bg-surface border border-border border-l-4 ${borderColors[t.type]} p-4 rounded shadow-2xl transition-all duration-300 pointer-events-auto transform translate-y-0 opacity-100 flex flex-col`}
        >
          <div className="font-semibold text-text-main text-sm">{titles[t.type]}</div>
          <div className="text-text-muted text-xs mt-1">{t.msg}</div>
        </div>
      ))}
    </div>
  );
}
