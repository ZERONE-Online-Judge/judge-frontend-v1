const { test, beforeEach, afterEach, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const { JSDOM } = require('jsdom');
const React = require('react');
const { act } = React;
const { createRoot } = require('react-dom/client');

const dom = new JSDOM('<!doctype html><head></head><body></body>', {
  pretendToBeVisual: true,
});
global.window = dom.window;
global.document = dom.window.document;
global.HTMLElement = dom.window.HTMLElement;
global.HTMLTextAreaElement = dom.window.HTMLTextAreaElement;
global.IS_REACT_ACT_ENVIRONMENT = true;
window.HTMLDialogElement.prototype.showModal = function () {
  this.open = true;
};
window.HTMLDialogElement.prototype.close = function () {
  this.open = false;
};
const style = document.createElement('style');
style.textContent = fs.readFileSync(
  path.resolve(__dirname, '../src/shared/ui/StatementImage.css'),
  'utf8',
);
document.head.append(style);

const imports = Promise.all(
  [
    'unified',
    'remark-parse',
    'remark-math',
    'hast-util-from-html',
    'react-markdown',
    'rehype-raw',
    'rehype-sanitize',
    'rehype-katex',
    'remark-gfm',
  ].map(async (name) => [name, { __esModule: true, ...(await import(name)) }]),
).then((entries) => new Map(entries));
const cache = new Map();
function source(file, libraries) {
  if (cache.has(file)) return cache.get(file).exports;
  const mod = new Module(file, module);
  mod.filename = file;
  mod.paths = Module._nodeModulePaths(path.dirname(file));
  const native = mod.require.bind(mod);
  mod.require = (name) => {
    if (name.endsWith('.css')) return {};
    if (libraries.has(name)) return libraries.get(name);
    if (name.startsWith('.') || name.startsWith('@/')) {
      const base = name.startsWith('@/')
        ? path.resolve(__dirname, '../src', name.slice(2))
        : path.resolve(path.dirname(file), name);
      return source(
        ['.ts', '.tsx', '']
          .map((extension) => base + extension)
          .find((candidate) => fs.existsSync(candidate)),
        libraries,
      );
    }
    return native(name);
  };
  cache.set(file, mod);
  mod._compile(
    ts.transpileModule(fs.readFileSync(file, 'utf8'), {
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.CommonJS,
        jsx: ts.JsxEmit.ReactJSX,
        esModuleInterop: true,
      },
    }).outputText,
    file,
  );
  return mod.exports;
}
async function component(name) {
  return source(
    path.resolve(__dirname, '../src/shared/ui', name + '.tsx'),
    await imports,
  ).default;
}
let host, root;
beforeEach(() => {
  document.body.innerHTML = '';
  host = document.createElement('main');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  if (root) await act(() => root.unmount());
});
after(() => dom.window.close());
async function renderImage(props) {
  const Image = await component('StatementImage');
  await act(() => root.render(React.createElement(Image, props)));
  return host.querySelector('img');
}
function status() {
  return host.querySelector('[data-statement-image-state]');
}
function loaded(image, decode = async () => {}) {
  Object.defineProperty(image, 'naturalWidth', {
    configurable: true,
    value: 640,
  });
  Object.defineProperty(image, 'complete', { configurable: true, value: true });
  image.decode = decode;
}
async function event(image, type) {
  await act(async () =>
    image.dispatchEvent(new window.Event(type, { bubbles: false })),
  );
}

test('visible placeholder covers the network and browser decode, with original dimensions and alignment applied once', async () => {
  const image = await renderImage({
    src: 'https://authorized.test/figure.png',
    alt: '경로 그림',
    style: {
      width: '75%',
      maxWidth: '100%',
      display: 'block',
      marginLeft: 'auto',
      marginRight: 0,
    },
  });
  assert.equal(status().dataset.statementImageState, 'loading');
  assert.equal(status().getAttribute('aria-busy'), 'true');
  const placeholder = host.querySelector('[role=status]');
  assert.match(placeholder.textContent, /이미지를 불러오고 있습니다/);
  assert.match(placeholder.textContent, /경로 그림/);
  assert.equal(window.getComputedStyle(placeholder).minHeight, '96px');
  assert.equal(window.getComputedStyle(status()).display, 'contents');
  assert.equal(placeholder.style.width, '75%');
  assert.equal(placeholder.style.marginLeft, 'auto');
  assert.equal(image.style.width, '75%');
  assert.equal(image.style.marginRight, '0px');
  // jsdom does not apply stylesheet !important over inline display, while
  // browsers do. Check the semantic hidden state and matching hiding rule.
  assert.equal(image.hidden, true);
  assert.ok(
    image.matches(
      '.statement-image:not([data-statement-image-state="ready"]) > img',
    ),
  );
  let release;
  loaded(
    image,
    () =>
      new Promise((resolve) => {
        release = resolve;
      }),
  );
  await event(image, 'load');
  assert.equal(status().dataset.statementImageState, 'loading');
  await act(async () => release());
  assert.equal(status().dataset.statementImageState, 'ready');
  assert.equal(image.hidden, false);
  assert.equal(host.querySelector('[role=status]'), null);
  assert.equal(window.getComputedStyle(image).display, 'block');
});

