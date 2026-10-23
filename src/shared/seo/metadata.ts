export const SITE_ORIGIN = 'https://zoj.kr';
export const SITE_TITLE = '홈 | ZOJ';
export const SITE_DESCRIPTION =
  'ZOJ는 프로그래밍 대회의 문제, 참가자, 코드 제출, 자동 채점과 스코어보드를 관리하는 플랫폼입니다.';

export type PageMetadata = {
  path: string;
  title: string;
  description: string;
  canonical: string | null;
  robots: string | null;
  structured_data: Record<string, unknown>[];
};

const PUBLIC_PAGES: Record<string, [string, string]> = {
  '/': [
    '홈 | ZOJ',
    'ZOJ는 프로그래밍 대회의 문제, 참가자, 코드 제출, 자동 채점과 스코어보드를 관리하는 플랫폼입니다.',
  ],
  '/about': [
    'ZOJ 소개 | ZOJ',
    'ZOJ의 문제·테스트 검증, 참가자 관리, 자동 채점, 스코어보드와 결과 공개 기능을 소개합니다.',
  ],
  '/editor': [
    'Editor 소개 | ZOJ',
    'ZOJ Editor는 지문·테스트·풀이와 검수 기록을 관리하는 문제 제작 도구입니다. ZOJ 채점기 검증, 대회 문제 등록과 패키지 내보내기를 지원합니다.',
  ],
  '/contests': [
    '대회 목록 | ZOJ',
    'ZOJ에서 열리는 프로그래밍 대회를 찾아보세요. 대회 소개와 주최, 진행 일정, 참가 현황 및 종료된 대회의 공개 자료를 확인할 수 있습니다.',
  ],
  '/notices': [
    '공지사항 | ZOJ',
    'ZOJ의 서비스 업데이트, 점검과 긴급 공지사항을 확인합니다.',
  ],
  '/judge-status': [
    '채점 안내 | ZOJ',
    'ZOJ 채점 서버의 연결 상태를 확인하세요. 서버 연결 정보가 주기적으로 갱신되며, 코드 제출부터 결과 확인까지의 채점 과정도 안내합니다.',
  ],
  '/support': [
    '지원 안내 | ZOJ',
    'ZOJ 이용안내, 대회 참가 규정, 로그인과 코드 제출에 관한 도움말을 확인하세요. 개인정보 처리 안내와 서비스 문의도 지원 안내에서 찾을 수 있습니다.',
  ],
  '/support/rules': [
    '대회 참가 규정 | ZOJ',
    'ZOJ 대회 참가 유형과 접근 범위, 채점 결과와 스코어보드, 프리즈 및 종료 후 자료 공개에 관한 서비스 기준을 확인하세요.',
  ],
  '/support/help': [
    '자주 묻는 질문 | ZOJ',
    '로그인, 대회 접근, 코드 제출과 채점 결과, 스코어보드 프리즈 및 세션 만료에 관한 자주 묻는 질문과 답변을 확인하세요.',
  ],
  '/support/privacy': [
    '개인정보처리방침 | ZOJ',
    'Zerone Online Judge의 개인정보 처리 기준을 안내합니다. 수집 항목, 이용 목적, 보관과 파기 기준 및 개인정보 관련 문의 방법을 확인하세요.',
  ],
  '/support/contact': [
    '서비스 문의 | ZOJ',
    'ZOJ 이용 중 궁금한 점과 불편한 점을 남겨 주세요. 서비스 문의 양식으로 접수하면 입력한 이메일 주소로 답변을 받을 수 있습니다.',
  ],
};

