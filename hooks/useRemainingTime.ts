import { useEffect, useState } from "react";

export function useRemainingTime(endTime: number, isRunning: number) {
  const [label, setLabel] = useState("00:00");
  const [isOver, setIsOver] = useState(false);

  useEffect(() => {
    let interval: NodeJS.Timeout;

    const updateLabel = () => {
      const now = Date.now();
      const remaining = isRunning === 2 ? endTime : endTime - now;
      const over = remaining < 0;
      const abs = Math.abs(remaining);

      const minutes = Math.floor(abs / 1000 / 60)
        .toString()
        .padStart(2, "0");
      const seconds = Math.floor((abs / 1000) % 60)
        .toString()
        .padStart(2, "0");

      setLabel(`${over ? "-" : ""}${minutes}:${seconds}`);
      setIsOver(over);
    };

    updateLabel(); // 💡 즉시 계산

    if (isRunning === 1) {
      interval = setInterval(updateLabel, 1000);
    }

    if (isRunning === 0) {
      setLabel("00:00");
      setIsOver(false);
    }

    return () => {
      clearInterval(interval);
    };
  }, [endTime, isRunning]);

  const color: "black" | "blue" | "red" =
    isRunning === 1 ? (isOver ? "red" : "blue") : "black";

  return { label, isOver, color };
}
