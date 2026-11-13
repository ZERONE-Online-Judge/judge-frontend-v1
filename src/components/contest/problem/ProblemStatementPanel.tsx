import { parseProblemDocument } from '@/domains/problemManagement/document';
import type { Problem, ProblemAsset } from '@/domains/problemManagement/types';
import MarkdownPreview from '@/shared/ui/MarkdownPreview';
import ProblemExamplesGrid from '@/components/contest/problem/ProblemExamplesGrid';
import ProblemMetaPills from '@/components/contest/problem/ProblemMetaPills';
import { statementVersions } from '@/domains/problemManagement/statementLanguages';
import StatementLanguageSelect from './StatementLanguageSelect';
import { useStatementLanguage } from '@/domains/problemManagement/useStatementLanguage';

type ProblemStatementPanelProps = {
  assets?: ProblemAsset[];
  problem: Problem;
};

export default function ProblemStatementPanel({
  assets = [],
  problem,
}: ProblemStatementPanelProps) {
  const versions = statementVersions(problem);
  const defaultLanguage = problem.default_statement_language || 'ko';
  const [language, selectLanguage] = useStatementLanguage(
    Object.keys(versions),
    defaultLanguage,
  );
  const variant = versions[language];
  const document = parseProblemDocument(variant.statement);

  return (
    <article
      lang={language}
      className="zoj-problem-document min-w-0 bg-white px-4 py-5 sm:px-6 sm:py-6"
    >
      <header>
        <h1 className="text-3xl font-black tracking-normal text-slate-950">
          {problem.problem_code}. {variant.title || problem.title}
        </h1>
        <div className="mt-5">
          <ProblemMetaPills problem={problem} />
        </div>
        <StatementLanguageSelect
          languages={Object.keys(versions)}
          selected={language}
          defaultLanguage={defaultLanguage}
          onChange={selectLanguage}
        />
      </header>

      {problem.scoring_mode === 'ioi' ? (
        <section
          aria-label="배점 안내"
          className="mt-6 rounded-xl border border-indigo-100 bg-indigo-50/50 p-4"
        >
          <h2 className="text-sm font-semibold text-slate-900">배점 · 100점</h2>
          <p className="mt-1 text-xs leading-5 text-slate-600">
            {problem.subtasks?.length
              ? '각 서브태스크의 모든 테스트를 통과하면 배점을 받습니다. 각 그룹의 최고점은 여러 제출에서 합산합니다.'
              : '전체 테스트를 통과하면 100점, 그렇지 않으면 0점입니다.'}
          </p>
          {problem.subtasks?.length ? (
            <ul className="mt-3 flex flex-wrap gap-2">
              {problem.subtasks.map((group) => (
                <li
                  key={group.subtask_id}
                  className="rounded-lg border border-indigo-100 bg-white px-3 py-2 text-xs text-slate-700"
                >
                  <span className="break-words">{group.name}</span>{' '}
                  <strong className="ml-2 text-indigo-700 tabular-nums">
                    {group.points}점
                  </strong>
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      ) : null}
      <div className="mt-7">
        <MarkdownPreview assets={assets} statement={document.statement} />
      </div>

      {document.inputDescription ? (
        <section className="mt-10">
          <h2 className="text-2xl font-black tracking-normal text-slate-950">
            입력
          </h2>
          <div className="mt-4">
            <MarkdownPreview
              assets={assets}
              statement={document.inputDescription}
            />
          </div>
        </section>
      ) : null}

      {document.outputDescription ? (
        <section className="mt-10">
          <h2 className="text-2xl font-black tracking-normal text-slate-950">
            출력
          </h2>
          <div className="mt-4">
            <MarkdownPreview
              assets={assets}
              statement={document.outputDescription}
            />
          </div>
        </section>
      ) : null}

      {document.note ? (
        <section className="mt-10">
          <h2 className="text-2xl font-black tracking-normal text-slate-950">
            노트
          </h2>
          <div className="mt-4">
            <MarkdownPreview assets={assets} statement={document.note} />
          </div>
        </section>
      ) : null}

      <section className="mt-10">
        <ProblemExamplesGrid
          assets={assets}
          examples={
            document.examples.length
              ? document.examples
              : parseProblemDocument(problem.statement).examples
          }
        />
      </section>
    </article>
  );
}
