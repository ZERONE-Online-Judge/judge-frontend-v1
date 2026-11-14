const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<body></body>', { pretendToBeVisual: true });
global.window = dom.window;
global.document = dom.window.document;
global.IS_REACT_ACT_ENVIRONMENT = true;
const React = require('react');
const { createRoot } = require('react-dom/client');
const cache = new Map();
function source(name) {
  const filename = path.resolve(
    __dirname,
    '../src/components/presentation',
    name,
  );
  if (cache.has(filename)) return cache.get(filename).exports;
  const mod = new Module(filename, module);
  mod.filename = filename;
  mod.paths = Module._nodeModulePaths(path.dirname(filename));
  mod.require = (id) =>
    id.endsWith('.css')
      ? {}
      : id.startsWith('./')
        ? source(id.slice(2) + '.ts')
        : require(id);
  cache.set(filename, mod);
  mod._compile(
    ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
      fileName: filename,
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.CommonJS,
        jsx: ts.JsxEmit.ReactJSX,
      },
    }).outputText,
    filename,
  );
  return mod.exports;
}
const { fitPresentationTitleSize } = source('usePresentationTitleFit.ts');
const Header = source('PresentationStageHeader.tsx').default;

test('font fitting finds the largest measured size with bounded layout work', () => {
  let measures = 0;
  const fit = fitPresentationTitleSize({
    minimum: 12,
    maximum: 240,
    fits(size) {
      measures++;
      return size <= 37.45;
    },
  });
  assert.equal(fit.fits, true);
  assert.ok(fit.size <= 37.45 && fit.size >= 37.3);
  assert.ok(measures <= 14);
  assert.deepEqual(
    fitPresentationTitleSize({ minimum: 12, maximum: 80, fits: () => false }),
    { size: 12, fits: false },
  );
  assert.deepEqual(
    fitPresentationTitleSize({ minimum: 12, maximum: 80, fits: () => true }),
    { size: 80, fits: true },
  );
});

test('header refits on frame, scale and font changes and releases every observer', async () => {
  const metrics = {
    width: 1200,
    height: 104,
    requested: 80,
    characterWidth: 20,
  };
  const observers = [];
  const frames = new Map();
  const fontListeners = new Set();
  let nextFrame = 0;
  let resolveFonts;
  const fontsReady = new Promise((resolve) => {
    resolveFonts = resolve;
  });
  Object.defineProperty(document, 'fonts', {
    configurable: true,
    value: {
      ready: fontsReady,
      addEventListener: (_, listener) => fontListeners.add(listener),
      removeEventListener: (_, listener) => fontListeners.delete(listener),
    },
  });
  window.ResizeObserver = class {
    constructor(callback) {
      this.callback = callback;
      this.targets = [];
      observers.push(this);
    }
    observe(element) {
      this.targets.push(element);
    }
    disconnect() {
      this.disconnected = true;
    }
  };
  window.requestAnimationFrame = (callback) => {
    const id = ++nextFrame;
    frames.set(id, callback);
    return id;
  };
  window.cancelAnimationFrame = (id) => frames.delete(id);
  const nativeStyle = window.getComputedStyle.bind(window);
  window.getComputedStyle = (element) => {
    if (element.classList.contains('presentation-title-fit-probe'))
      return { fontSize: `${metrics.requested}px` };
    if (element.classList.contains('presentation-title-frame'))
      return { getPropertyValue: () => '12' };
    if (element.tagName === 'H1')
      return {
        lineHeight: `${parseFloat(element.style.fontSize)}px`,
        rowGap: '4px',
      };
    return nativeStyle(element);
  };
  for (const [property, getter] of Object.entries({
    clientWidth() {
      return this.classList.contains('presentation-title-frame')
        ? metrics.width
        : 0;
    },
    clientHeight() {
      return this.classList.contains('presentation-title-frame')
        ? metrics.height
        : 0;
    },
    scrollWidth() {
      return this.tagName === 'H1'
        ? parseFloat(this.style.fontSize) * metrics.characterWidth
        : 0;
    },
    scrollHeight() {
      return this.tagName === 'H1'
        ? parseFloat(this.style.fontSize) * 2.2 + 4
        : 0;
    },
  }))
    Object.defineProperty(window.HTMLElement.prototype, property, {
      configurable: true,
      get: getter,
    });
  window.HTMLElement.prototype.getBoundingClientRect = function () {
    return {
      height:
        this.tagName === 'H1' ? parseFloat(this.style.fontSize) * 2 + 4 : 0,
    };
  };
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const title = '2026 ZOAC';
  const render = (beforeStart = false) =>
    React.act(() =>
      root.render(
        React.createElement(Header, {
          title,
          beforeStart,
          ended: false,
          timing: [],
        }),
      ),
    );
  const flush = () =>
    React.act(() => {
      const pending = [...frames.values()];
      frames.clear();
      pending.forEach((callback) => callback());
    });
  await render();
  const heading = host.querySelector('h1');
  const size = () => parseFloat(heading.style.fontSize);
  assert.ok(
    size() > 45.7 && size() <= 46,
    'Glyph overflow beyond a tight line box must not be mistaken for an extra line',
  );
  assert.equal(
    host.querySelector('.presentation-title-frame').dataset.titleLayout,
    'flow',
  );
  assert.equal(heading.textContent, title);
  assert.equal(heading.title, title);
  assert.equal(heading.getAttribute('aria-label'), title);
  assert.equal(
    observers[0].targets.length,
    2,
    'Only the reserved frame and independent font probe are observed',
  );
  metrics.width = 600;
  for (let index = 0; index < 100; index++) observers[0].callback();
  assert.equal(frames.size, 1, 'Resize bursts coalesce into one frame');
  await flush();
  assert.ok(size() > 29.8 && size() <= 30);
  assert.equal(frames.size, 0, 'Fitting does not schedule its own resize loop');
  metrics.width = 1200;
  metrics.height = 204;
  metrics.requested = 240;
  observers[0].callback();
  await flush();
  assert.ok(
    size() > 59.8 && size() <= 60,
    'Scale changes respect the fixed reserved height and actual width',
  );
  metrics.characterWidth = 40;
  fontListeners.forEach((listener) => listener());
  await flush();
  assert.ok(
    size() > 29.8 && size() <= 30,
    'Loaded fonts trigger a new width measurement',
  );
  await render(true);
  assert.equal(observers[0].disconnected, true);
  assert.equal(fontListeners.size, 1);
  observers[1].callback();
  await React.act(() => root.unmount());
  assert.equal(observers[1].disconnected, true);
  assert.equal(frames.size, 0);
  assert.equal(fontListeners.size, 0);
  resolveFonts();
  await Promise.resolve();
  assert.equal(
    frames.size,
    0,
    'A late fonts.ready cannot schedule work after unmount',
  );
  host.remove();
  dom.window.close();
});
