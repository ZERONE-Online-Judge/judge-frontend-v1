import { normalizeProblemCode, problemCodeError } from './problemCode';
import { apiBlobRequest, apiRequest } from '@/shared/api/client';
import type { Problem } from './types';

export type ProblemArchivePreview = {
  problem: Problem;
  asset_count: number;
  file_count: number;
  total_bytes: number;
  example_count: number;
  testcase_count: number;
  testcase_sets: { version: number; is_active: boolean; count: number }[];
  assets: { filename: string; category: string }[];
  has_external_links: boolean;
};

export function inspectProblemArchive(
  contestId: string,
  token: string,
  file: File,
) {
  return apiRequest<ProblemArchivePreview>(
    `/operator/contests/${contestId}/problem-archives:inspect`,
    token,
    {
      method: 'POST',
      headers: { 'content-type': 'application/zip' },
      body: file,
    },
  );
}

export function importProblemArchive(
  contestId: string,
  token: string,
  file: File,
  divisionId: string,
  problemCode: string,
) {
  const error = problemCodeError(problemCode);
  if (error) throw new Error(error);
  const query = new URLSearchParams({
    division_id: divisionId,
    problem_code: normalizeProblemCode(problemCode),
  });
  return apiRequest<Problem>(
    `/operator/contests/${contestId}/problem-archives:import?${query}`,
    token,
    {
      method: 'POST',
      headers: { 'content-type': 'application/zip' },
      body: file,
    },
  );
}

export async function downloadProblemArchive(
  contestId: string,
  token: string,
  problem: Problem,
) {
  const blob = await apiBlobRequest(
    `/operator/contests/${contestId}/problems/${problem.problem_id}/archive`,
    token,
  );
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${problem.problem_code}-${problem.title}.zoj.zip`.replace(
    /[\\/:*?"<>|\p{Cc}]/gu,
    '_',
  );
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
