import './ContestBoardPage.css';
import NoticeCountdownText from '@/components/contest/NoticeCountdownText';
import InterfaceIcon from '@/components/common/InterfaceIcon';
import { hasOperatorAnswer } from '@/domains/serviceCommunication/boardPresentation';
import { type FormEvent, type ReactNode, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { PageHeading } from '@/components/common/PageLayout';
import ContestPageFrame from '@/components/contest/ContestPageFrame';
import ContestPageNavigation from '@/components/contest/ContestPageNavigation';
import ContestPageShell from '@/components/contest/ContestPageShell';
import { contestBoardText } from '@/data/contestBoardContent';
import {
  canViewContestResource,
  contestAccessPhase,
  contestResourceAccess,
  contestResourceAccessMessage,
} from '@/domains/contestAdministration/logic';
import type { Contest } from '@/domains/contestAdministration/types';
import {
  contestQueryKeys,
  generalSessionQueryIdentity,
  participantSessionQueryIdentity,
} from '@/domains/contestRuntime/queryKeys';
import { useContestParticipantSession } from '@/domains/contestRuntime/useContestParticipantSession';
import { contestStaffDisplayName } from '@/domains/identityAccess/staffDisplay';
import {
  createContestQuestionAnswer,
  createContestQuestion,
  getContestNotices,
  getContestQuestions,
} from '@/domains/serviceCommunication/api';
import type {
  ContestAnswer,
  ContestNotice,
  ContestQuestion,
} from '@/domains/serviceCommunication/types';
import { formatUserApiError } from '@/shared/api/errors';
import { formatDateTime } from '@/shared/lib/dateTime';
import PageNotice from '@/shared/ui/PageNotice';

type QuestionFormState = {
  body: string;
  title: string;
  visibility: ContestQuestion['visibility'];
};

const emptyQuestionForm: QuestionFormState = {
  body: '',
  title: '',
  visibility: 'public',
};

const NOTICE_PAGE_SIZE = 5;

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
  return question.author_name ?? contestBoardText.authorFallback;
}

function questionAuthorContext(question: ContestQuestion) {
  return authorContext(question.team_name, question.division_name);
}

