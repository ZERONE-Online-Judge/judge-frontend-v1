import type { Division } from '@/domains/contestAdministration/types';
import type { TeamImportRow } from '@/domains/teamParticipation/types';

export type TeamImportDraft = {
  line: number;
  team: TeamImportRow;
  warnings: string[];
};
export type TeamImportPreparation = {
  rows: TeamImportDraft[];
  errors: string[];
  corrections: string[];
};

function records(text: string, delimiter: string, limit = Infinity) {
  const result: { line: number; cells: string[]; errors: string[] }[] = [];
  let line = 1,
    start = 1,
    cell = '',
    cells: string[] = [],
    errors: string[] = [];
  let quoted = false,
    closed = false;
  const finishCell = () => {
    cells.push(cell);
    cell = '';
    closed = false;
  };
  const finishRow = () => {
    finishCell();
    if (cells.some((value) => value.trim()) || errors.length)
      result.push({ line: start, cells, errors });
    cells = [];
    errors = [];
  };
  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') {
        cell += '"';
        index++;
      } else if (char === '"') {
        quoted = false;
        closed = true;
      } else {
        cell += char;
        if (char === '\n') line++;
      }
    } else if (char === delimiter) finishCell();
    else if (char === '\n') {
      finishRow();
      if (result.length >= limit) return result;
      line++;
      start = line;
    } else if (char === '"' && !cell.trim() && !closed) {
      cell = '';
      quoted = true;
    } else if (closed && char.trim()) {
      errors.push('닫는 따옴표 뒤에는 구분자 또는 줄바꿈이 필요합니다.');
      cell += char;
    } else if (char === '"') {
      errors.push(
        '값 안의 따옴표는 값을 큰따옴표로 감싼 뒤 두 번 써야 합니다.',
      );
      cell += char;
    } else cell += char;
  }
  if (quoted) errors.push('큰따옴표가 닫히지 않았습니다.');
  finishRow();
  return result;
}

export function splitDelimitedLine(line: string, delimiter: string) {
  return records(line, delimiter)[0]?.cells.map((cell) => cell.trim()) ?? [];
}

function headerName(header: string) {
  const value = header
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, '');
  const aliases: Record<string, string> = {
    teamname: 'team_name',
    팀명: 'team_name',
    팀이름: 'team_name',
    division: 'division',
    divisionname: 'division',
    참가유형: 'division',
    유형: 'division',
    leadername: 'leader_name',
    팀장이름: 'leader_name',
    대표이름: 'leader_name',
    leaderemail: 'leader_email',
    팀장메일: 'leader_email',
    팀장이메일: 'leader_email',
    대표메일: 'leader_email',
    대표이메일: 'leader_email',
  };
  if (Object.hasOwn(aliases, value)) return aliases[value];
  const member = value.match(
    /^(?:member|팀원)([1-9]\d*)?(name|이름|email|메일|이메일)$/,
  );
  return member
    ? `member${member[1] || '1'}_${['name', '이름'].includes(member[2]) ? 'name' : 'email'}`
    : '';
}

export function normalizeTeamImportRow(team: TeamImportRow): TeamImportRow {
  return {
    team_name: team.team_name.trim(),
    division_id: team.division_id.trim(),
    leader: {
      name: team.leader.name.trim(),
      email: team.leader.email.trim().toLowerCase(),
    },
    members: team.members.map((member) => ({
      name: member.name.trim(),
      email: member.email.trim().toLowerCase(),
    })),
  };
}

function hasControlCharacters(value: string) {
  return [...value].some((character) => {
    const code = character.charCodeAt(0);
    return code < 32 || code === 127;
  });
}

