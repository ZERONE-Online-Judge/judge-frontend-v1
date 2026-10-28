import BoundedTextarea from '@/shared/ui/BoundedTextarea';
import StorageFileContent from '@/components/operator/StorageFileContent';
import type { TextPreview } from '@/shared/lib/largeText';
import BoundedText from '@/shared/ui/BoundedText';
import Select from '@/shared/ui/Select';
import LanguageResourceLimitsEditor from '@/components/operator/LanguageResourceLimitsEditor';
import RecentChangeNotice from '@/components/operator/RecentChangeNotice';
import ProblemArchivePanel from '@/components/operator/ProblemArchivePanel';
import PackageUpdateHistory from '@/components/operator/PackageUpdateHistory';
import { downloadProblemArchive } from '@/domains/problemManagement/archive';
import { judgeLanguageLabel } from '@/domains/submissionScoreboard/languageLabel';
import useConfirmation from '@/shared/ui/useConfirmation';
import ModalDialog from '@/shared/ui/ModalDialog';
import VerificationCodeSection from '@/components/operator/VerificationCodeSection';
import useVerificationCodeRuns, {
  VERIFICATION_CODE_KINDS,
  verificationKindFromAsset,
  type VerificationCodeKind,
} from '@/domains/problemManagement/useVerificationCodeRuns';
import {
  Fragment,
  type FormEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import PageLayout from '@/components/common/PageLayout';
import { sharedUiText } from '@/data/uiText';
import {
  OperatorAccessGate,
  OperatorPanel,
  OperatorTabs,
  ProblemIcon,
} from '@/components/operator/OperatorShell';
import { getOperatorContestDashboard } from '@/domains/contestAdministration/api';
import { tokenQueryIdentity } from '@/domains/identityAccess/queryIdentity';
import {
  deleteProblemAsset,
  deleteProblemTestcase,
  deleteProblemTestcaseSet,
  copyOperatorProblem,
  createOperatorProblem,
  deleteOperatorProblem,
  getStorageObjectPreview,
  getOperatorProblems,
  getProblemAssets,
  getProblemPackageStatus,
  getProblemTestcaseSets,
  uploadAndCreateMatchedTestcaseSet,
  updateOperatorProblem,
  uploadProblemAsset,
  warmProblemJudgeBundle,
} from '@/domains/problemManagement/api';
import {
  parseProblemDocument,
  serializeProblemDocument,
} from '@/domains/problemManagement/document';
import ProblemSubmitPanel from '@/components/contest/problem/ProblemSubmitPanel';
import ProblemEditorialPanel from '@/components/contest/problem/ProblemEditorialPanel';
import ProblemStatementPanel from '@/components/contest/problem/ProblemStatementPanel';
import ProblemLanguageEditor from '@/components/operator/ProblemLanguageEditor';
import { hasProblemEditorial } from '@/domains/problemManagement/statementLanguages';
import type {
  PackageFileRole,
  JudgeBundleStatus,
  PackageSupportFileStatus,
  Problem,
  ProblemAsset,
  TestcaseSet,
} from '@/domains/problemManagement/types';
import {
  PACKAGE_FILE_ROLES,
  PROBLEM_STATEMENT_TEMPLATE,
  TESTCASE_SUPPORT_FILE_ROLES,
} from '@/domains/problemManagement/types';
import {
  problemMemoryLimitLabel,
  problemTimeLimitLabel,
} from '@/domains/problemManagement/resourceLimits';
import {
  createOperatorTestSubmission,
  waitOperatorTestSubmissionStatus,
} from '@/domains/submissionScoreboard/api';
import {
  parseJudgeDetail,
  submissionProgressPercent,
  submissionProgressText,
  submissionStatusLabel,
  isSubmissionPending,
} from '@/domains/submissionScoreboard/status';
import {
  isJudgeLanguage,
  judgeLanguages,
  loadLastJudgeLanguage,
  saveLastJudgeLanguage,
} from '@/domains/submissionScoreboard/languagePreference';
import type {
  JudgeLanguage,
  Submission,
} from '@/domains/submissionScoreboard/types';
import { formatApiError } from '@/shared/api/errors';
import { loadCodeDraft, saveCodeDraft } from '@/shared/lib/codeDraftStorage';
import { formatMemoryKb } from '@/shared/lib/formatters';

type ProblemForm = {
  allowedLanguages: JudgeLanguage[];
  defaultStatementLanguage: string;
  statementTranslations: NonNullable<Problem['statement_translations']>;
  editorialTranslations: NonNullable<Problem['editorial_translations']>;
  displayOrder: string;
  divisionId: string;
  editorial: string;
  examples: { input: string; note?: string; output: string }[];
  inputDescription: string;
  languageResourceLimits: Partial<
    Record<
      JudgeLanguage,
      {
        memoryLimitMb: string;
        timeLimitMs: string;
        disableAutoAdjustment?: boolean;
      }
    >
  >;
  memoryLimitMb: string;
  note: string;
  outputDescription: string;
  problemCode: string;
  problemId: string;
  statement: string;
  timeLimitMs: string;
  title: string;
};

const TEST_SUBMISSION_MAX_WAIT_ATTEMPTS = 60;
const LIMIT_BOUNDARIES = {
  memoryMb: { max: 1024, min: 16 },
  timeMs: { max: 10000, min: 100 },
} as const;
const LANGUAGE_LABELS: Record<JudgeLanguage, string> = {
  c99: 'C99',
  pypy3: 'PyPy 3.11 (8.0.1)',
  kotlin: 'Kotlin 1.9.24',
  cpp17: 'C++17',
  java8: 'Java 8',
  python311: 'Python 3.11',
  python313: 'Python 3.13 (이전 환경)',
};
const AUTOMATIC_LANGUAGE_ADJUSTMENTS: Partial<
  Record<
    JudgeLanguage,
    {
      memoryBonusMb: number;
      memoryMultiplier: number;
      timeBonusMs: number;
      timeMultiplier: number;
    }
  >
> = {
  java8: {
    memoryBonusMb: 16,
    memoryMultiplier: 2,
    timeBonusMs: 1000,
    timeMultiplier: 2,
  },
  python311: {
    memoryBonusMb: 32,
    memoryMultiplier: 2,
    timeBonusMs: 2000,
    timeMultiplier: 3,
  },
  pypy3: {
    memoryBonusMb: 128,
    memoryMultiplier: 2,
    timeBonusMs: 2000,
    timeMultiplier: 3,
  },
  kotlin: {
    memoryBonusMb: 16,
    memoryMultiplier: 2,
    timeBonusMs: 1000,
    timeMultiplier: 2,
  },
};

function sleep(ms: number) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function formatRuntime(value?: number | null) {
  if (value === undefined || value === null) return '-';
  return `${value.toLocaleString('ko-KR')} ms`;
}

function judgeBundleStatusLabel(status?: JudgeBundleStatus | null) {
  if (!status) return '번들 확인 중';
  if (status.ready) return '번들 준비됨';
  if (status.status === 'pending') return '번들 대기중';
  if (status.status === 'running') return '번들 준비중';
  if (status.status === 'failed') return '번들 실패';
  if (status.status === 'no_active_testcase_set') return '활성 세트 없음';
  return '번들 미생성';
}

function judgeBundleStatusClassName(status?: JudgeBundleStatus | null) {
  if (!status) return 'border-slate-200 bg-slate-50 text-slate-500';
  if (status.ready) return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  if (status.status === 'running' || status.status === 'pending') {
    return 'border-sky-200 bg-sky-50 text-sky-700';
  }
  if (status.status === 'failed') {
    return 'border-rose-200 bg-rose-50 text-rose-700';
  }
  return 'border-amber-200 bg-amber-50 text-amber-700';
}

function judgeBundleStatusDetail(status?: JudgeBundleStatus | null) {
  if (!status) return '상태를 불러오는 중입니다.';
  if (status.ready && status.size_bytes) {
    return `${status.size_bytes.toLocaleString('ko-KR')} B`;
  }
  if (status.status === 'running') return '채점 번들을 생성하고 있습니다.';
  if (status.status === 'pending') return '생성 작업이 큐에서 대기 중입니다.';
  if (status.status === 'failed') {
    return status.queue?.last_error || '생성 작업이 실패했습니다.';
  }
  if (status.status === 'no_active_testcase_set') {
    return '활성 테스트케이스 세트가 필요합니다.';
  }
  return '다음 채점은 개별 파일 경로로 fallback됩니다.';
}

function codeLength(submission: Submission) {
  const length =
    submission.code_length_bytes ??
    submission.source_code_length ??
    submission.source_code?.length ??
    null;
  return typeof length === 'number'
    ? `${length.toLocaleString('ko-KR')} B`
    : '-';
}

type ProblemEditorMode = 'idle' | 'create' | 'edit';

const emptyProblemForm: ProblemForm = {
  allowedLanguages: [...judgeLanguages],
  defaultStatementLanguage: 'ko',
  statementTranslations: {},
  editorialTranslations: {},
  displayOrder: '',
  divisionId: '',
  editorial: '',
  examples: [],
  inputDescription: '',
  languageResourceLimits: {},
  memoryLimitMb: '256',
  note: '',
  outputDescription: '',
  problemCode: '',
  problemId: '',
  statement: PROBLEM_STATEMENT_TEMPLATE,
  timeLimitMs: '1000',
  title: '',
};

function problemFormFromProblem(problem: Problem): ProblemForm {
  const document = parseProblemDocument(problem.statement);
  const languageResourceLimits = Object.fromEntries(
    judgeLanguages
      .map((language) => {
        const limit = problem.language_resource_limits?.[language];
        if (!limit) return null;
        return [
          language,
          {
            disableAutoAdjustment: Boolean(limit.disable_auto_adjustment),
            memoryLimitMb:
              limit.memory_limit_mb === undefined ||
              limit.memory_limit_mb === null
                ? ''
                : String(limit.memory_limit_mb),
            timeLimitMs:
              limit.time_limit_ms === undefined || limit.time_limit_ms === null
                ? ''
                : String(limit.time_limit_ms),
          },
        ];
      })
      .filter(Boolean) as [
      JudgeLanguage,
      {
        memoryLimitMb: string;
        timeLimitMs: string;
        disableAutoAdjustment?: boolean;
      },
    ][],
  );

  return {
    displayOrder: String(problem.display_order ?? ''),
    divisionId: problem.division_id ?? '',
    editorial: problem.editorial ?? '',
    defaultStatementLanguage: problem.default_statement_language || 'ko',
    statementTranslations: problem.statement_translations || {},
    editorialTranslations: problem.editorial_translations || {},
    examples: document.examples,
    inputDescription: document.inputDescription,
    allowedLanguages: problem.allowed_languages ?? [...judgeLanguages],
    languageResourceLimits,
    memoryLimitMb: String(problem.memory_limit_mb),
    note: document.note,
    outputDescription: document.outputDescription,
    problemCode: problem.problem_code,
    problemId: problem.problem_id,
    statement: document.statement,
    timeLimitMs: String(problem.time_limit_ms),
    title: problem.title,
  };
}

function problemStatementFromForm(form: ProblemForm) {
  return serializeProblemDocument({
    examples: form.examples.filter(
      (example) => example.input.trim() || example.output.trim(),
    ),
    inputDescription: form.inputDescription,
    note: form.note,
    outputDescription: form.outputDescription,
    statement: form.statement,
  });
}

function languageResourceLimitsFromForm(form: ProblemForm) {
  return Object.fromEntries(
    judgeLanguages
      .map((language) => {
        const limit = form.languageResourceLimits[language];
        if (!limit) return null;
        const timeLimitMs = limit.timeLimitMs.trim();
        const memoryLimitMb = limit.memoryLimitMb.trim();
        const payload: {
          memory_limit_mb?: number;
          time_limit_ms?: number;
          disable_auto_adjustment?: boolean;
        } = {};
        if (limit.disableAutoAdjustment) payload.disable_auto_adjustment = true;
        if (timeLimitMs) payload.time_limit_ms = Number(timeLimitMs);
        if (memoryLimitMb) payload.memory_limit_mb = Number(memoryLimitMb);
        return Object.keys(payload).length ? [language, payload] : null;
      })
      .filter(Boolean) as [
      JudgeLanguage,
      {
        memory_limit_mb?: number;
        time_limit_ms?: number;
        disable_auto_adjustment?: boolean;
      },
    ][],
  );
}

function positiveNumberOrFallback(value: string, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function clampInteger(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function limitValueOrFallback(
  value: string,
  fallback: number,
  boundary: { max: number; min: number },
) {
  const parsed = Number(value);
  return Number.isInteger(parsed)
    ? clampInteger(parsed, boundary.min, boundary.max)
    : fallback;
}

function normalizeLimitValue(
  value: string,
  label: string,
  unit: string,
  boundary: { max: number; min: number },
) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) {
    return { message: '', value };
  }
  const nextValue = clampInteger(parsed, boundary.min, boundary.max);
  if (nextValue === parsed) {
    return { message: '', value };
  }
  const message =
    parsed < boundary.min
      ? `${label}은 ${boundary.min.toLocaleString('ko-KR')}${unit} 이상으로 설정 가능합니다. ${boundary.min.toLocaleString('ko-KR')}${unit}로 자동 변경했습니다.`
      : `${label}은 최대 ${boundary.max.toLocaleString('ko-KR')}${unit}까지 설정 가능합니다. ${boundary.max.toLocaleString('ko-KR')}${unit}로 자동 변경했습니다.`;
  return { message, value: String(nextValue) };
}

function normalizeOptionalLimitValue(
  value: string,
  label: string,
  unit: string,
  boundary: { max: number; min: number },
) {
  if (!value.trim()) return { message: '', value };
  return normalizeLimitValue(value, label, unit, boundary);
}

function normalizeProblemLimitForm(form: ProblemForm) {
  const time = normalizeLimitValue(
    form.timeLimitMs,
    '시간 제한',
    'ms',
    LIMIT_BOUNDARIES.timeMs,
  );
  const memory = normalizeLimitValue(
    form.memoryLimitMb,
    '메모리 제한',
    'MB',
    LIMIT_BOUNDARIES.memoryMb,
  );
  const normalizedLanguageLimits = { ...form.languageResourceLimits };
  const languageMessages: string[] = [];
  for (const language of judgeLanguages) {
    const limit = form.languageResourceLimits[language];
    if (!limit) continue;
    const label = LANGUAGE_LABELS[language];
    const languageTime = normalizeOptionalLimitValue(
      limit.timeLimitMs,
      `${label} 시간 제한`,
      'ms',
      LIMIT_BOUNDARIES.timeMs,
    );
    const languageMemory = normalizeOptionalLimitValue(
      limit.memoryLimitMb,
      `${label} 메모리 제한`,
      'MB',
      LIMIT_BOUNDARIES.memoryMb,
    );
    languageMessages.push(languageTime.message, languageMemory.message);
    normalizedLanguageLimits[language] = {
      ...limit,
      memoryLimitMb: languageMemory.value,
      timeLimitMs: languageTime.value,
    };
  }

  return {
    form: {
      ...form,
      languageResourceLimits: normalizedLanguageLimits,
      memoryLimitMb: memory.value,
      timeLimitMs: time.value,
    },
    messages: [time.message, memory.message, ...languageMessages].filter(
      Boolean,
    ),
  };
}

function automaticLanguageLimitText(
  form: ProblemForm,
  language: JudgeLanguage,
) {
  const adjustment = AUTOMATIC_LANGUAGE_ADJUSTMENTS[language];
  if (!adjustment) return '';
  const limit = form.languageResourceLimits[language];
  if (limit?.disableAutoAdjustment)
    return '자동 보정 꺼짐 · 비워 둔 항목은 문제 기본 제한을 사용합니다.';
  if (limit?.timeLimitMs.trim() && limit?.memoryLimitMb.trim()) return '';
  const baseTimeMs = limitValueOrFallback(
    form.timeLimitMs,
    1000,
    LIMIT_BOUNDARIES.timeMs,
  );
  const baseMemoryMb = limitValueOrFallback(
    form.memoryLimitMb,
    256,
    LIMIT_BOUNDARIES.memoryMb,
  );
  const adjustedTimeMs =
    baseTimeMs * adjustment.timeMultiplier + adjustment.timeBonusMs;
  const adjustedMemoryMb =
    baseMemoryMb * adjustment.memoryMultiplier + adjustment.memoryBonusMb;
  return [
    '빈 항목에 자동 보정 적용',
    limit?.timeLimitMs.trim()
      ? `시간: 직접 지정 ${limit.timeLimitMs}ms`
      : `시간: 기본 ${baseTimeMs.toLocaleString('ko-KR')}ms × ${adjustment.timeMultiplier} + ${adjustment.timeBonusMs.toLocaleString('ko-KR')}ms = ${adjustedTimeMs.toLocaleString('ko-KR')}ms`,
    limit?.memoryLimitMb.trim()
      ? `메모리: 직접 지정 ${limit.memoryLimitMb}MB`
      : `메모리: 기본 ${baseMemoryMb.toLocaleString('ko-KR')}MB × ${adjustment.memoryMultiplier} + ${adjustment.memoryBonusMb.toLocaleString('ko-KR')}MB = ${adjustedMemoryMb.toLocaleString('ko-KR')}MB`,
  ].join(' / ');
}

function previewProblemFromForm(
  form: ProblemForm,
  selectedProblem?: Problem,
): Problem {
  const displayOrder = form.displayOrder
    ? positiveNumberOrFallback(
        form.displayOrder,
        selectedProblem?.display_order ?? 1,
      )
    : selectedProblem?.display_order;

  return {
    display_order: displayOrder,
    division_id: form.divisionId || selectedProblem?.division_id,
    editorial: form.editorial,
    default_statement_language: form.defaultStatementLanguage,
    statement_translations: form.statementTranslations,
    editorial_translations: form.editorialTranslations,
    language_resource_limits: languageResourceLimitsFromForm(form),
    allowed_languages: form.allowedLanguages,
    memory_limit_mb: limitValueOrFallback(
      form.memoryLimitMb,
      selectedProblem?.memory_limit_mb ?? 256,
      LIMIT_BOUNDARIES.memoryMb,
    ),
    problem_code:
      form.problemCode.trim() || selectedProblem?.problem_code || 'Preview',
    problem_id: form.problemId || selectedProblem?.problem_id || 'preview',
    statement:
      problemStatementFromForm(form).trim() ||
      selectedProblem?.statement ||
      PROBLEM_STATEMENT_TEMPLATE,
    time_limit_ms: limitValueOrFallback(
      form.timeLimitMs,
      selectedProblem?.time_limit_ms ?? 1000,
      LIMIT_BOUNDARIES.timeMs,
    ),
    title: form.title.trim() || selectedProblem?.title || '문제 미리보기',
  };
}

function positiveInteger(value: string, label: string) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return `${label}은 1 이상의 정수로 입력해야 합니다.`;
  }
  return '';
}