function answerAuthorLabel(question: ContestQuestion, answer: ContestAnswer) {
  if (answer.created_by_role === 'operator')
    return contestStaffDisplayName(
      answer.created_by_name,
      answer.created_by_title,
    );

  const name =
    answer.created_by_name ||
    answer.created_by_email ||
    contestBoardText.authorFallback;
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

function ContestBoardContent({
  contest,
  contestId,
}: {
  contest: Contest;
  contestId: string;
}) {
  const queryClient = useQueryClient();
  const {
    activeParticipantSession,
    isPreview,
    ensureParticipantSession,
    generalSession,
    participantContest,
    token,
  } = useContestParticipantSession(contestId);
  const hasSessionAccess = Boolean(
    participantContest || activeParticipantSession,
  );
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedNoticeId = searchParams.get('noticeId') ?? '';
  const requestedQuestionId = searchParams.get('questionId') ?? '';
  const noticeAccess = contestResourceAccess(contest, 'notice');
  const boardAccess = contestResourceAccess(contest, 'board');
  const phase = isPreview ? 'running' : contestAccessPhase(contest);
  const isEnded = phase === 'ended';
  const canViewNotices =
    !isEnded || canViewContestResource(contest, hasSessionAccess, noticeAccess);
  const canViewQuestions =
    !isEnded || canViewContestResource(contest, hasSessionAccess, boardAccess);
  const activeBoardTab = requestedNoticeId
    ? 'notices'
    : requestedQuestionId
      ? 'questions'
      : searchParams.get('tab') === 'notices'
        ? 'notices'
        : canViewQuestions
          ? 'questions'
          : 'notices';
  const [expandedNoticeId, setExpandedNoticeId] = useState(requestedNoticeId);
  const [noticePage, setNoticePage] = useState(1);
  const [expandedQuestionId, setExpandedQuestionId] =
    useState(requestedQuestionId);
  const [isWritingQuestion, setIsWritingQuestion] = useState(false);
  const [questionForm, setQuestionForm] =
    useState<QuestionFormState>(emptyQuestionForm);
  const [formError, setFormError] = useState('');
  const [answerDrafts, setAnswerDrafts] = useState<Record<string, string>>({});
  const [answerErrors, setAnswerErrors] = useState<Record<string, string>>({});
  const generalQueryIdentity = generalSessionQueryIdentity(generalSession);
  const participantQueryIdentity = participantSessionQueryIdentity(
    activeParticipantSession,
    participantContest,
  );

  const noticesQuery = useQuery({
    enabled: canViewNotices,
    queryKey: contestQueryKeys.notices(
      contestId,
      generalQueryIdentity,
      participantContest?.contest.contest_id,
      participantQueryIdentity,
    ),
    queryFn: async () => {
      const session =
        participantContest ||
        activeParticipantSession ||
        noticeAccess === 'participants'
          ? await ensureParticipantSession()
          : null;
      return getContestNotices(contestId, session?.accessToken ?? token);
    },
    refetchInterval: 15_000,
  });
  const questionsQuery = useQuery({
    enabled: canViewQuestions,
    queryKey: contestQueryKeys.questions(
      contestId,
      generalQueryIdentity,
      participantContest?.contest.contest_id,
      participantQueryIdentity,
    ),
    queryFn: async () => {
      const session =
        participantContest ||
        activeParticipantSession ||
        boardAccess === 'participants'
          ? await ensureParticipantSession()
          : null;
      return getContestQuestions(contestId, session?.accessToken ?? token);
    },
    refetchInterval: 15_000,
  });
  const notices = useMemo(
    () =>
      [...(noticesQuery.data ?? [])].sort(
        (a, b) =>
          Number(b.pinned) - Number(a.pinned) ||
          new Date(b.published_at).getTime() -
            new Date(a.published_at).getTime(),
      ),
    [noticesQuery.data],
  );
  const targetNoticeIndex = requestedNoticeId
    ? notices.findIndex(
        (notice) => notice.contest_notice_id === requestedNoticeId,
      )
    : -1;
  const activeNoticeId = requestedNoticeId || expandedNoticeId;
  const currentNoticePage =
    targetNoticeIndex >= 0
      ? Math.floor(targetNoticeIndex / NOTICE_PAGE_SIZE) + 1
      : noticePage;
  const totalNoticePages = Math.max(
    1,
    Math.ceil(notices.length / NOTICE_PAGE_SIZE),
  );
  const pagedNotices = notices.slice(
    (currentNoticePage - 1) * NOTICE_PAGE_SIZE,
    currentNoticePage * NOTICE_PAGE_SIZE,
  );
  const questions = useMemo(
    () =>
      [...(questionsQuery.data ?? [])].sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      ),
    [questionsQuery.data],
  );
  const activeQuestionId = requestedQuestionId || expandedQuestionId;

  const createQuestionMutation = useMutation({
    mutationFn: async () => {
      const participantSession = await ensureParticipantSession();
      const submitToken = participantSession?.accessToken ?? token;

      if (!submitToken) {
        throw new Error(contestBoardText.questionSubmitLoginRequired);
      }

      return createContestQuestion(contestId, submitToken, {
        body: questionForm.body.trim(),
        title: questionForm.title.trim(),
        visibility: questionForm.visibility,
      });
    },
    onSuccess: (question) => {
      setQuestionForm(emptyQuestionForm);
      setFormError('');
      setIsWritingQuestion(false);
      setExpandedQuestionId(question.contest_question_id);
      setSearchParams({ questionId: question.contest_question_id });
      void queryClient.invalidateQueries({
        queryKey: ['contest-questions', contestId],
      });
    },
  });
  const createAnswerMutation = useMutation({
    mutationFn: async ({
      body,
      questionId,
    }: {
      body: string;
      questionId: string;
    }) => {
      const participantSession = await ensureParticipantSession();
      const submitToken = participantSession?.accessToken ?? token;

      if (!submitToken) {
        throw new Error(contestBoardText.answerSubmitLoginRequired);
      }

      return createContestQuestionAnswer(contestId, questionId, submitToken, {
        body: body.trim(),
      });
    },
    onSuccess: (_answer, variables) => {
      setAnswerDrafts((current) => ({
        ...current,
        [variables.questionId]: '',
      }));
      setAnswerErrors((current) => ({
        ...current,
        [variables.questionId]: '',
      }));
      setExpandedQuestionId(variables.questionId);
      setSearchParams({ questionId: variables.questionId });
      void queryClient.invalidateQueries({
        queryKey: ['contest-questions', contestId],
      });
    },
  });

  function submitQuestion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!questionForm.title.trim()) {
      setFormError(contestBoardText.questionTitleRequired);
      return;
    }

    if (!questionForm.body.trim()) {
      setFormError(contestBoardText.questionBodyRequired);
      return;
    }

    createQuestionMutation.mutate();
  }

  function submitAnswer(questionId: string) {
    const body = answerDrafts[questionId]?.trim() ?? '';

    if (!body) {
      setAnswerErrors((current) => ({
        ...current,
        [questionId]: contestBoardText.answerBodyRequired,
      }));
      return;
    }

    setAnswerErrors((current) => ({ ...current, [questionId]: '' }));
    createAnswerMutation.mutate({ body, questionId });
  }

  function toggleNotice(noticeId: string) {
    const nextNoticeId = activeNoticeId === noticeId ? '' : noticeId;
    setExpandedNoticeId(nextNoticeId);
    setSearchParams(
      nextNoticeId ? { noticeId: nextNoticeId } : { tab: 'notices' },
    );
  }

  function changeNoticePage(page: number) {
    setNoticePage(page);
    setExpandedNoticeId('');
    setSearchParams({ tab: 'notices' });
  }

  return (
    <ContestPageFrame>
      <PageHeading
        className="gap-4"
        eyebrow={contest.title}
        title={contestBoardText.pageTitle}
        variant="contest"
      />

      <ContestPageNavigation contest={contest} contestId={contestId} />

      <div className="zoj-contest-board">
        <nav className="contest-board-switch" aria-label="게시판 보기">
          <button
            type="button"
            aria-pressed={activeBoardTab === 'questions'}
            disabled={!canViewQuestions}
            onClick={() => setSearchParams({})}
          >
            질문과 답변 <span>{questions.length}</span>
          </button>
          <button
            type="button"
            aria-pressed={activeBoardTab === 'notices'}
            disabled={!canViewNotices}
            onClick={() => setSearchParams({ tab: 'notices' })}
          >
            공지사항 <span>{notices.length}</span>
          </button>
        </nav>
        {activeBoardTab === 'notices' ? (
          <section className="contest-board-panel">
            {canViewNotices ? (
              <NoticePanel
                contest={contest}
                currentPage={currentNoticePage}
                expandedNoticeId={activeNoticeId}
                isError={noticesQuery.isError}
                isLoading={noticesQuery.isPending}
                notices={pagedNotices}
                onChangePage={changeNoticePage}
                onToggle={toggleNotice}
                showPagination={notices.length > NOTICE_PAGE_SIZE}
                totalPages={totalNoticePages}
              />
            ) : (
              <PageNotice
                message={contestResourceAccessMessage(
                  contest,
                  'notice',
                  hasSessionAccess,
                )}
                status="idle"
              />
            )}
          </section>
        ) : null}

        {activeBoardTab === 'questions' ? (
          <section className="contest-board-panel">
            {canViewQuestions ? (
              <QuestionPanel
                form={questionForm}
                formError={formError}
                isError={questionsQuery.isError}
                isLoading={questionsQuery.isLoading}
                isSubmitting={createQuestionMutation.isPending}
                isSubmittingAnswer={createAnswerMutation.isPending}
                submittingAnswerQuestionId={
                  createAnswerMutation.variables?.questionId ?? ''
                }
                isWriting={isWritingQuestion}
                mutationError={createQuestionMutation.error}
                answerMutationError={createAnswerMutation.error}
                answerMutationQuestionId={
                  createAnswerMutation.variables?.questionId ?? ''
                }
                answerDrafts={answerDrafts}
                answerErrors={answerErrors}
                onCancelWrite={() => {
                  setIsWritingQuestion(false);
                  setFormError('');
                }}
                onChangeAnswer={(questionId, body) => {
                  setAnswerDrafts((current) => ({
                    ...current,
                    [questionId]: body,
                  }));
                  setAnswerErrors((current) => ({
                    ...current,
                    [questionId]: '',
                  }));
                }}
                onChangeForm={setQuestionForm}
                expandedQuestionId={activeQuestionId}
                onToggleQuestion={(questionId) => {
                  setExpandedQuestionId(
                    activeQuestionId === questionId ? '' : questionId,
                  );
                  setSearchParams(
                    activeQuestionId === questionId ? {} : { questionId },
                  );
                }}
                onStartWrite={() => {
                  setIsWritingQuestion(true);
                  setFormError('');
                }}
                onSubmit={submitQuestion}
                onSubmitAnswer={submitAnswer}
                questions={questions}
              />
            ) : (
              <PageNotice
                message={contestResourceAccessMessage(
                  contest,
                  'board',
                  hasSessionAccess,
                )}
                status="idle"
              />
            )}
          </section>
        ) : null}
      </div>
    </ContestPageFrame>
  );
}

