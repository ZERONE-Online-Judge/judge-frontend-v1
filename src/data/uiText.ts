export const routeText = {
  admin: '관리자',
  adminContests: '대회 관리',
  adminHome: '관리 홈',
  adminJudge: '채점 관리',
  adminAuditLogs: '운영 로그',
  contestBoard: '대회 게시판',
  contestDetail: '표준 대회',
  contestProblem: '대회 문제',
  contestProblemDetail: '대회 문제 보기',
  contestProblems: '대회 문제집',
  contestScoreboard: '대회 스코어보드',
  contestSubmissions: '대회 채점현황',
  contests: '대회 목록',
  home: '메인',
  judgeStatus: '채점 안내',
  login: '로그인',
  notFound: '찾을 수 없는 페이지',
  notices: '공지사항',
  operator: '운영자',
  operatorBoard: '대회 운영 게시판',
  operatorContest: '대회 운영',
  operatorNotices: '대회 운영 공지',
  operatorParticipants: '대회 운영 참가팀',
  operatorProblems: '대회 운영 문제',
  operatorProblemReview: '문제 모아보기',
  operatorScoreboard: '대회 운영 스코어보드',
  operatorSettings: '대회 운영 설정',
  operatorOperators: '운영자 추가',
  operatorSubmissions: '대회 운영 제출',
  operatorAuditLogs: '대회 운영 로그',
  support: '지원 안내',
} as const;

export const headerText = {
  admin: '관리자',
  logoutCancel: '취소',
  logoutConfirm: '로그아웃',
  logoutConfirmDescription:
    '현재 계정의 로그인 상태가 이 브라우저에서 해제됩니다. 다시 이용하려면 ZOJ에 로그인해 주세요.',
  logoutConfirmTitle: '로그아웃할까요?',
  login: '로그인',
  logout: '로그아웃',
  loggingOut: '로그아웃 중',
  operator: '운영자',
} as const;

export const contestHeaderNavText = [
  { name: '개요', path: '' },
  { name: '문제집', path: 'problems' },
  { name: '채점 현황', path: 'submissions' },
  { name: '스코어 보드', path: 'scoreboard' },
  { name: '게시판', path: 'board' },
] as const;

export const contestCompactNavText = [
  { label: '개요', path: '' },
  { label: '문제집', path: 'problems' },
  { label: '채점현황', path: 'submissions' },
  { label: '스코어보드', path: 'scoreboard' },
  { label: '게시판', path: 'board' },
] as const;

export const problemDetailNavText = [
  { key: 'combined', label: '전체', path: '' },
  { key: 'problem', label: '문제', path: 'statement' },
  { key: 'submit', label: '제출', path: 'submit' },
  { key: 'editorial', label: '해설', path: 'editorial' },
] as const;

export const mainPageText = {
  contestSectionTitle: '대회 목록',
  emergencyNoticeLabel: '긴급',
  noticeLabel: '공지',
  noticeSectionTitle: '공지사항',
} as const;

export const operatorNavText = {
  home: '운영 홈',
  notices: '공지',
  board: '게시판',
  participants: '참가팀',
  problems: '문제',
  problemReview: '문제 모아보기',
  scoreboard: '스코어보드',
  settings: '설정',
  operators: '운영자 추가',
  submissions: '제출',
  auditLogs: '운영 로그',
} as const;

export const publicPageText = {
  contests: {
    description: '참가 가능한 대회와 예정된 대회를 확인하세요.',
    empty: '표시할 공개 대회가 없습니다.',
    eyebrow: 'Contest',
    loadError: '공개 대회를 불러오지 못했습니다.',
    loading: '공개 대회를 불러오는 중입니다.',
    title: '대회 목록',
  },
  judgeStatus: {
    allocationPolicy: '할당 정책',
    activeNodes: '활성 노드',
    description: '공개 채점 서버 상태를 주기적으로 갱신해 표시합니다.',
    eyebrow: 'Judge Status',
    lastUpdated: '마지막 갱신',
    loadError: '채점 상태를 불러오지 못했습니다.',
    loading: '채점 상태를 불러오는 중입니다.',
    queueDepth: '대기열',
    refreshNotice: '5초마다 상태를 갱신합니다.',
    runningJobs: '실행 중 작업',
    title: '채점 상태',
  },
  notFound: {
    homeLink: '메인으로 이동',
    message: '주소가 잘못되었거나 더 이상 사용할 수 없는 페이지입니다.',
    eyebrow: '404',
    title: '페이지를 찾을 수 없습니다',
  },
  notices: {
    description: '서비스 운영 공지를 최신 상태로 표시합니다.',
    empty: '표시할 공지사항이 없습니다.',
    emergencyLabel: '긴급',
    eyebrow: 'Notice',
    label: '공지',
    loadError: '공지사항을 불러오지 못했습니다.',
    loading: '공지사항을 불러오는 중입니다.',
    title: '공지사항',
  },
  support: {
    description: '문의, 서비스 도움말, 규정을 한 곳에서 확인합니다.',
    eyebrow: 'Support',
    tabAriaLabel: '지원 안내 탭',
    title: '지원 안내',
  },
} as const;

