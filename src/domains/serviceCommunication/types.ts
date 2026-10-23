export type ServiceNotice = {
  service_notice_id: string;
  title: string;
  summary: string;
  body: string;
  emergency: boolean;
  published_at: string;
};

export type ContactInquiry = {
  contact_inquiry_id: string;
  title: string;
  sender_name: string;
  sender_email: string;
  body: string;
  status: 'pending' | 'answered' | string;
  answer_body?: string | null;
  answered_by_email?: string | null;
  answered_at?: string | null;
  created_at: string;
  updated_at: string;
};

export type ContestNotice = {
  contest_notice_id: string;
  title: string;
  body: string;
  body_template?: string | null;
  pinned: boolean;
  emergency: boolean;
  visibility: 'public' | 'participants';
  published_at: string;
};

export type ContestAnswer = {
  contest_answer_id: string;
  body: string;
  visibility: 'public' | 'questioner';
  created_by_email?: string | null;
  created_by_name?: string | null;
  created_by_title?: string | null;
  created_by_role?: 'operator' | 'participant' | string | null;
  created_by_team_name?: string | null;
  created_by_division_name?: string | null;
  created_at: string;
};

export type ContestQuestion = {
  contest_question_id: string;
  title: string;
  body: string;
  visibility: 'public' | 'private';
  comment_scope?: 'all' | 'operators';
  effective_comment_scope?: 'all' | 'operators';
  team_name?: string | null;
  division_name?: string | null;
  author_name?: string | null;
  author_email?: string | null;
  created_at: string;
  answers: ContestAnswer[];
};