function NoticePanel({
  contest,
  currentPage,
  expandedNoticeId,
  isError,
  isLoading,
  notices,
  onChangePage,
  onToggle,
  showPagination,
  totalPages,
}: {
  contest: Contest;
  currentPage: number;
  expandedNoticeId: string;
  isError: boolean;
  isLoading: boolean;
  notices: ContestNotice[];
  onChangePage: (page: number) => void;
  onToggle: (noticeId: string) => void;
  showPagination: boolean;
  totalPages: number;
}) {
  return (
    <section className="contest-board-content">
      <header className="contest-board-heading">
        <h2>공지사항</h2>
      </header>
      {isLoading ? (
        <PageNotice message={contestBoardText.noticeLoading} status="loading" />
      ) : null}
      {isError ? (
        <PageNotice message={contestBoardText.noticeLoadError} status="error" />
      ) : null}
      <ul className="contest-board-list">
        {notices.map((notice) => {
          const expanded = expandedNoticeId === notice.contest_notice_id;
          return (
            <li key={notice.contest_notice_id}>
              <button
                aria-expanded={expanded}
                className="contest-board-row"
                onClick={() => onToggle(notice.contest_notice_id)}
                type="button"
              >
                <span className="contest-board-row__content">
                  <span className="contest-board-row__title">
                    <span
                      className="contest-board-badge"
                      data-tone={
                        notice.emergency
                          ? 'urgent'
                          : notice.pinned
                            ? 'accent'
                            : undefined
                      }
                    >
                      {notice.emergency
                        ? '긴급'
                        : notice.pinned
                          ? '고정'
                          : '공지'}
                    </span>
                    <strong>{notice.title}</strong>
                  </span>
                  <time dateTime={notice.published_at}>
                    {formatDateTime(notice.published_at)}
                  </time>
                </span>
                <InterfaceIcon
                  name="chevronDown"
                  className="contest-board-chevron"
                />
              </button>
              {expanded ? (
                <article className="contest-notice-body">
                  <NoticeCountdownText
                    text={notice.body}
                    template={notice.body_template}
                    contest={contest}
                  />
                </article>
              ) : null}
            </li>
          );
        })}
      </ul>
      {showPagination ? (
        <Pagination
          currentPage={currentPage}
          onChange={onChangePage}
          totalPages={totalPages}
        />
      ) : null}
      {!isLoading && !isError && notices.length === 0 ? (
        <p className="zoj-contest-empty">{contestBoardText.emptyNotices}</p>
      ) : null}
    </section>
  );
}

