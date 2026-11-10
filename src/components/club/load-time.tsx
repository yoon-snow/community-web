"use client";

import { useEffect, useState } from "react";

// Only shown on a directly opened measurement link. Uses the phone's own clock.
export function LoadTime({ screen }: { screen: string }) {
  const [seconds, setSeconds] = useState("");
  useEffect(() => {
    const navigation = performance.getEntriesByType("navigation")[0];
    if (!navigation || new URL(navigation.name).href !== location.href) return;
    const selectors: Record<string, string[]> = {
      "/": [".event-card.featured, .greeting + .card"],
      "/calendar": [".calendar-grid button"],
      "/admin": [".task-list", ".daily-guests .card"],
    };
    const targets = selectors[screen];
    const main = document.getElementById("main-content");
    if (!targets || !main) return;
    let frame = 0;
    const observe = () => {
      if (!targets.every((selector) => main.querySelector(selector))) return;
      observer.disconnect();
      frame = requestAnimationFrame(() => {
        setSeconds((performance.now() / 1000).toFixed(2));
      });
    };
    const observer = new MutationObserver(observe);
    observer.observe(main, { childList: true, subtree: true });
    observe();
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [screen]);
  return seconds ? (
    <p role="status" className="micro">
      화면 표시 시간 · {seconds}초
    </p>
  ) : null;
}
