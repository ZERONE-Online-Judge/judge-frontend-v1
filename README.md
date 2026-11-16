# ZOJ Frontend

Zerone Online Judge 프론트엔드 프로젝트입니다.

## 현재 기능

- 공개 메인, 대회 목록, 공지사항, 채점 상태, 지원 안내
- 참가자 대회 화면: 개요, 문제집, 문제/제출, 채점 현황, 스코어보드, 게시판
- 일반/참가자/운영자 세션 관리와 로그아웃 시 캐시 정리
- 서비스 마스터 관리자 화면: 대시보드, 대회 관리, 채점 관리
  - 제출 상세는 대회 운영자와 같은 결과·소스·진행률·재채점 이력을 표시합니다.
  - 채점 관리 → 작업 내역 (Editor)에서 에디터의 전체·단일 검증, 스트레스
    테스트, 패키지 생성 등의 기록을 검색하고 종류·상태별로 조회합니다.
    상세에는 요청자, 실행 기준 리비전, 진행률, 실행 시각과 결과를 표시하며
    작업을 변경하거나 취소하지 않습니다.
- 대회 운영자 화면: 설정, 공지, 참가팀, 문제, 제출, 스코어보드
- 발표용 스코어보드: 해상도·비율 자동 조절, 유형별 표의 독립 스크롤, 결과 공개·순위 이동 모션
- 결과 공개 완료 시 공식 공동 순위를 보존하는 메달 수여·축하 연출과 팡파르
- 발표 화면 설정: 테마·글자 크기·자동 가로/세로 스크롤·효과음과 최초 소리 활성화 안내
- 카드·열 너비를 유지하는 글자 확대와 표별 가로 이동바, 실제 오디오 준비 상태 확인
- 문제 Markdown/LaTeX 렌더링, Monaco 코드 제출, 제출 진행률/시간/메모리 표시
- C·C++ 표준 헤더 대소문자와 JVM 시작점의 제출 전 확인: 경고가 있을 때만 안내하며 원본 코드는 유지
- ICPC 순위: 해결 수 → 총시간 → 마지막 정답 제출 시각, 모두 같으면 공동 순위. 미해결 시도는 순위에 반영하지 않음
- 컴파일 오류는 제출 이력·전체 제출 수에 보존하며 ICPC 오답 횟수·페널티에서는 제외

## 실행 환경

```text
Node.js: ^20.19.0 또는 >=22.12.0
npm: >=10
```

이 프로젝트는 npm을 사용합니다. 다른 패키지 매니저의 lockfile은 추가하지 않습니다.

## 설치

```bash
npm install
```

## 개발 서버

```bash
npm run dev
```

## 빌드

```bash
npm run build
```

## 프리뷰

```bash
npm run preview
```

`npm run build` 이후 실행합니다.

운영 배포는 `bash deploy/deploy-static.sh`로 별도 경로에 빌드하고 정적
파일을 추가한 다음 `index.html`만 원자적으로 교체합니다. 기존 탭에서
사용하는 파일과 실행 중인 API·채점기·nginx는 유지합니다.

운영 HTML은 서버가 빈 `#root` 안에 검색용 공개 본문을 넣습니다.
`index.html`의 초기 스크립트와 인라인 스타일은 앱 번들이 도착하기 전까지
JavaScript 사용 환경에서만 해당 본문을 숨기고 로딩 안내를 표시합니다.
`App`의 첫 commit 뒤 `zoj:app-ready` 이벤트로 안내·타이머를 정리합니다.
번들 실패나 15초 지연에는 새로고침 버튼을 제공하며, JavaScript를 끈
환경에서는 기존 공개 본문과 링크를 표시합니다. 서버 템플릿 계약을 위해
소스의 `#root`는 비워 두고 초기 안내는 그 밖에 유지합니다.

## 코드 검사와 포맷

```bash
npm run lint
npm run typecheck
npm run format:check
npm run format
```

- `npm run lint`: ESLint 검사를 실행합니다.
- `npm run typecheck`: TypeScript 검사를 실행합니다.
- `npm run format:check`: Prettier 포맷 상태를 확인합니다.
- `npm run format`: Prettier로 파일을 정리합니다.

## 기술 스택

- Vite
- React
- TypeScript
- Tailwind CSS
- React Router
- TanStack Query
- Zustand
- React Hook Form
- Zod
- Monaco Editor
- React Markdown
- KaTeX
- ESLint
- Prettier

## Import 규칙

프로젝트 내부 파일은 `@/` alias로 import합니다.

```ts
import App from '@/App';
import '@/index.css';
```

## 환경 변수

| 이름                | 기본값 | 설명                                                                 |
| ------------------- | ------ | -------------------------------------------------------------------- |
| `VITE_API_BASE_URL` | `/api` | API base URL. 개발 환경에서는 Vite proxy를 통해 백엔드로 전달됩니다. |

Vite 환경 변수는 `VITE_` prefix를 사용합니다.

## 문서

프로젝트 진행 상황과 demo/docs 반영 현황은 `docs/README.md`를 먼저 확인합니다.

## 보안 의존성 고정

`monaco-editor`의 하위 의존성인 `dompurify`는 `package.json`의 `overrides`로 안전 버전을 고정합니다.

```json
{
  "overrides": {
    "dompurify": "3.4.2"
  }
}
```

## 색상 참고

| 이름                 | HEX       | RGB                  |
| -------------------- | --------- | -------------------- |
| Blue / Light         | `#f2efff` | `rgb(242, 239, 255)` |
| Blue / Light hover   | `#ebe7ff` | `rgb(235, 231, 255)` |
| Blue / Light active  | `#d6ceff` | `rgb(214, 206, 255)` |
| Blue / Normal        | `#7b61ff` | `rgb(123, 97, 255)`  |
| Blue / Normal hover  | `#6f57e6` | `rgb(111, 87, 230)`  |
| Blue / Normal active | `#624ecc` | `rgb(98, 78, 204)`   |
| Blue / Dark          | `#5c49bf` | `rgb(92, 73, 191)`   |
| Blue / Dark hover    | `#4a3a99` | `rgb(74, 58, 153)`   |
| Blue / Dark active   | `#372c73` | `rgb(55, 44, 115)`   |
| Blue / Darker        | `#2b2259` | `rgb(43, 34, 89)`    |
