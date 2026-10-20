import { responsePreview } from '@/shared/lib/largeText';
import type {
  MatchedTestcaseUploadProgress,
  MatchedTestcaseUploadResult,
  PresignedUpload,
  Problem,
  ProblemAsset,
  ProblemPackageBuildResult,
  ProblemPackageStatus,
  Testcase,
  TestcaseSet,
  VerifiedTestcaseSetRequest,
  VerifiedTestcaseSetResponse,
  VerifiedTestcaseZipResponse,
} from '@/domains/problemManagement/types';
import { API_BASE_URL, apiRequest } from '@/shared/api/client';
import { encodeStorageKey, sha256Hex } from '@/shared/lib/files';

export function getContestProblems(contestId: string, token?: string) {
  return apiRequest<Problem[]>(`/contests/${contestId}/problems`, token);
}

export function getDivisionProblems(
  contestId: string,
  divisionId: string,
  token?: string,
) {
  return apiRequest<Problem[]>(
    `/contests/${contestId}/divisions/${divisionId}/problems`,
    token,
  );
}

export function getContestProblem(
  contestId: string,
  problemId: string,
  token?: string,
) {
  return apiRequest<Problem>(
    `/contests/${contestId}/problems/${problemId}`,
    token,
  );
}

export function getContestProblemAssets(
  contestId: string,
  problemId: string,
  token?: string,
) {
  return apiRequest<ProblemAsset[]>(
    `/contests/${contestId}/problems/${problemId}/assets`,
    token,
  );
}

export function getOperatorProblems(contestId: string, token: string) {
  return apiRequest<Problem[]>(
    `/operator/contests/${contestId}/problems`,
    token,
  );
}

export function createOperatorProblem(
  contestId: string,
  token: string,
  body: {
    division_id: string;
    problem_code: string;
    title: string;
    statement: string;
    default_statement_language?: string;
    statement_translations?: Problem['statement_translations'];
    editorial_translations?: Problem['editorial_translations'];
    time_limit_ms: number;
    memory_limit_mb: number;
    language_resource_limits?: Problem['language_resource_limits'];
    allowed_languages?: Problem['allowed_languages'];
    display_order?: number;
  },
) {
  return apiRequest<Problem>(
    `/operator/contests/${contestId}/problems`,
    token,
    {
      method: 'POST',
      body: JSON.stringify(body),
    },
  );
}

export function copyOperatorProblem(
  contestId: string,
  token: string,
  body: {
    source_problem_id: string;
    target_division_id: string;
    problem_code?: string;
    display_order?: number;
  },
) {
  return apiRequest<Problem>(
    `/operator/contests/${contestId}/problems:copy`,
    token,
    {
      method: 'POST',
      body: JSON.stringify(body),
    },
  );
}

export function updateOperatorProblem(
  contestId: string,
  problemId: string,
  token: string,
  body: Partial<Omit<Problem, 'problem_id' | 'division_id'>>,
) {
  return apiRequest<Problem>(
    `/operator/contests/${contestId}/problems/${problemId}`,
    token,
    {
      method: 'PATCH',
      body: JSON.stringify(body),
    },
  );
}

export function deleteOperatorProblem(
  contestId: string,
  problemId: string,
  token: string,
  cancelRejudging = false,
) {
  const query = cancelRejudging ? '?cancel_rejudging=true' : '';
  return apiRequest<Problem>(
    `/operator/contests/${contestId}/problems/${problemId}${query}`,
    token,
    {
      method: 'DELETE',
    },
  );
}

export function requestPresignedUpload(
  contestId: string,
  token: string,
  body: { category: string; filename: string; content_type?: string },
) {
  return apiRequest<PresignedUpload>(
    `/operator/contests/${contestId}/storage/presign-upload`,
    token,
    {
      method: 'POST',
      body: JSON.stringify(body),
    },
  );
}

