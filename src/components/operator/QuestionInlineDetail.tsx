import Select from '@/shared/ui/Select';
import type { FormEvent } from 'react';
import type {
  ContestAnswer,
  ContestQuestion,
} from '@/domains/serviceCommunication/types';
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
  commentScopeLocked = false,
  onChangeCommentScope,
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
  commentScopeLocked?: boolean;
  onChangeCommentScope?: (scope: 'all' | 'operators') => void;
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

  const answers = [...question.answers].sort(
    (a, b) =>
      Date.parse(a.created_at) - Date.parse(b.created_at) ||
      a.contest_answer_id.localeCompare(b.contest_answer_id),
  );
  const composerId = `question-answer-${question.contest_question_id}`;
  const privateHintId = `${composerId}-privacy`;
  return (
    <article
      id={`question-detail-${question.contest_question_id}`}
      className="contest-question-detail operator-question-detail"
    >
      <div className="operator-question-post">
        <p className="contest-question-body">{question.body}</p>
        {canManage ? (
          <div className="operator-question-tools">
            <div className="operator-thread-tools">
              {onChangeCommentScope ? (
                <button
                  type="button"
                  className="operator-thread-tool"
                  disabled={updatePending || commentScopeLocked}
                  title={
                    commentScopeLocked
                      ? '대회 설정으로 고정되어 있습니다.'
                      : '댓글 작성 범위 변경'
                  }
                  onClick={() =>
                    onChangeCommentScope(
                      (question.effective_comment_scope ??
                        question.comment_scope ??
                        'all') === 'all'
                        ? 'operators'
                        : 'all',
                    )
                  }
                >
                  댓글:{' '}
                  {(question.effective_comment_scope ??
                    question.comment_scope ??
                    'all') === 'all'
                    ? '전체'
                    : '운영진만'}
                  {commentScopeLocked ? ' · 고정' : ''}
                </button>
              ) : null}
              <button
                type="button"
                className="operator-thread-tool"
                disabled={updatePending}
                onClick={onToggleVisibility}
              >
                {question.visibility === 'public' ? '비공개 전환' : '공개 전환'}
              </button>
              <button
                type="button"
                className="operator-thread-tool operator-thread-tool--danger"
                disabled={deletePending}
                onClick={onDelete}
              >
                삭제
              </button>
            </div>
            <button
              type="button"
              className="operator-thread-reply-button"
              aria-expanded={isAnswerFormOpen}
              aria-controls={composerId}
              disabled={isAnswerSubmitting}
              onClick={() => {
                if (!isAnswerFormOpen) onStartAnswer();
              }}
            >
              {isAnswerFormOpen ? '답변 작성 중' : '답변 작성'}
            </button>
          </div>
        ) : null}
        {updateError || deleteError ? (
          <ErrorBox
            error={updateError || deleteError}
            fallback="게시글 처리에 실패했습니다"
          />
        ) : null}
      </div>
      <section className="contest-replies" aria-label="답변 내역">
        <h3 className="operator-thread-heading">답변 {answers.length}건</h3>
        {answers.map((answer) => (
          <article
            className="contest-reply"
            data-operator={answer.created_by_role === 'operator'}
            key={answer.contest_answer_id}
          >
            <header>
              <strong>{answerAuthorLabel(question, answer)}</strong>
              {answerAuthorContext(answer) ? (
                <span>{answerAuthorContext(answer)}</span>
              ) : null}
              <span>{answer.visibility === 'public' ? '공개' : '비공개'}</span>
              <time dateTime={answer.created_at}>
                {formatDateTime(answer.created_at)}
              </time>
            </header>
            <p>{answer.body}</p>
            {canManage ? (
              <footer className="operator-thread-tools operator-thread-tools--reply">
                <button
                  type="button"
                  className="operator-thread-tool"
                  disabled={answerActionPending}
                  onClick={() => onToggleAnswerVisibility(answer)}
                >
                  {answer.visibility === 'public' ? '비공개 전환' : '공개 전환'}
                </button>
                <button
                  type="button"
                  className="operator-thread-tool operator-thread-tool--danger"
                  disabled={answerActionPending}
                  onClick={() => onDeleteAnswer(answer)}
                >
                  삭제
                </button>
              </footer>
            ) : null}
          </article>
        ))}
        {!answers.length ? (
          <p className="contest-replies-empty">아직 답변이 없습니다.</p>
        ) : null}
        {answerActionError ? (
          <ErrorBox
            error={answerActionError}
            fallback="댓글/답변 처리에 실패했습니다"
          />
        ) : null}
      </section>
      {canManage && isAnswerFormOpen ? (
        <form
          id={composerId}
          className="contest-reply-form"
          onSubmit={onSubmitAnswer}
        >
          <label className="contest-field">
            <span>답변</span>
            <textarea
              aria-label="답변 내용"
              autoFocus
              disabled={isAnswerSubmitting}
              rows={3}
              placeholder="참가자에게 전달할 답변을 입력하세요."
              onChange={(event) =>
                onAnswerChange({ ...answerForm, body: event.target.value })
              }
              value={answerForm.body}
            />
          </label>
          {forcedPrivateAnswer ? (
            <p id={privateHintId} className="operator-thread-privacy">
              비공개 질문에는 비공개 답변만 등록할 수 있습니다.
            </p>
          ) : null}
          {formError || answerMutationError ? (
            <ErrorBox
              error={answerMutationError}
              fallback={formError || '답변 등록에 실패했습니다'}
            />
          ) : null}
          <div className="operator-answer-actions">
            <label className="operator-answer-visibility">
              공개 범위
              <Select
                aria-label="답변 공개 범위"
                aria-describedby={
                  forcedPrivateAnswer ? privateHintId : undefined
                }
                disabled={forcedPrivateAnswer || isAnswerSubmitting}
                value={
                  forcedPrivateAnswer ? 'questioner' : answerForm.visibility
                }
                onChange={(event) =>
                  onAnswerChange({
                    ...answerForm,
                    visibility: event.target.value as AnswerForm['visibility'],
                  })
                }
              >
                {!forcedPrivateAnswer ? (
                  <option value="public">공개</option>
                ) : null}
                <option value="questioner">비공개</option>
              </Select>
            </label>
            <div className="operator-thread-tools">
              <button
                type="button"
                className="operator-thread-tool"
                disabled={isAnswerSubmitting}
                onClick={onCancelAnswer}
              >
                취소
              </button>
              <button
                type="submit"
                className="operator-thread-reply-button"
                disabled={isAnswerSubmitting}
              >
                {isAnswerSubmitting ? '등록 중' : '답변 등록'}
              </button>
            </div>
          </div>
        </form>
      ) : null}
    </article>
  );
}

function ErrorBox({ error, fallback }: { error: unknown; fallback: string }) {
  return (
    <p
      role="alert"
      className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700"
    >
      {error ? formatApiError(error, fallback) : fallback}
    </p>
  );
}