export function prepareTeamImport(
  text: string,
  divisions: Division[],
): TeamImportPreparation {
  const errors: string[] = [],
    corrections: string[] = [];
  if (text.includes('\uFFFD'))
    errors.push(
      '읽을 수 없는 문자가 있습니다. 원본 파일을 UTF-8 형식으로 저장한 뒤 다시 확인하세요.',
    );
  if (text.startsWith('\uFEFF')) corrections.push('파일의 BOM을 제거했습니다.');
  if (/\r/.test(text)) corrections.push('줄바꿈을 통일했습니다.');
  const normalized = text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  const first = normalized.split('\n').find((line) => line.trim()) || '';
  const delimiter = first.includes('\t') ? '\t' : ',';
  const parsed = records(normalized, delimiter, 1002);
  const header = parsed.shift();
  if (!header)
    return {
      rows: [],
      errors: ['헤더와 참가팀 정보를 입력하세요.'],
      corrections,
    };
  errors.push(...header.errors.map((error) => `${header.line}행: ${error}`));
  const headers = header.cells.map(headerName);
  if (parsed.length > 1000)
    errors.push(
      '한 번에 1,000팀까지 등록할 수 있습니다. 원본을 나누어 다시 검사하세요. 처음 1,000팀만 표시합니다.',
    );
  const required = {
    team_name: '팀명',
    division: '참가 유형',
    leader_name: '팀장 이름',
    leader_email: '팀장 이메일',
  };
  for (const [key, label] of Object.entries(required)) {
    if (!headers.includes(key))
      errors.push(`${label} 열이 없습니다. 헤더를 확인하세요.`);
  }
  headers.forEach((name, index) => {
    if (!name)
      errors.push(
        `지원하지 않는 열입니다: ${header.cells[index] || '(빈 헤더)'}`,
      );
    else if (headers.indexOf(name) !== index)
      errors.push(`같은 의미의 열이 중복되어 있습니다: ${header.cells[index]}`);
  });
  const memberNumbers = [
    ...new Set(
      headers.flatMap((name) => name.match(/^member(\d+)_/)?.[1] || []),
    ),
  ];
  for (const number of memberNumbers) {
    if (
      !headers.includes(`member${number}_name`) ||
      !headers.includes(`member${number}_email`)
    )
      errors.push(`팀원 ${number}의 이름·이메일 열을 모두 준비하세요.`);
  }
  const divisionKeys = new Map<string, Set<string>>();
  for (const division of divisions) {
    for (const key of [division.division_id, division.code, division.name]) {
      if (!key) continue;
      const value = key.trim().toLowerCase(),
        matches = divisionKeys.get(value) ?? new Set<string>();
      matches.add(division.division_id);
      divisionKeys.set(value, matches);
    }
  }
  let trimmed = false,
    lowercased = false;
  const rows = parsed.slice(0, 1000).map((record) => {
    const cells = record.cells.map((value) => value.trim());
    trimmed ||= cells.some((value, index) => value !== record.cells[index]);
    const value = (key: string) => cells[headers.indexOf(key)] || '';
    const division = value('division'),
      matches = divisionKeys.get(division.toLowerCase());
    const rowErrors = [...record.errors];
    if (cells.length !== headers.length)
      rowErrors.push(
        `열 개수가 헤더와 다릅니다. 헤더 ${headers.length}개, 이 행 ${cells.length}개입니다.`,
      );
    const team: TeamImportRow = {
      team_name: value('team_name'),
      division_id: matches?.size === 1 ? [...matches][0] : division,
      leader: { name: value('leader_name'), email: value('leader_email') },
      members: memberNumbers
        .map((number) => ({
          name: value(`member${number}_name`),
          email: value(`member${number}_email`),
        }))
        .filter((member) => member.name || member.email),
    };
    lowercased ||= [team.leader, ...team.members].some(
      (member) => member.email !== member.email.toLowerCase(),
    );
    return {
      line: record.line,
      team: normalizeTeamImportRow(team),
      warnings: rowErrors,
    };
  });
  if (trimmed) corrections.push('값 앞뒤의 공백을 정리했습니다.');
  if (lowercased) corrections.push('이메일을 소문자로 통일했습니다.');
  if (header.cells.some((value, index) => value.trim() !== headers[index]))
    corrections.push('헤더 이름을 표준 항목에 맞춰 읽었습니다.');
  if (!rows.length) errors.push('등록할 참가팀 행이 없습니다.');
  return { rows, errors, corrections };
}

export function teamImportRowErrors(
  team: TeamImportRow,
  divisions: Division[],
) {
  const row = normalizeTeamImportRow(team),
    errors: string[] = [];
  if (!row.team_name) errors.push('팀명을 입력하세요.');
  if (hasControlCharacters(row.team_name))
    errors.push('팀명에는 줄바꿈·제어 문자를 사용할 수 없습니다.');
  if (!divisions.some((division) => division.division_id === row.division_id))
    errors.push('등록할 참가 유형을 선택하세요.');
  const people = [
    { ...row.leader, label: '팀장' },
    ...row.members.map((member, index) => ({
      ...member,
      label: `팀원 ${index + 1}`,
    })),
  ];
  for (const person of people) {
    if (!person.name) errors.push(`${person.label} 이름을 입력하세요.`);
    if (hasControlCharacters(person.name))
      errors.push(
        `${person.label} 이름에는 줄바꿈·제어 문자를 사용할 수 없습니다.`,
      );
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(person.email))
      errors.push(`${person.label} 이메일 형식을 확인하세요.`);
  }
  return errors;
}

export function serializeTeamImportRows(rows: TeamImportRow[]) {
  const count = Math.max(0, ...rows.map((row) => row.members.length));
  const headers = [
    'team_name',
    'division',
    'leader_name',
    'leader_email',
    ...Array.from({ length: count }, (_, index) => [
      `member${index + 1}_name`,
      `member${index + 1}_email`,
    ]).flat(),
  ];
  const cell = (value: string) =>
    /["\t\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
  return [
    headers,
    ...rows.map((team) => [
      team.team_name,
      team.division_id,
      team.leader.name,
      team.leader.email,
      ...Array.from({ length: count }, (_, index) => [
        team.members[index]?.name || '',
        team.members[index]?.email || '',
      ]).flat(),
    ]),
  ]
    .map((values) => values.map(cell).join('\t'))
    .join('\n');
}

export function parseTeamImportFile(text: string, divisions: Division[]) {
  const prepared = prepareTeamImport(text, divisions);
  const errors = [
    ...prepared.errors,
    ...prepared.rows.flatMap((row) => [
      ...row.warnings,
      ...teamImportRowErrors(row.team, divisions),
    ]),
  ];
  if (errors.length) throw new Error(errors.join('\n'));
  return prepared.rows.map((row) => row.team);
}
