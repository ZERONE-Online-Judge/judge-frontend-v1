/** Add verified records here; keep the timeline layout and metric order shared. */
export type OperatingHistoryEvent = {
  id: string;
  title: string;
  name: string;
  organization: string;
  date: string;
  hours: number;
  teams: number;
  participants: number;
  submissions: number;
  submissionScope: string;
  problems: number;
  testCases: number;
};

export const operatingHistory: readonly OperatingHistoryEvent[] = [
  {
    id: '2026-dspc',
    title: '2026 DSPC',
    name: 'Dankook Univ. SWAG Programming Contest',
    organization: '단국대학교 알고리즘 동아리 SWAG',
    date: '2026-11-15',
    hours: 3,
    teams: 14,
    participants: 14,
    submissions: 226,
    submissionScope: '대회 중 참가자 제출',
    problems: 8,
    testCases: 480,
  },
  {
    id: '2026-zoac',
    title: '2026 ZOAC',
    name: 'Zero One Algorithm Contest',
    organization: '한양대학교 ERICA 학회 영과일',
    date: '2026-11-12',
    hours: 3,
    teams: 16,
    participants: 16,
    submissions: 77,
    submissionScope: '대회 중 참가자 제출',
    problems: 10,
    testCases: 569,
  },
  {
    id: '2026-hepc',
    title: 'HEPC 2026',
    name: 'Hanyang ERICA Programming Contest',
    organization: '한양대학교 ERICA 학회 영과일',
    date: '2026-05-28',
    hours: 2,
    teams: 30,
    participants: 51,
    submissions: 350,
    submissionScope: '전체 제출 건수',
    problems: 15,
    testCases: 728,
  },
];
