import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

const ToastContext = createContext(null);
const ConfirmContext = createContext(null);

let nextToastId = 1;

// Short status messages after an action, plus a styled replacement for
// window.confirm. Both are provided once at the app root.
export function FeedbackProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const [request, setRequest] = useState(null);

  const dismiss = useCallback((id) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const show = useCallback(
    (tone, message) => {
      const id = nextToastId++;
      setToasts((current) => [...current.slice(-3), { id, tone, message }]);
      window.setTimeout(() => dismiss(id), tone === 'error' ? 7000 : 4000);
    },
    [dismiss],
  );

  const toastRef = useRef(null);
  if (!toastRef.current) {
    toastRef.current = {
      success: (message) => show('success', message),
      error: (message) => show('error', message),
      info: (message) => show('info', message),
    };
  }

  const confirm = useCallback(
    (options) => new Promise((resolve) => setRequest({ ...options, resolve })),
    [],
  );

  function settle(result) {
    request?.resolve(result);
    setRequest(null);
  }

  return (
    <ToastContext.Provider value={toastRef.current}>
      <ConfirmContext.Provider value={confirm}>
        {children}
        <div className="toast-stack" aria-live="polite" aria-atomic="false">
          {toasts.map((toast) => (
            <div key={toast.id} className={`toast toast-${toast.tone}`} role="status">
              <span className="toast-icon" aria-hidden="true">
                {toast.tone === 'success' ? '✓' : toast.tone === 'error' ? '!' : 'i'}
              </span>
              <span className="toast-message">{toast.message}</span>
              <button type="button" aria-label="Dismiss" onClick={() => dismiss(toast.id)}>
                ×
              </button>
            </div>
          ))}
        </div>
        {request ? <ConfirmDialog request={request} onSettle={settle} /> : null}
      </ConfirmContext.Provider>
    </ToastContext.Provider>
  );
}

function ConfirmDialog({ request, onSettle }) {
  const cancelRef = useRef(null);
  const danger = request.tone === 'danger';

  useEffect(() => {
    cancelRef.current?.focus();
    const onKeyDown = (event) => {
      if (event.key === 'Escape') onSettle(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onSettle]);

  return (
    <div className="confirm-backdrop" onMouseDown={() => onSettle(false)}>
      <section
        className="confirm-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        aria-describedby="confirm-message"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <span className={`confirm-icon ${danger ? 'is-danger' : ''}`} aria-hidden="true">
          {danger ? '!' : '?'}
        </span>
        <h2 id="confirm-title">{request.title}</h2>
        {request.message ? <p id="confirm-message">{request.message}</p> : null}
        <div className="confirm-actions">
          <button
            ref={cancelRef}
            type="button"
            className="ui-button ui-button-secondary"
            onClick={() => onSettle(false)}
          >
            {request.cancelLabel || 'Cancel'}
          </button>
          <button
            type="button"
            className={`ui-button ${danger ? 'ui-button-danger confirm-danger' : 'ui-button-primary'}`}
            onClick={() => onSettle(true)}
          >
            {request.confirmLabel || 'Confirm'}
          </button>
        </div>
      </section>
    </div>
  );
}

export function useToast() {
  return useContext(ToastContext);
}

// Resolves to true when the user confirms. Options: title, message,
// confirmLabel, cancelLabel and tone ('danger' for destructive actions).
export function useConfirm() {
  return useContext(ConfirmContext);
}

// Reads the API's error message, falling back to a page-specific one.
export function apiErrorMessage(error, fallback) {
  return error?.response?.data?.error?.message || fallback;
}
