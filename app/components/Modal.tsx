'use client';

import { useEffect } from 'react';
import styles from './Modal.module.scss';

export function Modal({
  open,
  title,
  children,
  onClose,
}: {
  open: boolean;
  title?: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className={styles.overlay} role="dialog" aria-modal="true">
      <button className={styles.backdrop} aria-label="Close" onClick={onClose} />
      <div className={styles.modal}>
        {title ? <div className={styles.title}>{title}</div> : null}
        <div>{children}</div>
      </div>
    </div>
  );
}
