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

  return <div className={`toast ${visible ? "show" : ""}`}>{message}</div>;
}