export const contestListItemText = {
  periodPrefix: '기간',
  registrationDeadlinePrefix: '모집 마감',
  unavailableMessage:
    '대회 정보를 연결하지 못해 이동할 수 없습니다. 관리자에게 문의해 주세요.',
} as const;

export const sharedUiText = {
  codeEditorLoading: '코드 에디터를 불러오는 중입니다.',
  contestMenuAriaLabel: '대회 메뉴',
  contestSelectionRequiredBody: '운영할 대회를 먼저 선택하세요.',
  contestSelectionRequiredTitle: '대회 선택 필요',
  emptyTable: '표시할 데이터가 없습니다.',
  emergencyNoticeAriaLabel: '긴급공지',
  emergencyNoticeClose: '긴급공지 닫기',
  exampleSectionTitle: '간단 예시 요소',
  noticeLabel: '공지',
  problemDetailMenuAriaLabel: '문제 상세 메뉴',
} as const;

export const accessText = {
  adminLoginDescription:
    '관리자 기능은 운영자 세션이 있는 계정으로만 접근할 수 있습니다.',
  adminLoginTitle: '관리자 로그인 필요',
  adminNoPermissionDescription:
    '현재 계정에는 서비스 관리자 권한이 없습니다. 권한이 필요하면 서비스 마스터에게 요청하세요.',
  adminNoPermissionMessage:
    '관리자 전용 기능은 서비스 마스터 계정에서만 사용할 수 있습니다.',
  adminNoPermissionTitle: '접근 권한 없음',
  loginPageLink: '로그인 페이지로 이동',
  operatorLoginDescription:
    '대회 운영 기능은 운영자 권한이 있는 계정으로 로그인해야 사용할 수 있습니다.',
  operatorLoginTitle: '운영자 로그인 필요',
  operatorNoPermissionDescription:
    '현재 계정은 이 대회의 해당 운영 기능을 사용할 권한이 없습니다.',
  operatorNoPermissionMessage:
    '권한이 필요한 경우 대회 운영자 또는 서비스 관리자에게 요청하세요.',
  operatorNoPermissionTitle: '운영 권한 없음',
  operatorReturnLink: '내 운영 대회로 돌아가기',
  participantNoAccessDescription:
    '현재 로그인한 계정은 이 대회의 참가자로 등록되어 있지 않습니다.',
  participantNoAccessMessage:
    '참가 등록된 계정으로 다시 로그인하거나 대회 운영자에게 참가자 등록 상태를 확인하세요.',
  participantNoAccessTitle: '참가 권한 없음',
} as const;

export const loginPageText = {
  contestRequiredDescription:
    '대회에 참가하거나 대회별 문제, 제출, 스코어보드를 확인하려면 먼저 로그인해야 합니다.',
  contestRequiredTitle: '로그인이 필요합니다',
  cooldownLabel: '재전송',
  description: '이메일 인증번호 또는 비밀번호로 ZOJ에 로그인합니다.',
  emailChanged: '이메일이 변경되었습니다. 새 인증번호를 받아 주세요.',
  emailLabel: '이메일',
  emailPlaceholder: '등록된 이메일',
  emailValidation: '올바른 이메일을 입력해 주세요.',
  eyebrow: 'Login',
  invalidCredentials:
    '로그인 실패: 이메일 또는 인증번호가 맞지 않거나 인증번호가 만료되었습니다. 새 인증번호를 받아 다시 시도해 주세요.',
  loginButton: '로그인',
  loginFailed: '로그인 실패',
  loginReady: '로그인되었습니다.',
  loginSubmitting: '로그인 중입니다.',
  modalConfirm: '확인',
  otpExpired: '인증번호가 만료되었습니다. 다시 발송해 주세요.',
  otpExpiryLabel: '인증번호 유효시간',
  otpExpiredLabel: '만료',
  otpLabel: '인증번호',
  otpPlaceholder: '인증번호',
  otpRequestButton: '로그인 인증번호 받기',
  otpRequestFailed: '인증번호 발송 실패',
  otpRequesting: '인증번호를 발송하고 있습니다.',
  otpRequired: '인증번호를 입력해 주세요.',
  otpSent: '인증번호가 이메일로 발송되었습니다. 인증번호 유효시간은 5분입니다.',
  spamHelp: '인증번호 메일이 보이지 않으면 스팸함도 함께 확인해 주세요.',
  title: '로그인',
  unregisteredEmail:
    '등록된 이메일이 아닙니다. 대회 참가 등록에 사용한 이메일을 입력해 주세요.',
} as const;