function positiveOptionalInteger(value: string, label: string) {
  if (!value.trim()) return '';
  return positiveInteger(value, label);
}

function validateProblemForm(form: ProblemForm) {
  if (!form.divisionId || !form.problemCode.trim() || !form.title.trim()) {
    return '유형, 문제 번호, 제목은 반드시 입력해야 합니다.';
  }

  const languageLimitError = judgeLanguages
    .map((language) => {
      const limit = form.languageResourceLimits[language];
      if (!limit) return '';
      const label = LANGUAGE_LABELS[language];
      return (
        positiveOptionalInteger(limit.timeLimitMs, `${label} 시간 제한`) ||
        positiveOptionalInteger(limit.memoryLimitMb, `${label} 메모리 제한`)
      );
    })
    .find(Boolean);

  return (
    positiveInteger(form.timeLimitMs, '시간 제한') ||
    positiveInteger(form.memoryLimitMb, '메모리 제한') ||
    languageLimitError ||
    (form.displayOrder ? positiveInteger(form.displayOrder, '정렬 순서') : '')
  );
}

function uniqueProblemCode(baseCode: string, existingCodes: Set<string>) {
  if (!existingCodes.has(baseCode)) return baseCode;

  let index = 1;
  let candidate = `${baseCode}-copy`;
  while (existingCodes.has(candidate)) {
    index += 1;
    candidate = `${baseCode}-copy${index}`;
  }
  return candidate;
}

function problemsInDivision(problems: Problem[], divisionId: string) {
  return problems
    .filter((problem) => problem.division_id === divisionId)
    .sort(
      (a, b) =>
        (a.display_order ?? 0) - (b.display_order ?? 0) ||
        a.problem_code.localeCompare(b.problem_code, 'ko-KR', {
          numeric: true,
        }),
    );
}

function nextProblemDisplayOrder(problems: Problem[], divisionId: string) {
  const divisionProblems = problemsInDivision(problems, divisionId);
  return (
    Math.max(
      0,
      ...divisionProblems.map((problem) => problem.display_order ?? 0),
    ) + 1
  );
}

function problemOrderOptions(
  problems: Problem[],
  divisionId: string,
  currentDisplayOrder: string,
) {
  if (!divisionId) return [];

  const divisionProblems = problemsInDivision(problems, divisionId);
  const nextOrder = nextProblemDisplayOrder(problems, divisionId);
  const currentOrder = Number(currentDisplayOrder);
  const maxOrder = Math.max(
    nextOrder,
    Number.isInteger(currentOrder) ? currentOrder : 0,
  );
  const problemByOrder = new Map<number, Problem>();

  divisionProblems.forEach((problem) => {
    const order = problem.display_order ?? 0;
    if (order > 0 && !problemByOrder.has(order)) {
      problemByOrder.set(order, problem);
    }
  });

  return Array.from({ length: maxOrder }, (_, index) => {
    const order = index + 1;
    const problem = problemByOrder.get(order);
    const suffix = problem
      ? `${problem.problem_code}. ${problem.title}`
      : order === nextOrder
        ? '마지막에 추가'
        : '빈 순서';

    return {
      label: `${order}번 · ${suffix}`,
      value: String(order),
    };
  });
}

function storageFileName(storageKey: string) {
  return decodeURIComponent(storageKey.split('/').pop() ?? storageKey);
}

function formatTestcaseFileSize(sizeBytes?: number | null) {
  if (
    typeof sizeBytes !== 'number' ||
    !Number.isFinite(sizeBytes) ||
    sizeBytes < 0
  ) {
    return null;
  }
  if (sizeBytes >= 1024 * 1024) {
    const sizeMb = sizeBytes / (1024 * 1024);
    return `${sizeMb >= 10 ? sizeMb.toFixed(0) : sizeMb.toFixed(1)}MB`;
  }
  return `${Math.max(1, Math.ceil(sizeBytes / 1024))}KB`;
}

function testcaseDisplayFileName(
  displayOrder: number,
  extension: 'in' | 'out',
) {
  return `${String(displayOrder).padStart(2, '0')}.${extension}`;
}

function testcaseFileLabel(
  displayOrder: number,
  extension: 'in' | 'out',
  sizeBytes?: number | null,
) {
  const sizeLabel = formatTestcaseFileSize(sizeBytes);
  return `${testcaseDisplayFileName(displayOrder, extension)}${
    sizeLabel ? `(${sizeLabel})` : ''
  }`;
}

