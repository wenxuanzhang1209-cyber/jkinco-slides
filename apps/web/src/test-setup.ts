import '@testing-library/jest-dom/vitest';

// Node ≥22 defines a stubbed `localStorage`/`sessionStorage` on globalThis,
// which makes vitest skip copying the real jsdom storage. Bridge it manually.
const jsdomWindow = (globalThis as { jsdom?: { window?: Window } }).jsdom?.window as (Window & typeof globalThis) | undefined;
if (jsdomWindow && typeof jsdomWindow.localStorage === 'object') {
  const bridge = (name: 'localStorage' | 'sessionStorage') => {
    Object.defineProperty(globalThis, name, {
      get: () => jsdomWindow[name],
      configurable: true,
    });
  };
  bridge('localStorage');
  bridge('sessionStorage');
}

// jsdom lacks these browser APIs used by the editor.
if (!window.matchMedia) {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => undefined,
    removeListener: () => undefined,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    dispatchEvent: () => false,
  })) as never;
}

if (!window.ResizeObserver) {
  window.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as never;
}

if (!('structuredClone' in window)) {
  (window as unknown as { structuredClone: typeof structuredClone }).structuredClone = (obj: unknown) =>
    JSON.parse(JSON.stringify(obj));
}

if (!window.PointerEvent) {
  window.PointerEvent = MouseEvent as never;
}

// Deterministic-ish clipboard mock for tests
Object.defineProperty(window.navigator, 'clipboard', {
  value: {
    writeText: (t: string) => Promise.resolve(t),
    readText: () => Promise.resolve(''),
  },
  configurable: true,
});

// SVG rendering of ECharts is async; tests don't need real charts.
window.HTMLCanvasElement.prototype.getContext = (() => null) as never;
