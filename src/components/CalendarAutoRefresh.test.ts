// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
const router = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
import { CalendarAutoRefresh } from "./CalendarAutoRefresh";
let root: Root;
let host: HTMLDivElement;
beforeEach(async () => {
  vi.useFakeTimers();
  router.refresh.mockClear();
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    value: "visible",
  });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root.render(createElement(CalendarAutoRefresh)));
});
afterEach(async () => {
  await act(async () => root.unmount());
  document.body.replaceChildren();
  vi.useRealTimers();
});
it("refreshes every 30 seconds and stops on unmount", async () => {
  await act(async () => vi.advanceTimersByTime(29_999));
  expect(router.refresh).not.toHaveBeenCalled();
  await act(async () => vi.advanceTimersByTime(1));
  expect(router.refresh).toHaveBeenCalledTimes(1);
  await act(async () => root.render(null));
  await act(async () => vi.advanceTimersByTime(30_000));
  expect(router.refresh).toHaveBeenCalledTimes(1);
});
it("pauses in a hidden tab and refreshes once when returning", async () => {
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    value: "hidden",
  });
  await act(async () => vi.advanceTimersByTime(30_000));
  expect(router.refresh).not.toHaveBeenCalled();
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    value: "visible",
  });
  await act(async () => {
    document.dispatchEvent(new Event("visibilitychange"));
    window.dispatchEvent(new Event("focus"));
  });
  expect(router.refresh).toHaveBeenCalledTimes(1);
});
it("leaves an open appointment dialog undisturbed", async () => {
  const dialog = document.createElement("dialog");
  dialog.setAttribute("open", "");
  document.body.append(dialog);
  await act(async () => vi.advanceTimersByTime(30_000));
  expect(router.refresh).not.toHaveBeenCalled();
  dialog.remove();
  await act(async () => vi.advanceTimersByTime(30_000));
  expect(router.refresh).toHaveBeenCalledTimes(1);
});