test('cached complete images still wait for decode without relying on a second load event', async () => {
  const proto = window.HTMLImageElement.prototype;
  const complete = Object.getOwnPropertyDescriptor(proto, 'complete');
  const width = Object.getOwnPropertyDescriptor(proto, 'naturalWidth');
  const previousDecode = proto.decode;
  let release,
    decodes = 0;
  Object.defineProperty(proto, 'complete', {
    configurable: true,
    get: () => true,
  });
  Object.defineProperty(proto, 'naturalWidth', {
    configurable: true,
    get: () => 100,
  });
  proto.decode = () => {
    decodes++;
    return new Promise((resolve) => {
      release = resolve;
    });
  };
  try {
    await renderImage({ src: 'data:image/png;base64,AA==', alt: 'cached' });
    assert.equal(decodes, 1);
    assert.equal(status().dataset.statementImageState, 'loading');
    await act(async () => release());
    assert.equal(status().dataset.statementImageState, 'ready');
  } finally {
    Object.defineProperty(proto, 'complete', complete);
    Object.defineProperty(proto, 'naturalWidth', width);
    if (previousDecode) proto.decode = previousDecode;
    else delete proto.decode;
  }
});

test('native download failure and decode failure show a readable error and retain the image description', async () => {
  let image = await renderImage({
    src: 'https://authorized.test/missing.png',
    alt: '네트워크 그림',
  });
  await event(image, 'error');
  assert.equal(status().dataset.statementImageState, 'error');
  assert.equal(status().getAttribute('aria-busy'), 'false');
  assert.match(
    host.querySelector('[role=status]').textContent,
    /이미지를 불러오지 못했습니다.*네트워크 그림/,
  );
  image = await renderImage({
    src: 'https://authorized.test/bad.png',
    alt: '손상된 그림',
  });
  loaded(image, async () => {
    throw new Error('Private response details');
  });
  await event(image, 'load');
  assert.equal(status().dataset.statementImageState, 'error');
  assert.match(host.textContent, /손상된 그림/);
  assert.doesNotMatch(host.textContent, /Private response/);
});

test('source replacement and unmount ignore late decode completions and cannot revive an old image', async () => {
  const first = await renderImage({ src: 'https://authorized.test/old.png' });
  let release;
  loaded(
    first,
    () =>
      new Promise((resolve) => {
        release = resolve;
      }),
  );
  await event(first, 'load');
  const next = await renderImage({ src: 'https://authorized.test/new.png' });
  assert.notEqual(next, first);
  await act(async () => release());
  assert.equal(status().dataset.statementImageState, 'loading');
  let finish;
  loaded(
    next,
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  await event(next, 'load');
  await act(() => root.unmount());
  root = null;
  await act(async () => finish());
  assert.equal(host.childElementCount, 0);
});

test('a native failure cannot be overwritten by an already pending decode success', async () => {
  const image = await renderImage({ src: 'https://authorized.test/race.png' });
  let release;
  loaded(
    image,
    () =>
      new Promise((resolve) => {
        release = resolve;
      }),
  );
  await event(image, 'load');
  await event(image, 'error');
  await act(async () => release());
  assert.equal(status().dataset.statementImageState, 'error');
});

test('actual Markdown preview keeps ready images mounted across parent rerenders and resets only for a changed authorized URL', async () => {
  const Preview = await component('MarkdownPreview');
  const statement = '[![회로](asset://figure)](https://example.test)';
  const asset = {
    asset_id: 'figure',
    original_filename: 'figure.png',
    storage_key: 'figures/figure.png',
    download_url: 'https://authorized.test/first.png',
  };
  async function render(url = asset.download_url) {
    await act(() =>
      root.render(
        React.createElement(Preview, {
          statement,
          assets: [{ ...asset, download_url: url }],
        }),
      ),
    );
  }
  await render();
  const image = host.querySelector('img');
  assert.equal(image.src, asset.download_url);
  assert.ok(image.closest('p'));
  assert.equal(image.closest('a').querySelector('button'), null);
  let decodes = 0;
  loaded(image, async () => {
    decodes++;
  });
  await event(image, 'load');
  assert.equal(status().dataset.statementImageState, 'ready');
  await render();
  assert.equal(host.querySelector('img'), image);
  assert.equal(status().dataset.statementImageState, 'ready');
  assert.equal(decodes, 1);
  await render('https://authorized.test/refreshed-signature.png');
  assert.notEqual(host.querySelector('img'), image);
  assert.equal(status().dataset.statementImageState, 'loading');
  assert.equal(
    host.querySelector('img').src,
    'https://authorized.test/refreshed-signature.png',
  );
});

test('image management uses the same compact loading and failure states without nesting interactive controls', async () => {
  const Tools = await component('StatementImageTools');
  await act(() =>
    root.render(
      React.createElement(
        Tools,
        {
          identity: 'test/ko',
          label: '문제 본문',
          value: '',
          onChange: () => {},
          assets: [
            {
              id: 'one',
              name: '그림.png',
              source: 'asset://one',
              previewUrl: 'https://authorized.test/gallery.png',
            },
          ],
        },
        React.createElement('textarea'),
      ),
    ),
  );
  await act(() => host.querySelector('button').click());
  const thumbnail = document.querySelector('.statement-image-thumbnail');
  assert.ok(thumbnail.querySelector('.statement-image--compact'));
  assert.match(thumbnail.textContent, /이미지를 불러오고 있습니다/);
  assert.equal(thumbnail.querySelector('button'), null);
  await event(thumbnail.querySelector('img'), 'error');
  assert.match(thumbnail.textContent, /이미지를 불러오지 못했습니다/);
  assert.equal(thumbnail.closest('button').disabled, false);
});
