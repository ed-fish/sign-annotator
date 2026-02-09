import { useEffect, useRef, type ReactNode } from 'react';

interface DialogShellProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}

export function DialogShell({ title, onClose, children, wide }: DialogShellProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = `dialog-title-${title.replace(/\s+/g, '-').toLowerCase()}`;

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [onClose]);

  // Focus trap
  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    const focusable = el.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    if (focusable.length > 0) focusable[0].focus();

    const handleTab = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last?.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first?.focus();
      }
    };
    el.addEventListener('keydown', handleTab);
    return () => el.removeEventListener('keydown', handleTab);
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div
        ref={dialogRef}
        className={`relative bg-surface-1 border border-surface-3 rounded-lg shadow-2xl flex flex-col max-h-[80vh] ${
          wide ? 'w-[640px]' : 'w-[480px]'
        }`}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-surface-3">
          <h2 id={titleId} className="text-base font-semibold text-zinc-200">{title}</h2>
          <button
            onClick={onClose}
            aria-label="Close dialog"
            className="text-zinc-400 hover:text-zinc-200 transition-colors"
          >
            ✕
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">{children}</div>
      </div>
    </div>
  );
}
