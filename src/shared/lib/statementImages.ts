import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkMath from 'remark-math';
import { fromHtml } from 'hast-util-from-html';

export type StatementImageAsset = {
  id: string;
  source: string;
  name: string;
  previewUrl?: string;
};
export type ImageAlignment = 'left' | 'center' | 'right';
export type StatementImageOptions = {
  source: string;
  alt: string;
  align?: ImageAlignment;
  width?: string;
};
export type StatementImageOccurrence = StatementImageOptions & {
  start: number;
  end: number;
  text: string;
  kind: 'markdown' | 'html' | 'tex';
  legacy?: Record<string, string>;
  layoutEditable?: boolean;
};
export const STATEMENT_IMAGE_MAX_BYTES = 16 * 1024 * 1024;
/** Match the bounded textarea's edit limits; never change a truncated preview. */
export function statementImageTextEditable(value: string) {
  if (value.length > 256 * 1024) return false;
  let lines = 1,
    column = 0;
  for (let i = 0; i < value.length; i++) {
    const character = value[i];
    if (character === '\n') {
      if (++lines > 5000) return false;
      column = 0;
    } else if (++column > 16384) return false;
  }
  return true;
}
export async function validateStatementImageUpload(file: File) {
  if (!file.size || file.size > STATEMENT_IMAGE_MAX_BYTES)
    throw new Error('이미지는 비어 있지 않은 16MiB 이하 파일을 선택해 주세요.');
  const bytes = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  const ascii = (from: number, length: number) =>
    String.fromCharCode(...bytes.slice(from, from + length));
  const mime =
    ascii(0, 8) === '\x89PNG\r\n\x1a\n'
      ? 'image/png'
      : bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
        ? 'image/jpeg'
        : ascii(0, 4) === 'RIFF' && ascii(8, 4) === 'WEBP'
          ? 'image/webp'
          : null;
  const extension = /\.png$/i.test(file.name)
    ? 'image/png'
    : /\.jpe?g$/i.test(file.name)
      ? 'image/jpeg'
      : /\.webp$/i.test(file.name)
        ? 'image/webp'
        : null;
  if (!mime || mime !== extension || (file.type && file.type !== mime))
    throw new Error(
      '파일 내용과 확장자가 일치하는 PNG, JPEG, WEBP 이미지를 선택해 주세요.',
    );
  return mime;
}
type SyntaxNode = {
  type: string;
  url?: string;
  alt?: string;
  identifier?: string;
  value?: string;
  tagName?: string;
  properties?: Record<string, unknown>;
  children?: SyntaxNode[];
  position?: { start: { offset?: number }; end: { offset?: number } };
};
const parser = unified().use(remarkParse).use(remarkMath);
const escapeAttribute = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        c
      ]!,
  );
export function normalizeImageWidth(value: unknown): string | undefined {
  const match = /^(\d+(?:\.\d+)?)(%|px)$/.exec(String(value ?? '').trim());
  if (!match || !Number.isFinite(Number(match[1]))) return undefined;
  return `${Math.min(match[2] === '%' ? 100 : 4096, Math.max(1, Number(match[1])))}${match[2]}`;
}
/** Native HTML dimensions must be positive, unlike normalized authored controls. */
export function normalizeNativeImageDimension(
  value: unknown,
): string | undefined {
  const text = String(value ?? '');
  const match = /^(\d+(?:\.\d+)?)(px|%)?$/.exec(text);
  if (!match || !Number.isFinite(Number(match[1])) || Number(match[1]) <= 0)
    return undefined;
  return normalizeImageWidth(`${match[1]}${match[2] ?? 'px'}`);
}