// Search parameters may contain account information or return URLs. Metadata
// requests and canonical URLs are always based on the pathname alone.
export function normalizeSeoPath(pathname: string): string {
  const path = pathname.split(/[?#]/, 1)[0];
  if (!path.startsWith('/') || path.startsWith('//')) return '/';
  return path.replace(/\/{2,}/g, '/').replace(/\/+$/, '') || '/';
}

export function resolveSeoPath(pathname: string, search = ''): string {
  const path = normalizeSeoPath(pathname);
  const params = new URLSearchParams(search);
  const noticeId = params.get('noticeId');
  if (path === '/notices' && noticeId && /^[A-Za-z0-9_-]+$/.test(noticeId)) {
    return `/notices/${noticeId}`;
  }
  if (path === '/support') {
    const tab = params.get('tab');
    if (tab && ['rules', 'help', 'privacy', 'contact'].includes(tab)) {
      return `/support/${tab}`;
    }
  }
  return path;
}

export function isPublicSeoPath(path: string): boolean {
  return (
    path in PUBLIC_PAGES ||
    /^\/notices\/[^/]+$/.test(path) ||
    /^\/contests\/[^/]+$/.test(path)
  );
}

export function fallbackMetadata(path: string): PageMetadata {
  const page = PUBLIC_PAGES[path];
  const publicPath = isPublicSeoPath(path);
  const privateTitle = privatePageTitle(path);
  return {
    path,
    title:
      page?.[0] ??
      (publicPath
        ? path.startsWith('/notices/')
          ? '공지사항 | ZOJ'
          : '대회 개요 | ZOJ'
        : privateTitle
          ? `${privateTitle} | ZOJ`
          : '페이지를 찾을 수 없습니다 | ZOJ'),
    description:
      page?.[1] ??
      (publicPath
        ? SITE_DESCRIPTION
        : privateTitle
          ? '로그인과 접근 권한이 필요한 ZOJ 페이지입니다.'
          : '요청한 페이지가 없거나 공개되지 않았습니다.'),
    canonical: page ? `${SITE_ORIGIN}${path}` : null,
    // A public detail page needs the server's visibility decision. Do not put
    // a temporary noindex on it while its public metadata is being requested.
    robots: page ? 'index,follow' : publicPath ? null : 'noindex,nofollow',
    structured_data: [],
  };
}

const PRIVATE_PAGES: Record<string, string> = {
  '/login': '로그인',
  '/admin': '관리자 콘솔',
  '/admin/contests': '대회 관리',
  '/admin/judge': '채점 관리',
  '/admin/analytics': '운영 통계',
  '/admin/audit-logs': '운영 로그',
  '/admin/inquiries': '문의 관리',
  '/operator': '대회 운영',
};
const OPERATOR_PAGES: Record<string, string> = {
  '': '대회 운영',
  settings: '대회 설정',
  operators: '운영자 관리',
  notices: '대회 공지',
  board: '대회 게시판',
  participants: '참가팀 관리',
  problems: '문제 관리',
  'problem-review': '문제 모아보기',
  submissions: '제출 목록',
  scoreboard: '스코어보드',
  'scoreboard/presentation': '프레젠테이션 스코어보드',
  'audit-logs': '운영 로그',
  guide: '운영 가이드',
};
const CONTEST_PAGES: Record<string, string> = {
  submissions: '채점현황',
  scoreboard: '스코어보드',
  board: '대회 게시판',
};

function privatePageTitle(path: string): string | null {
  if (/^\/share\/[A-Za-z0-9_-]{11}$/.test(path)) return '대회 공유 링크';
  if (/^\/presentation\/contests\/[^/]+$/.test(path))
    return '프레젠테이션 스코어보드';
  if (path in PRIVATE_PAGES) return PRIVATE_PAGES[path];
  const operator = path.match(/^\/operator\/contests\/[^/]+(?:\/(.+))?$/);
  if (operator) return OPERATOR_PAGES[operator[1] ?? ''] ?? null;
  const contest = path.match(/^\/contests\/[^/]+\/(.+)$/);
  if (!contest) return null;
  const section = contest[1];
  if (section in CONTEST_PAGES) return CONTEST_PAGES[section];
  if (section === 'problems') return '문제집';
  const problem = section.match(/^problems\/[^/]+(?:\/([^/]+))?$/);
  if (problem)
    return problem[1] === 'submit'
      ? '코드 제출'
      : problem[1] === 'editorial'
        ? '해설'
        : '문제 보기';
  return null;
}

export function readBootstrapMetadata(path: string): PageMetadata | undefined {
  const element = document.getElementById('zoj-seo-data');
  if (!element?.textContent) return;
  try {
    const value = JSON.parse(element.textContent) as PageMetadata;
    if (
      value.path === path &&
      typeof value.title === 'string' &&
      typeof value.description === 'string' &&
      (typeof value.canonical === 'string' || value.canonical === null) &&
      (typeof value.robots === 'string' || value.robots === null) &&
      Array.isArray(value.structured_data)
    ) {
      return value;
    }
  } catch {
    // A failed bootstrap must not prevent the page from loading.
  }
}

function updateMeta(
  attribute: 'name' | 'property',
  key: string,
  value: string | null,
) {
  const matches = [
    ...document.head.querySelectorAll<HTMLMetaElement>(
      `meta[${attribute}="${key}"]`,
    ),
  ];
  const existing = matches.shift();
  matches.forEach((node) => node.remove());
  if (value === null) {
    existing?.remove();
    return;
  }
  const element = existing ?? document.createElement('meta');
  element.setAttribute(attribute, key);
  element.content = value;
  if (!existing) document.head.append(element);
}

function canonicalUrl(value: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value, SITE_ORIGIN);
    if (url.origin !== SITE_ORIGIN) return null;
    return `${SITE_ORIGIN}${normalizeSeoPath(url.pathname)}`;
  } catch {
    return null;
  }
}