export async function uploadToPresignedUrl(
  file: Blob,
  presigned: PresignedUpload,
) {
  const response = await fetch(presigned.upload_url, {
    method: presigned.method ?? 'PUT',
    headers: {
      'content-type':
        file.type || presigned.content_type || 'application/octet-stream',
    },
    body: file,
  });

  if (!response.ok) {
    throw new Error(`upload failed: HTTP ${response.status}`);
  }
}

export async function getStorageObjectPreview(
  storageKey: string,
  token: string,
  signal?: AbortSignal,
  limit = 262144,
  clipLines = true,
) {
  const response = await fetch(
    `${API_BASE_URL}/storage/objects/${encodeStorageKey(storageKey)}`,
    {
      credentials: 'include',
      headers: { Authorization: `Bearer ${token}`, Range: `bytes=0-${limit}` },
      signal,
    },
  );
  return responsePreview(response, limit, clipLines);
}
export async function getStorageObjectText(storageKey: string, token: string) {
  const preview = await getStorageObjectPreview(
    storageKey,
    token,
    undefined,
    512 * 1024,
    false,
  );
  if (preview.truncated || preview.binary)
    throw new Error('512KiB 이하의 텍스트 소스 코드를 사용하세요.');
  return preview.text;
}
export async function downloadStorageObject(storageKey: string, token: string) {
  const value = await apiRequest<{ download_url: string }>(
    `/storage/download-url?storage_key=${encodeURIComponent(storageKey)}`,
    token,
  );
  const link = document.createElement('a');
  link.href = value.download_url;
  link.download = storageKey.split('/').pop() || 'file';
  document.body.append(link);
  link.click();
  link.remove();
}

export async function uploadProblemAsset(
  contestId: string,
  problemId: string,
  token: string,
  file: File,
  category = `problems/${problemId}/assets`,
) {
  const presigned = await requestPresignedUpload(contestId, token, {
    category,
    filename: file.name,
    content_type: file.type || 'application/octet-stream',
  });
  await uploadToPresignedUrl(file, presigned);

  return apiRequest<ProblemAsset>(
    `/operator/contests/${contestId}/problems/${problemId}/assets`,
    token,
    {
      method: 'POST',
      body: JSON.stringify({
        original_filename: file.name,
        storage_key: presigned.storage_key,
        mime_type:
          file.type || presigned.content_type || 'application/octet-stream',
        file_size: file.size,
        sha256: await sha256Hex(file),
      }),
    },
  );
}

export function getProblemAssets(
  contestId: string,
  problemId: string,
  token: string,
) {
  return apiRequest<ProblemAsset[]>(
    `/operator/contests/${contestId}/problems/${problemId}/assets`,
    token,
  );
}

export function deleteProblemAsset(
  contestId: string,
  problemId: string,
  assetId: string,
  token: string,
) {
  return apiRequest<ProblemAsset>(
    `/operator/contests/${contestId}/problems/${problemId}/assets/${assetId}`,
    token,
    { method: 'DELETE' },
  );
}

export function getProblemTestcaseSets(
  contestId: string,
  problemId: string,
  token: string,
) {
  return apiRequest<TestcaseSet[]>(
    `/operator/contests/${contestId}/problems/${problemId}/testcase-sets`,
    token,
  );
}

export function createProblemTestcaseSet(
  contestId: string,
  problemId: string,
  token: string,
  body: { is_active: boolean },
) {
  return apiRequest<TestcaseSet>(
    `/operator/contests/${contestId}/problems/${problemId}/testcase-sets`,
    token,
    {
      method: 'POST',
      body: JSON.stringify(body),
    },
  );
}

export function updateProblemTestcaseSet(
  contestId: string,
  problemId: string,
  testcaseSetId: string,
  token: string,
  body: Partial<Pick<TestcaseSet, 'is_active'>>,
) {
  return apiRequest<TestcaseSet>(
    `/operator/contests/${contestId}/problems/${problemId}/testcase-sets/${testcaseSetId}`,
    token,
    {
      method: 'PATCH',
      body: JSON.stringify(body),
    },
  );
}

