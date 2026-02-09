import { useUiStore } from '../../stores/ui-store';

export function ToastContainer() {
  const toasts = useUiStore((s) => s.toasts);
  const removeToast = useUiStore((s) => s.removeToast);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-16 right-4 z-50 flex flex-col gap-2">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg shadow-lg text-sm transition-all
            ${toast.type === 'success' ? 'bg-green-900/90 text-green-200 border border-green-800' : ''}
            ${toast.type === 'error' ? 'bg-red-900/90 text-red-200 border border-red-800' : ''}
            ${toast.type === 'info' ? 'bg-zinc-800/90 text-zinc-200 border border-zinc-700' : ''}
          `}
        >
          <span
            className="cursor-pointer flex-1"
            onClick={() => removeToast(toast.id)}
          >
            {toast.message}
          </span>
          {toast.action && (
            <button
              onClick={() => {
                toast.action!.callback();
                removeToast(toast.id);
              }}
              className="text-xs font-medium text-accent hover:text-accent-hover underline underline-offset-2 shrink-0 ml-2"
            >
              {toast.action.label}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
