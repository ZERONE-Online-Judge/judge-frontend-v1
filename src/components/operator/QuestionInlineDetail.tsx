import type { FormEvent } from 'react';
import type {
  ContestAnswer,
  ContestQuestion,
} from '@/domains/serviceCommunication/types';
import { NoticeIcon } from '@/components/operator/OperatorShell';
import { contestStaffDisplayName } from '@/domains/identityAccess/staffDisplay';
import { formatApiError } from '@/shared/api/errors';
import { formatDateTime } from '@/shared/lib/dateTime';
import '@/pages/operator/OperatorBoardPage.css';
export type AnswerForm = {
  body: string;
  questionId: string;
  visibility: 'public' | 'questioner';
};

function normalizedEmail(value?: string | null) {
  return value?.trim().toLowerCase() ?? '';
}

function authorContext(teamName?: string | null, divisionName?: string | null) {
  const parts = [teamName, divisionName].filter((item): item is string =>
    Boolean(item),
  );
  return parts.length > 0 ? parts.join(' · ') : null;
}

function questionAuthorName(question: ContestQuestion) {
  return question.author_name ?? '참가자';
}

function answerAuthorLabel(question: ContestQuestion, answer: ContestAnswer) {
  if (answer.created_by_role === 'operator')
    return contestStaffDisplayName(
      answer.created_by_name,
      answer.created_by_title,
    );

  const name = answer.created_by_name || answer.created_by_email || '참가자';
  const answerEmail = normalizedEmail(answer.created_by_email);
  const isQuestionAuthor =
    answerEmail !== '' &&
    answerEmail === normalizedEmail(question.author_email);

  return isQuestionAuthor ? `${name} (글쓴이)` : name;
}

function answerAuthorContext(answer: ContestAnswer) {
  if (answer.created_by_role === 'operator') return null;
  return authorContext(
    answer.created_by_team_name,
    answer.created_by_division_name,
  );
}

