import Select from '@/shared/ui/Select';
import { useState } from 'react';
import type {
  Problem,
  ProblemDocument,
  ProblemExample,
} from '@/domains/problemManagement/types';
import {
  parseProblemDocument,
  serializeProblemDocument,
} from '@/domains/problemManagement/document';
import {
  promoteStatementLanguage,
  statementLanguageLabels,
  statementLanguageLabel,
} from '@/domains/problemManagement/statementLanguages';

const inputClass =
  'w-full min-w-0 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100';
const fields = [
  ['statement', '번역 본문'],
  ['inputDescription', '번역 입력 설명'],
  ['outputDescription', '번역 출력 설명'],
  ['note', '번역 노트'],
] as const;

export default function ProblemLanguageEditor({
  problem,
  onChange,
}: {
  problem: Problem;
  onChange: (next: Problem) => void;
}) {
  const defaultLanguage = problem.default_statement_language || 'ko';
  const translations = problem.statement_translations || {};
  const languages = Object.keys(translations);
  const [choice, setChoice] = useState('');
  const [adding, setAdding] = useState('');
  const [exampleDrafts, setExampleDrafts] = useState<
    Record<string, ProblemExample[]>
  >({});
  const selected = languages.includes(choice) ? choice : languages[0] || '';
  const variant = translations[selected];
  const document = variant ? parseProblemDocument(variant.statement) : null;
  const examples = exampleDrafts[selected] || document?.examples || [];
  const choices = [
    ...new Set([
      defaultLanguage,
      ...Object.keys(statementLanguageLabels),
      ...languages,
    ]),
  ];
  const canAdd = Boolean(
    adding &&
    adding !== defaultLanguage &&
    !translations[adding] &&
    languages.length < 20,
  );
  function changeDocument(patch: Partial<ProblemDocument>) {
    if (!document) return;
    onChange({
      ...problem,
      statement_translations: {
        ...translations,
        [selected]: {
          ...variant,
          statement: serializeProblemDocument({ ...document, ...patch }),
        },
      },
    });
  }
  function changeExamples(next: ProblemExample[]) {
    setExampleDrafts((previous) => ({ ...previous, [selected]: next }));
    changeDocument({ examples: next });
  }
  return (
    <section className="grid min-w-0 gap-3 rounded-xl border border-indigo-100 bg-indigo-50/40 p-4">
      <label className="grid gap-2 text-sm font-semibold text-slate-700">
        기본 지문 언어
        <Select
          className={inputClass}
          value={defaultLanguage}
          onChange={(e) => {
            setExampleDrafts({});
            onChange(promoteStatementLanguage(problem, e.target.value));
          }}
        >
          {choices.map((language) => (
            <option
              key={language}
              value={language}
              disabled={Boolean(
                translations[language] &&
                !parseProblemDocument(
                  translations[language].statement,
                ).statement.trim(),
              )}
            >
              {statementLanguageLabel(language)}
            </option>
          ))}
        </Select>
      </label>
      <p className="text-xs leading-5 text-slate-600">
        아래 원문은 기본 지문입니다. 기존 번역을 기본 언어로 선택하면
        제목·본문·해설을 서로 교환해 보존합니다. 번역이 없는 언어를 선택하면
        원문의 언어 표시만 변경됩니다.
      </p>
      <details className="min-w-0 rounded-lg border border-indigo-100 bg-white p-3">
        <summary className="cursor-pointer text-sm font-bold text-indigo-700">
          번역 지문 추가·편집{' '}
          <span className="ml-2 text-xs font-medium">
            {languages.length}개 언어
          </span>
        </summary>
        <div className="mt-4 grid min-w-0 gap-4">
          <p className="text-xs leading-5 text-slate-500">
            등록한 번역은 참가자가 지문 언어를 선택해 볼 수 있습니다. 본문이
            비어 있는 번역은 언어 목록에 표시되지 않습니다. 예제를 따로 작성하지
            않으면 기본 지문의 예제를 사용합니다.
          </p>
          <div className="flex flex-wrap items-end gap-2">
            <label className="grid min-w-0 flex-1 gap-2 text-sm font-semibold text-slate-700">
              추가할 지문 언어
              <Select
                className={inputClass}
                value={adding}
                onChange={(e) => setAdding(e.target.value)}
              >
                <option value="">언어 선택</option>
                {Object.keys(statementLanguageLabels)
                  .filter(
                    (language) =>
                      language !== defaultLanguage && !translations[language],
                  )
                  .map((language) => (
                    <option key={language} value={language}>
                      {statementLanguageLabel(language)}
                    </option>
                  ))}
              </Select>
            </label>
            <button
              type="button"
              className="rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50"
              disabled={!canAdd}
              onClick={() => {
                if (!canAdd) return;
                onChange({
                  ...problem,
                  statement_translations: {
                    ...translations,
                    [adding]: { title: problem.title, statement: '' },
                  },
                });
                setChoice(adding);
                setAdding('');
              }}
            >
              번역 추가
            </button>
          </div>
          {variant && document && (
            <>
              <div className="flex flex-wrap items-end gap-2">
                <label className="grid min-w-0 flex-1 gap-2 text-sm font-semibold text-slate-700">
                  편집할 번역
                  <Select
                    className={inputClass}
                    value={selected}
                    onChange={(e) => setChoice(e.target.value)}
                  >
                    {languages.map((language) => (
                      <option key={language} value={language}>
                        {statementLanguageLabel(language)}
                      </option>
                    ))}
                  </Select>
                </label>
                <button
                  type="button"
                  className="rounded-lg border border-rose-200 px-3 py-2.5 text-xs font-bold text-rose-600"
                  onClick={() => {
                    const next = { ...translations },
                      editorials = { ...problem.editorial_translations };
                    delete next[selected];
                    delete editorials[selected];
                    setExampleDrafts((previous) => {
                      const drafts = { ...previous };
                      delete drafts[selected];
                      return drafts;
                    });
                    onChange({
                      ...problem,
                      statement_translations: next,
                      editorial_translations: editorials,
                    });
                  }}
                >
                  이 번역 삭제
                </button>
              </div>
              <p className="text-xs text-slate-500">
                변경은 저장 버튼을 눌러야 서버에 반영됩니다.
              </p>
              <label className="grid gap-2 text-sm font-semibold text-slate-700">
                번역 제목
                <input
                  className={inputClass}
                  maxLength={255}
                  value={variant.title}
                  onChange={(e) =>
                    onChange({
                      ...problem,
                      statement_translations: {
                        ...translations,
                        [selected]: { ...variant, title: e.target.value },
                      },
                    })
                  }
                />
              </label>
              {fields.map(([field, label]) => (
                <label
                  key={field}
                  className="grid min-w-0 gap-2 text-sm font-semibold text-slate-700"
                >
                  {label}
                  <textarea
                    className={`${inputClass} font-mono text-xs leading-5`}
                    rows={field === 'statement' ? 8 : 3}
                    value={document[field]}
                    onChange={(e) =>
                      changeDocument({ [field]: e.target.value })
                    }
                  />
                </label>
              ))}
              <details className="min-w-0 rounded-lg border border-slate-200 p-3">
                <summary className="cursor-pointer text-sm font-semibold text-slate-700">
                  번역 예제{' '}
                  {examples.length
                    ? `${examples.length}개`
                    : '· 기본 예제 사용'}
                </summary>
                <div className="mt-3 grid gap-3">
                  {examples.map((example, index) => (
                    <fieldset
                      key={index}
                      className="grid gap-3 rounded-lg bg-slate-50 p-3"
                    >
                      <legend className="text-xs font-bold">
                        예제 {index + 1}
                      </legend>
                      {(['input', 'output', 'note'] as const).map((field) => (
                        <label
                          key={field}
                          className="grid gap-2 text-xs font-semibold"
                        >
                          {field === 'input'
                            ? '번역 예제 입력'
                            : field === 'output'
                              ? '번역 예제 출력'
                              : '번역 예제 설명'}
                          <textarea
                            className={inputClass}
                            rows={3}
                            value={example[field] || ''}
                            onChange={(e) =>
                              changeExamples(
                                examples.map((item, i) =>
                                  i === index
                                    ? { ...item, [field]: e.target.value }
                                    : item,
                                ),
                              )
                            }
                          />
                        </label>
                      ))}
                      <button
                        type="button"
                        className="w-fit text-xs font-bold text-rose-600"
                        onClick={() =>
                          changeExamples(examples.filter((_, i) => i !== index))
                        }
                      >
                        이 예제 삭제
                      </button>
                    </fieldset>
                  ))}
                  <button
                    type="button"
                    className="w-fit rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold"
                    onClick={() =>
                      changeExamples([
                        ...examples,
                        { input: '', output: '', note: '' },
                      ])
                    }
                  >
                    번역 예제 추가
                  </button>
                </div>
              </details>
              <details className="min-w-0 rounded-lg border border-slate-200 p-3">
                <summary className="cursor-pointer text-sm font-semibold text-slate-700">
                  번역 해설 · 기존 해설 공개 정책 적용
                </summary>
                <label className="mt-3 grid gap-2 text-sm font-semibold">
                  번역 해설
                  <textarea
                    className={`${inputClass} font-mono text-xs`}
                    rows={6}
                    value={problem.editorial_translations?.[selected] || ''}
                    onChange={(e) =>
                      onChange({
                        ...problem,
                        editorial_translations: {
                          ...problem.editorial_translations,
                          [selected]: e.target.value,
                        },
                      })
                    }
                  />
                </label>
              </details>
            </>
          )}
        </div>
      </details>
    </section>
  );
}