export function statementImagePreviewSource(
  source: string,
  assets: StatementImageAsset[],
): string {
  const exact = assets.find((asset) => asset.source === source);
  if (exact) return exact.previewUrl || exact.source;
  if (/^[a-z][a-z\d+.-]*:|^\/\//i.test(source)) return source;
  let name = source;
  try {
    name = decodeURIComponent(name);
  } catch {
    /* Keep malformed authored paths literal. */
  }
  name = name.replace(/^\.\//, '');
  const named = assets.find(
    (asset) => asset.name.replace(/^\.\//, '') === name,
  );
  if (named) return named.previewUrl || named.source;
  const basename = name.split('/').pop();
  const matching = assets.filter(
    (asset) => asset.name.split('/').pop() === basename,
  );
  return matching.length === 1
    ? matching[0].previewUrl || matching[0].source
    : source;
}

/** Match the statement TeX renderer's supported, bounded image dimensions. */
export function normalizeTexImageDimension(
  value: unknown,
  pixelsInCm = 37.8,
): string | undefined {
  const text = String(value ?? '').trim();
  const fraction =
    /^((?:\d+(?:\.\d*)?|\.\d+)?)\\(?:textwidth|linewidth|columnwidth)$/.exec(
      text,
    );
  if (fraction)
    return normalizeImageWidth(`${Number(fraction[1] || 1) * 100}%`);
  const unit = /^(\d+(?:\.\d*)?|\.\d+)\s*(cm|mm|pt|px)$/.exec(text);
  if (!unit) return normalizeImageWidth(text);
  const factor =
    unit[2] === 'cm'
      ? pixelsInCm
      : unit[2] === 'mm'
        ? pixelsInCm / 10
        : unit[2] === 'pt'
          ? 4 / 3
          : 1;
  return normalizeImageWidth(`${Number(unit[1]) * factor}px`);
}

export function imageAlignment(value: unknown): ImageAlignment | undefined {
  return value === 'left' || value === 'center' || value === 'right'
    ? value
    : undefined;
}
function walk(node: SyntaxNode, visit: (node: SyntaxNode) => void) {
  visit(node);
  node.children?.forEach((child) => walk(child, visit));
}
const offsets = (node: SyntaxNode) => ({
  start: node.position?.start.offset ?? -1,
  end: node.position?.end.offset ?? -1,
});
function tree(value: string) {
  return parser.parse(value) as SyntaxNode;
}
function texLiteralRanges(value: string, root: SyntaxNode) {
  const blocked: { start: number; end: number }[] = [];
  walk(root, (node) => {
    if (
      ['code', 'inlineCode', 'math', 'inlineMath', 'html'].includes(node.type)
    )
      blocked.push(offsets(node));
  });
  const ranges: { start: number; end: number }[] = [];
  for (const [open, close] of [
    ['\\(', '\\)'],
    ['\\[', '\\]'],
    ['\\begin{verbatim}', '\\end{verbatim}'],
    ['\\begin{lstlisting}', '\\end{lstlisting}'],
  ]) {
    let cursor = 0;
    while (cursor < value.length) {
      const start = value.indexOf(open, cursor);
      if (start === -1) break;
      cursor = start + open.length;
      if (blocked.some((r) => start >= r.start && start < r.end)) continue;
      const end = value.indexOf(close, cursor);
      if (end === -1) break;
      cursor = end + close.length;
      ranges.push({ start, end: cursor });
    }
  }
  return ranges;
}
function group(value: string, start: number, open: string, close: string) {
  while (/\s/.test(value[start] ?? '') && start < value.length) start++;
  if (value[start] !== open) return null;
  let depth = 1;
  const begin = ++start;
  for (; start < value.length; start++) {
    if (value[start] === '\\') {
      start++;
      continue;
    }
    if (value[start] === open) depth++;
    if (value[start] === close && --depth === 0)
      return { value: value.slice(begin, start), end: start + 1 };
  }
  return null;
}

/** Source offsets identify occurrences, including repeated uses of one file. */
export function parseStatementImages(
  value: string,
): StatementImageOccurrence[] {
  const root = tree(value);
  const definitions = new Map<string, string>();
  walk(root, (node) => {
    if (
      node.type === 'definition' &&
      node.identifier &&
      node.url &&
      !definitions.has(node.identifier)
    )
      definitions.set(node.identifier, node.url);
  });
  const found: StatementImageOccurrence[] = [];
  const protectedRanges: { start: number; end: number }[] = [];
  const literals = texLiteralRanges(value, root);
  walk(root, (node) => {
    const { start, end } = offsets(node);
    if (start < 0 || end < start) return;
    if (
      [
        'code',
        'math',
        'inlineMath',
        'inlineCode',
        'html',
        'image',
        'imageReference',
        'definition',
      ].includes(node.type)
    )
      protectedRanges.push({ start, end });
    const add = (
      options: StatementImageOptions,
      kind: StatementImageOccurrence['kind'],
      from = start,
      to = end,
      legacy?: Record<string, string>,
    ) => {
      if (!options.source) return;
      found.push({
        ...options,
        kind,
        start: from,
        end: to,
        text: value.slice(from, to),
        legacy,
      });
    };
    if (node.type === 'image' || node.type === 'imageReference') {
      const source = node.url ?? definitions.get(node.identifier ?? '') ?? '';
      add({ source, alt: node.alt ?? '' }, 'markdown');
    }
    if (node.type === 'html' && node.value) {
      const html = fromHtml(node.value, { fragment: true }) as SyntaxNode;
      walk(html, (element) => {
        if (element.tagName !== 'img') return;
        const range = offsets(element);
        if (range.start < 0) return;
        const p = element.properties ?? {};
        const legacy: Record<string, string> = {};
        const nativeWidth = normalizeNativeImageDimension(p.width);
        const nativeHeight = normalizeNativeImageDimension(p.height);
        const canonicalWidth = normalizeImageWidth(p.dataZojWidth);
        const legacyWidth = normalizeImageWidth(p.dataTexWidth) ?? nativeWidth;
        const legacyHeight =
          normalizeImageWidth(p.dataTexHeight) ?? nativeHeight;
        const legacyScale = Number(p.dataTexScale);
        if (!canonicalWidth) {
          if (legacyWidth) legacy['data-tex-width'] = legacyWidth;
          if (legacyHeight) legacy['data-tex-height'] = legacyHeight;
          if (Number.isFinite(legacyScale) && legacyScale > 0)
            legacy['data-tex-scale'] = String(
              Math.min(4, Math.max(0.1, legacyScale)),
            );
        }
        add(
          {
            source: String(p.src ?? ''),
            alt: String(p.alt ?? ''),
            align: imageAlignment(p.dataZojAlign),
            width: canonicalWidth ?? legacyWidth,
          },
          'html',
          start + range.start,
          start + range.end,
          legacy,
        );
      });
    }
  });
  protectedRanges.push(...literals);
  const command = /\\includegraphics\*?/g;
  let match: RegExpExecArray | null;
  while ((match = command.exec(value))) {
    const start = match.index;
    if (
      value[start - 1] === '\\' ||
      protectedRanges.some((r) => start >= r.start && start < r.end)
    )
      continue;
    const options = group(value, command.lastIndex, '[', ']');
    const path = group(value, options?.end ?? command.lastIndex, '{', '}');
    if (!path) continue;
    const source = path.value.replace(/\\([%&#_${}])/g, '$1');
    const opts = Object.fromEntries(
      (options?.value ?? '')
        .split(',')
        .filter((entry) => entry.trim())
        .map((entry) => entry.trim().split(/\s*=\s*/, 2)),
    );
    const pixelDefinitions = [
      ...value
        .slice(0, start)
        .matchAll(/\\def\s*\\htmlPixelsInCm\s*\{([\d.]+)\}/g),
    ].filter(
      (definition) =>
        value[definition.index! - 1] !== '\\' &&
        !protectedRanges.some(
          (range) =>
            definition.index! >= range.start && definition.index! < range.end,
        ),
    );
    const pixelsInCm = pixelDefinitions.length
      ? Math.min(200, Math.max(1, Number(pixelDefinitions.at(-1)![1]) || 37.8))
      : 37.8;
    const width = normalizeTexImageDimension(opts.width, pixelsInCm);
    const height = normalizeTexImageDimension(opts.height, pixelsInCm);
    const scale = Number(opts.scale);
    const legacy: Record<string, string> = {};
    if (width) legacy['data-tex-width'] = width;
    if (height) legacy['data-tex-height'] = height;
    if (Number.isFinite(scale) && scale > 0)
      legacy['data-tex-scale'] = String(Math.min(4, Math.max(0.1, scale)));
    found.push({
      source,
      alt: source,
      kind: 'tex',
      start,
      end: path.end,
      text: value.slice(start, path.end),
      width,
      legacy,
      layoutEditable:
        !match[0].endsWith('*') &&
        Object.keys(opts).every((key) =>
          ['width', 'height', 'scale'].includes(key),
        ) &&
        (!opts.width || Boolean(width)) &&
        (!opts.height || Boolean(height)) &&
        (!opts.scale || (Number.isFinite(scale) && scale > 0)),
    });
    command.lastIndex = path.end;
  }
  return found
    .filter(
      (image) =>
        !literals.some((r) => image.start >= r.start && image.start < r.end),
    )
    .sort((a, b) => a.start - b.start);
}

export function statementImageMarkup(
  options: StatementImageOptions,
  legacy: Record<string, string> = {},
) {
  const align = imageAlignment(options.align) ?? 'center';
  const width = normalizeImageWidth(options.width);
  const old = Object.entries(legacy)
    .filter(([name]) =>
      ['data-tex-width', 'data-tex-height', 'data-tex-scale'].includes(name),
    )
    .map(([name, value]) => ` ${name}="${escapeAttribute(value)}"`)
    .join('');
  return `<img src="${escapeAttribute(options.source)}" alt="${escapeAttribute(options.alt)}" data-zoj-align="${align}"${width ? ` data-zoj-width="${width}"` : ''}${old}>`;
}
export function safeImageInsertion(value: string, position: number) {
  if (!Number.isInteger(position) || position < 0 || position > value.length)
    return false;
  let safe = true;
  const root = tree(value);
  if (
    texLiteralRanges(value, root).some(
      (r) => position > r.start && position < r.end,
    )
  )
    return false;
  walk(root, (node) => {
    if (
      ![
        'code',
        'math',
        'inlineMath',
        'inlineCode',
        'html',
        'image',
        'imageReference',
        'definition',
      ].includes(node.type)
    )
      return;
    const { start, end } = offsets(node);
    if (position > start && position < end) safe = false;
  });
  return safe;
}
export function insertStatementImage(
  value: string,
  position: number,
  markup: string,
) {
  if (!safeImageInsertion(value, position)) return null;
  const before = value.slice(0, position),
    after = value.slice(position);
  return (
    before +
    (before && !before.endsWith('\n\n')
      ? before.endsWith('\n')
        ? '\n'
        : '\n\n'
      : '') +
    markup +
    (after && !after.startsWith('\n\n')
      ? after.startsWith('\n')
        ? '\n'
        : '\n\n'
      : '') +
    after
  );
}
export function replaceStatementImage(
  value: string,
  image: StatementImageOccurrence,
  replacement: string,
) {
  if (value.slice(image.start, image.end) !== image.text) return null;
  return value.slice(0, image.start) + replacement + value.slice(image.end);
}
export function moveStatementImage(
  value: string,
  image: StatementImageOccurrence,
  destination: 'above' | 'below' | number,
) {
  if (value.slice(image.start, image.end) !== image.text) return null;
  let target: number;
  if (typeof destination === 'number') target = destination;
  else {
    const blocks = tree(value).children ?? [];
    const index = blocks.findIndex(
      (b) => offsets(b).start <= image.start && offsets(b).end >= image.end,
    );
    if (index < 0) return null;
    const block = offsets(blocks[index]);
    const onlyImage =
      value.slice(block.start, block.end).trim() === image.text.trim();
    const neighbor = blocks[index + (destination === 'above' ? -1 : 1)];
    target =
      onlyImage && neighbor
        ? offsets(neighbor)[destination === 'above' ? 'start' : 'end']
        : block[destination === 'above' ? 'start' : 'end'];
  }
  if (target >= image.start && target <= image.end) return value;
  if (!safeImageInsertion(value, target)) return null;
  const removed = replaceStatementImage(value, image, '')!;
  const adjusted =
    target > image.end ? target - (image.end - image.start) : target;
  return insertStatementImage(removed, adjusted, image.text);
}

/** A completed upload may add a file, but never overwrite another document. */
export function imageEditContextMatches(
  current: { identity: string; value: string; readOnly?: boolean },
  captured: { identity: string; value: string },
) {
  return (
    !current.readOnly &&
    current.identity === captured.identity &&
    current.value === captured.value
  );
}