export default function QuestionInlineDetail({
  canManage,
  answerActionError,
  answerActionPending,
  answerForm,
  answerMutationError,
  deleteError,
  deletePending,
  formError,
  isAnswerSubmitting,
  onAnswerChange,
  onCancelAnswer,
  onDeleteAnswer,
  onDelete,
  onStartAnswer,
  onSubmitAnswer,
  onToggleAnswerVisibility,
  onToggleVisibility,
  question,
  updateError,
  updatePending,
}: {
  canManage: boolean;
  answerActionError: unknown;
  answerActionPending: boolean;
  answerForm: AnswerForm;
  answerMutationError: unknown;
  deleteError: unknown;
  deletePending: boolean;
  formError: string;
  isAnswerSubmitting: boolean;
  onAnswerChange: (form: AnswerForm) => void;
  onCancelAnswer: () => void;
  onDeleteAnswer: (answer: ContestAnswer) => void;
  onDelete: () => void;
  onStartAnswer: () => void;
  onSubmitAnswer: (event: FormEvent<HTMLFormElement>) => void;
  onToggleAnswerVisibility: (answer: ContestAnswer) => void;
  onToggleVisibility: () => void;
  question: ContestQuestion;
  updateError: unknown;
  updatePending: boolean;
}) {
  const isAnswerFormOpen =
    answerForm.questionId === question.contest_question_id;
  const forcedPrivateAnswer = question.visibility === 'private';

  return (
    <article
      id={`question-detail-${question.contest_question_id}`}
      className="operator-board-detail"
    >
      <div className="operator-board-question">
        <QuestionMeta question={question} />
        <p className="operator-board-body">{question.body}</p>
        {canManage ? (
          <div className="flex flex-wrap gap-2">
            <button
              className="inline-flex h-9 items-center gap-2 rounded-lg bg-indigo-600 px-4 text-sm font-semibold text-white disabled:bg-slate-300"
              disabled={isAnswerSubmitting}
              onClick={onStartAnswer}
              type="button"
            >
              <NoticeIcon />
              {isAnswerFormOpen ? '답변 작성 중' : '답변 작성'}
            </button>
            <button
              className="h-9 rounded-lg border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:text-slate-300"
              disabled={updatePending}
              onClick={onToggleVisibility}
              type="button"
            >
              {question.visibility === 'public' ? '비공개 전환' : '공개 전환'}
            </button>
            <button
              className="h-9 rounded-lg border border-rose-200 bg-white px-4 text-sm font-semibold text-rose-700 transition hover:bg-rose-50 disabled:text-slate-300"
              disabled={deletePending}
              onClick={onDelete}
              type="button"
            >
              삭제
            </button>
          </div>
        ) : null}
      </div>

      {updateError || deleteError ? (
        <ErrorBox
          error={updateError || deleteError}
          fallback="게시글 처리에 실패했습니다"
        />
      ) : null}

      {canManage && isAnswerFormOpen ? (
        <form className="operator-board-composer" onSubmit={onSubmitAnswer}>
          <label className="grid gap-2 text-sm font-semibold text-slate-700">
            공개 범위
            <select
              aria-label="답변 공개 범위"
              className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100 disabled:bg-slate-100 disabled:text-slate-600"
              disabled={forcedPrivateAnswer || isAnswerSubmitting}
              onChange={(event) =>
                onAnswerChange({
                  ...answerForm,
                  visibility: event.target.value as AnswerForm['visibility'],
                })
              }
              value={forcedPrivateAnswer ? 'questioner' : answerForm.visibility}
            >
              {!forcedPrivateAnswer ? (
                <option value="public">공개</option>
              ) : null}
              <option value="questioner">비공개</option>
            </select>
          </label>
          {forcedPrivateAnswer ? (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-medium text-amber-800">
              비공개 질문에는 비공개 답변만 등록할 수 있습니다.
            </p>
          ) : null}
          <textarea
            aria-label="답변 내용"
            autoFocus
            disabled={isAnswerSubmitting}
            placeholder="참가자에게 전달할 답변을 입력하세요."
            className="min-h-32 resize-y rounded-lg border border-slate-200 bg-white px-3 py-3 text-sm leading-6 text-slate-950 outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100"
            onChange={(event) =>
              onAnswerChange({ ...answerForm, body: event.target.value })
            }
            value={answerForm.body}
          />
          {formError || answerMutationError ? (
            <ErrorBox
              error={answerMutationError}
              fallback={formError || '답변 등록에 실패했습니다'}
            />
          ) : null}
          <div className="flex justify-end gap-2">
            <button
              className="h-10 rounded-lg border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-600"
              disabled={isAnswerSubmitting}
              onClick={onCancelAnswer}
              type="button"
            >
              취소
            </button>
            <button
              className="h-10 rounded-lg bg-indigo-600 px-4 text-sm font-semibold text-white disabled:bg-slate-300"
              disabled={isAnswerSubmitting}
              type="submit"
            >
              {isAnswerSubmitting ? '등록 중' : '답변 등록'}
            </button>
          </div>
        </form>
      ) : null}

      <section className="operator-board-replies" aria-label="답변 내역">
        <h3 className="text-sm font-semibold text-slate-700">
          답변 내역 · {question.answers.length}건
        </h3>
        {question.answers.map((answer) => (
          <article
            className="operator-board-reply"
            key={answer.contest_answer_id}
          >
            <div className="grid min-w-0 gap-3">
              <div className="flex flex-wrap gap-2 text-xs font-semibold text-slate-600">
                <span
                  className={[
                    'rounded-full px-3 py-1',
                    answer.created_by_role === 'operator'
                      ? 'bg-indigo-100 text-indigo-700'
                      : 'bg-slate-100 text-slate-700',
                  ].join(' ')}
                >
                  {answerAuthorLabel(question, answer)}
                </span>
                {answerAuthorContext(answer) ? (
                  <span className="py-1 text-slate-600">
                    {answerAuthorContext(answer)}
                  </span>
                ) : null}
                <span className="py-1 text-slate-600">
                  {answer.visibility === 'public' ? '공개' : '비공개'}
                </span>
                <span className="py-1 text-slate-600">
                  {formatDateTime(answer.created_at)}
                </span>
              </div>
              <p className="operator-board-body">{answer.body}</p>
              {canManage ? (
                <div className="flex flex-wrap justify-end gap-2">
                  <button
                    className="h-8 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:text-slate-300"
                    disabled={answerActionPending}
                    onClick={() => onToggleAnswerVisibility(answer)}
                    type="button"
                  >
                    {answer.visibility === 'public'
                      ? '비공개 전환'
                      : '공개 전환'}
                  </button>
                  <button
                    className="h-8 rounded-lg border border-rose-200 bg-white px-3 text-xs font-semibold text-rose-700 transition hover:bg-rose-50 disabled:text-slate-300"
                    disabled={answerActionPending}
                    onClick={() => onDeleteAnswer(answer)}
                    type="button"
                  >
                    삭제
                  </button>
                </div>
              ) : null}
            </div>
          </article>
        ))}
        {question.answers.length === 0 ? (
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-700">
            아직 등록된 답변이 없습니다.
          </p>
        ) : null}
        {answerActionError ? (
          <ErrorBox
            error={answerActionError}
            fallback="댓글/답변 처리에 실패했습니다"
          />
        ) : null}
      </section>
    </article>
  );
}

function QuestionMeta({ question }: { question: ContestQuestion }) {
  return (
    <span className="flex flex-wrap gap-x-3 gap-y-1 text-sm font-medium text-slate-600">
      <span>작성자: {questionAuthorName(question)}</span>
      <span>팀: {question.team_name ?? '-'}</span>
      <span>유형: {question.division_name ?? '-'}</span>
      <span>작성일: {formatDateTime(question.created_at)}</span>
    </span>
  );
}

function ErrorBox({ error, fallback }: { error: unknown; fallback: string }) {
  return (
    <p className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
      {error ? formatApiError(error, fallback) : fallback}
    </p>
  );
}