export function deleteProblemTestcaseSet(
  contestId: string,
  problemId: string,
  testcaseSetId: string,
  token: string,
) {
  return apiRequest<TestcaseSet>(
    `/operator/contests/${contestId}/problems/${problemId}/testcase-sets/${testcaseSetId}`,
    token,
    { method: 'DELETE' },
  );
}

export function createProblemTestcase(
  contestId: string,
  problemId: string,
  testcaseSetId: string,
  token: string,
  body: Omit<Testcase, 'testcase_id'> & {
    time_limit_ms_override?: number | null;
    memory_limit_mb_override?: number | null;
  },
) {
  return apiRequest<Testcase>(
    `/operator/contests/${contestId}/problems/${problemId}/testcase-sets/${testcaseSetId}/testcases`,
    token,
    {
      method: 'POST',
      body: JSON.stringify(body),
    },
  );
}

export function deleteProblemTestcase(
  contestId: string,
  problemId: string,
  testcaseSetId: string,
  testcaseId: string,
  token: string,
) {
  return apiRequest<Testcase>(
    `/operator/contests/${contestId}/problems/${problemId}/testcase-sets/${testcaseSetId}/testcases/${testcaseId}`,
    token,
    { method: 'DELETE' },
  );
}

export function createVerifiedTestcaseSet(
  contestId: string,
  problemId: string,
  token: string,
  body: VerifiedTestcaseSetRequest,
) {
  return apiRequest<VerifiedTestcaseSetResponse>(
    `/operator/contests/${contestId}/problems/${problemId}/verified-testcase-sets`,
    token,
    {
      method: 'POST',
      body: JSON.stringify(body),
    },
  );
}

const EMPTY_SHA256 =
  'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

type UploadedTestcaseFile = {
  stem: string;
  ext: 'in' | 'out';
  storageKey: string;
  sha: string;
  name: string;
};

async function uploadTestcaseFile(
  contestId: string,
  problemId: string,
  token: string,
  file: Blob,
  filename: string,
) {
  const presigned = await requestPresignedUpload(contestId, token, {
    category: `problems/${problemId}/testcases/bulk`,
    filename: `${Date.now()}-${filename}`,
    content_type: file.type || 'text/plain',
  });
  await uploadToPresignedUrl(file, presigned);

  return {
    storageKey: presigned.storage_key,
    sha: await sha256Hex(file),
  };
}

