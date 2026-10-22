// Generated from verified solo-run CPU measurements; counts vary by case.
export const judgeTimeBenchmark = {
  schemaVersion: 4,
  measuredAt: '2026-10-22T06:45:35.806574+00:00',
  finishedAt: '2026-10-22T09:21:24.344864+00:00',
  displayDate: '2026. 10. 22.',
  snapshotPath: '/guides/judge-solo-benchmark-2026-10-22.json',
  runtimeMetric: 'isolate_cpu_time_ms',
  profiles: [
    {
      id: 'simple',
      label: '단순 나머지 누적',
      countLabel: '반복',
      description:
        '상수 97로 나머지를 구하고 더해요. 최적화가 잘 되는 반복이에요.',
    },
    {
      id: 'dependent',
      label: '의존 곱셈·나머지',
      countLabel: '반복',
      description:
        '직전 계산값으로 다음 값을 구해요. 계산 사이에 의존성이 있어요.',
    },
    {
      id: 'sequential',
      label: '연속 메모리 접근',
      countLabel: '반복',
      description: '4,194,304개 정수 배열을 연속으로 읽고 더해요.',
    },
    {
      id: 'pointer',
      label: '의존 무작위 메모리 접근',
      countLabel: '반복',
      description:
        '4,194,304개 정수 배열에서 읽은 값으로 다음 위치를 찾아가요.',
    },
    {
      id: 'search',
      label: '배열 이진 탐색',
      countLabel: '반복',
      description:
        '1,048,576개 정렬 배열을 검색해요. 탐색 1회 전체가 작업 단위예요.',
    },
    {
      id: 'branches',
      label: '분기·비트 연산',
      countLabel: '반복',
      description: '입력값의 비트에 따라 분기하고 시프트·XOR 연산을 해요.',
    },
  ],
  languages: [
    {
      id: 'c99',
      label: 'C99',
      version: 'GCC 14.2.0 · -O2 · C99',
    },
    {
      id: 'cpp17',
      label: 'C++17',
      version: 'GCC 14.2.0 · -O2 · C++17',
    },
    {
      id: 'python311',
      label: 'Python 3.11',
      version: 'CPython 3.11.17',
    },
    {
      id: 'pypy3',
      label: 'PyPy 3.11',
      version: 'PyPy 8.0.1 · Python 3.11.17',
    },
    {
      id: 'java8',
      label: 'Java 8 호환',
      version: 'Temurin 21.0.12.1+1-LTS · javac --release 8',
    },
    {
      id: 'kotlin',
      label: 'Kotlin',
      version: 'Kotlin 1.9.24 · Temurin 21.0.12.1+1-LTS',
    },
  ],
  safetyFactor: 2,
  method:
    '실제 채점 큐에서 제출 1건·테스트 1개를 단독 실행합니다. 6개 언어 × 6종 작업을 각각 8회, 총 288회 측정했으며 모두 정답입니다. 언어·작업별 반복 횟수를 사전 보정 후 고정했습니다. 평균은 8회 CPU 시간의 산술평균이며 표준편차는 표본 기준입니다. 프로그램 시작·JIT·GC·배열 초기화를 포함하고 격리 준비·큐 대기·CPU 배정 대기·컴파일·checker는 제외합니다.',
  limits: {
    time_ms: 120000,
    memory_mib: 1024,
  },
  environment: {
    cpu: 'Intel Xeon E5-2698 v4 @ 2.20GHz',
    nodeCount: 6,
    agentVersion: '0.3.0',
    runtimePolicy: 'zoj-runtime-v1',
    cpuPerExecution: 1,
  },
  calibrationNote:
    '언어·작업별로 약 1.2초를 목표로 반복 횟수를 보정한 뒤 고정했습니다. 작업 수가 서로 다르므로 CPU 시간만으로 언어 간 속도 순위를 비교하지 마세요.',
  cases: [
    {
      id: 'simple-c99',
      profile: 'simple',
      language: 'c99',
      iterations: 589635316,
      sampleCount: 8,
      runtimeMs: {
        min: 1197,
        max: 1199,
        mean: 1198.125,
        sampleSd: 0.8345229603962802,
      },
      serialMaxMs: 1199,
    },
    {
      id: 'dependent-c99',
      profile: 'dependent',
      language: 'c99',
      iterations: 171428571,
      sampleCount: 8,
      runtimeMs: {
        min: 1185,
        max: 1190,
        mean: 1186.5,
        sampleSd: 1.927248223318863,
      },
      serialMaxMs: 1190,
    },
    {
      id: 'sequential-c99',
      profile: 'sequential',
      language: 'c99',
      iterations: 1000000000,
      sampleCount: 8,
      runtimeMs: {
        min: 764,
        max: 810,
        mean: 789.625,
        sampleSd: 13.907218064218101,
      },
      serialMaxMs: 810,
    },
    {
      id: 'pointer-c99',
      profile: 'pointer',
      language: 'c99',
      iterations: 16000000,
      sampleCount: 8,
      runtimeMs: {
        min: 707,
        max: 848,
        mean: 790.75,
        sampleSd: 42.7609635064506,
      },
      serialMaxMs: 848,
    },
    {
      id: 'search-c99',
      profile: 'search',
      language: 'c99',
      iterations: 2560000,
      sampleCount: 8,
      runtimeMs: {
        min: 775,
        max: 809,
        mean: 784.125,
        sampleSd: 10.615857411035087,
      },
      serialMaxMs: 809,
    },
    {
      id: 'branches-c99',
      profile: 'branches',
      language: 'c99',
      iterations: 154838709,
      sampleCount: 8,
      runtimeMs: {
        min: 1190,
        max: 1199,
        mean: 1193.375,
        sampleSd: 2.7222627143085005,
      },
      serialMaxMs: 1199,
    },
    {
      id: 'simple-cpp17',
      profile: 'simple',
      language: 'cpp17',
      iterations: 589635316,
      sampleCount: 8,
      runtimeMs: {
        min: 1198,
        max: 1198,
        mean: 1198,
        sampleSd: 0.0,
      },
      serialMaxMs: 1198,
    },
    {
      id: 'dependent-cpp17',
      profile: 'dependent',
      language: 'cpp17',
      iterations: 171428571,
      sampleCount: 8,
      runtimeMs: {
        min: 1185,
        max: 1186,
        mean: 1185.25,
        sampleSd: 0.4629100498862757,
      },
      serialMaxMs: 1186,
    },
    {
      id: 'sequential-cpp17',
      profile: 'sequential',
      language: 'cpp17',
      iterations: 1000000000,
      sampleCount: 8,
      runtimeMs: {
        min: 767,
        max: 825,
        mean: 805.75,
        sampleSd: 19.976772226048645,
      },
      serialMaxMs: 825,
    },
    {
      id: 'pointer-cpp17',
      profile: 'pointer',
      language: 'cpp17',
      iterations: 16000000,
      sampleCount: 8,
      runtimeMs: {
        min: 674,
        max: 838,
        mean: 780,
        sampleSd: 60.35608621222174,
      },
      serialMaxMs: 838,
    },
    {
      id: 'search-cpp17',
      profile: 'search',
      language: 'cpp17',
      iterations: 2560000,
      sampleCount: 8,
      runtimeMs: {
        min: 771,
        max: 812,
        mean: 786.125,
        sampleSd: 16.234333106985684,
      },
      serialMaxMs: 812,
    },
    {
      id: 'branches-cpp17',
      profile: 'branches',
      language: 'cpp17',
      iterations: 154838709,
      sampleCount: 8,
      runtimeMs: {
        min: 1190,
        max: 1199,
        mean: 1193.125,
        sampleSd: 3.48209706929603,
      },
      serialMaxMs: 1199,
    },
    {
      id: 'simple-python311',
      profile: 'simple',
      language: 'python311',
      iterations: 4633204,
      sampleCount: 8,
      runtimeMs: {
        min: 829,
        max: 1004,
        mean: 880.25,
        sampleSd: 57.492235500606014,
      },
      serialMaxMs: 1004,
    },
    {
      id: 'dependent-python311',
      profile: 'dependent',
      language: 'python311',
      iterations: 3438395,
      sampleCount: 8,
      runtimeMs: {
        min: 836,
        max: 897,
        mean: 860.375,
        sampleSd: 22.50674502073926,
      },
      serialMaxMs: 897,
    },
    {
      id: 'sequential-python311',
      profile: 'sequential',
      language: 'python311',
      iterations: 1000000,
      sampleCount: 8,
      runtimeMs: {
        min: 1206,
        max: 1235,
        mean: 1220.875,
        sampleSd: 12.158917949977527,
      },
      serialMaxMs: 1235,
    },
    {
      id: 'pointer-python311',
      profile: 'pointer',
      language: 'python311',
      iterations: 1000000,
      sampleCount: 8,
      runtimeMs: {
        min: 1131,
        max: 1195,
        mean: 1145.75,
        sampleSd: 21.11025478630841,
      },
      serialMaxMs: 1195,
    },
    {
      id: 'search-python311',
      profile: 'search',
      language: 'python311',
      iterations: 69181,
      sampleCount: 8,
      runtimeMs: {
        min: 732,
        max: 774,
        mean: 749.5,
        sampleSd: 14.39245834257849,
      },
      serialMaxMs: 774,
    },
    {
      id: 'branches-python311',
      profile: 'branches',
      language: 'python311',
      iterations: 1000000,
      sampleCount: 8,
      runtimeMs: {
        min: 659,
        max: 717,
        mean: 686.5,
        sampleSd: 16.962142721787412,
      },
      serialMaxMs: 717,
    },
    {
      id: 'simple-pypy3',
      profile: 'simple',
      language: 'pypy3',
      iterations: 307692297,
      sampleCount: 8,
      runtimeMs: {
        min: 1043,
        max: 1047,
        mean: 1044.5,
        sampleSd: 1.6903085094570331,
      },
      serialMaxMs: 1047,
    },
    {
      id: 'dependent-pypy3',
      profile: 'dependent',
      language: 'pypy3',
      iterations: 72800807,
      sampleCount: 8,
      runtimeMs: {
        min: 762,
        max: 768,
        mean: 764.25,
        sampleSd: 1.8322507626258087,
      },
      serialMaxMs: 768,
    },
    {
      id: 'sequential-pypy3',
      profile: 'sequential',
      language: 'pypy3',
      iterations: 189761040,
      sampleCount: 8,
      runtimeMs: {
        min: 804,
        max: 909,
        mean: 824.625,
        sampleSd: 34.64075840476278,
      },
      serialMaxMs: 909,
    },
    {
      id: 'pointer-pypy3',
      profile: 'pointer',
      language: 'pypy3',
      iterations: 9447267,
      sampleCount: 8,
      runtimeMs: {
        min: 718,
        max: 809,
        mean: 748.375,
        sampleSd: 31.513885828313843,
      },
      serialMaxMs: 809,
    },
    {
      id: 'search-pypy3',
      profile: 'search',
      language: 'pypy3',
      iterations: 1691002,
      sampleCount: 8,
      runtimeMs: {
        min: 885,
        max: 907,
        mean: 896.75,
        sampleSd: 8.08437646681195,
      },
      serialMaxMs: 907,
    },
    {
      id: 'branches-pypy3',
      profile: 'branches',
      language: 'pypy3',
      iterations: 176616036,
      sampleCount: 8,
      runtimeMs: {
        min: 1100,
        max: 1135,
        mean: 1109.25,
        sampleSd: 13.23145602613063,
      },
      serialMaxMs: 1135,
    },
    {
      id: 'simple-java8',
      profile: 'simple',
      language: 'java8',
      iterations: 498345335,
      sampleCount: 8,
      runtimeMs: {
        min: 1071,
        max: 1076,
        mean: 1073.75,
        sampleSd: 1.9820624179302297,
      },
      serialMaxMs: 1076,
    },
    {
      id: 'dependent-java8',
      profile: 'dependent',
      language: 'java8',
      iterations: 96096090,
      sampleCount: 8,
      runtimeMs: {
        min: 813,
        max: 821,
        mean: 817,
        sampleSd: 2.878491668515698,
      },
      serialMaxMs: 821,
    },
    {
      id: 'sequential-java8',
      profile: 'sequential',
      language: 'java8',
      iterations: 527717331,
      sampleCount: 8,
      runtimeMs: {
        min: 761,
        max: 786,
        mean: 776.375,
        sampleSd: 9.797047660246573,
      },
      serialMaxMs: 786,
    },
    {
      id: 'pointer-java8',
      profile: 'pointer',
      language: 'java8',
      iterations: 16354157,
      sampleCount: 8,
      runtimeMs: {
        min: 844,
        max: 974,
        mean: 891.25,
        sampleSd: 48.11518916695048,
      },
      serialMaxMs: 974,
    },
    {
      id: 'search-java8',
      profile: 'search',
      language: 'java8',
      iterations: 3201775,
      sampleCount: 8,
      runtimeMs: {
        min: 1032,
        max: 1073,
        mean: 1047.25,
        sampleSd: 15.434192097880787,
      },
      serialMaxMs: 1073,
    },
    {
      id: 'branches-java8',
      profile: 'branches',
      language: 'java8',
      iterations: 341555975,
      sampleCount: 8,
      runtimeMs: {
        min: 1110,
        max: 1119,
        mean: 1113.625,
        sampleSd: 3.9618718519695424,
      },
      serialMaxMs: 1119,
    },
    {
      id: 'simple-kotlin',
      profile: 'simple',
      language: 'kotlin',
      iterations: 389610375,
      sampleCount: 8,
      runtimeMs: {
        min: 885,
        max: 894,
        mean: 889,
        sampleSd: 2.9277002188455996,
      },
      serialMaxMs: 894,
    },
    {
      id: 'dependent-kotlin',
      profile: 'dependent',
      language: 'kotlin',
      iterations: 128182978,
      sampleCount: 8,
      runtimeMs: {
        min: 1099,
        max: 1108,
        mean: 1101.625,
        sampleSd: 2.8753881725529062,
      },
      serialMaxMs: 1108,
    },
    {
      id: 'sequential-kotlin',
      profile: 'sequential',
      language: 'kotlin',
      iterations: 709919986,
      sampleCount: 8,
      runtimeMs: {
        min: 1016,
        max: 1055,
        mean: 1038.125,
        sampleSd: 15.282459600096164,
      },
      serialMaxMs: 1055,
    },
    {
      id: 'pointer-kotlin',
      profile: 'pointer',
      language: 'kotlin',
      iterations: 16968924,
      sampleCount: 8,
      runtimeMs: {
        min: 793,
        max: 932,
        mean: 853.875,
        sampleSd: 55.64026676530484,
      },
      serialMaxMs: 932,
    },
    {
      id: 'search-kotlin',
      profile: 'search',
      language: 'kotlin',
      iterations: 2569132,
      sampleCount: 8,
      runtimeMs: {
        min: 886,
        max: 934,
        mean: 895.125,
        sampleSd: 16.039571600976664,
      },
      serialMaxMs: 934,
    },
    {
      id: 'branches-kotlin',
      profile: 'branches',
      language: 'kotlin',
      iterations: 279349094,
      sampleCount: 8,
      runtimeMs: {
        min: 944,
        max: 985,
        mean: 959.625,
        sampleSd: 13.721073469042324,
      },
      serialMaxMs: 985,
    },
  ],
} as const;

