import type {
  ContestAnswer,
  ContestNotice,
  ContestQuestion,
  ContactInquiry,
  ServiceNotice,
} from '@/domains/serviceCommunication/types';
import { apiRequest } from '@/shared/api/client';

export function getPublicServiceNotices() {
  return apiRequest<ServiceNotice[]>('/public/service-notices');
}

export function getPublicServiceNotice(noticeId: string) {
  return apiRequest<ServiceNotice>(`/public/service-notices/${noticeId}`);
}

export function createPublicContactInquiry(body: {
  title: string;
  sender_name: string;
  sender_email: string;
  body: string;
}) {
  return apiRequest<ContactInquiry>('/public/contact-inquiries', undefined, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function listAdminServiceNotices(token: string) {
  return apiRequest<ServiceNotice[]>('/admin/service-notices', token);
}

export function createAdminServiceNotice(
  token: string,
  body: Pick<ServiceNotice, 'title' | 'summary' | 'body'> &
    Partial<Pick<ServiceNotice, 'emergency'>>,
) {
  return apiRequest<ServiceNotice>('/admin/service-notices', token, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function deleteAdminServiceNotice(noticeId: string, token: string) {
  return apiRequest<{ service_notice_id: string; deleted: boolean }>(
    `/admin/service-notices/${noticeId}`,
    token,
    { method: 'DELETE' },
  );
}

export function listAdminContactInquiries(token: string) {
  return apiRequest<ContactInquiry[]>('/admin/contact-inquiries', token);
}

export function answerAdminContactInquiry(
  inquiryId: string,
  token: string,
  body: { answer_body: string },
) {
  return apiRequest<ContactInquiry>(
    `/admin/contact-inquiries/${inquiryId}/answer`,
    token,
    {
      method: 'POST',
      body: JSON.stringify(body),
    },
  );
}

export function listOperatorContestNotices(contestId: string, token: string) {
  return apiRequest<ContestNotice[]>(
    `/operator/contests/${contestId}/notices`,
    token,
  );
}

export function getContestNotices(contestId: string, token?: string) {
  return apiRequest<ContestNotice[]>(`/contests/${contestId}/notices`, token);
}

export function createContestNotice(
  contestId: string,
  token: string,
  body: Pick<ContestNotice, 'title' | 'body'> &
    Partial<Pick<ContestNotice, 'pinned' | 'emergency' | 'visibility'>>,
) {
  return apiRequest<ContestNotice>(
    `/operator/contests/${contestId}/notices`,
    token,
    {
      method: 'POST',
      body: JSON.stringify(body),
    },
  );
}

export function updateContestNotice(
  contestId: string,
  noticeId: string,
  token: string,
  body: Partial<
    Pick<
      ContestNotice,
      'title' | 'body' | 'pinned' | 'emergency' | 'visibility'
    >
  >,
) {
  return apiRequest<ContestNotice>(
    `/operator/contests/${contestId}/notices/${noticeId}`,
    token,
    {
      method: 'PATCH',
      body: JSON.stringify(body),
    },
  );
}

export function deleteContestNotice(
  contestId: string,
  noticeId: string,
  token: string,
) {
  return apiRequest<{ contest_notice_id: string; deleted: boolean }>(
    `/operator/contests/${contestId}/notices/${noticeId}`,
    token,
    { method: 'DELETE' },
  );
}

export function getContestQuestions(contestId: string, token?: string) {
  return apiRequest<ContestQuestion[]>(`/contests/${contestId}/boards`, token);
}

export function listOperatorContestQuestions(contestId: string, token: string) {
  return apiRequest<ContestQuestion[]>(
    `/operator/contests/${contestId}/boards`,
    token,
  );
}

export function updateContestQuestion(
  contestId: string,
  questionId: string,
  token: string,
  body: Partial<Pick<ContestQuestion, 'visibility' | 'comment_scope'>>,
) {
  return apiRequest<ContestQuestion>(
    `/operator/contests/${contestId}/boards/${questionId}`,
    token,
    {
      method: 'PATCH',
      body: JSON.stringify(body),
    },
  );
}

export function deleteContestQuestion(
  contestId: string,
  questionId: string,
  token: string,
) {
  return apiRequest<{ contest_question_id: string; deleted: boolean }>(
    `/operator/contests/${contestId}/boards/${questionId}`,
    token,
    { method: 'DELETE' },
  );
}

export function createContestQuestion(
  contestId: string,
  token: string,
  body: Pick<ContestQuestion, 'title' | 'body' | 'visibility'> & {
    problem_id?: string | null;
    comment_scope?: 'all' | 'operators';
  },
) {
  return apiRequest<ContestQuestion>(`/contests/${contestId}/boards`, token, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function createContestQuestionAnswer(
  contestId: string,
  questionId: string,
  token: string,
  body: Pick<ContestAnswer, 'body'>,
) {
  return apiRequest<ContestAnswer>(
    `/contests/${contestId}/boards/${questionId}/answers`,
    token,
    {
      method: 'POST',
      body: JSON.stringify(body),
    },
  );
}

export function createContestAnswer(
  contestId: string,
  questionId: string,
  token: string,
  body: Pick<ContestAnswer, 'body' | 'visibility'>,
) {
  return apiRequest<ContestAnswer>(
    `/operator/contests/${contestId}/boards/${questionId}/answers`,
    token,
    {
      method: 'POST',
      body: JSON.stringify(body),
    },
  );
}

export function updateContestAnswer(
  contestId: string,
  questionId: string,
  answerId: string,
  token: string,
  body: Partial<Pick<ContestAnswer, 'visibility'>>,
) {
  return apiRequest<ContestAnswer>(
    `/operator/contests/${contestId}/boards/${questionId}/answers/${answerId}`,
    token,
    {
      method: 'PATCH',
      body: JSON.stringify(body),
    },
  );
}

export function deleteContestAnswer(
  contestId: string,
  questionId: string,
  answerId: string,
  token: string,
) {
  return apiRequest<{ contest_answer_id: string; deleted: boolean }>(
    `/operator/contests/${contestId}/boards/${questionId}/answers/${answerId}`,
    token,
    { method: 'DELETE' },
  );
}
