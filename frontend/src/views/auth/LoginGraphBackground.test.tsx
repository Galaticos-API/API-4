// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { AuthScreen } from "./AuthView";

vi.mock("../../viewmodels/useAuthViewModel", () => ({
  useAuth: () => ({ login: vi.fn(), register: vi.fn(), notice: null }),
}));

vi.mock("../../models/navigation", () => ({
  navigate: vi.fn(),
  safeDestination: vi.fn(),
  loginDestination: vi.fn(),
}));

type RafCallback = FrameRequestCallback;

function createMediaQueryList(initialMatch: boolean) {
  let matches = initialMatch;
  const listeners = new Set<(event: MediaQueryListEvent) => void>();
  const query = {
    media: "(prefers-reduced-motion: reduce)",
    get matches() { return matches; },
    onchange: null,
    addEventListener: vi.fn((type: string, listener: EventListenerOrEventListenerObject) => {
      if (type === "change") listeners.add(listener as (event: MediaQueryListEvent) => void);
    }),
    removeEventListener: vi.fn((type: string, listener: EventListenerOrEventListenerObject) => {
      if (type === "change") listeners.delete(listener as (event: MediaQueryListEvent) => void);
    }),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatch(nextMatch: boolean) {
      matches = nextMatch;
      const event = { matches, media: query.media } as MediaQueryListEvent;
      listeners.forEach(listener => listener(event));
    },
  };
  return query;
}

function createCanvasContext() {
  const gradient = { addColorStop: vi.fn() };
  return {
    clearRect: vi.fn(),
    setTransform: vi.fn(),
    createRadialGradient: vi.fn(() => gradient),
    beginPath: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 1,
    shadowColor: "",
    shadowBlur: 0,
  } as unknown as CanvasRenderingContext2D;
}

