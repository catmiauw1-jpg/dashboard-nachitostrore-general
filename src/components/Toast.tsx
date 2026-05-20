import { useEffect, useState } from "react";

interface ToastProps {
  message: string;
  onDone: () => void;
}

export function Toast({ message, onDone }: ToastProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!message) return;

    setVisible(true);
    const timer = window.setTimeout(() => {
      setVisible(false);
      onDone();
    }, 3200);

    return () => window.clearTimeout(timer);
  }, [message, onDone]);

  const closeToast = () => {
    setVisible(false);
    onDone();
  };

  if (!message) return null;

  return (
    <div className={`toast ${visible ? "show" : ""}`} role="status">
      <span>{message}</span>
      <button aria-label="Cerrar notificación" className="toast-close" onClick={closeToast} type="button">
        ×
      </button>
    </div>
  );
}
