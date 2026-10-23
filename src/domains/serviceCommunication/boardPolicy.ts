import type { Contest } from '@/domains/contestAdministration/types';
import type { ContestQuestion } from './types';

export function boardQuestionDefaults(contest: Contest) {
  return {
    visibility:
      contest.board_question_visibility_policy &&
      contest.board_question_visibility_policy !== 'choice'
        ? contest.board_question_visibility_policy
        : (contest.board_question_default_visibility ?? 'public'),
    comment_scope:
      contest.board_comment_scope_policy &&
      contest.board_comment_scope_policy !== 'choice'
        ? contest.board_comment_scope_policy
        : (contest.board_comment_default_scope ?? 'all'),
  };
}

export function applyBoardQuestionPolicy<
  T extends {
    visibility: 'public' | 'private';
    comment_scope: 'all' | 'operators';
  },
>(contest: Contest, form: T): T {
  const defaults = boardQuestionDefaults(contest);
  return {
    ...form,
    visibility:
      !contest.board_question_visibility_policy ||
      contest.board_question_visibility_policy === 'choice'
        ? form.visibility
        : defaults.visibility,
    comment_scope:
      !contest.board_comment_scope_policy ||
      contest.board_comment_scope_policy === 'choice'
        ? form.comment_scope
        : defaults.comment_scope,
  };
}

export function boardCommentScope(contest: Contest, question: ContestQuestion) {
  return contest.board_comment_scope_policy &&
    contest.board_comment_scope_policy !== 'choice'
    ? contest.board_comment_scope_policy
    : (question.effective_comment_scope ?? question.comment_scope ?? 'all');
}

export type BoardWritingPolicy = Required<
  Pick<
    Contest,
    | 'board_question_visibility_policy'
    | 'board_question_default_visibility'
    | 'board_comment_scope_policy'
    | 'board_comment_default_scope'
  >
>;

export function boardWritingSettingsFromContest(
  value: Pick<Contest, keyof BoardWritingPolicy>,
): BoardWritingPolicy {
  const visibilityPolicy = value.board_question_visibility_policy ?? 'choice';
  const commentPolicy = value.board_comment_scope_policy ?? 'choice';
  return {
    board_question_visibility_policy: visibilityPolicy,
    board_question_default_visibility:
      visibilityPolicy === 'choice'
        ? (value.board_question_default_visibility ?? 'public')
        : visibilityPolicy,
    board_comment_scope_policy: commentPolicy,
    board_comment_default_scope:
      commentPolicy === 'choice'
        ? (value.board_comment_default_scope ?? 'all')
        : commentPolicy,
  };
}
