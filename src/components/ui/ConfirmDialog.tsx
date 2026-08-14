'use client';

import { useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Button } from './Button';

interface ConfirmDialogProps {
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}

// In-app replacement for window.confirm() (DR-109) -- a native browser
// dialog reads as broken/untrustworthy in a polished product UI. Same
// centered-overlay shape as gallery-grid.tsx's image lightbox (Escape and a
// backdrop click both cancel; a click inside the panel itself is stopped
// from bubbling to the backdrop).
export function ConfirmDialog({ message, confirmLabel, cancelLabel, onConfirm, onCancel }: ConfirmDialogProps) {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onCancel();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onCancel]);

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-50 flex items-center justify-center bg-ink/80 p-6"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onCancel}
        role="alertdialog"
        aria-modal="true"
        aria-label={message}
      >
        <motion.div
          className="w-full max-w-sm rounded-card bg-bone p-6 shadow-lift"
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.96 }}
          onClick={(event) => event.stopPropagation()}
        >
          <p className="text-sm text-ink">{message}</p>
          <div className="mt-5 flex justify-end gap-3">
            <Button type="button" variant="secondary" size="compact" onClick={onCancel}>
              {cancelLabel}
            </Button>
            <Button type="button" variant="primary" size="compact" onClick={onConfirm} autoFocus>
              {confirmLabel}
            </Button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