function Pagination({
  currentPage,
  onChange,
  totalPages,
}: {
  currentPage: number;
  onChange: (page: number) => void;
  totalPages: number;
}) {
  return (
    <nav className="contest-board-pagination" aria-label="공지사항 페이지">
      {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
        <button
          aria-current={currentPage === page ? 'page' : undefined}
          key={page}
          onClick={() => onChange(page)}
          type="button"
        >
          {page}
        </button>
      ))}
    </nav>
  );
}

function QuestionPanel({
  answerDrafts,
  answerErrors,
  answerMutationError,
  answerMutationQuestionId,
  expandedQuestionId,
  form,
  formError,
  isError,
  isLoading,
  isSubmitting,
  isSubmittingAnswer,
  isWriting,
  mutationError,
  onCancelWrite,
  onChangeAnswer,
  onChangeForm,
  onToggleQuestion,
  onStartWrite,
  onSubmit,
  onSubmitAnswer,
  questions,
  submittingAnswerQuestionId,
}: {
  answerDrafts: Record<string, string>;
  answerErrors: Record<string, string>;
  answerMutationError: unknown;
  answerMutationQuestionId: string;
  expandedQuestionId: string;
  form: QuestionFormState;
  formError: string;
  isError: boolean;
  isLoading: boolean;
  isSubmitting: boolean;
  isSubmittingAnswer: boolean;
  isWriting: boolean;
  mutationError: unknown;
  onCancelWrite: () => void;
  onChangeAnswer: (questionId: string, body: string) => void;
  onChangeForm: (form: QuestionFormState) => void;
  onToggleQuestion: (questionId: string) => void;
  onStartWrite: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onSubmitAnswer: (questionId: string) => void;
  questions: ContestQuestion[];
  submittingAnswerQuestionId: string;
}) {
  return (
    <section className="contest-board-content">
      <header className="contest-board-heading">
        <h2>{isWriting ? '질문 작성' : '질문과 답변'}</h2>
        {!isWriting ? (
          <PrimaryButton onClick={onStartWrite}>
            {contestBoardText.askButton}
          </PrimaryButton>
        ) : null}
      </header>
      {isWriting ? (
        <QuestionForm
          form={form}
          formError={formError}
          isSubmitting={isSubmitting}
          mutationError={mutationError}
          onCancel={onCancelWrite}
          onChange={onChangeForm}
          onSubmit={onSubmit}
        />
      ) : null}
      {isLoading ? (
        <PageNotice
          message={contestBoardText.questionLoading}
          status="loading"
        />
      ) : null}
      {isError ? (
        <PageNotice
          message={contestBoardText.questionLoadError}
          status="error"
        />
      ) : null}
      <ul className="contest-board-list">
        {questions.map((question) => {
          const expanded = expandedQuestionId === question.contest_question_id;
          const answered = hasOperatorAnswer(question);
          return (
            <li key={question.contest_question_id}>
              <button
                aria-expanded={expanded}
                className="contest-board-row"
                onClick={() => onToggleQuestion(question.contest_question_id)}
                type="button"
              >
                <span className="contest-board-row__content">
                  <span className="contest-board-row__title">
                    <span
                      className="contest-board-badge"
                      data-tone={answered ? 'answered' : undefined}
                    >
                      {answered ? '답변 완료' : '답변 대기'}
                    </span>
                    <strong>{question.title}</strong>
                    {question.visibility === 'private' ? (
                      <span className="contest-board-private">비공개</span>
                    ) : null}
                  </span>
                  <span className="contest-board-row__meta">
                    <span>{questionAuthorName(question)}</span>
                    {questionAuthorContext(question) ? (
                      <span>{questionAuthorContext(question)}</span>
                    ) : null}
                    <time dateTime={question.created_at}>
                      {formatDateTime(question.created_at)}
                    </time>
                    {question.answers.length > 0 ? (
                      <span>댓글 {question.answers.length}</span>
                    ) : null}
                  </span>
                </span>
                <InterfaceIcon
                  name="chevronDown"
                  className="contest-board-chevron"
                />
              </button>
              {expanded ? (
                <QuestionInlineDetail
                  answerDraft={answerDrafts[question.contest_question_id] ?? ''}
                  answerError={answerErrors[question.contest_question_id] ?? ''}
                  answerMutationError={
                    answerMutationQuestionId === question.contest_question_id
                      ? answerMutationError
                      : null
                  }
                  isSubmittingAnswer={
                    isSubmittingAnswer &&
                    submittingAnswerQuestionId === question.contest_question_id
                  }
                  onChangeAnswer={(body) =>
                    onChangeAnswer(question.contest_question_id, body)
                  }
                  onSubmitAnswer={() =>
                    onSubmitAnswer(question.contest_question_id)
                  }
                  question={question}
                />
              ) : null}
            </li>
          );
        })}
      </ul>
      {!isLoading && !isError && questions.length === 0 ? (
        <p className="zoj-contest-empty">{contestBoardText.emptyQuestions}</p>
      ) : null}
    </section>
  );
}

