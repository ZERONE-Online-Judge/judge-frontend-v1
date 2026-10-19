export type Problem = {
  allowed_languages?: import('@/domains/submissionScoreboard/types').JudgeLanguage[];
  default_statement_language?: string;
  statement_translations?: Record<string, { title: string; statement: string }>;
  editorial_translations?: Record<string, string>;
  problem_id: string;
  division_id?: string;
  problem_code: string;
  title: string;
  statement: string;
  editorial?: string;
  solve_status?: 'accepted' | 'wrong' | 'unsolved';
  time_limit_ms: number;
  memory_limit_mb: number;
  language_resource_limits?: Partial<
    Record<
      string,
      {
        disable_auto_adjustment?: boolean;
        time_limit_ms?: number | null;
        memory_limit_mb?: number | null;
      }
    >
  >;
  display_order?: number;
};

export type ProblemAsset = {
  source_language?:
    | import('@/domains/submissionScoreboard/types').JudgeLanguage
    | null;
  asset_id: string;
  original_filename: string;
  storage_key: string;
  mime_type: string;
  file_size: number;
  sha256: string;
  asset_status: string;
  download_url?: string;
};

export type PackageFileRole =
  | 'main-solution'
  | 'brute-solution'
  | 'wrong-solution'
  | 'checker'
  | 'validator'
  | 'generator'
  | 'manual-input'
  | 'test-script'
  | 'package-resource'
  | 'interactor';

export type ProblemExample = {
  input: string;
  output: string;
  note?: string;
};

export type ProblemDocument = {
  statement: string;
  inputDescription: string;
  outputDescription: string;
  note: string;
  examples: ProblemExample[];
};

export type Testcase = {
  testcase_id: string;
  display_order: number;
  input_storage_key: string;
  output_storage_key: string;
  input_sha256: string;
  output_sha256: string;
  input_size_bytes?: number | null;
  output_size_bytes?: number | null;
};

export type TestcaseSet = {
  testcase_set_id: string;
  version: number;
  is_active: boolean;
  testcases?: Testcase[];
};

export type PackageSupportFileStatus = {
  role: PackageFileRole;
  label: string;
  required: boolean;
  count: number;
  latest_filename?: string | null;
  status: 'ready' | 'missing';
};

export type JudgeBundleStatus = {
  ready: boolean;
  status:
    | 'ready'
    | 'pending'
    | 'running'
    | 'failed'
    | 'missing'
    | 'no_active_testcase_set';
  storage_key?: string | null;
  size_bytes?: number | null;
  testcase_set_id?: string | null;
  version_hash?: string | null;
  queue?: {
    status: string;
    attempts: number;
    last_error?: string | null;
    created_at?: string | null;
    started_at?: string | null;
    completed_at?: string | null;
  } | null;
};

export type ProblemPackageStatus = {
  ready: boolean;
  warnings: string[];
  support_files: PackageSupportFileStatus[];
  active_testcase_set?: TestcaseSet | null;
  active_testcase_count: number;
  testcase_set_count: number;
  judge_bundle?: JudgeBundleStatus | null;
};

export type ProblemPackageBuildResult = {
  generated_count: number;
  testcase_set: TestcaseSet;
  checks: Record<string, unknown>;
};

export type TestcaseDraft = {
  id: string;
  display_order: number;
  input_filename: string;
  output_filename: string;
  input_storage_key: string;
  output_storage_key: string;
  input_sha256: string;
  output_sha256: string;
};

export type PresignedUpload = {
  method?: string;
  storage_key: string;
  upload_url: string;
  content_type: string;
};

export type VerifiedTestcaseSetRequest = {
  cases: Array<{
    display_order: number;
    input_storage_key: string;
    output_storage_key: string;
    input_sha256: string;
    output_sha256: string;
    time_limit_ms_override?: number | null;
    memory_limit_mb_override?: number | null;
  }>;
};

export type MatchedTestcaseUploadProgress = {
  phase: 'upload' | 'match' | 'verify';
  current: number;
  total: number;
  filename?: string;
};

export type MatchedTestcaseUploadResult = VerifiedTestcaseSetResponse & {
  warnings: string[];
};

export type VerifiedTestcaseSetResponse = {
  verified_count: number;
  testcase_set: TestcaseSet;
  testcases: Testcase[];
  checks?: Record<string, unknown>;
};

export type VerifiedTestcaseZipResponse = VerifiedTestcaseSetResponse & {
  imported_archive?: {
    filename: string;
    case_count: number;
    format: string;
  };
};

export const PROBLEM_META_PREFIX = '<!--ZOJ_META:';

export const PROBLEM_STATEMENT_TEMPLATE = `# 문제 설명

문제 설명을 작성하세요.
`;

export const PROBLEM_INPUT_TEMPLATE = `입력 형식을 작성하세요.

`;

export const PROBLEM_OUTPUT_TEMPLATE = `출력 형식을 작성하세요.
`;

export const PROBLEM_NOTE_TEMPLATE = `필요한 추가 설명을 작성하세요.
`;

export const PACKAGE_FILE_ROLES: {
  value: PackageFileRole;
  label: string;
  detail: string;
}[] = [
  {
    value: 'main-solution',
    label: 'Main Solution',
    detail: '공식 출력 생성용 정답 코드',
  },
  { value: 'validator', label: 'Validator', detail: '입력 검증 프로그램' },
  { value: 'generator', label: 'Generator', detail: '입력 생성 프로그램' },
  { value: 'checker', label: 'Checker', detail: '정답 비교 프로그램' },
  {
    value: 'brute-solution',
    label: 'Brute Solution',
    detail: '작은 테스트 교차검증용',
  },
  {
    value: 'wrong-solution',
    label: 'Wrong Solution',
    detail: '저격 테스트 검증용 오답 코드',
  },
  {
    value: 'manual-input',
    label: 'Manual Input',
    detail: 'sample/manual 입력 파일',
  },
  { value: 'test-script', label: 'Test Script', detail: '테스트 생성 recipe' },
  {
    value: 'package-resource',
    label: 'Package Resource',
    detail: 'testlib.h 등 공유 include 파일',
  },
  {
    value: 'interactor',
    label: 'Interactor',
    detail: '인터랙티브 문제용 프로그램',
  },
];

export const TESTCASE_SUPPORT_FILE_ROLES: PackageFileRole[] = [
  'package-resource',
  'validator',
  'checker',
];

export const TEST_SCRIPT_TEMPLATE = `# samples
manual sample1.in
manual sample2.in

# small random
gen_random 1 1 10
gen_random 5 1 10
gen_random 10 1 100

# edge
gen_min
gen_max
gen_same 100000 1
gen_same 100000 1000000000

# performance
gen_random 100000 1 1000000000
gen_reverse 100000
gen_sorted 100000
`;