export async function uploadAndCreateMatchedTestcaseSet(
  contestId: string,
  problemId: string,
  token: string,
  files: File[],
  onProgress?: (progress: MatchedTestcaseUploadProgress) => void,
): Promise<MatchedTestcaseUploadResult> {
  const validFiles = files.filter((file) => /\.(in|out)$/i.test(file.name));

  if (!validFiles.length) {
    throw new Error('no testcase .in/.out files to upload');
  }

  const uploaded: UploadedTestcaseFile[] = [];
  const total = validFiles.length + 2;

  for (let index = 0; index < validFiles.length; index += 1) {
    const file = validFiles[index];
    const ext = file.name.toLowerCase().endsWith('.in') ? 'in' : 'out';
    const stem = file.name.replace(/\.(in|out)$/i, '');
    const result = await uploadTestcaseFile(
      contestId,
      problemId,
      token,
      file,
      file.name,
    );

    uploaded.push({
      stem,
      ext,
      storageKey: result.storageKey,
      sha: result.sha,
      name: file.name,
    });
    onProgress?.({
      phase: 'upload',
      current: index + 1,
      total,
      filename: file.name,
    });
  }

  const grouped = new Map<
    string,
    {
      in?: { storageKey: string; sha: string; name: string };
      out?: { storageKey: string; sha: string; name: string };
    }
  >();

  for (const item of uploaded) {
    const current = grouped.get(item.stem) ?? {};
    current[item.ext] = {
      storageKey: item.storageKey,
      sha: item.sha,
      name: item.name,
    };
    grouped.set(item.stem, current);
  }

  const warnings: string[] = [];
  const cases: VerifiedTestcaseSetRequest['cases'] = [];
  const sorted = Array.from(grouped.entries()).sort(([a], [b]) =>
    a.localeCompare(b),
  );

  for (let index = 0; index < sorted.length; index += 1) {
    const [stem, pair] = sorted[index];
    let input = pair.in;
    let output = pair.out;

    if (!input) {
      warnings.push(`${stem}: .in 누락 -> 빈 .in 생성`);
      const fallback = await uploadTestcaseFile(
        contestId,
        problemId,
        token,
        new Blob([''], { type: 'text/plain' }),
        `${stem}.in`,
      );
      input = {
        storageKey: fallback.storageKey,
        sha: EMPTY_SHA256,
        name: `${stem}.in`,
      };
    }

    if (!output) {
      warnings.push(`${stem}: .out 누락 -> 빈 .out 생성`);
      const fallback = await uploadTestcaseFile(
        contestId,
        problemId,
        token,
        new Blob([''], { type: 'text/plain' }),
        `${stem}.out`,
      );
      output = {
        storageKey: fallback.storageKey,
        sha: EMPTY_SHA256,
        name: `${stem}.out`,
      };
    }

    cases.push({
      display_order: index + 1,
      input_storage_key: input.storageKey,
      output_storage_key: output.storageKey,
      input_sha256: input.sha,
      output_sha256: output.sha,
    });
  }

  onProgress?.({ phase: 'match', current: validFiles.length + 1, total });

  const result = await createVerifiedTestcaseSet(contestId, problemId, token, {
    cases,
  });
  onProgress?.({ phase: 'verify', current: total, total });

  return { ...result, warnings };
}

export function createVerifiedTestcaseSetFromZip(
  contestId: string,
  problemId: string,
  token: string,
  file: File,
) {
  const formData = new FormData();
  formData.set('file', file);

  return apiRequest<VerifiedTestcaseZipResponse>(
    `/operator/contests/${contestId}/problems/${problemId}/verified-testcase-sets:zip`,
    token,
    {
      method: 'POST',
      body: formData,
    },
  );
}

export function getProblemPackageStatus(
  contestId: string,
  problemId: string,
  token: string,
) {
  return apiRequest<ProblemPackageStatus>(
    `/operator/contests/${contestId}/problems/${problemId}/package-status`,
    token,
  );
}

export function warmProblemJudgeBundle(
  contestId: string,
  problemId: string,
  token: string,
) {
  return apiRequest<ProblemPackageStatus['judge_bundle']>(
    `/operator/contests/${contestId}/problems/${problemId}/judge-bundle:warm`,
    token,
    { method: 'POST' },
  );
}

export function buildProblemPackageRecipe(
  contestId: string,
  problemId: string,
  token: string,
  scriptText: string,
) {
  return apiRequest<ProblemPackageBuildResult>(
    `/operator/contests/${contestId}/problems/${problemId}/package-builds`,
    token,
    {
      method: 'POST',
      body: JSON.stringify({ script_text: scriptText }),
    },
  );
}

export function importPolygonProblem(
  contestId: string,
  token: string,
  body: {
    file: File;
    division_id: string;
    display_order?: number;
    build_tests?: boolean;
  },
) {
  const formData = new FormData();
  formData.set('file', body.file);
  formData.set('division_id', body.division_id);
  if (body.display_order !== undefined)
    formData.set('display_order', String(body.display_order));
  if (body.build_tests !== undefined)
    formData.set('build_tests', String(body.build_tests));

  return apiRequest<unknown>(
    `/operator/contests/${contestId}/problems/import-polygon`,
    token,
    {
      method: 'POST',
      body: formData,
    },
  );
}
