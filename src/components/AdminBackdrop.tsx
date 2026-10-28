"use client";
import { useLayoutEffect, useRef } from "react";

/** Settings share one header boundary; section content must never move the backdrop. */
export function AdminBackdrop() {
  const marker = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const main = marker.current?.closest<HTMLElement>(".admin-main");
    if (!main) return;
    let frame = 0;
    const measure = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const target =
          main.querySelector(".settings-workspace-heading p") ??
          main.querySelector(".account-editor > p") ??
          main.querySelector(".settings-category-heading p") ??
          main.querySelector(".admin-page-head p") ??
          main.querySelector(".admin-topbar");
        if (!target) return;
        const end = Math.max(
          0,
          target.getBoundingClientRect().bottom - main.getBoundingClientRect().top + 16,
        );
        main.style.setProperty("--admin-intro-height", `${Math.round(end)}px`);
      });
    };
    const resize = new ResizeObserver(measure);
    resize.observe(main);
    const mutations = new MutationObserver(measure);
    mutations.observe(main, { childList: true, subtree: true, characterData: true });
    measure();
    return () => {
      cancelAnimationFrame(frame);
      resize.disconnect();
      mutations.disconnect();
    };
  }, []);
  return <span ref={marker} hidden />;
}