export type TimeComplexity =
  | 'linear'
  | 'n_log_n'
  | 'quadratic'
  | 'pairs'
  | 'cubic';
type Reference = {
  profile?: string;
  iterations: number;
  runtimeMs: { max: number };
};
export function estimateTimeBudget(
  reference: Reference,
  complexity: TimeComplexity,
  n: number,
  safetyFactor = 2,
) {
  if (
    !Number.isSafeInteger(n) ||
    n < 1 ||
    n > 1_000_000_000 ||
    !Number.isFinite(safetyFactor) ||
    safetyFactor < 1 ||
    safetyFactor > 10
  )
    return null;
  if (
    !Number.isFinite(reference.iterations) ||
    !Number.isFinite(reference.runtimeMs.max) ||
    !(reference.iterations > 0) ||
    !(reference.runtimeMs.max > 0)
  )
    return null;
  if (reference.profile === 'search' && complexity !== 'linear') return null;
  const count = {
    linear: n,
    n_log_n: n * Math.ceil(Math.log2(n)),
    quadratic: n * n,
    pairs: (n * (n - 1)) / 2,
    cubic: n * n * n,
  }[complexity];
  if (!Number.isFinite(count)) return null;
  return {
    count,
    budgetMs:
      (count / reference.iterations) * reference.runtimeMs.max * safetyFactor,
    extrapolated: count > reference.iterations,
  };
}
