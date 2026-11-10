import ReactMarkdown, { type Components } from 'react-markdown';
import rehypeKatex from 'rehype-katex';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize from 'rehype-sanitize';
import { useMemo } from 'react';
import { statementToMarkdown } from '@/shared/lib/statementLatex';
import {
  statementSchema,
  statementUrl,
  statementImageStyle,
} from '@/shared/lib/statementHtml';
import './statementLatex.css';
import remarkGfm from 'remark-gfm';
import 'katex/dist/katex.min.css';

import { resolveAssetSource } from '@/domains/problemManagement/document';
import type { ProblemAsset } from '@/domains/problemManagement/types';
import StatementImage from './StatementImage';

// Component identities must stay stable across parent timer/state renders so
// loaded images keep their DOM, download and decode state.
const statementComponents: Components = {
  a: ({ href = '', children }) => (
    <a
      className="font-bold text-indigo-700 underline underline-offset-4 hover:text-indigo-900"
      href={href}
      rel="noreferrer"
      target="_blank"
    >
      {children}
    </a>
  ),
  img: ({ src = '', alt = '', ...properties }) =>
    src ? (
      <StatementImage
        src={src}
        alt={alt}
        className="max-w-full rounded-md border border-slate-200 object-contain"
        style={statementImageStyle(properties)}
      />
    ) : null,
  ul: ({ children }) => (
    <ul className="my-4 list-disc space-y-2 pl-6 leading-7">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="my-4 list-decimal space-y-2 pl-6 leading-7">{children}</ol>
  ),
  li: ({ children }) => (
    <li className="pl-1 marker:font-black marker:text-slate-500">{children}</li>
  ),
  p: ({ children }) => (
    <p className="my-5 leading-8 tracking-normal text-slate-800">{children}</p>
  ),
  pre: ({ children }) => (
    <pre className="overflow-x-auto rounded-md border border-slate-200 bg-slate-950 p-4 text-sm text-slate-50">
      {children}
    </pre>
  ),
  code: ({ children }) => (
    <code className="rounded bg-slate-100 px-1.5 py-0.5 text-[0.92em] text-slate-900">
      {children}
    </code>
  ),
};

type MarkdownPreviewProps = {
  statement: string;
  assets?: ProblemAsset[];
};

export default function MarkdownPreview({
  statement,
  assets = [],
}: MarkdownPreviewProps) {
  const normalizedStatement = useMemo(
    () => statementToMarkdown(statement),
    [statement],
  );
  return (
    <div className="zoj-statement prose prose-slate max-w-none text-slate-800">
      <ReactMarkdown
        components={statementComponents}
        urlTransform={(url, key) =>
          statementUrl(resolveAssetSource(url, assets), key)
        }
        rehypePlugins={[
          rehypeRaw,
          [rehypeSanitize, statementSchema],
          [
            rehypeKatex,
            { throwOnError: false, trust: false, maxExpand: 1000, maxSize: 20 },
          ],
        ]}
        remarkPlugins={[remarkGfm]}
      >
        {normalizedStatement}
      </ReactMarkdown>
    </div>
  );
}