export default function OperatorProblemsPage() {
  const { contestId } = useParams();

  return (
    <OperatorAccessGate
      contestId={contestId}
      permission="contest.problem.manage"
    >
      {(session) =>
        contestId ? (
          <OperatorProblemsContent
            key={contestId}
            contestId={contestId}
            token={session.accessToken}
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

function OperatorProblemsContent({
  contestId,
  token,
}: {
  contestId: string;
  token: string;
}) {
  const { confirm: confirmAction, dialog: confirmationDialog } =
    useConfirmation();

  const queryIdentity = tokenQueryIdentity(token);
  const queryClient = useQueryClient();
  const [editorMode, setEditorMode] = useState<ProblemEditorMode>('idle');
  const editorRef = useRef<HTMLDivElement>(null);
  const initialFormRef = useRef(emptyProblemForm);
  const [problemSearch, setProblemSearch] = useState('');
  const [savedMessage, setSavedMessage] = useState('');
  const [authoringTab, setAuthoringTab] = useState<
    'settings' | 'statement' | 'editorial' | 'tests' | 'preview'
  >('settings');
  const [form, setForm] = useState(emptyProblemForm);
  const [selectedProblemId, setSelectedProblemId] = useState('');
  const [copySourceProblemId, setCopySourceProblemId] = useState('');
  const [isCopyPanelOpen, setIsCopyPanelOpen] = useState(false);
  const [filterDivisionId, setFilterDivisionId] = useState('');
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [isTestcaseModalOpen, setIsTestcaseModalOpen] = useState(false);
  const [isCaseDropActive, setIsCaseDropActive] = useState(false);
  const [testcaseFilePreview, setTestcaseFilePreview] = useState<{
    storageKey: string;
    title: string;
  } | null>(null);
  const [supportFilePreview, setSupportFilePreview] = useState<{
    storageKey: string;
    title: string;
  } | null>(null);
  const [testLanguage, setTestLanguage] = useState<JudgeLanguage>(() =>
    loadLastJudgeLanguage(),
  );
  const [testSourceCode, setTestSourceCode] = useState('');
  const [testSubmission, setTestSubmission] = useState<Submission | null>(null);
  const [uploadProgress, setUploadProgress] = useState('');
  const [uploadProgressValue, setUploadProgressValue] = useState(0);
  const [formError, setFormError] = useState('');
  const [formNotice, setFormNotice] = useState('');

  const dashboardQuery = useQuery({
    queryKey: ['operator', 'dashboard', contestId, queryIdentity],
    queryFn: () => getOperatorContestDashboard(contestId, token),
  });
  const problemsQuery = useQuery({
    queryKey: ['operator', 'problems', contestId, queryIdentity],
    queryFn: () => getOperatorProblems(contestId, token),
  });

  const problems = useMemo(
    () =>
      [...(problemsQuery.data ?? [])].sort(
        (a, b) =>
          (a.display_order ?? 0) - (b.display_order ?? 0) ||
          a.problem_code.localeCompare(b.problem_code, 'ko-KR', {
            numeric: true,
          }),
      ),
    [problemsQuery.data],
  );
  const divisions = dashboardQuery.data?.divisions ?? [];
  const activeDivisionId =
    (filterDivisionId &&
    divisions.some((division) => division.division_id === filterDivisionId)
      ? filterDivisionId
      : divisions[0]?.division_id) ?? '';
  const divisionProblems = activeDivisionId
    ? problems.filter((problem) => problem.division_id === activeDivisionId)
    : problems;
  const filteredProblems = divisionProblems.filter((problem) =>
    `${problem.problem_code} ${problem.title}`
      .toLowerCase()
      .includes(problemSearch.trim().toLowerCase()),
  );
  const displayOrderOptions = useMemo(
    () => problemOrderOptions(problems, form.divisionId, form.displayOrder),
    [form.displayOrder, form.divisionId, problems],
  );
  const copyableProblems = activeDivisionId
    ? problems.filter((problem) => problem.division_id !== activeDivisionId)
    : [];
  const effectiveSelectedProblemId = selectedProblemId;
  const verificationRuns = useVerificationCodeRuns({
    contestId,
    problemId: effectiveSelectedProblemId,
    token,
  });
  const selectedProblem = problems.find(
    (problem) => problem.problem_id === effectiveSelectedProblemId,
  );
  const hasUnsavedProblem = Boolean(
    selectedProblem &&
    JSON.stringify(form) !==
      JSON.stringify(problemFormFromProblem(selectedProblem)),
  );
  const testDraftScope = `operator:${contestId}`;
  const testDraftKey = effectiveSelectedProblemId
    ? `preview:${effectiveSelectedProblemId}`
    : '';
  const previewProblem = useMemo(
    () => previewProblemFromForm(form, selectedProblem),
    [form, selectedProblem],
  );

  const assetsQuery = useQuery({
    enabled:
      Boolean(effectiveSelectedProblemId) &&
      (authoringTab === 'statement' ||
        authoringTab === 'editorial' ||
        authoringTab === 'tests' ||
        isPreviewOpen),
    queryKey: [
      'operator',
      'problem-assets',
      contestId,
      effectiveSelectedProblemId,
      queryIdentity,
    ],
    queryFn: () =>
      getProblemAssets(contestId, effectiveSelectedProblemId, token),
  });
  const testcaseSetsQuery = useQuery({
    enabled: Boolean(effectiveSelectedProblemId) && authoringTab === 'tests',
    queryKey: [
      'operator',
      'problem-testcase-sets',
      contestId,
      effectiveSelectedProblemId,
      queryIdentity,
    ],
    queryFn: () =>
      getProblemTestcaseSets(contestId, effectiveSelectedProblemId, token),
  });
  const packageStatusQuery = useQuery({
    enabled: Boolean(effectiveSelectedProblemId) && authoringTab === 'tests',
    queryKey: [
      'operator',
      'problem-package-status',
      contestId,
      effectiveSelectedProblemId,
      queryIdentity,
    ],
    queryFn: () =>
      getProblemPackageStatus(contestId, effectiveSelectedProblemId, token),
    refetchInterval: (query) => {
      const status = query.state.data?.judge_bundle?.status;
      return status === 'pending' || status === 'running' ? 1000 : false;
    },
  });
  const latestTestcaseSet = useMemo(() => {
    const sets = testcaseSetsQuery.data ?? [];
    return (
      sets.find((set) => set.is_active) ??
      [...sets].sort((a, b) => b.version - a.version)[0] ??
      null
    );
  }, [testcaseSetsQuery.data]);
  const imageAssets = useMemo(
    () =>
      (assetsQuery.data ?? []).filter(
        (asset) =>
          !asset.storage_key.includes('/editorial-assets/') &&
          (asset.mime_type.startsWith('image/') ||
            asset.storage_key.includes('/assets/')),
      ),
    [assetsQuery.data],
  );
  const editorialAssets = useMemo(
    () =>
      (assetsQuery.data ?? []).filter((asset) =>
        asset.storage_key.includes('/editorial-assets/'),
      ),
    [assetsQuery.data],
  );
  const verificationAssetsByKind = useMemo(() => {
    const grouped = new Map<VerificationCodeKind, ProblemAsset[]>();
    for (const kind of VERIFICATION_CODE_KINDS) {
      grouped.set(kind.expectedStatus, []);
    }
    for (const asset of assetsQuery.data ?? []) {
      const kind = verificationKindFromAsset(asset);
      if (!kind) continue;
      grouped.get(kind)?.push(asset);
    }
    for (const [kind, assets] of grouped) {
      grouped.set(
        kind,
        [...assets].sort((a, b) =>
          a.original_filename.localeCompare(b.original_filename, 'ko-KR', {
            numeric: true,
          }),
        ),
      );
    }
    return grouped;
  }, [assetsQuery.data]);
  const supportAssetByRole = useMemo(() => {
    const grouped = new Map<string, ProblemAsset>();
    for (const asset of assetsQuery.data ?? []) {
      const role = supportRoleFromAsset(asset);
      if (!role) continue;
      grouped.set(role, asset);
    }
    return grouped;
  }, [assetsQuery.data]);
  const supportFileRows = useMemo(() => {
    const statusByRole = new Map(
      (packageStatusQuery.data?.support_files ?? []).map((file) => [
        file.role,
        file,
      ]),
    );

    return TESTCASE_SUPPORT_FILE_ROLES.map((role) => {
      const roleMeta = PACKAGE_FILE_ROLES.find((item) => item.value === role);
      const fallback: PackageSupportFileStatus = {
        role,
        label: supportRoleRequiredFilename(role),
        required: role !== 'checker',
        count: 0,
        latest_filename: null,
        status: 'missing',
      };
      const current = statusByRole.get(role) ?? fallback;

      return {
        ...current,
        detail: roleMeta?.detail ?? '',
        label:
          supportRoleRequiredFilename(role) ||
          current.label ||
          roleMeta?.label ||
          role,
      };
    });
  }, [packageStatusQuery.data?.support_files]);
  const warmJudgeBundleMutation = useMutation({
    mutationFn: () =>
      warmProblemJudgeBundle(contestId, effectiveSelectedProblemId, token),
    onSuccess: (judgeBundle) => {
      const packageStatusKey = [
        'operator',
        'problem-package-status',
        contestId,
        effectiveSelectedProblemId,
        queryIdentity,
      ];
      queryClient.setQueryData(packageStatusKey, (current) => {
        if (!current || typeof current !== 'object') return current;
        return {
          ...current,
          judge_bundle: judgeBundle,
        };
      });
      void queryClient.refetchQueries({
        queryKey: packageStatusKey,
      });
    },
  });
  const testcaseFileStorageKey = testcaseFilePreview?.storageKey ?? '';
  const testcaseFileQuery = useQuery({
    enabled: Boolean(testcaseFileStorageKey),
    queryKey: [
      'operator',
      'testcase-file',
      testcaseFileStorageKey,
      queryIdentity,
    ],
    queryFn: async ({ signal }) => ({
      storageKey: testcaseFileStorageKey,
      preview: await getStorageObjectPreview(
        testcaseFileStorageKey,
        token,
        signal,
      ),
    }),
    gcTime: 30000,
  });
  const isTestcaseFileSettled =
    testcaseFileQuery.data?.storageKey === testcaseFileStorageKey;
  const isTestcaseFileLoading =
    Boolean(testcaseFileStorageKey) &&
    (testcaseFileQuery.isPending ||
      (testcaseFileQuery.isFetching && !isTestcaseFileSettled));
  const supportFileQuery = useQuery({
    enabled: Boolean(supportFilePreview?.storageKey),
    queryKey: [
      'operator',
      'support-file',
      supportFilePreview?.storageKey ?? '',
      queryIdentity,
    ],
    queryFn: ({ signal }) =>
      getStorageObjectPreview(supportFilePreview!.storageKey, token, signal),
    gcTime: 30000,
  });

  const saveProblemMutation = useMutation({
    mutationFn: (problemForm: ProblemForm) => {
      const body = {
        display_order: problemForm.displayOrder
          ? Number(problemForm.displayOrder)
          : undefined,
        division_id: problemForm.divisionId,
        editorial: problemForm.editorial,
        default_statement_language: problemForm.defaultStatementLanguage,
        statement_translations: problemForm.statementTranslations,
        editorial_translations: problemForm.editorialTranslations,
        language_resource_limits: languageResourceLimitsFromForm(problemForm),
        allowed_languages: problemForm.allowedLanguages,
        memory_limit_mb: Number(problemForm.memoryLimitMb),
        problem_code: problemForm.problemCode.trim(),
        statement: problemStatementFromForm(problemForm),
        time_limit_ms: Number(problemForm.timeLimitMs),
        title: problemForm.title.trim(),
      };

      return problemForm.problemId
        ? updateOperatorProblem(contestId, problemForm.problemId, token, body)
        : createOperatorProblem(contestId, token, body);
    },
    onSuccess: (problem) => {
      setEditorMode('edit');
      setSelectedProblemId(problem.problem_id);
      setForm(problemFormFromProblem(problem));
      initialFormRef.current = problemFormFromProblem(problem);
      setSavedMessage(
        `${problem.problem_code}. ${problem.title} 문제가 저장되었습니다.`,
      );
      setTestSubmission(null);
      setFormError('');
      setFormNotice('');
      void queryClient.invalidateQueries({
        queryKey: ['operator', 'problems', contestId],
      });
    },
  });

  const deleteProblemMutation = useMutation({
    mutationFn: (problem: Problem) =>
      deleteOperatorProblem(contestId, problem.problem_id, token, true),
    onSuccess: (_deleted, problem) => {
      setEditorMode('idle');
      setAuthoringTab('settings');
      setSelectedProblemId('');
      setForm({
        ...emptyProblemForm,
        displayOrder: activeDivisionId
          ? String(nextProblemDisplayOrder(problems, activeDivisionId))
          : '',
        divisionId: activeDivisionId,
      });
      setTestSubmission(null);
      verificationRuns.removeProblem(problem.problem_id);
      setFormError('');
      setFormNotice('');
      setSavedMessage(
        `${problem.problem_code}. ${problem.title} 문제가 삭제되었습니다.`,
      );
      void queryClient.invalidateQueries({
        queryKey: ['operator', 'problems', contestId],
      });
    },
  });

  const copyProblemMutation = useMutation({
    mutationFn: () => {
      const sourceProblem = problems.find(
        (problem) => problem.problem_id === copySourceProblemId,
      );
      if (!sourceProblem) {
        throw new Error('복사할 문제를 선택해 주세요.');
      }
      if (!activeDivisionId) {
        throw new Error('문제를 가져올 유형을 선택해 주세요.');
      }

      const targetProblems = problems.filter(
        (problem) => problem.division_id === activeDivisionId,
      );
      const existingCodes = new Set(
        targetProblems.map((problem) => problem.problem_code),
      );
      const nextDisplayOrder =
        Math.max(
          0,
          ...targetProblems.map((problem) => problem.display_order ?? 0),
        ) + 1;

      return copyOperatorProblem(contestId, token, {
        display_order: nextDisplayOrder,
        problem_code: uniqueProblemCode(
          sourceProblem.problem_code,
          existingCodes,
        ),
        source_problem_id: sourceProblem.problem_id,
        target_division_id: activeDivisionId,
      });
    },
    onSuccess: (problem) => {
      setCopySourceProblemId('');
      setIsCopyPanelOpen(false);
      setEditorMode('edit');
      setAuthoringTab('statement');
      setSelectedProblemId(problem.problem_id);
      setForm(problemFormFromProblem(problem));
      initialFormRef.current = problemFormFromProblem(problem);
      setFormNotice('');
      setSavedMessage(
        `${problem.problem_code}. ${problem.title} 문제를 현재 유형으로 복사했습니다.`,
      );
      setTestSubmission(null);
      setFormError('');
      void queryClient.invalidateQueries({
        queryKey: ['operator', 'problems', contestId],
      });
    },
  });

  const uploadAssetMutation = useMutation({
    mutationFn: (file: File) =>
      uploadProblemAsset(contestId, effectiveSelectedProblemId, token, file),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: [
          'operator',
          'problem-assets',
          contestId,
          effectiveSelectedProblemId,
        ],
      });
      void queryClient.invalidateQueries({
        queryKey: [
          'operator',
          'problem-package-status',
          contestId,
          effectiveSelectedProblemId,
        ],
      });
    },
  });

  const uploadEditorialAssetMutation = useMutation({
    mutationFn: (file: File) =>
      uploadProblemAsset(
        contestId,
        effectiveSelectedProblemId,
        token,
        file,
        `problems/${effectiveSelectedProblemId}/editorial-assets`,
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: [
          'operator',
          'problem-assets',
          contestId,
          effectiveSelectedProblemId,
        ],
      });
    },
  });

  const uploadRoleFileMutation = useMutation({
    mutationFn: ({ file, role }: { file: File; role: string }) =>
      uploadProblemAsset(
        contestId,
        effectiveSelectedProblemId,
        token,
        file,
        `problems/${effectiveSelectedProblemId}/package-files/${role}`,
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: [
          'operator',
          'problem-assets',
          contestId,
          effectiveSelectedProblemId,
        ],
      });
      void queryClient.invalidateQueries({
        queryKey: [
          'operator',
          'problem-package-status',
          contestId,
          effectiveSelectedProblemId,
        ],
      });
    },
  });

  async function waitForOperatorTestSubmission(
    submitted: Submission,
    onUpdate?: (submission: Submission) => void,
  ) {
    let latest = submitted;
    onUpdate?.(latest);

    for (
      let attempt = 0;
      isSubmissionPending(latest.status) &&
      attempt < TEST_SUBMISSION_MAX_WAIT_ATTEMPTS;
      attempt += 1
    ) {
      latest = await waitOperatorTestSubmissionStatus(
        contestId,
        latest.submission_id,
        token,
        {
          pollIntervalSeconds: 0.1,
          waitSeconds: 0.35,
        },
      );
      onUpdate?.(latest);

      if (isSubmissionPending(latest.status)) {
        await sleep(100);
      }
    }

    return latest;
  }

  const deleteAssetMutation = useMutation({
    mutationFn: (asset: ProblemAsset) =>
      deleteProblemAsset(
        contestId,
        effectiveSelectedProblemId,
        asset.asset_id,
        token,
      ),
    onSuccess: (_asset, deletedAsset) => {
      if (supportFilePreview?.storageKey === deletedAsset.storage_key) {
        setSupportFilePreview(null);
      }
      verificationRuns.removeAsset(deletedAsset);
      void queryClient.invalidateQueries({
        queryKey: [
          'operator',
          'problem-assets',
          contestId,
          effectiveSelectedProblemId,
        ],
      });
      void queryClient.invalidateQueries({
        queryKey: [
          'operator',
          'problem-package-status',
          contestId,
          effectiveSelectedProblemId,
        ],
      });
    },
  });

  const uploadMatchedTestcasesMutation = useMutation({
    mutationFn: (files: File[]) =>
      uploadAndCreateMatchedTestcaseSet(
        contestId,
        effectiveSelectedProblemId,
        token,
        files,
        (progress) => {
          const filename = progress.filename ? ` · ${progress.filename}` : '';
          setUploadProgressValue(
            Math.round((progress.current / progress.total) * 100),
          );
          setUploadProgress(
            `${progress.phase} ${progress.current}/${progress.total}${filename}`,
          );
        },
      ),
    onSuccess: async (result) => {
      setUploadProgressValue(100);
      setUploadProgress(
        result.warnings.length
          ? `검증 완료: ${result.verified_count}건, 경고 ${result.warnings.length}건`
          : `검증 완료: ${result.verified_count}건`,
      );
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: [
            'operator',
            'problem-testcase-sets',
            contestId,
            effectiveSelectedProblemId,
          ],
        }),
        queryClient.invalidateQueries({
          queryKey: [
            'operator',
            'problem-package-status',
            contestId,
            effectiveSelectedProblemId,
          ],
        }),
      ]);
    },
    onError: () => setUploadProgressValue(0),
  });

  const deleteTestcaseSetMutation = useMutation({
    mutationFn: (testcaseSetId: string) =>
      deleteProblemTestcaseSet(
        contestId,
        effectiveSelectedProblemId,
        testcaseSetId,
        token,
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: [
          'operator',
          'problem-testcase-sets',
          contestId,
          effectiveSelectedProblemId,
        ],
      });
      void queryClient.invalidateQueries({
        queryKey: [
          'operator',
          'problem-package-status',
          contestId,
          effectiveSelectedProblemId,
        ],
      });
    },
  });

  const deleteTestcaseMutation = useMutation({
    mutationFn: ({
      testcaseId,
      testcaseSetId,
    }: {
      testcaseId: string;
      testcaseSetId: string;
    }) =>
      deleteProblemTestcase(
        contestId,
        effectiveSelectedProblemId,
        testcaseSetId,
        testcaseId,
        token,
      ),
    onSuccess: (deletedTestcase) => {
      if (
        testcaseFilePreview?.storageKey === deletedTestcase.input_storage_key ||
        testcaseFilePreview?.storageKey === deletedTestcase.output_storage_key
      ) {
        setTestcaseFilePreview(null);
      }
      void queryClient.invalidateQueries({
        queryKey: [
          'operator',
          'problem-testcase-sets',
          contestId,
          effectiveSelectedProblemId,
        ],
      });
      void queryClient.invalidateQueries({
        queryKey: [
          'operator',
          'problem-package-status',
          contestId,
          effectiveSelectedProblemId,
        ],
      });
    },
  });

  const exportProblemMutation = useMutation({
    mutationFn: (problem: Problem) =>
      downloadProblemArchive(contestId, token, problem),
  });

  const testSubmissionMutation = useMutation({
    mutationFn: async () => {
      const submitted = await createOperatorTestSubmission(
        contestId,
        effectiveSelectedProblemId,
        token,
        {
          language: testLanguage,
          source_code: testSourceCode,
        },
      );

      setTestSubmission(submitted);

      const latest = await waitForOperatorTestSubmission(
        submitted,
        setTestSubmission,
      );

      return latest;
    },
    onSuccess: (submission) => {
      setTestSubmission(submission);
    },
  });

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (!testDraftKey) {
        setTestSourceCode('');
        return;
      }

      const savedDraft = loadCodeDraft(testDraftScope, testDraftKey);
      setTestSourceCode(savedDraft?.sourceCode ?? '');
      if (isJudgeLanguage(savedDraft?.language)) {
        setTestLanguage(savedDraft.language);
      }
    }, 0);

    return () => window.clearTimeout(timer);
  }, [testDraftKey, testDraftScope]);

  function handleTestLanguageChange(language: JudgeLanguage) {
    setTestLanguage(language);
    saveLastJudgeLanguage(language);
    if (testDraftKey) {
      saveCodeDraft(testDraftScope, testDraftKey, { language });
    }
  }

  function handleTestSourceCodeChange(sourceCode: string) {
    setTestSourceCode(sourceCode);
    if (testDraftKey) {
      saveCodeDraft(testDraftScope, testDraftKey, { sourceCode });
    }
  }

  function editProblem(problem: Problem) {
    if (!canLeaveEditor()) return;
    clearEditorFeedback();
    setEditorMode('edit');
    setAuthoringTab('statement');
    setSelectedProblemId(problem.problem_id);
    setForm(problemFormFromProblem(problem));
    initialFormRef.current = problemFormFromProblem(problem);
    setTestSubmission(null);
    setFormError('');
    focusEditor();
  }

  function startCreateMode() {
    if (!activeDivisionId || !canLeaveEditor()) return;
    clearEditorFeedback();
    const divisionId = activeDivisionId;
    setEditorMode('create');
    setAuthoringTab('settings');
    setSelectedProblemId('');
    const nextForm = {
      ...emptyProblemForm,
      displayOrder: divisionId
        ? String(nextProblemDisplayOrder(problems, divisionId))
        : '',
      divisionId,
    };
    setForm(nextForm);
    initialFormRef.current = nextForm;
    setTestSubmission(null);
    setFormError('');
    focusEditor();
  }

  function focusEditor() {
    editorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    editorRef.current?.focus({ preventScroll: true });
  }

  function canLeaveEditor() {
    if (
      saveProblemMutation.isPending ||
      deleteProblemMutation.isPending ||
      copyProblemMutation.isPending
    )
      return false;
    return (
      editorMode === 'idle' ||
      JSON.stringify(form) === JSON.stringify(initialFormRef.current) ||
      window.confirm(
        '저장하지 않은 문제 변경사항이 있습니다. 변경사항을 버리고 이동할까요?',
      )
    );
  }

  function clearEditorFeedback() {
    setFormError('');
    setFormNotice('');
    setSavedMessage('');
    saveProblemMutation.reset();
    deleteProblemMutation.reset();
    exportProblemMutation.reset();
  }

  function cancelEditor() {
    if (!canLeaveEditor()) return false;
    clearEditorFeedback();
    setEditorMode('idle');
    setSelectedProblemId('');
    setAuthoringTab('settings');
    setForm(emptyProblemForm);
    setTestSubmission(null);
    return true;
  }

  function addExample() {
    setForm((prev) => ({
      ...prev,
      examples: [...prev.examples, { input: '', output: '', note: '' }],
    }));
  }

  function updateExample(
    index: number,
    values: Partial<{ input: string; note: string; output: string }>,
  ) {
    setForm((prev) => ({
      ...prev,
      examples: prev.examples.map((example, exampleIndex) =>
        exampleIndex === index ? { ...example, ...values } : example,
      ),
    }));
  }

  function removeExample(index: number) {
    setForm((prev) => ({
      ...prev,
      examples: prev.examples.filter(
        (_, exampleIndex) => exampleIndex !== index,
      ),
    }));
  }

  function normalizeLimitsInForm() {
    const normalized = normalizeProblemLimitForm(form);
    if (normalized.messages.length) {
      setForm(normalized.form);
      setFormNotice(normalized.messages.join(' '));
    } else {
      setFormNotice('');
    }
    return normalized;
  }

  function submitProblem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (
      editorMode === 'idle' ||
      saveProblemMutation.isPending ||
      deleteProblemMutation.isPending
    )
      return;
    setSavedMessage('');
    if (editorMode === 'edit' && !form.problemId) {
      setFormError('수정할 문제를 먼저 가져와 주세요.');
      return;
    }
    const normalized = normalizeLimitsInForm();
    const validationMessage = validateProblemForm(normalized.form);
    if (validationMessage) {
      setFormError(validationMessage);
      return;
    }
    setFormError('');
    saveProblemMutation.mutate(normalized.form);
  }

  async function handleDeleteProblem() {
    if (!selectedProblem || deleteProblemMutation.isPending) return;

    const confirmed = await confirmAction(
      `${selectedProblem.problem_code}. ${selectedProblem.title} 문제를 삭제할까요?\n\n진행 중이거나 결과 반영을 기다리는 재채점 작업은 먼저 취소합니다. 채점 파일, 테스트케이스, 제출 기록과 재채점 기록도 함께 삭제됩니다.`,
    );
    if (!confirmed) return;

    deleteProblemMutation.mutate(selectedProblem);
  }

  function handleMatchedFiles(files: File[]) {
    if (
      !effectiveSelectedProblemId ||
      uploadMatchedTestcasesMutation.isPending
    ) {
      return;
    }

    const testcaseFiles = files.filter((file) =>
      /\.(in|out)$/i.test(file.name),
    );
    if (!testcaseFiles.length) {
      setUploadProgress('.in 또는 .out 파일을 선택해 주세요.');
      return;
    }
    setUploadProgressValue(0);
    setUploadProgress('업로드 준비 중');
    uploadMatchedTestcasesMutation.mutate(testcaseFiles);
  }

  const problemWritePending =
    saveProblemMutation.isPending ||
    deleteProblemMutation.isPending ||
    copyProblemMutation.isPending ||
    uploadAssetMutation.isPending ||
    uploadEditorialAssetMutation.isPending ||
    uploadRoleFileMutation.isPending ||
    uploadMatchedTestcasesMutation.isPending ||
    deleteAssetMutation.isPending ||
    deleteTestcaseSetMutation.isPending ||
    deleteTestcaseMutation.isPending;

  return (
    <PageLayout
      navigation={<OperatorTabs contestId={contestId} />}
      actions={<RecentChangeNotice contestId={contestId} token={token} />}
      variant="management"
      description="문제 본문, 예제, 채점 파일, 테스트케이스를 관리합니다."
      eyebrow="Operator"
      title="문제 관리"
      width="full"
    >
      {confirmationDialog}

      {dashboardQuery.error || problemsQuery.error ? (
        <ErrorBox
          error={dashboardQuery.error || problemsQuery.error}
          fallback="문제 데이터를 불러오지 못했습니다"
        />
      ) : null}

      <ProblemArchivePanel
        contestId={contestId}
        token={token}
        divisions={divisions}
        problems={problems}
        activeDivisionId={activeDivisionId}
        disabled={problemWritePending}
        onCreate={startCreateMode}
        onImported={(problem) => {
          void queryClient.invalidateQueries({
            queryKey: ['operator', 'problems', contestId],
          });
          void queryClient.invalidateQueries({
            queryKey: ['operator', 'dashboard', contestId],
          });
          if (editorMode === 'idle')
            setFilterDivisionId(problem.division_id ?? activeDivisionId);
        }}
      />

      <div className="operator-problem-layout">
        <aside className="operator-problem-index">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold text-indigo-600 uppercase">
                문제 목록
              </p>
              <h2 className="text-base font-semibold text-slate-950">
                {filteredProblems.length}개
              </h2>
            </div>
            <div className="flex shrink-0 gap-2">
              <button
                aria-expanded={isCopyPanelOpen}
                className={[
                  'rounded-lg border px-3 py-2 text-xs font-semibold transition',
                  isCopyPanelOpen
                    ? 'border-indigo-300 bg-indigo-600 text-white'
                    : 'border-slate-200 text-slate-700 hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-700',
                ].join(' ')}
                onClick={() => setIsCopyPanelOpen((current) => !current)}
                type="button"
              >
                문제 복사
              </button>
            </div>
          </div>
          <label className="grid gap-2 text-xs font-medium text-slate-600">
            문제 검색
            <input
              className="h-10 min-w-0 rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
              type="search"
              placeholder="문제 번호 또는 제목"
              value={problemSearch}
              onChange={(event) => setProblemSearch(event.target.value)}
            />
          </label>
          <div className="flex shrink-0 gap-1 overflow-x-auto rounded-full bg-slate-100 p-1">
            {divisions.map((division) => (
              <button
                className={[
                  'h-8 shrink-0 rounded-full px-4 text-xs font-semibold transition',
                  activeDivisionId === division.division_id
                    ? 'bg-white text-indigo-700 shadow-sm'
                    : 'text-slate-500 hover:text-slate-900',
                ].join(' ')}
                key={division.division_id}
                onClick={() => {
                  if (division.division_id === activeDivisionId) return;
                  if (!cancelEditor()) return;
                  setFilterDivisionId(division.division_id);
                  setProblemSearch('');
                  setCopySourceProblemId('');
                }}
                type="button"
              >
                {division.name}
              </button>
            ))}
          </div>
          {isCopyPanelOpen ? (
            <div className="grid gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
              <div>
                <p className="text-xs font-semibold text-slate-700">
                  다른 유형 문제 가져오기
                </p>
                <p className="mt-1 text-[11px] font-medium text-slate-500">
                  채점 파일과 테스트케이스까지 현재 유형으로 복사합니다.
                </p>
              </div>
              <Select
                className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100"
                disabled={
                  !copyableProblems.length || copyProblemMutation.isPending
                }
                onChange={(event) => setCopySourceProblemId(event.target.value)}
                value={copySourceProblemId}
              >
                <option value="">
                  {copyableProblems.length
                    ? '복사할 문제 선택'
                    : '다른 유형 문제가 없습니다'}
                </option>
                {copyableProblems.map((problem) => {
                  const divisionName =
                    divisions.find(
                      (division) =>
                        division.division_id === problem.division_id,
                    )?.name ?? '다른 유형';

                  return (
                    <option key={problem.problem_id} value={problem.problem_id}>
                      [{divisionName}] {problem.problem_code}. {problem.title}
                    </option>
                  );
                })}
              </Select>
              <button
                className="h-10 rounded-lg bg-indigo-600 px-3 text-xs font-semibold text-white disabled:bg-slate-300"
                disabled={
                  !copySourceProblemId ||
                  !activeDivisionId ||
                  copyProblemMutation.isPending ||
                  saveProblemMutation.isPending ||
                  deleteProblemMutation.isPending
                }
                onClick={() => {
                  if (canLeaveEditor()) {
                    clearEditorFeedback();
                    copyProblemMutation.mutate();
                  }
                }}
                type="button"
              >
                {copyProblemMutation.isPending
                  ? '가져오는 중'
                  : '현재 유형으로 가져오기'}
              </button>
              {copyProblemMutation.error ? (
                <ErrorBox
                  error={copyProblemMutation.error}
                  fallback="문제 복사에 실패했습니다"
                />
              ) : null}
            </div>
          ) : null}
          <div className="grid max-h-64 min-h-0 gap-2 overflow-y-auto pr-1 xl:max-h-none xl:flex-1">
            {filteredProblems.map((problem) => (
              <button
                className={[
                  'grid gap-1 rounded-lg border px-3 py-3 text-left transition',
                  selectedProblemId === problem.problem_id
                    ? 'border-indigo-300 bg-indigo-50'
                    : 'border-slate-200 hover:border-indigo-200 hover:bg-indigo-50',
                ].join(' ')}
                key={problem.problem_id}
                aria-pressed={selectedProblemId === problem.problem_id}
                onClick={() => editProblem(problem)}
                type="button"
              >
                <span className="font-semibold text-slate-950">
                  {problem.problem_code}. {problem.title}
                </span>
                <span className="text-xs font-medium text-slate-500">
                  {problemTimeLimitLabel(problem)} ·{' '}
                  {problemMemoryLimitLabel(problem)}
                </span>
              </button>
            ))}
            {!filteredProblems.length ? (
              <p className="rounded-lg border border-dashed border-slate-200 px-3 py-8 text-center text-sm font-medium text-slate-500">
                {problemsQuery.isLoading
                  ? '문제를 불러오는 중입니다.'
                  : problemSearch.trim()
                    ? '검색 결과가 없습니다. 검색어를 바꿔보세요.'
                    : '이 유형에 등록된 문제가 없습니다. 위의 문제 추가하기에서 추가하세요.'}
              </p>
            ) : null}
          </div>
        </aside>
        <div
          className="grid scroll-mt-6 content-start gap-6 outline-none"
          ref={editorRef}
          tabIndex={-1}
        >
          {savedMessage ? (
            <p
              role="status"
              className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800"
            >
              {savedMessage}
            </p>
          ) : null}
          <OperatorPanel
            description={
              editorMode === 'edit'
                ? '왼쪽 목록에서 선택한 문제를 수정합니다.'
                : editorMode === 'create'
                  ? '기본 정보와 본문을 작성해 저장한 뒤, 테스트케이스와 채점 파일을 추가하세요.'
                  : '새 문제를 만들거나 목록에서 수정할 문제를 선택하세요.'
            }
            title={
              editorMode === 'edit'
                ? `${selectedProblem?.problem_code ?? ''}. ${selectedProblem?.title ?? '문제'} 수정`
                : editorMode === 'create'
                  ? '새 문제 작성'
                  : '문제 편집'
            }
          >
            {editorMode === 'idle' ? (
              <div className="grid justify-items-center gap-4 rounded-lg border border-dashed border-slate-300 bg-slate-50 px-6 py-16 text-center">
                <ProblemIcon />
                <h3 className="text-lg font-semibold text-slate-800">
                  {!activeDivisionId && !dashboardQuery.isLoading
                    ? '참가 유형을 먼저 추가하세요'
                    : '수정할 문제를 선택하세요'}
                </h3>
                <p className="max-w-md text-sm leading-6 text-slate-500">
                  {!activeDivisionId && !dashboardQuery.isLoading
                    ? '문제를 추가하려면 참가팀 탭의 참가 유형 관리에서 유형을 먼저 추가해 주세요.'
                    : '기존 문제는 목록에서 선택하고, 새 문제는 위의 문제 추가하기에서 추가하세요.'}
                </p>
                {!activeDivisionId && !dashboardQuery.isLoading ? (
                  <Link
                    className="rounded-lg bg-indigo-600 px-5 py-3 text-sm font-semibold text-white"
                    to={`/operator/contests/${contestId}/participants`}
                  >
                    참가팀에서 참가 유형 추가
                  </Link>
                ) : dashboardQuery.isLoading ? (
                  <p className="text-sm text-slate-500">
                    대회 정보를 불러오는 중입니다.
                  </p>
                ) : null}
              </div>
            ) : (
              <>
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-indigo-100 bg-indigo-50 px-4 py-3">
                  <p className="text-xs leading-5 text-indigo-800">
                    {editorMode === 'create'
                      ? '새로 작성 중 · 저장하면 문제 목록에 추가됩니다.'
                      : '수정 중 · 기본 정보, 본문, 해설은 저장해야 반영됩니다. 파일·테스트 변경은 개별 저장됩니다.'}
                  </p>
                  <button
                    className="shrink-0 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 disabled:opacity-50"
                    disabled={
                      saveProblemMutation.isPending ||
                      deleteProblemMutation.isPending ||
                      copyProblemMutation.isPending
                    }
                    onClick={cancelEditor}
                    type="button"
                  >
                    {editorMode === 'create' ? '작성 취소' : '편집 닫기'}
                  </button>
                </div>
                {selectedProblem ? (
                  <PackageUpdateHistory
                    key={selectedProblem.problem_id + selectedProblem.title}
                    contestId={contestId}
                    problemId={selectedProblem.problem_id}
                    token={token}
                  />
                ) : null}
                {editorMode === 'edit' && !form.problemId ? (
                  <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">
                    수정할 문제를 목록에서 가져와 주세요.
                  </p>
                ) : null}
                <div className="grid items-start gap-2 md:grid-cols-3 xl:grid-cols-5">
                  {[
                    ['settings', '기본 정보'],
                    ['statement', '문제/예제'],
                    ['editorial', '해설'],
                    ['tests', '테스트케이스'],
                    ['preview', '전체 미리보기'],
                  ].map(([value, label]) => (
                    <button
                      className={[
                        'h-11 rounded-lg border px-4 text-sm font-semibold transition',
                        authoringTab === value
                          ? 'border-indigo-300 bg-indigo-600 text-white'
                          : 'border-slate-200 bg-white text-slate-600 hover:border-indigo-200 hover:bg-indigo-50',
                      ].join(' ')}
                      key={value}
                      onClick={() => {
                        if (value === 'preview') {
                          setIsPreviewOpen(true);
                          return;
                        }
                        setAuthoringTab(value as typeof authoringTab);
                      }}
                      type="button"
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <form className="grid gap-3" onSubmit={submitProblem}>
                  <fieldset
                    className="grid min-w-0 gap-3 disabled:opacity-60"
                    disabled={
                      saveProblemMutation.isPending ||
                      deleteProblemMutation.isPending ||
                      copyProblemMutation.isPending
                    }
                  >
                    {authoringTab === 'settings' ? (
                      <>
                        <label className="grid gap-2 text-sm font-semibold text-slate-700">
                          유형
                          <Select
                            className="h-11 rounded-lg border border-slate-200 px-3 text-sm font-medium text-slate-950 transition outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100"
                            onChange={(event) =>
                              setForm((prev) => ({
                                ...prev,
                                displayOrder:
                                  editorMode === 'create' && event.target.value
                                    ? String(
                                        nextProblemDisplayOrder(
                                          problems,
                                          event.target.value,
                                        ),
                                      )
                                    : prev.displayOrder,
                                divisionId: event.target.value,
                              }))
                            }
                            value={form.divisionId}
                          >
                            <option value="">유형 선택</option>
                            {divisions.map((division) => (
                              <option
                                key={division.division_id}
                                value={division.division_id}
                              >
                                {division.name}
                              </option>
                            ))}
                          </Select>
                        </label>
                        <div className="grid gap-3 md:grid-cols-2">
                          <TextInput
                            label="문제 번호"
                            onChange={(value) =>
                              setForm((prev) => ({
                                ...prev,
                                problemCode: value,
                              }))
                            }
                            value={form.problemCode}
                          />
                          <TextInput
                            label="제목"
                            onChange={(value) =>
                              setForm((prev) => ({ ...prev, title: value }))
                            }
                            value={form.title}
                          />
                        </div>
                        <div className="grid gap-3 md:grid-cols-2">
                          <TextInput
                            label="시간(ms)"
                            onBlur={normalizeLimitsInForm}
                            onChange={(value) => {
                              setFormNotice('');
                              setForm((prev) => ({
                                ...prev,
                                timeLimitMs: value,
                              }));
                            }}
                            helperText={`설정 가능 범위: ${LIMIT_BOUNDARIES.timeMs.min.toLocaleString('ko-KR')}~${LIMIT_BOUNDARIES.timeMs.max.toLocaleString('ko-KR')}ms`}
                            inputMode="numeric"
                            value={form.timeLimitMs}
                          />
                          <TextInput
                            label="메모리(MB)"
                            onBlur={normalizeLimitsInForm}
                            onChange={(value) => {
                              setFormNotice('');
                              setForm((prev) => ({
                                ...prev,
                                memoryLimitMb: value,
                              }));
                            }}
                            helperText={`설정 가능 범위: ${LIMIT_BOUNDARIES.memoryMb.min.toLocaleString('ko-KR')}~${LIMIT_BOUNDARIES.memoryMb.max.toLocaleString('ko-KR')}MB`}
                            inputMode="numeric"
                            value={form.memoryLimitMb}
                          />
                        </div>
                        <fieldset className="rounded-lg border border-slate-200 p-4">
                          <legend className="px-1 text-sm font-semibold text-slate-900">
                            제출 가능한 언어
                          </legend>
                          <p className="mb-3 text-xs text-slate-500">
                            이 문제에 제출할 수 있는 언어를 선택하세요. 기존
                            제출과 재채점에는 영향을 주지 않습니다.
                          </p>
                          <div className="flex flex-wrap gap-x-5 gap-y-3">
                            {judgeLanguages.map((language) => (
                              <label
                                key={language}
                                className="flex items-center gap-2 text-sm text-slate-700"
                              >
                                <input
                                  type="checkbox"
                                  className="accent-[#6d5dfc]"
                                  checked={form.allowedLanguages.includes(
                                    language,
                                  )}
                                  disabled={
                                    form.allowedLanguages.length === 1 &&
                                    form.allowedLanguages.includes(language)
                                  }
                                  onChange={(event) =>
                                    setForm((previous) => ({
                                      ...previous,
                                      allowedLanguages: event.target.checked
                                        ? [
                                            ...previous.allowedLanguages,
                                            language,
                                          ]
                                        : previous.allowedLanguages.filter(
                                            (value) => value !== language,
                                          ),
                                    }))
                                  }
                                />
                                {LANGUAGE_LABELS[language]}
                              </label>
                            ))}
                          </div>
                        </fieldset>
                        <LanguageResourceLimitsEditor
                          rows={judgeLanguages.map((language) => ({
                            language,
                            label: LANGUAGE_LABELS[language],
                            corrected: Boolean(
                              AUTOMATIC_LANGUAGE_ADJUSTMENTS[language],
                            ),
                            hint: automaticLanguageLimitText(form, language),
                          }))}
                          values={form.languageResourceLimits}
                          baseTime={form.timeLimitMs}
                          baseMemory={form.memoryLimitMb}
                          onNormalize={normalizeLimitsInForm}
                          onChange={(language, value) => {
                            setFormNotice('');
                            setForm((prev) => ({
                              ...prev,
                              languageResourceLimits: {
                                ...prev.languageResourceLimits,
                                [language]: value,
                              },
                            }));
                          }}
                        />
                        <label className="grid gap-2 text-sm font-semibold text-slate-700">
                          정렬 순서
                          <Select
                            className="h-11 rounded-lg border border-slate-200 px-3 text-sm font-medium text-slate-950 transition outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100"
                            disabled={!form.divisionId}
                            onChange={(event) =>
                              setForm((prev) => ({
                                ...prev,
                                displayOrder: event.target.value,
                              }))
                            }
                            value={form.displayOrder}
                          >
                            {!form.divisionId ? (
                              <option value="">
                                유형을 먼저 선택해 주세요
                              </option>
                            ) : null}
                            {displayOrderOptions.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </Select>
                          <span className="text-xs font-medium text-slate-500">
                            문제 생성 시 선택한 유형의 마지막 순서가 자동으로
                            채워집니다.
                          </span>
                        </label>
                      </>
                    ) : null}
                    {authoringTab === 'statement' ? (
                      <>
                        <ProblemLanguageEditor
                          key={form.problemId || 'new'}
                          problem={{
                            problem_id: form.problemId,
                            problem_code: form.problemCode,
                            title: form.title,
                            statement: problemStatementFromForm(form),
                            editorial: form.editorial,
                            time_limit_ms: Number(form.timeLimitMs),
                            memory_limit_mb: Number(form.memoryLimitMb),
                            default_statement_language:
                              form.defaultStatementLanguage,
                            statement_translations: form.statementTranslations,
                            editorial_translations: form.editorialTranslations,
                          }}
                          onChange={(next) => {
                            const document = parseProblemDocument(
                              next.statement,
                            );
                            setForm((prev) => ({
                              ...prev,
                              title: next.title,
                              statement: document.statement,
                              inputDescription: document.inputDescription,
                              outputDescription: document.outputDescription,
                              note: document.note,
                              examples: document.examples,
                              editorial: next.editorial || '',
                              defaultStatementLanguage:
                                next.default_statement_language || 'ko',
                              statementTranslations:
                                next.statement_translations || {},
                              editorialTranslations:
                                next.editorial_translations || {},
                            }));
                          }}
                        />
                        <label className="grid gap-2 text-sm font-semibold text-slate-700">
                          문제 본문
                          <BoundedTextarea
                            className="min-h-72 resize-y rounded-lg border border-slate-200 px-3 py-3 font-mono text-xs leading-5 text-slate-950 transition outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100"
                            onChange={(event) =>
                              setForm((prev) => ({
                                ...prev,
                                statement: event.target.value,
                              }))
                            }
                            value={form.statement}
                          />
                        </label>
                        <div className="grid gap-3 md:grid-cols-2">
                          <label className="grid gap-2 text-sm font-semibold text-slate-700">
                            입력 설명
                            <BoundedTextarea
                              className="min-h-28 resize-y rounded-lg border border-slate-200 px-3 py-3 text-sm leading-6 text-slate-950 transition outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100"
                              onChange={(event) =>
                                setForm((prev) => ({
                                  ...prev,
                                  inputDescription: event.target.value,
                                }))
                              }
                              value={form.inputDescription}
                            />
                          </label>
                          <label className="grid gap-2 text-sm font-semibold text-slate-700">
                            출력 설명
                            <BoundedTextarea
                              className="min-h-28 resize-y rounded-lg border border-slate-200 px-3 py-3 text-sm leading-6 text-slate-950 transition outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100"
                              onChange={(event) =>
                                setForm((prev) => ({
                                  ...prev,
                                  outputDescription: event.target.value,
                                }))
                              }
                              value={form.outputDescription}
                            />
                          </label>
                        </div>
                        <label className="grid gap-2 text-sm font-semibold text-slate-700">
                          노트
                          <BoundedTextarea
                            className="min-h-24 resize-y rounded-lg border border-slate-200 px-3 py-3 text-sm leading-6 text-slate-950 transition outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100"
                            onChange={(event) =>
                              setForm((prev) => ({
                                ...prev,
                                note: event.target.value,
                              }))
                            }
                            value={form.note}
                          />
                        </label>
                        <div className="grid gap-3 rounded-lg border border-slate-200 p-4">
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <div>
                              <p className="text-sm font-semibold text-slate-800">
                                예제
                              </p>
                              <p className="text-xs font-medium text-slate-500">
                                예제 입력, 출력, 설명을 여러 개 관리합니다.
                              </p>
                            </div>
                            <button
                              className="rounded-lg border border-indigo-200 px-3 py-2 text-xs font-semibold text-indigo-700"
                              onClick={addExample}
                              type="button"
                            >
                              예제 추가
                            </button>
                          </div>
                          {form.examples.map((example, index) => (
                            <section
                              className="grid gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3"
                              key={index}
                            >
                              <div className="flex items-center justify-between gap-3">
                                <strong className="text-sm font-semibold text-slate-950">
                                  예제 {index + 1}
                                </strong>
                                <button
                                  className="rounded-lg border border-rose-200 px-3 py-2 text-xs font-semibold text-rose-600"
                                  onClick={() => removeExample(index)}
                                  type="button"
                                >
                                  삭제
                                </button>
                              </div>
                              <div className="grid gap-3 md:grid-cols-2">
                                <label className="grid gap-2 text-sm font-semibold text-slate-700">
                                  예제 입력
                                  <BoundedTextarea
                                    className="min-h-28 resize-y rounded-lg border border-slate-200 px-3 py-3 font-mono text-xs leading-5 text-slate-950 transition outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100"
                                    onChange={(event) =>
                                      updateExample(index, {
                                        input: event.target.value,
                                      })
                                    }
                                    value={example.input}
                                  />
                                </label>
                                <label className="grid gap-2 text-sm font-semibold text-slate-700">
                                  예제 출력
                                  <BoundedTextarea
                                    className="min-h-28 resize-y rounded-lg border border-slate-200 px-3 py-3 font-mono text-xs leading-5 text-slate-950 transition outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100"
                                    onChange={(event) =>
                                      updateExample(index, {
                                        output: event.target.value,
                                      })
                                    }
                                    value={example.output}
                                  />
                                </label>
                              </div>
                              <label className="grid gap-2 text-sm font-semibold text-slate-700">
                                예제 설명
                                <BoundedTextarea
                                  className="min-h-20 resize-y rounded-lg border border-slate-200 px-3 py-3 text-sm leading-6 text-slate-950 transition outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100"
                                  onChange={(event) =>
                                    updateExample(index, {
                                      note: event.target.value,
                                    })
                                  }
                                  value={example.note ?? ''}
                                />
                              </label>
                            </section>
                          ))}
                          {!form.examples.length ? (
                            <p className="rounded-lg border border-dashed border-slate-200 px-4 py-8 text-center text-sm font-medium text-slate-500">
                              등록된 예제가 없습니다.
                            </p>
                          ) : null}
                        </div>
                        <div className="grid gap-3 rounded-lg border border-indigo-100 bg-indigo-50/60 p-4">
                          <div className="grid gap-1">
                            <p className="text-sm font-semibold text-indigo-800">
                              문제/예제 이미지
                            </p>
                            <p className="text-xs font-medium text-slate-600">
                              본문이나 예제 설명에 사용할 이미지를 업로드합니다.
                            </p>
                          </div>
                          <label className="inline-flex h-10 w-fit cursor-pointer items-center rounded-lg bg-indigo-600 px-4 text-xs font-semibold text-white transition hover:bg-indigo-800">
                            이미지 선택
                            <input
                              accept="image/png,image/jpeg,image/webp"
                              className="sr-only"
                              disabled={
                                !effectiveSelectedProblemId ||
                                uploadAssetMutation.isPending
                              }
                              onChange={(event) => {
                                const file = event.currentTarget.files?.[0];
                                if (file) uploadAssetMutation.mutate(file);
                                event.currentTarget.value = '';
                              }}
                              type="file"
                            />
                          </label>
                          <div className="grid gap-2">
                            {imageAssets.map((asset) => (
                              <p
                                className="rounded-lg border border-indigo-100 bg-white px-3 py-2 text-xs font-medium text-slate-600"
                                key={asset.asset_id}
                              >
                                {asset.original_filename}
                              </p>
                            ))}
                            {effectiveSelectedProblemId &&
                            !assetsQuery.isLoading &&
                            !imageAssets.length ? (
                              <p className="rounded-lg border border-dashed border-indigo-100 bg-white/60 px-3 py-5 text-center text-xs font-medium text-slate-500">
                                업로드된 이미지가 없습니다.
                              </p>
                            ) : null}
                          </div>
                          {uploadAssetMutation.error ? (
                            <ErrorBox
                              error={uploadAssetMutation.error}
                              fallback="이미지 업로드에 실패했습니다"
                            />
                          ) : null}
                        </div>
                      </>
                    ) : null}
                    {authoringTab === 'editorial' ? (
                      <>
                        <label className="grid gap-2 text-sm font-semibold text-slate-700">
                          해설 본문
                          <BoundedTextarea
                            className="min-h-72 resize-y rounded-lg border border-slate-200 px-3 py-3 font-mono text-xs leading-5 text-slate-950 transition outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100"
                            onChange={(event) =>
                              setForm((prev) => ({
                                ...prev,
                                editorial: event.target.value,
                              }))
                            }
                            value={form.editorial}
                          />
                          <span className="text-xs font-medium text-slate-500">
                            문제 본문과 동일한 Markdown, LaTeX, 이미지 문법을
                            사용할 수 있습니다.
                          </span>
                        </label>
                        <div className="grid gap-3 rounded-lg border border-indigo-100 bg-indigo-50/60 p-4">
                          <div className="grid gap-1">
                            <p className="text-sm font-semibold text-indigo-800">
                              해설 PDF / 이미지
                            </p>
                            <p className="text-xs font-medium text-slate-600">
                              해설집 PDF나 본문에 넣을 이미지를 업로드합니다.
                              본문에는 아래 asset 문법을 붙여 넣어 사용할 수
                              있습니다.
                            </p>
                          </div>
                          <label className="inline-flex h-10 w-fit cursor-pointer items-center rounded-lg bg-indigo-600 px-4 text-xs font-semibold text-white transition hover:bg-indigo-800">
                            파일 선택
                            <input
                              accept="application/pdf,image/png,image/jpeg,image/webp"
                              className="sr-only"
                              disabled={
                                !effectiveSelectedProblemId ||
                                uploadEditorialAssetMutation.isPending
                              }
                              onChange={(event) => {
                                const file = event.currentTarget.files?.[0];
                                if (file)
                                  uploadEditorialAssetMutation.mutate(file);
                                event.currentTarget.value = '';
                              }}
                              type="file"
                            />
                          </label>
                          <div className="grid gap-2">
                            {editorialAssets.map((asset) => {
                              const isImage =
                                asset.mime_type.startsWith('image/');
                              const snippet = isImage
                                ? `![${asset.original_filename}](asset://${asset.asset_id})`
                                : `[${asset.original_filename}](asset://${asset.asset_id})`;
                              return (
                                <div
                                  className="grid gap-2 rounded-lg border border-indigo-100 bg-white px-3 py-3 text-xs font-medium text-slate-600"
                                  key={asset.asset_id}
                                >
                                  <div className="flex flex-wrap items-center justify-between gap-2">
                                    <span>{asset.original_filename}</span>
                                    <button
                                      className="rounded-lg border border-rose-200 px-2 py-1 text-[11px] font-semibold text-rose-600"
                                      disabled={deleteAssetMutation.isPending}
                                      onClick={() =>
                                        deleteAssetMutation.mutate(asset)
                                      }
                                      type="button"
                                    >
                                      삭제
                                    </button>
                                  </div>
                                  <code className="zoj-break-anywhere rounded-lg bg-slate-100 px-2 py-1 font-mono text-[11px] text-slate-700">
                                    {snippet}
                                  </code>
                                </div>
                              );
                            })}
                            {effectiveSelectedProblemId &&
                            !assetsQuery.isLoading &&
                            !editorialAssets.length ? (
                              <p className="rounded-lg border border-dashed border-indigo-100 bg-white/60 px-3 py-5 text-center text-xs font-medium text-slate-500">
                                업로드된 해설 파일이 없습니다.
                              </p>
                            ) : null}
                          </div>
                          {uploadEditorialAssetMutation.error ? (
                            <ErrorBox
                              error={uploadEditorialAssetMutation.error}
                              fallback="해설 파일 업로드에 실패했습니다"
                            />
                          ) : null}
                        </div>
                        <div className="overflow-hidden rounded-lg border border-slate-200">
                          <ProblemEditorialPanel
                            assets={assetsQuery.data ?? []}
                            problem={previewProblem}
                          />
                        </div>
                      </>
                    ) : null}
                    {authoringTab === 'tests' ? (
                      <p className="rounded-lg border border-indigo-100 bg-indigo-50 px-4 py-3 text-sm font-medium text-indigo-700">
                        아래 영역에서 채점 보조 파일과 .in/.out 테스트케이스를
                        관리합니다.
                      </p>
                    ) : null}
                    {formError ||
                    saveProblemMutation.error ||
                    deleteProblemMutation.error ? (
                      <ErrorBox
                        error={
                          saveProblemMutation.error ||
                          deleteProblemMutation.error
                        }
                        fallback={
                          formError ||
                          (deleteProblemMutation.error
                            ? '문제 삭제에 실패했습니다'
                            : '문제 저장에 실패했습니다')
                        }
                      />
                    ) : null}
                    {formNotice ? (
                      <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">
                        {formNotice}
                      </p>
                    ) : null}
                    {authoringTab !== 'tests' ? (
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-indigo-600 px-5 text-sm font-semibold text-white disabled:bg-slate-300"
                          disabled={
                            (editorMode === 'edit' && !form.problemId) ||
                            saveProblemMutation.isPending ||
                            deleteProblemMutation.isPending
                          }
                          type="submit"
                        >
                          <ProblemIcon />
                          {saveProblemMutation.isPending
                            ? '저장 중…'
                            : editorMode === 'edit'
                              ? '변경사항 저장'
                              : '새 문제 저장'}
                        </button>
                        {editorMode === 'edit' && selectedProblem ? (
                          <>
                            <button
                              className="inline-flex h-11 items-center justify-center rounded-lg border border-slate-200 bg-white px-5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
                              disabled={
                                exportProblemMutation.isPending ||
                                problemWritePending ||
                                hasUnsavedProblem
                              }
                              onClick={() =>
                                exportProblemMutation.mutate(selectedProblem)
                              }
                              type="button"
                            >
                              {exportProblemMutation.isPending
                                ? 'ZIP 만드는 중…'
                                : '문제 ZIP 내보내기'}
                            </button>
                            <button
                              className="inline-flex h-11 items-center justify-center rounded-lg border border-rose-200 bg-white px-5 text-sm font-semibold text-rose-700 transition hover:bg-rose-50 disabled:border-slate-200 disabled:text-slate-300"
                              disabled={
                                deleteProblemMutation.isPending ||
                                saveProblemMutation.isPending
                              }
                              onClick={handleDeleteProblem}
                              type="button"
                            >
                              {deleteProblemMutation.isPending
                                ? '삭제 중'
                                : '문제 삭제'}
                            </button>
                          </>
                        ) : null}
                      </div>
                    ) : null}
                    {authoringTab !== 'tests' && selectedProblem ? (
                      <>
                        {hasUnsavedProblem ? (
                          <p className="text-xs text-slate-500">
                            편집한 내용을 저장한 뒤 ZIP으로 내보낼 수 있습니다.
                          </p>
                        ) : null}
                        {exportProblemMutation.error ? (
                          <ErrorBox
                            error={exportProblemMutation.error}
                            fallback="문제를 내보내지 못했습니다"
                          />
                        ) : null}
                        {exportProblemMutation.isPending ? (
                          <p role="status" className="text-xs text-indigo-700">
                            첨부 파일과 테스트케이스를 모으고 있습니다.
                          </p>
                        ) : exportProblemMutation.isSuccess ? (
                          <p role="status" className="text-xs text-emerald-700">
                            문제 ZIP 다운로드를 시작했습니다.
                          </p>
                        ) : null}
                      </>
                    ) : null}
                  </fieldset>
                </form>
              </>
            )}
          </OperatorPanel>

          {authoringTab === 'tests' ? (
            <OperatorPanel
              description={
                selectedProblem
                  ? `${selectedProblem.problem_code}. ${selectedProblem.title} 채점 파일입니다.`
                  : '문제를 생성하거나 왼쪽 목록에서 선택하면 채점 파일을 관리할 수 있습니다.'
              }
              title="채점 파일과 테스트케이스"
            >
              {!effectiveSelectedProblemId ? (
                <p className="rounded-lg border border-dashed border-slate-200 px-4 py-8 text-center text-sm font-medium text-slate-500">
                  채점 파일을 확인할 문제를 먼저 선택해 주세요.
                </p>
              ) : (
                <>
                  {packageStatusQuery.isLoading ? (
                    <p className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-600">
                      채점 파일 상태를 불러오는 중입니다.
                    </p>
                  ) : null}
                  <div className="grid gap-3">
                    {packageStatusQuery.data ? (
                      <p
                        className={[
                          'rounded-lg border px-4 py-3 text-sm font-semibold',
                          packageStatusQuery.data.ready
                            ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                            : 'border-amber-200 bg-amber-50 text-amber-700',
                        ].join(' ')}
                      >
                        {packageStatusQuery.data.ready
                          ? '채점 준비 완료'
                          : '채점 파일 확인 필요'}
                      </p>
                    ) : null}
                    {packageStatusQuery.data?.warnings.length ? (
                      <ul className="grid gap-1 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-medium text-amber-800">
                        {packageStatusQuery.data.warnings.map((warning) => (
                          <li key={warning}>{warning}</li>
                        ))}
                      </ul>
                    ) : null}
                    <div className="grid gap-2">
                      {supportFileRows.map((file) => {
                        const asset = supportAssetByRole.get(file.role);

                        return (
                          <div
                            className="grid gap-3 rounded-lg border border-slate-200 bg-white px-3 py-3 text-xs font-semibold text-slate-600 sm:grid-cols-[minmax(0,1fr)_auto]"
                            key={file.role}
                          >
                            <span className="grid min-w-0 gap-1">
                              <span>
                                {file.label}
                                {file.required ? ' *' : ''}
                              </span>
                              {file.detail ? (
                                <span className="text-[11px] font-medium text-slate-400">
                                  {file.detail}
                                </span>
                              ) : null}
                              <button
                                className={[
                                  'w-fit max-w-full truncate text-left font-semibold',
                                  asset
                                    ? 'text-indigo-700 hover:text-indigo-950'
                                    : file.status === 'ready'
                                      ? 'text-emerald-700'
                                      : 'text-amber-700',
                                ].join(' ')}
                                disabled={!asset}
                                onClick={() =>
                                  asset
                                    ? setSupportFilePreview({
                                        storageKey: asset.storage_key,
                                        title: `${file.label} · ${asset.original_filename}`,
                                      })
                                    : undefined
                                }
                                title={asset?.original_filename ?? undefined}
                                type="button"
                              >
                                {asset?.original_filename ??
                                  file.latest_filename ??
                                  '파일 없음'}
                              </button>
                            </span>
                            <div className="flex flex-wrap gap-2">
                              <button
                                className="h-9 rounded-lg border border-indigo-200 px-3 text-xs font-semibold text-indigo-700 transition hover:bg-indigo-50 disabled:border-slate-200 disabled:text-slate-300"
                                disabled={!asset}
                                onClick={() =>
                                  asset
                                    ? setSupportFilePreview({
                                        storageKey: asset.storage_key,
                                        title: `${file.label} · ${asset.original_filename}`,
                                      })
                                    : undefined
                                }
                                type="button"
                              >
                                보기
                              </button>
                              <button
                                className="h-9 rounded-lg border border-rose-200 px-3 text-xs font-semibold text-rose-600 transition hover:bg-rose-50 disabled:border-slate-200 disabled:text-slate-300"
                                disabled={
                                  !asset || deleteAssetMutation.isPending
                                }
                                onClick={async () => {
                                  if (
                                    asset &&
                                    (await confirmAction(
                                      `${asset.original_filename} 파일을 삭제할까요?`,
                                    ))
                                  ) {
                                    deleteAssetMutation.mutate(asset);
                                  }
                                }}
                                type="button"
                              >
                                삭제
                              </button>
                              <label className="inline-flex h-9 cursor-pointer items-center justify-center rounded-lg border border-slate-200 bg-slate-950 px-3 text-xs font-semibold text-white transition hover:bg-slate-800">
                                파일 선택
                                <input
                                  className="sr-only"
                                  disabled={
                                    !effectiveSelectedProblemId ||
                                    uploadRoleFileMutation.isPending
                                  }
                                  onChange={(event) => {
                                    const fileObject =
                                      event.currentTarget.files?.[0];
                                    if (fileObject) {
                                      uploadRoleFileMutation.mutate({
                                        file: fileObject,
                                        role: file.role,
                                      });
                                    }
                                    event.currentTarget.value = '';
                                  }}
                                  type="file"
                                />
                              </label>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  <div className="grid gap-3 rounded-lg border border-indigo-100 bg-indigo-50/60 p-4">
                    <p className="text-sm font-semibold text-indigo-800">
                      테스트케이스 파일 추가
                    </p>
                    <div
                      className={[
                        'grid gap-3 rounded-lg border border-dashed px-4 py-6 text-center transition',
                        isCaseDropActive
                          ? 'border-indigo-400 bg-white'
                          : 'border-indigo-200 bg-white/70',
                      ].join(' ')}
                      onDragLeave={() => setIsCaseDropActive(false)}
                      onDragOver={(event) => {
                        event.preventDefault();
                        if (uploadMatchedTestcasesMutation.isPending) return;
                        setIsCaseDropActive(true);
                      }}
                      onDrop={(event) => {
                        event.preventDefault();
                        setIsCaseDropActive(false);
                        if (uploadMatchedTestcasesMutation.isPending) return;
                        handleMatchedFiles(
                          Array.from(event.dataTransfer.files),
                        );
                      }}
                    >
                      <p className="text-sm font-semibold text-slate-800">
                        테스트케이스 파일을 이 영역에 드롭
                      </p>
                      <p className="text-xs font-medium text-slate-500">
                        같은 이름의 입력 파일(.in)과 출력 파일(.out)을 함께
                        선택하거나 드롭해 주세요. 파일명 기준으로 짝지어 한 번에
                        반영합니다.
                      </p>
                      <label
                        className={[
                          'mx-auto inline-flex h-10 items-center rounded-lg px-4 text-xs font-semibold text-white transition',
                          uploadMatchedTestcasesMutation.isPending
                            ? 'cursor-not-allowed bg-slate-300'
                            : 'cursor-pointer bg-emerald-700 hover:bg-emerald-800',
                        ].join(' ')}
                      >
                        파일 선택
                        <input
                          accept=".in,.out,text/plain"
                          className="sr-only"
                          disabled={
                            !effectiveSelectedProblemId ||
                            uploadMatchedTestcasesMutation.isPending
                          }
                          multiple
                          onChange={(event) => {
                            handleMatchedFiles(
                              Array.from(event.currentTarget.files ?? []),
                            );
                            event.currentTarget.value = '';
                          }}
                          type="file"
                        />
                      </label>
                    </div>
                    {uploadProgress ? (
                      <p
                        aria-live="polite"
                        className="text-xs font-medium text-slate-600"
                      >
                        {uploadProgress}
                      </p>
                    ) : null}
                    {uploadRoleFileMutation.error ||
                    uploadMatchedTestcasesMutation.error ||
                    deleteTestcaseSetMutation.error ||
                    deleteTestcaseMutation.error ||
                    deleteAssetMutation.error ? (
                      <ErrorBox
                        error={
                          uploadRoleFileMutation.error ||
                          uploadMatchedTestcasesMutation.error ||
                          deleteTestcaseSetMutation.error ||
                          deleteTestcaseMutation.error ||
                          deleteAssetMutation.error
                        }
                        fallback="채점 파일 또는 테스트케이스 처리에 실패했습니다"
                      />
                    ) : null}
                  </div>
                  <div className="grid gap-2">
                    {latestTestcaseSet ? (
                      <div
                        className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 px-3 py-3 text-xs font-medium text-slate-600"
                        key={latestTestcaseSet.testcase_set_id}
                      >
                        <button
                          className="text-left font-semibold text-indigo-700 hover:text-indigo-950"
                          onClick={() => setIsTestcaseModalOpen(true)}
                          type="button"
                        >
                          현재 테스트케이스{' '}
                          {latestTestcaseSet.testcases?.length ?? 0}개 보기
                        </button>
                        <div className="flex min-w-0 flex-wrap items-center justify-end gap-2">
                          <span
                            className={[
                              'inline-flex h-7 max-w-full items-center rounded-lg border px-2 text-[11px] font-semibold',
                              judgeBundleStatusClassName(
                                packageStatusQuery.data?.judge_bundle,
                              ),
                            ].join(' ')}
                            title={judgeBundleStatusDetail(
                              packageStatusQuery.data?.judge_bundle,
                            )}
                          >
                            {judgeBundleStatusLabel(
                              packageStatusQuery.data?.judge_bundle,
                            )}
                          </span>
                          <button
                            className="h-7 rounded-lg border border-indigo-200 px-2 text-[11px] font-semibold text-indigo-700 transition hover:bg-indigo-50 disabled:border-slate-200 disabled:text-slate-300"
                            disabled={
                              !effectiveSelectedProblemId ||
                              warmJudgeBundleMutation.isPending ||
                              packageStatusQuery.data?.judge_bundle?.status ===
                                'pending' ||
                              packageStatusQuery.data?.judge_bundle?.status ===
                                'running'
                            }
                            onClick={() => warmJudgeBundleMutation.mutate()}
                            type="button"
                          >
                            {warmJudgeBundleMutation.isPending
                              ? '예약 중'
                              : '번들 재생성'}
                          </button>
                          <span className="min-w-0 truncate text-xs font-medium text-slate-400">
                            {judgeBundleStatusDetail(
                              packageStatusQuery.data?.judge_bundle,
                            )}
                          </span>
                        </div>
                      </div>
                    ) : (
                      <p className="rounded-lg border border-dashed border-slate-200 px-4 py-8 text-center text-sm font-medium text-slate-500">
                        업로드된 테스트케이스가 없습니다.
                      </p>
                    )}
                  </div>
                  <VerificationCodeSection
                    contestId={contestId}
                    token={token}
                    aiAvailable={verificationRuns.aiAvailable}
                    historyError={verificationRuns.historyError}
                    assetsByKind={verificationAssetsByKind}
                    onDelete={async (asset) => {
                      if (
                        await confirmAction(
                          `${asset.original_filename} 검증 코드를 삭제할까요?`,
                        )
                      ) {
                        deleteAssetMutation.mutate(asset);
                      }
                    }}
                    onPreview={(asset, label) =>
                      setSupportFilePreview({
                        storageKey: asset.storage_key,
                        title: `${label} · ${asset.original_filename}`,
                      })
                    }
                    onDismiss={verificationRuns.dismiss}
                    onRun={verificationRuns.rerun}
                    onUpload={verificationRuns.upload}
                    results={verificationRuns.results}
                  />
                </>
              )}
            </OperatorPanel>
          ) : null}
        </div>
      </div>

      {isTestcaseModalOpen && latestTestcaseSet ? (
        <TestcaseSetModal
          token={token}
          fileError={isTestcaseFileLoading ? null : testcaseFileQuery.error}
          filePreview={testcaseFilePreview}
          fileText={
            isTestcaseFileSettled ? testcaseFileQuery.data?.preview : undefined
          }
          isFileLoading={isTestcaseFileLoading}
          onClose={() => {
            setIsTestcaseModalOpen(false);
            setTestcaseFilePreview(null);
          }}
          onDeleteTestcase={async (testcaseId) => {
            if (!latestTestcaseSet) return;
            if (
              await confirmAction(
                '이 테스트케이스 입력/출력 세트를 삭제할까요?',
              )
            ) {
              deleteTestcaseMutation.mutate({
                testcaseId,
                testcaseSetId: latestTestcaseSet.testcase_set_id,
              });
            }
          }}
          onSelectFile={setTestcaseFilePreview}
          deletingTestcaseId={
            deleteTestcaseMutation.variables?.testcaseId ?? null
          }
          testcaseSet={latestTestcaseSet}
        />
      ) : null}
      {supportFilePreview ? (
        <FileContentModal
          token={token}
          fileError={supportFileQuery.error}
          filePreview={supportFilePreview}
          fileText={supportFileQuery.data}
          isFileLoading={supportFileQuery.isLoading}
          onClose={() => setSupportFilePreview(null)}
        />
      ) : null}
      {uploadMatchedTestcasesMutation.isPending ? (
        <UploadProgressModal
          message={uploadProgress || '테스트케이스 파일을 업로드하고 있습니다.'}
          progress={uploadProgressValue}
        />
      ) : null}

      {isPreviewOpen ? (
        <ProblemPreviewModal
          assets={assetsQuery.data ?? []}
          canSubmit={Boolean(form.problemId)}
          isSubmitting={testSubmissionMutation.isPending}
          message={
            !form.problemId
              ? '테스트 제출은 저장된 문제를 수정 모드로 가져온 뒤 사용할 수 있습니다.'
              : testSubmissionMutation.isPending && testSubmission
                ? `채점 중: ${submissionStatusLabel(testSubmission.status)}`
                : testSubmission
                  ? `결과: ${submissionStatusLabel(testSubmission.status)}`
                  : testSubmissionMutation.error
                    ? formatApiError(
                        testSubmissionMutation.error,
                        '테스트 제출에 실패했습니다',
                      )
                    : '채점 파일과 테스트케이스 등록 후 정답/오답 코드를 빠르게 검증할 수 있습니다.'
          }
          messageStatus={
            !form.problemId
              ? 'idle'
              : testSubmissionMutation.isPending
                ? 'loading'
                : testSubmissionMutation.error
                  ? 'error'
                  : testSubmission
                    ? 'ready'
                    : 'idle'
          }
          onClose={() => setIsPreviewOpen(false)}
          onLanguageChange={handleTestLanguageChange}
          onSourceCodeChange={handleTestSourceCodeChange}
          onSubmit={() => testSubmissionMutation.mutate()}
          problem={previewProblem}
          sourceCode={testSourceCode}
          testSubmission={testSubmission}
          testLanguage={testLanguage}
        />
      ) : null}
    </PageLayout>
  );
}

function TestcaseSetModal({
  deletingTestcaseId,
  token,
  fileError,
  filePreview,
  fileText,
  isFileLoading,
  onClose,
  onDeleteTestcase,
  onSelectFile,
  testcaseSet,
}: {
  deletingTestcaseId: string | null;
  token: string;
  fileError: unknown;
  filePreview: { storageKey: string; title: string } | null;
  fileText?: TextPreview;
  isFileLoading: boolean;
  onClose: () => void;
  onDeleteTestcase: (testcaseId: string) => void;
  onSelectFile: (preview: { storageKey: string; title: string } | null) => void;
  testcaseSet: TestcaseSet;
}) {
  const testcases = [...(testcaseSet.testcases ?? [])].sort(
    (a, b) => a.display_order - b.display_order,
  );
  const selectedStorageKey = filePreview?.storageKey ?? null;

  function selectTestcaseFile(storageKey: string, title: string) {
    onSelectFile(
      selectedStorageKey === storageKey ? null : { storageKey, title },
    );
  }

  return (
    <ModalDialog
      aria-label="테스트케이스"
      onClose={onClose}
      title={<>현재 테스트케이스 {testcases.length}개</>}
      eyebrow="테스트케이스"
      size="xl"
      fill
      customBody
    >
      <div className="min-h-0 overflow-hidden">
        <div className="h-full min-w-0 overflow-x-auto overflow-y-auto [scrollbar-gutter:stable]">
          <table className="w-full min-w-[38rem] border-collapse text-left text-sm">
            <thead className="sticky top-0 bg-slate-50 text-xs font-semibold text-slate-500">
              <tr>
                <th className="w-20 border-r border-b border-slate-200 px-4 py-3">
                  번호
                </th>
                <th className="w-36 border-r border-b border-slate-200 px-4 py-3">
                  입력 파일
                </th>
                <th className="w-36 border-r border-b border-slate-200 px-4 py-3">
                  출력 파일
                </th>
                <th className="border-r border-b border-slate-200 px-4 py-3">
                  내용
                </th>
                <th className="w-28 border-b border-slate-200 px-4 py-3">
                  관리
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {testcases.map((testcase) => {
                const isInputOpen =
                  selectedStorageKey === testcase.input_storage_key;
                const isOutputOpen =
                  selectedStorageKey === testcase.output_storage_key;
                const isOpen = isInputOpen || isOutputOpen;

                return (
                  <Fragment key={testcase.testcase_id}>
                    <tr className="hover:bg-indigo-50/40">
                      <td className="border-r border-slate-100 px-4 py-3 font-semibold text-slate-950">
                        {testcase.display_order}
                      </td>
                      <td
                        className="border-r border-slate-100 px-4 py-3 font-mono text-xs font-medium whitespace-nowrap text-slate-600"
                        title={storageFileName(testcase.input_storage_key)}
                      >
                        {testcaseFileLabel(
                          testcase.display_order,
                          'in',
                          testcase.input_size_bytes,
                        )}
                      </td>
                      <td
                        className="border-r border-slate-100 px-4 py-3 font-mono text-xs font-medium whitespace-nowrap text-slate-600"
                        title={storageFileName(testcase.output_storage_key)}
                      >
                        {testcaseFileLabel(
                          testcase.display_order,
                          'out',
                          testcase.output_size_bytes,
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-2">
                          <button
                            aria-expanded={isInputOpen}
                            className={[
                              'rounded-lg border px-3 py-2 text-xs font-semibold whitespace-nowrap',
                              isInputOpen
                                ? 'border-indigo-600 bg-indigo-600 text-white'
                                : 'border-indigo-200 text-indigo-700 hover:bg-indigo-50',
                            ].join(' ')}
                            onClick={() =>
                              selectTestcaseFile(
                                testcase.input_storage_key,
                                `${testcase.display_order}번 입력`,
                              )
                            }
                            type="button"
                          >
                            입력 보기
                          </button>
                          <button
                            aria-expanded={isOutputOpen}
                            className={[
                              'rounded-lg border px-3 py-2 text-xs font-semibold whitespace-nowrap',
                              isOutputOpen
                                ? 'border-indigo-600 bg-indigo-600 text-white'
                                : 'border-indigo-200 text-indigo-700 hover:bg-indigo-50',
                            ].join(' ')}
                            onClick={() =>
                              selectTestcaseFile(
                                testcase.output_storage_key,
                                `${testcase.display_order}번 출력`,
                              )
                            }
                            type="button"
                          >
                            출력 보기
                          </button>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <button
                          className="rounded-lg border border-rose-200 px-3 py-2 text-xs font-semibold whitespace-nowrap text-rose-600 hover:bg-rose-50 disabled:text-slate-300"
                          disabled={deletingTestcaseId === testcase.testcase_id}
                          onClick={() => onDeleteTestcase(testcase.testcase_id)}
                          type="button"
                        >
                          삭제
                        </button>
                      </td>
                    </tr>
                    {isOpen ? (
                      <tr className="bg-slate-50">
                        <td
                          className="border-t border-slate-100 px-4 py-4"
                          colSpan={5}
                        >
                          <div className="animate-panel-enter grid gap-3 rounded-lg border border-slate-200 bg-white p-4">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div>
                                <p className="text-sm font-semibold text-slate-950">
                                  {filePreview?.title ?? '파일 내용'}
                                </p>
                                <p className="font-mono text-xs font-medium break-all text-slate-400">
                                  {filePreview?.storageKey}
                                </p>
                              </div>
                              <button
                                className="h-8 rounded-lg border border-slate-200 px-3 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                                onClick={() => onSelectFile(null)}
                                type="button"
                              >
                                접기
                              </button>
                            </div>
                            {isFileLoading ? (
                              <p className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm font-medium text-slate-500">
                                파일 내용을 불러오는 중입니다.
                              </p>
                            ) : fileError ? (
                              <ErrorBox
                                error={fileError}
                                fallback="파일 내용을 불러오지 못했습니다"
                              />
                            ) : (
                              <StorageFileContent
                                preview={fileText}
                                storageKey={filePreview!.storageKey}
                                token={token}
                              />
                            )}
                          </div>
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })}
              {!testcases.length ? (
                <tr>
                  <td
                    className="px-4 py-10 text-center text-sm font-medium text-slate-500"
                    colSpan={5}
                  >
                    표시할 테스트케이스가 없습니다.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </ModalDialog>
  );
}

function FileContentModal({
  token,
  fileError,
  filePreview,
  fileText,
  isFileLoading,
  onClose,
}: {
  token: string;
  fileError: unknown;
  filePreview: { storageKey: string; title: string };
  fileText?: TextPreview;
  isFileLoading: boolean;
  onClose: () => void;
}) {
  return (
    <ModalDialog
      aria-label="파일 내용"
      onClose={onClose}
      title={filePreview.title}
      eyebrow="파일 내용"
      description={
        <span className="font-mono text-xs">{filePreview.storageKey}</span>
      }
      size="lg"
      fill
      customBody
    >
      <div className="min-h-0 p-5">
        {isFileLoading ? (
          <p className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm font-medium text-slate-500">
            파일 내용을 불러오는 중입니다.
          </p>
        ) : fileError ? (
          <ErrorBox
            error={fileError}
            fallback="파일 내용을 불러오지 못했습니다"
          />
        ) : (
          <StorageFileContent
            preview={fileText}
            storageKey={filePreview.storageKey}
            token={token}
          />
        )}
      </div>
    </ModalDialog>
  );
}

function UploadProgressModal({
  message,
  progress,
}: {
  message: string;
  progress: number;
}) {
  const safeProgress = Math.max(0, Math.min(100, progress));

  return (
    <ModalDialog
      title="테스트케이스 반영 중"
      description="업로드와 검증이 끝날 때까지 기다려 주세요."
    >
      <div className="grid gap-3" role="status">
        <div
          className="h-3 overflow-hidden rounded-full bg-slate-100"
          role="progressbar"
          aria-label="테스트케이스 반영 진행률"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={safeProgress}
        >
          <div
            className="h-full rounded-full bg-indigo-600 transition-all motion-reduce:transition-none"
            style={{ width: `${safeProgress}%` }}
          />
        </div>
        <div className="flex items-center justify-between gap-3 text-xs font-semibold text-slate-600">
          <span>{message}</span>
          <span>{safeProgress}%</span>
        </div>
      </div>
    </ModalDialog>
  );
}

function OperatorPreviewJudgeResult({
  submission,
}: {
  submission: Submission | null;
}) {
  if (!submission) {
    return (
      <section className="mx-7 mb-7 rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-5 text-sm font-medium text-slate-500">
        테스트 제출 후 채점 진행률과 실패 케이스 상세가 여기에 표시됩니다.
      </section>
    );
  }

  const detail = parseJudgeDetail(submission.judge_message);
  const progressText = submissionProgressText(submission);
  const progressPercent = submissionProgressPercent(submission);
  const runtime = formatRuntime(
    submission.runtime_ms ?? submission.time_ms ?? submission.execution_time_ms,
  );
  const memory = formatMemoryKb(
    submission.memory_kb ??
      submission.memory_usage_kb ??
      submission.max_memory_kb,
  );

  return (
    <section className="mx-7 mb-7 grid gap-4 rounded-lg border border-slate-200 bg-white px-4 py-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold text-indigo-600 uppercase">
            Judge result
          </p>
          <h3 className="text-lg font-semibold text-slate-950">
            {submissionStatusLabel(submission.status)}
            {progressText ? ` · ${progressText}` : ''}
          </h3>
        </div>
        <span
          className={[
            'rounded-full px-3 py-1 text-xs font-semibold',
            isSubmissionPending(submission.status)
              ? 'bg-amber-50 text-amber-700'
              : submission.status === 'accepted'
                ? 'bg-emerald-50 text-emerald-700'
                : 'bg-rose-50 text-rose-700',
          ].join(' ')}
        >
          {submission.status}
        </span>
      </div>

      {isSubmissionPending(submission.status) ? (
        <div className="grid gap-2">
          <div className="h-2 overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-amber-400 transition-all"
              style={{
                width: `${progressPercent ?? 0}%`,
              }}
            />
          </div>
          <p className="text-xs font-medium text-slate-500">
            채점 서버 응답을 기다리는 중입니다.
          </p>
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <PreviewJudgeMetric
          label="실패 케이스"
          value={String(submission.failed_testcase_order ?? '-')}
        />
        <PreviewJudgeMetric label="실패 파일" value={detail.caseFiles || '-'} />
        <PreviewJudgeMetric label="소요 시간" value={runtime} />
        <PreviewJudgeMetric label="사용 메모리" value={memory} />
        <PreviewJudgeMetric
          label="언어"
          value={judgeLanguageLabel(submission.language)}
        />
        <PreviewJudgeMetric label="코드 길이" value={codeLength(submission)} />
      </div>

      <PreviewJudgeLog
        label="컴파일 로그"
        value={submission.compile_message || '-'}
      />
      <PreviewJudgeLog
        label="채점 로그"
        value={submission.judge_message || '-'}
      />
      <div className="grid gap-3 xl:grid-cols-3">
        <PreviewJudgeLog label="실패 입력" value={detail.inputText || '-'} />
        <PreviewJudgeLog label="기대 출력" value={detail.expectedText || '-'} />
        <PreviewJudgeLog label="실제 출력" value={detail.actualText || '-'} />
      </div>
    </section>
  );
}

function PreviewJudgeMetric({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="grid gap-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
      <span className="text-[11px] font-semibold text-slate-500">{label}</span>
      <strong className="text-xs font-semibold break-words text-slate-950">
        {value}
      </strong>
    </div>
  );
}

function PreviewJudgeLog({ label, value }: { label: string; value: string }) {
  return (
    <label className="grid gap-2 text-xs font-semibold text-slate-700">
      {label}
      <BoundedText className="max-h-56 overflow-auto rounded-lg border border-slate-200 bg-slate-950 px-3 py-2 font-mono text-[11px] leading-5 whitespace-pre-wrap text-slate-50">
        {value}
      </BoundedText>
    </label>
  );
}

function ProblemPreviewModal({
  assets,
  canSubmit,
  isSubmitting,
  message,
  messageStatus,
  onClose,
  onLanguageChange,
  onSourceCodeChange,
  onSubmit,
  problem,
  sourceCode,
  testSubmission,
  testLanguage,
}: {
  assets: ProblemAsset[];
  canSubmit: boolean;
  isSubmitting: boolean;
  message: string;
  messageStatus: 'idle' | 'loading' | 'ready' | 'error';
  onClose: () => void;
  onLanguageChange: (language: JudgeLanguage) => void;
  onSourceCodeChange: (sourceCode: string) => void;
  onSubmit: () => void;
  problem: Problem;
  sourceCode: string;
  testSubmission: Submission | null;
  testLanguage: JudgeLanguage;
}) {
  return (
    <ModalDialog
      aria-label="문제 미리보기"
      onClose={onClose}
      title={
        <>
          {problem.problem_code}. {problem.title}
        </>
      }
      eyebrow="문제 미리보기"
      size="wide"
      fill
      customBody
    >
      <div className="grid min-h-0 flex-1 overflow-y-auto lg:grid-cols-[minmax(0,1fr)_28rem] lg:overflow-hidden">
        <div className="min-w-0 lg:min-h-0 lg:overflow-y-auto">
          <ProblemStatementPanel assets={assets} problem={problem} />
          {hasProblemEditorial(problem) ? (
            <div className="border-t border-slate-200">
              <ProblemEditorialPanel assets={assets} problem={problem} />
            </div>
          ) : null}
        </div>
        <div className="min-w-0 border-t border-slate-200 lg:min-h-0 lg:overflow-y-auto lg:border-t-0 lg:border-l">
          <ProblemSubmitPanel
            canSubmit={canSubmit}
            editorHeight={360}
            isSubmitting={isSubmitting}
            language={testLanguage}
            layout="standalone"
            message={message}
            messageStatus={messageStatus}
            onLanguageChange={onLanguageChange}
            onSourceCodeChange={onSourceCodeChange}
            onSubmit={onSubmit}
            sourceCode={sourceCode}
          />
          <OperatorPreviewJudgeResult submission={testSubmission} />
        </div>
      </div>
    </ModalDialog>
  );
}

function supportRoleRequiredFilename(role: PackageFileRole) {
  if (role === 'package-resource') return 'testlib.h';
  if (role === 'validator') return 'validator.cpp';
  if (role === 'checker') return 'checker.cpp';
  return '';
}

function supportRoleFromAsset(asset: ProblemAsset): PackageFileRole | null {
  const storageRole = asset.storage_key.match(
    /\/(?:support|package-files)\/([^/]+)(?:\/|$)/,
  )?.[1];
  if (isPackageFileRole(storageRole)) return storageRole;

  const filename = asset.original_filename.toLowerCase();
  if (filename === 'testlib.h') return 'package-resource';
  if (filename === 'validator.cpp') return 'validator';
  if (filename === 'checker.cpp') return 'checker';

  return null;
}

function isPackageFileRole(
  value: string | undefined,
): value is PackageFileRole {
  return PACKAGE_FILE_ROLES.some((role) => role.value === value);
}

function TextInput({
  helperText,
  inputMode,
  label,
  onBlur,
  onChange,
  placeholder,
  value,
}: {
  helperText?: string;
  inputMode?:
    | 'decimal'
    | 'email'
    | 'numeric'
    | 'search'
    | 'tel'
    | 'text'
    | 'url';
  label: string;
  onBlur?: () => void;
  onChange: (value: string) => void;
  placeholder?: string;
  value: string;
}) {
  return (
    <label className="grid gap-2 text-sm font-semibold text-slate-700">
      {label}
      <input
        className="h-11 rounded-lg border border-slate-200 px-3 text-sm font-medium text-slate-950 transition outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100"
        inputMode={inputMode}
        onBlur={onBlur}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        value={value}
      />
      {helperText ? (
        <span className="text-xs font-medium text-slate-500">{helperText}</span>
      ) : null}
    </label>
  );
}

function ErrorBox({ error, fallback }: { error: unknown; fallback: string }) {
  const message = error ? formatApiError(error, fallback) : fallback;
  if (!message) return null;
  return (
    <p className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
      {message}
    </p>
  );
}