function QuestionForm({
  form,
  formError,
  isSubmitting,
  mutationError,
  onCancel,
  onChange,
  onSubmit,
}: {
  form: QuestionFormState;
  formError: string;
  isSubmitting: boolean;
  mutationError: unknown;
  onCancel: () => void;
  onChange: (form: QuestionFormState) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <form
      className="contest-question-form"
      onSubmit={onSubmit}
      aria-label="질문 작성"
    >
      <fieldset disabled={isSubmitting} className="contest-question-fields">
        <label className="contest-field">
          <span>{contestBoardText.titleLabel}</span>
          <input
            autoFocus
            onChange={(e) => onChange({ ...form, title: e.target.value })}
            placeholder={contestBoardText.titlePlaceholder}
            value={form.title}
          />
        </label>
        <label className="contest-field">
          <span>내용</span>
          <textarea
            onChange={(e) => onChange({ ...form, body: e.target.value })}
            placeholder={contestBoardText.bodyPlaceholder}
            value={form.body}
            rows={7}
          />
        </label>
        <fieldset className="contest-question-visibility">
          <legend>공개 범위</legend>
          <label>
            <input
              type="radio"
              name="question_visibility"
              value="public"
              checked={form.visibility === 'public'}
              onChange={() => onChange({ ...form, visibility: 'public' })}
            />
            <span>
              <strong>공개</strong>
              <small>게시판에 공개</small>
            </span>
          </label>
          <label>
            <input
              type="radio"
              name="question_visibility"
              value="private"
              checked={form.visibility === 'private'}
              onChange={() => onChange({ ...form, visibility: 'private' })}
            />
            <span>
              <strong>비공개</strong>
              <small>내 팀과 운영진</small>
            </span>
          </label>
        </fieldset>
      </fieldset>
      {formError || mutationError ? (
        <PageNotice
          message={
            formError ||
            formatUserApiError(
              mutationError,
              contestBoardText.questionSubmitError,
            )
          }
          status="error"
        />
      ) : null}
      <footer className="contest-form-actions">
        <button
          className="contest-button"
          disabled={isSubmitting}
          onClick={onCancel}
          type="button"
        >
          취소
        </button>
        <PrimaryButton disabled={isSubmitting} type="submit">
          {isSubmitting ? '등록 중' : contestBoardText.questionSubmitButton}
        </PrimaryButton>
      </footer>
    </form>
  );
}

