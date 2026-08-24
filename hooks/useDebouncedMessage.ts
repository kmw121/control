import { useState, useRef, useCallback } from "react";

export function useDebouncedMessage(delay: number = 2000) {
  const [message, setMessage] = useState<string | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showMessage = useCallback(
    (text: string) => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      setMessage(text);

      timeoutRef.current = setTimeout(() => {
        setMessage(null);
        timeoutRef.current = null;
      }, delay);
    },
    [delay]
  );

  return { message, showMessage };
}
