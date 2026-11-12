const { test, beforeEach, afterEach, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<body></body>', { url: 'https://judge.test/' });
global.window = dom.window;
global.document = dom.window.document;
global.IS_REACT_ACT_ENVIRONMENT = true;
const React = require('react');
const { act } = React;
const { createRoot } = require('react-dom/client');
const filename = path.resolve(
  __dirname,
  '../src/shared/hooks/useNavigationViewport.ts',
);
const loaded = new Module(filename, module);
loaded.filename = filename;
loaded.paths = Module._nodeModulePaths(path.dirname(filename));
loaded._compile(
  ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText,
  filename,
);
const useNavigationViewport = loaded.exports.default;
let root,
  top,
  parentTop,
  parentBottom,
  viewport,
  frames,
  observer,
  observations,
  disconnected;
let nextFrame = 0;
const variable = '--zoj-navigation-available-height';
function Menu({
  shown = true,
  name = 'first',
  gap = 16,
  bounded = false,
  sticky = false,
  minimumHeight = 0,
}) {
  const ref = useNavigationViewport(gap, bounded, minimumHeight);
  return shown
    ? React.createElement('aside', {
        key: name,
        ref,
        'data-name': name,
        style: sticky ? { position: 'sticky', top: '88px' } : undefined,
      })
    : null;
}
async function render(props = {}) {
  await act(async () => root.render(React.createElement(Menu, props)));
  return document.querySelector('aside');
}
function flush() {
  const pending = [...frames.values()];
  frames.clear();
  for (const callback of pending) callback(0);
}
beforeEach(() => {
  document.body.innerHTML =
    '<header class="site-header"></header><main></main>';
  top = 240;
  parentTop = 240;
  parentBottom = 1000;
  viewport = new dom.window.EventTarget();
  viewport.height = 600;
  viewport.offsetTop = 0;
  Object.defineProperty(window, 'visualViewport', {
    configurable: true,
    value: viewport,
  });
  Object.defineProperty(window, 'innerHeight', {
    configurable: true,
    value: 600,
  });
  dom.window.HTMLElement.prototype.getBoundingClientRect = function () {
    return this.tagName === 'MAIN'
      ? { top: parentTop, bottom: parentBottom }
      : { top };
  };
  frames = new Map();
  window.requestAnimationFrame = (callback) => {
    frames.set(++nextFrame, callback);
    return nextFrame;
  };
  window.cancelAnimationFrame = (id) => frames.delete(id);
  observations = [];
  disconnected = false;
  global.ResizeObserver = class {
    constructor(callback) {
      observer = callback;
    }
    observe(element) {
      observations.push(element);
    }
    disconnect() {
      disconnected = true;
    }
  };
  root = createRoot(document.querySelector('main'));
});
afterEach(async () => {
  await act(async () => root.unmount());
  delete global.ResizeObserver;
});
after(() => dom.window.close());

test('initial height uses actual menu top instead of the eventual sticky offset', async () => {
  const menu = await render();
  assert.equal(menu.style.getPropertyValue(variable), '344px');
  assert.deepEqual(observations, [
    menu,
    document.querySelector('main'),
    document.querySelector('.site-header'),
  ]);
});

test('scroll and resize coalesce then expand the menu when it reaches its sticky top', async () => {
  const menu = await render();
  top = 88;
  window.dispatchEvent(new dom.window.Event('scroll'));
  window.dispatchEvent(new dom.window.Event('resize'));
  assert.equal(frames.size, 1);
  assert.equal(menu.style.getPropertyValue(variable), '344px');
  flush();
  assert.equal(menu.style.getPropertyValue(variable), '496px');
  viewport.height = 390;
  viewport.dispatchEvent(new dom.window.Event('resize'));
  flush();
  assert.equal(menu.style.getPropertyValue(variable), '286px');
});

test('visual viewport offset, layout changes and too-low menus are measured safely', async () => {
  const menu = await render();
  viewport.height = 300;
  viewport.offsetTop = 20;
  top = 100;
  observer();
  flush();
  assert.equal(menu.style.getPropertyValue(variable), '204px');
  top = 700;
  viewport.dispatchEvent(new dom.window.Event('scroll'));
  flush();
  assert.equal(menu.style.getPropertyValue(variable), '0px');
});

test('a conditionally mounted or replaced navigation gets a fresh measurement', async () => {
  await render({ shown: false });
  const first = await render();
  assert.equal(first.style.getPropertyValue(variable), '344px');
  top = 300;
  const second = await render({ name: 'second' });
  assert.notEqual(second, first);
  assert.equal(second.style.getPropertyValue(variable), '284px');
  top = 100;
  window.dispatchEvent(new dom.window.Event('scroll'));
  flush();
  assert.equal(first.style.getPropertyValue(variable), '344px');
  assert.equal(second.style.getPropertyValue(variable), '484px');
});

test('unmount disconnects observers and cancels a pending frame and listeners', async () => {
  const menu = await render();
  top = 50;
  window.dispatchEvent(new dom.window.Event('scroll'));
  assert.equal(frames.size, 1);
  await render({ shown: false });
  assert.equal(disconnected, true);
  assert.equal(frames.size, 0);
  window.dispatchEvent(new dom.window.Event('resize'));
  viewport.dispatchEvent(new dom.window.Event('scroll'));
  assert.equal(frames.size, 0);
  assert.equal(menu.style.getPropertyValue(variable), '344px');
});

test('older browsers without VisualViewport or ResizeObserver use the window height', async () => {
  Object.defineProperty(window, 'visualViewport', {
    configurable: true,
    value: undefined,
  });
  delete global.ResizeObserver;
  top = -10;
  const menu = await render({ gap: 20 });
  assert.equal(menu.style.getPropertyValue(variable), '580px');
});

test('bounded menus use the stable column anchor instead of their own changing geometry', async () => {
  top = -120;
  const menu = await render({ bounded: true, sticky: true });
  assert.equal(menu.style.getPropertyValue(variable), '344px');
  parentTop = -1000;
  parentBottom = 420;
  window.dispatchEvent(new dom.window.Event('scroll'));
  flush();
  assert.equal(menu.style.getPropertyValue(variable), '316px');
  assert.equal(menu.hasAttribute('data-navigation-empty'), false);
  // A hover can change the menu height and its native sticky position. The
  // content column still provides the same cap and does not move its toolbar.
  top = -500;
  observer();
  flush();
  assert.equal(menu.style.getPropertyValue(variable), '316px');
});

test('bounded menus shrink before the column end and follow header and viewport changes', async () => {
  parentTop = -100;
  parentBottom = 420;
  const menu = await render({ bounded: true, sticky: true });
  assert.equal(menu.style.getPropertyValue(variable), '316px');
  parentBottom = 260;
  observer();
  flush();
  assert.equal(menu.style.getPropertyValue(variable), '156px');
  viewport.height = 240;
  viewport.dispatchEvent(new dom.window.Event('resize'));
  flush();
  assert.equal(menu.style.getPropertyValue(variable), '136px');
  menu.style.top = '128px';
  observer();
  flush();
  assert.equal(menu.style.getPropertyValue(variable), '96px');
});

test('bounded menus disappear with their content instead of overlaying the footer', async () => {
  parentTop = -1000;
  parentBottom = 50;
  const menu = await render({ bounded: true, sticky: true });
  assert.equal(menu.style.getPropertyValue(variable), '0px');
  assert.equal(menu.hasAttribute('data-navigation-empty'), true);
  parentBottom = 400;
  window.dispatchEvent(new dom.window.Event('scroll'));
  flush();
  assert.equal(menu.style.getPropertyValue(variable), '296px');
  assert.equal(menu.hasAttribute('data-navigation-empty'), false);
});

test('bounded menus hide partial toolbar fragments and restore when space returns', async () => {
  parentTop = -1000;
  parentBottom = 140;
  const menu = await render({
    bounded: true,
    sticky: true,
    minimumHeight: 64,
  });
  assert.equal(menu.style.getPropertyValue(variable), '36px');
  assert.equal(menu.hasAttribute('data-navigation-empty'), true);
  parentBottom = 180;
  window.dispatchEvent(new dom.window.Event('scroll'));
  flush();
  assert.equal(menu.style.getPropertyValue(variable), '76px');
  assert.equal(menu.hasAttribute('data-navigation-empty'), false);
});

test('mobile layout and other sidebars retain ordinary viewport bounds', async () => {
  top = -120;
  parentTop = -1000;
  parentBottom = 50;
  let menu = await render({ sticky: true });
  assert.equal(menu.style.getPropertyValue(variable), '584px');
  menu = await render({ bounded: true, sticky: true });
  assert.equal(menu.hasAttribute('data-navigation-empty'), true);
  menu.style.position = 'static';
  window.dispatchEvent(new dom.window.Event('resize'));
  flush();
  assert.equal(menu.style.getPropertyValue(variable), '584px');
  assert.equal(menu.hasAttribute('data-navigation-empty'), false);
  menu.style.position = 'sticky';
  observer();
  flush();
  assert.equal(menu.hasAttribute('data-navigation-empty'), true);
  menu = await render({ bounded: false, sticky: true });
  assert.equal(menu.hasAttribute('data-navigation-empty'), false);
  assert.equal(menu.style.getPropertyValue(variable), '584px');
});