function QuestionInlineDetail({
  answerDraft,
  answerError,
  answerMutationError,
  isSubmittingAnswer,
  onChangeAnswer,
  onSubmitAnswer,
  question,
}: {
  answerDraft: string;
  answerError: string;
  answerMutationError: unknown;
  isSubmittingAnswer: boolean;
  onChangeAnswer: (body: string) => void;
  onSubmitAnswer: () => void;
  question: ContestQuestion;
}) {
  const answers = [...question.answers].sort(
    (a, b) =>
      new Date(a.created_at).getTime() - new Date(b.created_at).getTime() ||
      a.contest_answer_id.localeCompare(b.contest_answer_id),
  );
  return (
    <article className="contest-question-detail">
      <p className="contest-question-body">{question.body}</p>
      <section className="contest-replies" aria-label="질문 답변">
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
              <time dateTime={answer.created_at}>
                {formatDateTime(answer.created_at)}
              </time>
            </header>
            <p>{answer.body}</p>
          </article>
        ))}
        {answers.length === 0 ? (
          <p className="contest-replies-empty">아직 답변이 없습니다.</p>
        ) : null}
      </section>
      <form
        className="contest-reply-form"
        onSubmit={(event) => {
          event.preventDefault();
          onSubmitAnswer();
        }}
      >
        <label className="contest-field">
          <span>댓글</span>
          <textarea
            disabled={isSubmittingAnswer}
            onChange={(e) => onChangeAnswer(e.target.value)}
            placeholder={contestBoardText.answerPlaceholder}
            value={answerDraft}
            rows={3}
          />
        </label>
        {answerError || answerMutationError ? (
          <PageNotice
            message={
              answerError ||
              formatUserApiError(
                answerMutationError,
                contestBoardText.answerSubmitError,
              )
            }
            status="error"
          />
        ) : null}
        <div className="contest-form-actions">
          <PrimaryButton disabled={isSubmittingAnswer} type="submit">
            {isSubmittingAnswer
              ? '등록 중'
              : contestBoardText.answerSubmitButton}
          </PrimaryButton>
        </div>
      </form>
    </article>
  );
}

function PrimaryButton({
  children,
  disabled,
  onClick,
  type = 'button',
}: {
  children: ReactNode;
  disabled?: boolean;
  onClick?: () => void;
  type?: 'button' | 'submit';
}) {
  return (
    <button
      className="contest-button contest-button--primary"
      disabled={disabled}
      onClick={onClick}
      type={type}
    >
      {children}
    </button>
  );
}

export default function ContestBoardPage() {
  return (
    <ContestPageShell>
      {({ contest }) => (
        <ContestBoardContent contest={contest} contestId={contest.contest_id} />
      )}
    </ContestPageShell>
  );
}
