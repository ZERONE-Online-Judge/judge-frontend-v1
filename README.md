# ZOJ Frontend

Zerone Online Judge 프론트엔드 프로젝트입니다.

## 현재 기능

- 공개 메인, 대회 목록, 공지사항, 채점 상태, 지원 안내
- 참가자 대회 화면: 개요, 문제집, 문제/제출, 채점 현황, 스코어보드, 게시판
- 일반/참가자/운영자 세션 관리와 로그아웃 시 캐시 정리
- 서비스 마스터 관리자 화면: 대시보드, 대회 관리, 채점 관리
- 대회 운영자 화면: 설정, 공지, 참가팀, 문제, 제출, 스코어보드
- 발표용 스코어보드: 해상도·비율 자동 조절, 유형별 표의 독립 스크롤, 결과 공개·순위 이동 모션
- 결과 공개 완료 시 공식 공동 순위를 보존하는 메달 수여·축하 연출과 팡파르
- 발표 화면 설정: 테마·글자 크기·자동 가로/세로 스크롤·효과음과 최초 소리 활성화 안내
- 카드·열 너비를 유지하는 글자 확대와 표별 가로 이동바, 실제 오디오 준비 상태 확인
- 문제 Markdown/LaTeX 렌더링, Monaco 코드 제출, 제출 진행률/시간/메모리 표시

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
