import QuestionInlineDetail, {
  type AnswerForm,
} from '@/components/operator/QuestionInlineDetail';
import './OperatorBoardPage.css';
import {
  hasOperatorAnswer,
  matchesQuestionSearch,
} from '@/domains/serviceCommunication/boardPresentation';
import useConfirmation from '@/shared/ui/useConfirmation';
import { type FormEvent, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import PageLayout from '@/components/common/PageLayout';
import { sharedUiText } from '@/data/uiText';
import {
  OperatorAccessGate,
  OperatorPanel,
  OperatorTabs,
} from '@/components/operator/OperatorShell';
import { getOperatorContestDashboard } from '@/domains/contestAdministration/api';
import { tokenQueryIdentity } from '@/domains/identityAccess/queryIdentity';
import { hasContestPermission } from '@/domains/identityAccess/permissions';
import {
  createContestAnswer,
  deleteContestAnswer,
  deleteContestQuestion,
  listOperatorContestQuestions,
  updateContestAnswer,
  updateContestQuestion,
} from '@/domains/serviceCommunication/api';
import type {
  ContestAnswer,
  ContestQuestion,
} from '@/domains/serviceCommunication/types';
import { formatApiError } from '@/shared/api/errors';
import { formatDateTime } from '@/shared/lib/dateTime';

const emptyAnswerForm: AnswerForm = {
  body: '',
  questionId: '',
  visibility: 'public',
};

function questionAuthorName(question: ContestQuestion) {
  return question.author_name ?? '참가자';
}
function questionAuthorContext(question: ContestQuestion) {
  return (
    [question.team_name, question.division_name].filter(Boolean).join(' · ') ||
    null
  );
}

function answerCountLabel(count: number) {
  return count > 0 ? `답변 ${count}건` : '답변 없음';
}

export default function OperatorBoardPage() {
  const { contestId } = useParams();

  return (
    <OperatorAccessGate
      contestId={contestId}
      permission="contest.board.question.view"
    >
      {(session) =>
        contestId ? (
          <OperatorBoardContent
            contestId={contestId}
            token={session.accessToken}
            canManage={hasContestPermission(
              session,
              contestId,
              'contest.board.question.manage',
            )}
          />
        ) : (
          <PageLayout
            variant="management"
            title={sharedUiText.contestSelectionRequiredTitle}
          >
            {sharedUiText.contestSelectionRequiredBody}
          </PageLayout>
        )
      }
    </OperatorAccessGate>
  );
}

function OperatorBoardContent({
  contestId,
  token,
  canManage,
}: {
  contestId: string;
  token: string;
  canManage: boolean;
}) {
  const { confirm: confirmAction, dialog: confirmationDialog } =
    useConfirmation();

  const queryClient = useQueryClient();
  const queryIdentity = tokenQueryIdentity(token);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [visibilityFilter, setVisibilityFilter] = useState('all');
  const [expandedQuestionId, setExpandedQuestionId] = useState('');
  const [answerForm, setAnswerForm] = useState(emptyAnswerForm);
  const [formError, setFormError] = useState('');

  const dashboardQuery = useQuery({
    queryKey: ['operator', 'dashboard', contestId, queryIdentity],
    queryFn: () => getOperatorContestDashboard(contestId, token),
  });
  const questionsQuery = useQuery({
    queryKey: ['operator', 'boards', contestId, queryIdentity],
    queryFn: () => listOperatorContestQuestions(contestId, token),
    refetchInterval: 15_000,
  });

  const questions = useMemo(
    () =>
      [...(questionsQuery.data ?? [])].sort(
        (a, b) =>
          Number(!hasOperatorAnswer(b)) - Number(!hasOperatorAnswer(a)) ||
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      ),
    [questionsQuery.data],
  );
  const pendingCount = questions.filter(
    (question) => !hasOperatorAnswer(question),
  ).length;
  const filteredQuestions = questions.filter(
    (question) =>
      matchesQuestionSearch(question, search) &&
      (statusFilter === 'all' ||
        (statusFilter === 'answered') === hasOperatorAnswer(question)) &&
      (visibilityFilter === 'all' || question.visibility === visibilityFilter),
  );
  const draftingQuestion = questions.find(
    (question) => question.contest_question_id === answerForm.questionId,
  );
  const answerMutation = useMutation({
    mutationFn: () => {
      const question = questions.find(
        (item) => item.contest_question_id === answerForm.questionId,
      );

      return createContestAnswer(contestId, answerForm.questionId, token, {
        body: answerForm.body.trim(),
        visibility:
          question?.visibility === 'private'
            ? 'questioner'
            : answerForm.visibility,
      });
    },
    onSuccess: () => {
      setAnswerForm(emptyAnswerForm);
      setFormError('');
      void queryClient.invalidateQueries({
        queryKey: ['operator', 'boards', contestId],
      });
    },
  });

  const updateQuestionMutation = useMutation({
    mutationFn: ({
      questionId,
      visibility,
    }: {
      questionId: string;
      visibility: ContestQuestion['visibility'];
    }) => updateContestQuestion(contestId, questionId, token, { visibility }),
    onSuccess: (question) => {
      setExpandedQuestionId(question.contest_question_id);
      if (
        answerForm.questionId === question.contest_question_id &&
        question.visibility === 'private'
      ) {
        setAnswerForm((previous) => ({
          ...previous,
          visibility: 'questioner',
        }));
      }
      void queryClient.invalidateQueries({
        queryKey: ['operator', 'boards', contestId],
      });
    },
  });

  const deleteQuestionMutation = useMutation({
    mutationFn: (questionId: string) =>
      deleteContestQuestion(contestId, questionId, token),
    onSuccess: (_result, questionId) => {
      if (answerForm.questionId === questionId) setAnswerForm(emptyAnswerForm);
      if (expandedQuestionId === questionId) {
        setExpandedQuestionId('');
      }
      void queryClient.invalidateQueries({
        queryKey: ['operator', 'boards', contestId],
      });
    },
  });
  const updateAnswerMutation = useMutation({
    mutationFn: ({
      answerId,
      questionId,
      visibility,
    }: {
      answerId: string;
      questionId: string;
      visibility: ContestAnswer['visibility'];
    }) =>
      updateContestAnswer(contestId, questionId, answerId, token, {
        visibility,
      }),
    onSuccess: (_answer, variables) => {
      setExpandedQuestionId(variables.questionId);
      void queryClient.invalidateQueries({
        queryKey: ['operator', 'boards', contestId],
      });
    },
  });
  const deleteAnswerMutation = useMutation({
    mutationFn: ({
      answerId,
      questionId,
    }: {
      answerId: string;
      questionId: string;
    }) => deleteContestAnswer(contestId, questionId, answerId, token),
    onSuccess: (_result, variables) => {
      setExpandedQuestionId(variables.questionId);
      void queryClient.invalidateQueries({
        queryKey: ['operator', 'boards', contestId],
      });
    },
  });

  async function startAnswer(question: ContestQuestion) {
    if (answerMutation.isPending) return;
    if (answerForm.questionId === question.contest_question_id) return;
    if (
      answerForm.body.trim() &&
      !(await confirmAction('작성 중인 답변을 버리고 다른 질문에 답변할까요?'))
    )
      return;
    answerMutation.reset();
    setExpandedQuestionId(question.contest_question_id);
    setAnswerForm({
      body: '',
      questionId: question.contest_question_id,
      visibility: question.visibility === 'private' ? 'questioner' : 'public',
    });
    setFormError('');
  }

  function submitAnswer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (answerMutation.isPending) return;
    if (!answerForm.questionId) {
      setFormError('답변할 질문을 선택해 주세요.');
      return;
    }
    if (!answerForm.body.trim()) {
      setFormError('답변 내용을 입력해 주세요.');
      return;
    }
    answerMutation.mutate();
  }

  function toggleQuestionVisibility(question: ContestQuestion) {
    updateQuestionMutation.mutate({
      questionId: question.contest_question_id,
      visibility: question.visibility === 'public' ? 'private' : 'public',
    });
  }

  async function removeQuestion(question: ContestQuestion) {
    const confirmed = await confirmAction(
      `"${question.title}" 게시글을 삭제할까요? 답변도 함께 삭제되며 복구할 수 없습니다.`,
    );
    if (!confirmed) return;
    deleteQuestionMutation.mutate(question.contest_question_id);
  }

  function toggleAnswerVisibility(
    question: ContestQuestion,
    answer: ContestAnswer,
  ) {
    updateAnswerMutation.mutate({
      answerId: answer.contest_answer_id,
      questionId: question.contest_question_id,
      visibility: answer.visibility === 'public' ? 'questioner' : 'public',
    });
  }

  async function removeAnswer(
    question: ContestQuestion,
    answer: ContestAnswer,
  ) {
    const confirmed = await confirmAction('이 댓글/답변을 삭제할까요?');
    if (!confirmed) return;
    deleteAnswerMutation.mutate({
      answerId: answer.contest_answer_id,
      questionId: question.contest_question_id,
    });
  }

  function toggleQuestion(questionId: string) {
    setExpandedQuestionId((current) =>
      current === questionId ? '' : questionId,
    );
    setFormError('');
  }

  return (
    <PageLayout
      variant="management"
      description={
        canManage
          ? '참가자가 남긴 질문을 확인하고 운영자 답변을 등록합니다.'
          : '참가자 질문과 답변을 확인합니다.'
      }
      eyebrow="Operator"
      title={`${dashboardQuery.data?.contest.title ?? '대회'} 게시판`}
      width="full"
    >
      {confirmationDialog}

      <OperatorTabs contestId={contestId} />

      {dashboardQuery.error || questionsQuery.error ? (
        <ErrorBox
          error={dashboardQuery.error || questionsQuery.error}
          fallback="게시판 질문을 불러오지 못했습니다"
        />
      ) : null}

      <OperatorPanel
        description="운영자 답변이 없는 질문부터 표시합니다. 15초마다 새 질문을 확인합니다."
        title="질문 목록"
      >
        <div className="operator-board-toolbar">
          <div
            className="operator-board-filters"
            role="group"
            aria-label="답변 상태 필터"
          >
            {[
              ['all', '전체', questions.length],
              ['pending', '답변 필요', pendingCount],
              ['answered', '답변 완료', questions.length - pendingCount],
            ].map(([value, label, count]) => (
              <button
                key={value}
                type="button"
                aria-pressed={statusFilter === value}
                onClick={() => setStatusFilter(String(value))}
              >
                {label} <span>{count}</span>
              </button>
            ))}
          </div>
          <div className="operator-board-search">
            <input
              aria-label="게시판 검색"
              type="search"
              placeholder="제목·내용·작성자·팀 검색"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <select
              aria-label="질문 공개 범위 필터"
              value={visibilityFilter}
              onChange={(event) => setVisibilityFilter(event.target.value)}
            >
              <option value="all">전체 공개 범위</option>
              <option value="public">공개</option>
              <option value="private">비공개</option>
            </select>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600">
          <p role="status">
            {filteredQuestions.length}개 질문
            {search || statusFilter !== 'all' || visibilityFilter !== 'all'
              ? ` / 전체 ${questions.length}개`
              : ''}
          </p>
          {search || statusFilter !== 'all' || visibilityFilter !== 'all' ? (
            <button
              type="button"
              className="rounded px-2 py-1 font-semibold text-indigo-700"
              onClick={() => {
                setSearch('');
                setStatusFilter('all');
                setVisibilityFilter('all');
              }}
            >
              필터 초기화
            </button>
          ) : null}
        </div>
        {answerForm.body.trim() &&
        draftingQuestion &&
        (expandedQuestionId !== answerForm.questionId ||
          !filteredQuestions.includes(draftingQuestion)) ? (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-indigo-50 px-4 py-3 text-sm text-indigo-900">
            <span className="min-w-0 break-words">
              작성 중인 답변이 있습니다: {draftingQuestion.title}
            </span>
            <button
              type="button"
              className="shrink-0 font-semibold underline underline-offset-4"
              onClick={() => {
                setSearch('');
                setStatusFilter('all');
                setVisibilityFilter('all');
                setExpandedQuestionId(answerForm.questionId);
              }}
            >
              이어서 작성
            </button>
          </div>
        ) : null}
        {questionsQuery.isLoading ? (
          <p role="status" className="py-8 text-center text-sm text-slate-600">
            질문을 불러오는 중입니다.
          </p>
        ) : null}
        <ul className="operator-board-list">
          {filteredQuestions.map((question) => {
            const isExpanded =
              expandedQuestionId === question.contest_question_id;

            return (
              <li key={question.contest_question_id}>
                <button
                  aria-expanded={isExpanded}
                  aria-controls={`question-detail-${question.contest_question_id}`}
                  className="operator-board-row"
                  onClick={() => toggleQuestion(question.contest_question_id)}
                  type="button"
                >
                  <span className="operator-board-row-main">
                    <span className="flex flex-wrap items-center gap-2">
                      <StatusBadge answered={hasOperatorAnswer(question)} />
                      <VisibilityBadge visibility={question.visibility} />
                      <span className="text-xs text-slate-600">
                        {answerCountLabel(question.answers.length)}
                      </span>
                    </span>
                    <strong className="operator-board-title">
                      {question.title}
                    </strong>
                    <span className="operator-board-preview">
                      {question.body}
                    </span>
                    <span className="operator-board-meta">
                      <span>
                        {questionAuthorName(question)}
                        {questionAuthorContext(question)
                          ? ` · ${questionAuthorContext(question)}`
                          : ''}
                      </span>
                      <time>{formatDateTime(question.created_at)}</time>
                    </span>
                  </span>
                  <svg
                    aria-hidden="true"
                    viewBox="0 0 20 20"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    className={`size-4 shrink-0 text-slate-600 transition-transform motion-reduce:transition-none ${isExpanded ? 'rotate-180' : ''}`}
                  >
                    <path d="m5 7.5 5 5 5-5" />
                  </svg>
                </button>

                {isExpanded ? (
                  <QuestionInlineDetail
                    canManage={canManage}
                    answerForm={answerForm}
                    answerMutationError={answerMutation.error}
                    deleteError={deleteQuestionMutation.error}
                    formError={formError}
                    isAnswerSubmitting={answerMutation.isPending}
                    onAnswerChange={setAnswerForm}
                    onCancelAnswer={() => {
                      setAnswerForm(emptyAnswerForm);
                      setFormError('');
                    }}
                    onDelete={() => removeQuestion(question)}
                    onStartAnswer={() => startAnswer(question)}
                    onSubmitAnswer={submitAnswer}
                    onDeleteAnswer={(answer) => removeAnswer(question, answer)}
                    onToggleAnswerVisibility={(answer) =>
                      toggleAnswerVisibility(question, answer)
                    }
                    onToggleVisibility={() =>
                      toggleQuestionVisibility(question)
                    }
                    question={question}
                    answerActionError={
                      updateAnswerMutation.error || deleteAnswerMutation.error
                    }
                    answerActionPending={
                      updateAnswerMutation.isPending ||
                      deleteAnswerMutation.isPending
                    }
                    updateError={updateQuestionMutation.error}
                    updatePending={updateQuestionMutation.isPending}
                    deletePending={deleteQuestionMutation.isPending}
                  />
                ) : null}
              </li>
            );
          })}
        </ul>
        {!questionsQuery.isLoading && filteredQuestions.length === 0 ? (
          <p className="rounded-lg border border-dashed border-slate-200 px-4 py-8 text-center text-sm font-medium text-slate-600">
            {questions.length
              ? '검색 조건에 맞는 질문이 없습니다. 필터를 바꿔보세요.'
              : '아직 등록된 질문이 없습니다.'}
          </p>
        ) : null}
      </OperatorPanel>
    </PageLayout>
  );
}

function StatusBadge({ answered }: { answered: boolean }) {
  return (
    <span
      className={[
        'rounded-full px-2 py-1 text-xs font-semibold',
        answered
          ? 'bg-emerald-100 text-emerald-700'
          : 'bg-amber-100 text-amber-700',
      ].join(' ')}
    >
      {answered ? '답변 완료' : '답변 필요'}
    </span>
  );
}

function VisibilityBadge({
  visibility,
}: {
  visibility: ContestQuestion['visibility'];
}) {
  return (
    <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-600">
      {visibility === 'private' ? '비공개' : '공개'}
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