describe("fundo animado da autenticação", () => {
  let mediaQuery: ReturnType<typeof createMediaQueryList>;
  let context: CanvasRenderingContext2D;
  let rafQueue: Map<number, RafCallback>;
  let nextRafId: number;
  let addWindowListener: ReturnType<typeof vi.spyOn>;
  let removeWindowListener: ReturnType<typeof vi.spyOn>;
  let addDocumentListener: ReturnType<typeof vi.spyOn>;
  let removeDocumentListener: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    mediaQuery = createMediaQueryList(false);
    context = createCanvasContext();
    rafQueue = new Map();
    nextRafId = 0;
    Object.defineProperty(window, "devicePixelRatio", { configurable: true, value: 1 });

    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      writable: true,
      value: vi.fn(() => mediaQuery as unknown as MediaQueryList),
    });
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(context);
    vi.spyOn(HTMLCanvasElement.prototype, "getBoundingClientRect").mockImplementation(() => ({
      x: 0, y: 0, top: 0, left: 0, right: 800, bottom: 600, width: 800, height: 600,
      toJSON: () => ({}),
    } as DOMRect));

    vi.spyOn(window, "requestAnimationFrame").mockImplementation(callback => {
      const id = ++nextRafId;
      rafQueue.set(id, callback);
      return id;
    });
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation(id => {
      rafQueue.delete(id);
    });

    addWindowListener = vi.spyOn(window, "addEventListener");
    removeWindowListener = vi.spyOn(window, "removeEventListener");
    addDocumentListener = vi.spyOn(document, "addEventListener");
    removeDocumentListener = vi.spyOn(document, "removeEventListener");
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  const mount = (initialMode: "login" | "register" = "login") =>
    render(<AuthScreen initialMode={initialMode} />);

  it("renders a static frame without a continuous RAF loop when reduced motion is initially enabled", () => {
    mediaQuery = createMediaQueryList(true);
    vi.mocked(window.matchMedia).mockReturnValue(mediaQuery as unknown as MediaQueryList);

    mount();

    expect(context.clearRect).toHaveBeenCalledTimes(1);
    expect(window.requestAnimationFrame).not.toHaveBeenCalled();
    expect(rafQueue.size).toBe(0);
  });

  it("starts, pauses, and resumes animation as the motion preference changes", () => {
    mount();
    expect(rafQueue.size).toBe(1);

    act(() => mediaQuery.dispatch(true));
    expect(rafQueue.size).toBe(0);

    act(() => mediaQuery.dispatch(false));
    expect(rafQueue.size).toBe(1);
    expect(mediaQuery.addEventListener).toHaveBeenCalledWith("change", expect.any(Function));
  });

  it("pauses while the document is hidden and resumes when it becomes visible", () => {
    mount();
    expect(rafQueue.size).toBe(1);

    Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
    act(() => document.dispatchEvent(new Event("visibilitychange")));
    expect(rafQueue.size).toBe(0);

    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
    act(() => document.dispatchEvent(new Event("visibilitychange")));
    expect(rafQueue.size).toBe(1);
  });

  it("resizes the backing canvas and reapplies the pixel-ratio transform", () => {
    Object.defineProperty(window, "devicePixelRatio", { configurable: true, value: 2 });
    const bounds = { width: 1024, height: 768 };
    vi.spyOn(HTMLCanvasElement.prototype, "getBoundingClientRect").mockImplementation(() => ({
      x: 0, y: 0, top: 0, left: 0, right: bounds.width, bottom: bounds.height,
      width: bounds.width, height: bounds.height, toJSON: () => ({}),
    } as DOMRect));
    mount();
    const canvas = document.querySelector("canvas")!;
    expect(canvas.width).toBe(2048);
    expect(canvas.height).toBe(1536);

    bounds.width = 640;
    bounds.height = 360;
    act(() => window.dispatchEvent(new Event("resize")));

    expect(canvas.width).toBe(1280);
    expect(canvas.height).toBe(720);
    expect(context.setTransform).toHaveBeenLastCalledWith(2, 0, 0, 2, 0, 0);
  });

  it("cancels pending RAF and removes registered listeners on unmount", () => {
    const { unmount } = mount();
    expect(rafQueue.size).toBe(1);
    const relevantEvents = new Set(["resize", "mousemove", "mouseleave"]);
    const windowCalls = addWindowListener.mock.calls as unknown as Array<[
      string,
      EventListenerOrEventListenerObject,
      boolean | AddEventListenerOptions | undefined,
    ]>;
    const documentCalls = addDocumentListener.mock.calls as unknown as Array<[
      string,
      EventListenerOrEventListenerObject,
      boolean | AddEventListenerOptions | undefined,
    ]>;
    const windowAdds = windowCalls.filter(([type]) => relevantEvents.has(type));
    const documentAdds = documentCalls.filter(([type]) => type === "visibilitychange");

    unmount();

    expect(rafQueue.size).toBe(0);
    expect(window.cancelAnimationFrame).toHaveBeenCalledWith(expect.any(Number));
    for (const [type, listener] of windowAdds) {
      expect(removeWindowListener.mock.calls).toContainEqual([type, listener]);
    }
    for (const [type, listener] of documentAdds) {
      expect(removeDocumentListener.mock.calls).toContainEqual([type, listener]);
    }
    expect(mediaQuery.removeEventListener).toHaveBeenCalledWith("change", expect.any(Function));
  });

  it.each([
    ["login" as const, "Entre na sua conta", "E-mail"],
    ["register" as const, "Criar nova conta", "Nome Completo"],
  ])("keeps the %s form usable with the decorative canvas", (mode, heading, field) => {
    mount(mode);

    expect(screen.getByRole("heading", { name: heading })).toBeTruthy();
    expect(screen.getByLabelText(field)).toBeTruthy();
    expect(screen.queryByRole("img", { hidden: true })).toBeNull();
    expect(document.querySelector("canvas")).toHaveAttribute("aria-hidden", "true");
  });
});
