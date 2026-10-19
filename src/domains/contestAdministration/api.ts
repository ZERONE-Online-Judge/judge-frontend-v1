import type {
  Contest,
  ContestVisibility,
  ContestSettingsPatch,
  ContestWorkspace,
  Division,
  OperatorDashboard,
  PublicContestDetail,
  PublicHomeReadModel,
} from '@/domains/contestAdministration/types';
import type { StaffAccount } from '@/domains/identityAccess/types';
import type { ContestRole } from '@/domains/identityAccess/contestRoles';
import { apiRequest } from '@/shared/api/client';

export function getPublicHome() {
  return apiRequest<PublicHomeReadModel>('/public/home');
}

export function getPublicContests(token?: string) {
  return apiRequest<Contest[]>('/public/contests', token);
}

export function getPublicContest(contestId: string, token?: string) {
  return apiRequest<PublicContestDetail>(
    `/public/contests/${contestId}`,
    token,
  );
}

export function getContestWorkspace(contestId: string, token?: string) {
  return apiRequest<ContestWorkspace>(
    `/contests/${contestId}/workspace`,
    token,
  );
}

export function getDivisionWorkspace(
  contestId: string,
  divisionId: string,
  token?: string,
) {
  return apiRequest<ContestWorkspace>(
    `/contests/${contestId}/divisions/${divisionId}/workspace`,
    token,
  );
}

export function getOperatorContests(token: string) {
  return apiRequest<Contest[]>('/operator/contests', token);
}

export function getOperatorContestDashboard(contestId: string, token: string) {
  return apiRequest<OperatorDashboard>(
    `/operator/contests/${contestId}/dashboard`,
    token,
  );
}

export function getOperatorDivisions(contestId: string, token: string) {
  return apiRequest<Division[]>(
    `/operator/contests/${contestId}/divisions`,
    token,
  );
}

export function createOperatorDivision(
  contestId: string,
  token: string,
  body: Pick<Division, 'name'> & Partial<Pick<Division, 'description'>>,
) {
  return apiRequest<Division>(
    `/operator/contests/${contestId}/divisions`,
    token,
    {
      method: 'POST',
      body: JSON.stringify(body),
    },
  );
}

export function deleteOperatorDivision(
  contestId: string,
  divisionId: string,
  token: string,
) {
  return apiRequest<{ deleted: boolean }>(
    `/operator/contests/${contestId}/divisions/${divisionId}`,
    token,
    { method: 'DELETE' },
  );
}

export function updateOperatorDivision(
  contestId: string,
  divisionId: string,
  token: string,
  body: Partial<Pick<Division, 'name' | 'description'>>,
) {
  return apiRequest<Division>(
    `/operator/contests/${contestId}/divisions/${divisionId}`,
    token,
    {
      method: 'PATCH',
      body: JSON.stringify(body),
    },
  );
}

export function updateContestSettings(
  contestId: string,
  token: string,
  body: ContestSettingsPatch,
) {
  return apiRequest<Contest>(
    `/operator/contests/${contestId}/settings`,
    token,
    {
      method: 'PATCH',
      body: JSON.stringify(body),
    },
  );
}

export function listContestOperators(contestId: string, token: string) {
  return apiRequest<StaffAccount[]>(
    `/operator/contests/${contestId}/operators`,
    token,
  );
}

export function createContestOperator(
  contestId: string,
  token: string,
  body: { email: string; display_name: string; roles: ContestRole[] },
) {
  return apiRequest<StaffAccount>(
    `/operator/contests/${contestId}/operators`,
    token,
    {
      method: 'POST',
      body: JSON.stringify(body),
    },
  );
}

export function updateContestOperator(
  contestId: string,
  operatorEmail: string,
  token: string,
  body: { display_name: string; email: string; roles: ContestRole[] },
) {
  return apiRequest<StaffAccount>(
    `/operator/contests/${contestId}/operators/${encodeURIComponent(operatorEmail)}`,
    token,
    {
      method: 'PATCH',
      body: JSON.stringify(body),
    },
  );
}

export function replaceContestOperatorAccount(
  contestId: string,
  operatorEmail: string,
  token: string,
  body: { display_name: string; email: string; roles: ContestRole[] },
) {
  return apiRequest<StaffAccount>(
    `/operator/contests/${contestId}/operators/${encodeURIComponent(operatorEmail)}/account:replace`,
    token,
    { method: 'POST', body: JSON.stringify(body) },
  );
}

export function removeContestOperator(
  contestId: string,
  operatorEmail: string,
  token: string,
) {
  return apiRequest<StaffAccount>(
    `/operator/contests/${contestId}/operators/${encodeURIComponent(operatorEmail)}`,
    token,
    { method: 'DELETE' },
  );
}

export function createAdminContest(
  token: string,
  body: {
    organization_name: string;
    status: string;
    visibility?: ContestVisibility;
    visibility_after_end?: ContestVisibility;
    start_at?: string;
    operator_email?: string;
    operator_display_name?: string;
    title?: string;
    overview?: string;
  },
) {
  return apiRequest<Contest>('/admin/contests', token, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function getAdminContests(token: string) {
  return apiRequest<Contest[]>('/admin/contests', token);
}

export function deleteAdminContest(
  contestId: string,
  token: string,
  confirmTitle: string,
) {
  return apiRequest<{ deleted: boolean; contest_id: string; title: string }>(
    `/admin/contests/${contestId}`,
    token,
    { method: 'DELETE', body: JSON.stringify({ confirm_title: confirmTitle }) },
  );
}

export function getAdminContestDivisions(contestId: string, token: string) {
  return apiRequest<Division[]>(
    `/admin/contests/${contestId}/divisions`,
    token,
  );
}

export function assignAdminContestOperator(
  contestId: string,
  token: string,
  body: { email: string; display_name?: string },
) {
  return apiRequest<StaffAccount>(
    `/admin/contests/${contestId}/operators`,
    token,
    {
      method: 'POST',
      body: JSON.stringify(body),
    },
  );
}

export function transferContestOwner(
  contestId: string,
  token: string,
  email: string,
) {
  return apiRequest<StaffAccount[]>(
    `/operator/contests/${contestId}/owner:transfer`,
    token,
    {
      method: 'POST',
      body: JSON.stringify({ email }),
    },
  );
}