export function applyPageMetadata(
  metadata: PageMetadata,
  { preserveTitle = false } = {},
) {
  if (!preserveTitle) document.title = metadata.title;
  updateMeta('name', 'description', metadata.description);
  updateMeta('name', 'robots', metadata.robots);
  updateMeta('property', 'og:title', metadata.title);
  updateMeta('property', 'og:description', metadata.description);
  updateMeta('property', 'og:type', 'website');
  updateMeta('property', 'og:site_name', 'ZOJ');
  updateMeta('property', 'og:locale', 'ko_KR');
  const canonical = canonicalUrl(metadata.canonical);
  updateMeta('property', 'og:url', canonical);
  updateMeta('property', 'og:image', `${SITE_ORIGIN}/og-logo.png`);
  updateMeta('property', 'og:image:width', '1200');
  updateMeta('property', 'og:image:height', '630');
  updateMeta('property', 'og:image:alt', 'ZOJ · Zerone Online Judge');
  updateMeta('name', 'twitter:card', 'summary_large_image');
  updateMeta('name', 'twitter:title', metadata.title);
  updateMeta('name', 'twitter:description', metadata.description);
  updateMeta('name', 'twitter:image', `${SITE_ORIGIN}/og-logo.png`);
  updateMeta('name', 'twitter:image:alt', 'ZOJ · Zerone Online Judge');

  const links = [
    ...document.head.querySelectorAll<HTMLLinkElement>('link[rel="canonical"]'),
  ];
  const existing = links.shift();
  links.forEach((node) => node.remove());
  if (canonical) {
    const link = existing ?? document.createElement('link');
    link.rel = 'canonical';
    link.href = canonical;
    if (!existing) document.head.append(link);
  } else existing?.remove();

  const scripts = [
    ...document.querySelectorAll<HTMLScriptElement>('#zoj-structured-data'),
  ];
  const script = scripts.shift();
  scripts.forEach((node) => node.remove());
  if (metadata.structured_data.length) {
    const element = script ?? document.createElement('script');
    element.id = 'zoj-structured-data';
    element.type = 'application/ld+json';
    element.textContent = JSON.stringify(metadata.structured_data);
    if (!script) document.head.append(element);
  } else script?.remove();
}
