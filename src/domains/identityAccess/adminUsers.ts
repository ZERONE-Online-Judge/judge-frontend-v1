import { apiPageRequest, apiRequest } from '@/shared/api/client';

export const adminUserSortKeys = [
  'email',
  'name',
  'contest_count',
  'created_at',
  'password_updated_at',
] as const;
export type AdminUserSort = (typeof adminUserSortKeys)[number];

export type AdminUser = {
  email: string;
  display_name: string;
  names: string[];
  roles: string[];
  has_password: boolean;
  password_updated_at: string | null;
  account_created_at: string | null;
  participant_contest_count: number;
};
export type AdminUserDetail = AdminUser & {
  participations: {
    contest_id: string;
    contest_title: string;
    organization_name: string;
    contest_status: string;
    start_at: string;
    end_at: string;
    division_name: string;
    team_name: string;
    team_status: string;
    registered_name: string;
    member_role: string;
    registered_at: string;
    last_login_at: string | null;
    submission_count: number;
    accepted_submission_count: number;
  }[];
  operator_contests: {
    contest_id: string;
    contest_title: string;
    display_name: string;
    role_title: string;
  }[];
};

export function listAdminUsers(
  token: string,
  filters: {
    q: string;
    password: string;
    offset: number;
    sort: AdminUserSort;
    order: 'asc' | 'desc';
  },
) {
  const query = new URLSearchParams({
    q: filters.q,
    password: filters.password,
    offset: String(filters.offset),
    limit: '25',
    sort: filters.sort,
    order: filters.order,
  });
  return apiPageRequest<AdminUser[]>(`/admin/users?${query}`, token);
}
export function getAdminUserDetail(token: string, email: string) {
  return apiRequest<AdminUserDetail>(
    `/admin/users/detail?${new URLSearchParams({ email })}`,
    token,
  );
}
