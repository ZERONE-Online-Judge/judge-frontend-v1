import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { Division } from '@/domains/contestAdministration/types';
import { tokenQueryIdentity } from '@/domains/identityAccess/queryIdentity';
import {
  bulkCreateParticipantTeams,
  formatParticipantImportIssue,
  previewParticipantTeams,
} from '@/domains/teamParticipation/api';
import {
  prepareTeamImport,
  serializeTeamImportRows,
  teamImportRowErrors,
  type TeamImportPreparation,
} from '@/domains/teamParticipation/importParser';
import type {
  ParticipantBulkImportResponse,
  ParticipantBulkPreview,
  TeamImportRow,
} from '@/domains/teamParticipation/types';
import { formatApiError } from '@/shared/api/errors';
import ModalDialog, { ModalButton } from '@/shared/ui/ModalDialog';
import Select from '@/shared/ui/Select';
import CollapsibleEditor from './CollapsibleEditor';

type Validation = {
  key: string;
  data?: ParticipantBulkPreview;
  error?: string;
};
type Result = {
  data: ParticipantBulkImportResponse;
  rows: TeamImportPreparation['rows'];
  uncertain: boolean;
};
const fieldClass =
  'h-10 w-full min-w-0 rounded-lg border border-slate-200 bg-white px-3 text-sm font-normal text-slate-950 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 disabled:opacity-60';

type ImportProps = {
  contestId: string;
  token: string;
  divisions: Division[];
  onRegistered: () => void;
};
export default function ParticipantBulkImport(props: ImportProps) {
  return (
    <ParticipantBulkImportContent
      key={`${props.contestId}/${tokenQueryIdentity(props.token)}`}
      {...props}
    />
  );
}
function ParticipantBulkImportContent({
  contestId,
  token,
  divisions,
  onRegistered,
}: ImportProps) {
  const [expanded, setExpanded] = useState(false);
  const [text, setText] = useState('');
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<TeamImportPreparation | null>(null);
  const draftRef = useRef<TeamImportPreparation | null>(null);
  const [source, setSource] = useState('');
  const [sourceDirty, setSourceDirty] = useState(false);
  const sourceDirtyRef = useRef(false);
  const [validation, setValidation] = useState<Validation | null>(null);
  const [retry, setRetry] = useState(0);
  const [busy, setBusy] = useState(false);
  const [reading, setReading] = useState(false);
  const readingRef = useRef(false);
  const submitting = useRef(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<Result | null>(null);
  const [page, setPage] = useState(1);
  const [onlyErrors, setOnlyErrors] = useState(false);
  const lifecycle = useRef({ active: false });
  const generation = useRef(0);
  const fileGeneration = useRef(0);
  useLayoutEffect(() => {
    const current = { active: true };
    lifecycle.current = current;
    return () => {
      current.active = false;
    };
  }, []);
  const rows = draft?.rows ?? [];
  const requestRows = rows.map((row) => row.team);
  const signature = JSON.stringify({ contestId, token, teams: requestRows });
  const current = validation?.key === signature ? validation : null;
  const formatErrors = [
    ...(draft?.errors ?? []),
    ...rows.flatMap((row) =>
      row.warnings.map((warning) => `${row.line}행: ${warning}`),
    ),
  ];
  const localErrors = rows.map((row) =>
    teamImportRowErrors(row.team, divisions),
  );
  const valid =
    !sourceDirty &&
    !reading &&
    !formatErrors.length &&
    !!rows.length &&
    localErrors.every((issues) => !issues.length) &&
    current?.data?.summary.ready === rows.length &&
    current.data.rows.length === rows.length &&
    current.data.rows.every(
      (row, index) => row.row === index + 1 && row.valid && !!row.normalized,
    );

  function replaceDraft(next: TeamImportPreparation) {
    generation.current++;
    draftRef.current = next;
    setDraft(next);
    setValidation(null);
    setError('');
  }

  useEffect(() => {
    if (
      !open ||
      result ||
      !draft ||
      sourceDirty ||
      formatErrors.length ||
      !rows.length
    )
      return;
    let live = true;
    const epoch = generation.current;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const data = await previewParticipantTeams(
          contestId,
          token,
          JSON.parse(signature).teams,
          controller.signal,
        );
        if (live && lifecycle.current.active && epoch === generation.current)
          setValidation({ key: signature, data });
      } catch (cause) {
        if (live && lifecycle.current.active && epoch === generation.current)
          setValidation({
            key: signature,
            error: formatApiError(
              cause,
              '등록 가능 여부를 확인하지 못했습니다',
            ),
          });
      }
    }, 300);
    return () => {
      live = false;
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [
    open,
    result,
    draft,
    signature,
    sourceDirty,
    formatErrors.length,
    rows.length,
    contestId,
    token,
    retry,
  ]);

  function inspect(raw = text) {
    if (readingRef.current) return;
    replaceDraft(prepareTeamImport(raw, divisions));
    setSource(raw);
    setSourceDirty(false);
    sourceDirtyRef.current = false;
    setResult(null);
    setPage(1);
    setOnlyErrors(false);
    setOpen(true);
  }
  function changeRow(index: number, change: (team: TeamImportRow) => void) {
    const next = structuredClone(draftRef.current!);
    change(next.rows[index].team);
    replaceDraft(next);
    if (
      !next.errors.length &&
      !next.rows.some((row) => row.warnings.length) &&
      !sourceDirtyRef.current
    )
      setSource(serializeTeamImportRows(next.rows.map((row) => row.team)));
  }
  function close() {
    if (submitting.current) return;
    generation.current++;
    if (!result && draftRef.current) {
      setText(
        sourceDirty
          ? source
          : formatErrors.length
            ? source
            : serializeTeamImportRows(
                draftRef.current.rows.map((row) => row.team),
              ),
      );
    }
    setOpen(false);
  }
  async function register() {
    if (
      submitting.current ||
      !valid ||
      !current?.data ||
      sourceDirtyRef.current ||
      readingRef.current
    )
      return;
    const latest = draftRef.current;
    if (
      !latest ||
      JSON.stringify({
        contestId,
        token,
        teams: latest.rows.map((row) => row.team),
      }) !== current.key
    )
      return;
    submitting.current = true;
    setBusy(true);
    setError('');
    const owner = lifecycle.current;
    const submitted = structuredClone(latest.rows);
    const teams = current.data.rows.map((row) => row.normalized!);
    try {
      const data = await bulkCreateParticipantTeams(contestId, token, teams);
      if (!owner.active) return;
      const indices = data.errors.map((issue) => issue.row - 1);
      const uncertain =
        new Set(indices).size !== indices.length ||
        indices.some((index) => index < 0 || index >= submitted.length) ||
        data.created.length + data.errors.length !== submitted.length;
      const remaining = uncertain
        ? submitted
        : submitted.filter((_, index) => indices.includes(index));
      const normalizedRemaining = remaining.map((row) => ({
        ...row,
        team: teams[submitted.indexOf(row)],
      }));
      replaceDraft({ rows: normalizedRemaining, errors: [], corrections: [] });
      setText(
        remaining.length
          ? serializeTeamImportRows(normalizedRemaining.map((row) => row.team))
          : '',
      );
      setResult({ data, rows: submitted, uncertain });
      setPage(1);
      onRegistered();
    } catch (cause) {
      if (owner.active) {
        setError(
          `${formatApiError(cause, '등록 결과를 확인하지 못했습니다')}. 일부 팀이 등록되었을 수 있습니다. 참가팀 목록을 확인하고 등록 가능 여부를 다시 검사하세요.`,
        );
        setValidation(null);
        setRetry((value) => value + 1);
        onRegistered();
      }
    } finally {
      submitting.current = false;
      if (owner.active) setBusy(false);
    }
  }
  function retryFailed() {
    setResult(null);
    setPage(1);
    setSource(text);
    setSourceDirty(false);
    sourceDirtyRef.current = false;
    setOnlyErrors(false);
    setValidation(null);
    setRetry((value) => value + 1);
  }
  const indexed = rows.map((row, index) => ({ row, index }));
  const shown = onlyErrors
    ? indexed.filter(
        ({ index }) =>
          localErrors[index].length ||
          current?.data?.rows[index]?.errors.length,
      )
    : indexed;
  const pages = Math.max(
    1,
    Math.ceil((result ? result.rows.length : shown.length) / 10),
  );
  const displayedPage = Math.min(page, pages);
  const offset = (displayedPage - 1) * 10;
  const editingBlocked = busy || sourceDirty || reading;
  const dirty = !!text.trim() || (!result && !!rows.length);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  return (
    <>
      <CollapsibleEditor
        open={expanded}
        onOpenChange={setExpanded}
        busy={busy}
        draft={!!text}
        title="일괄 등록"
        description="CSV·TSV 내용을 확인하고 수정한 뒤 참가팀을 등록합니다."
      >
        <form
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (!busy) inspect();
          }}
        >
          <p className="text-xs leading-5 text-slate-600">
            헤더: team_name, division, leader_name, leader_email, member1_name,
            member1_email…
          </p>
          <input
            aria-label="참가팀 CSV·TSV 파일"
            type="file"
            accept=".csv,.tsv,text/csv,text/tab-separated-values,text/plain"
            disabled={busy}
            className="block w-full text-xs text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-indigo-50 file:px-3 file:py-2 file:font-semibold file:text-indigo-700"
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              event.currentTarget.value = '';
              if (!file) return;
              readingRef.current = true;
              setReading(true);
              generation.current++;
              setValidation(null);
              const epoch = ++fileGeneration.current,
                owner = lifecycle.current,
                reader = new FileReader();
              reader.onload = () => {
                if (owner.active && epoch === fileGeneration.current) {
                  readingRef.current = false;
                  setReading(false);
                  setOpen(false);
                  setText(String(reader.result ?? ''));
                  setError('');
                  setResult(null);
                }
              };
              reader.onerror = () => {
                if (owner.active && epoch === fileGeneration.current) {
                  readingRef.current = false;
                  setReading(false);
                  setError(
                    '파일을 읽지 못했습니다. UTF-8 CSV·TSV 파일을 다시 선택하세요.',
                  );
                }
              };
              reader.readAsText(file);
            }}
          />
          <textarea
            aria-label="참가팀 일괄 등록 내용"
            value={text}
            disabled={busy}
            className="min-h-44 w-full resize-y rounded-lg border border-slate-200 px-3 py-3 font-mono text-xs leading-5 outline-none focus:border-indigo-400"
            placeholder={
              'team_name,division,leader_name,leader_email,member1_name,member1_email\nTeam A,일반,홍길동,a@example.com,김철수,b@example.com'
            }
            onChange={(event) => {
              fileGeneration.current++;
              generation.current++;
              readingRef.current = false;
              setReading(false);
              setText(event.target.value);
              setResult(null);
              setError('');
            }}
          />
          {reading ? (
            <p role="status" className="text-xs text-slate-500">
              파일을 읽고 있습니다. 완료 후 내용을 확인하세요.
            </p>
          ) : null}
          {error && !open ? (
            <p role="alert" className="text-sm text-rose-700">
              {error}
            </p>
          ) : null}
          {result && !open ? (
            <p role="status" className="text-sm text-slate-700">
              최근 결과: {result.data.created.length}팀 등록 ·{' '}
              {result.data.errors.length}팀 실패
            </p>
          ) : null}
          <button
            type="submit"
            disabled={busy || reading || !text.trim() || !divisions.length}
            className="h-10 w-fit rounded-lg border border-indigo-200 bg-indigo-50 px-4 text-sm font-semibold text-indigo-700 disabled:opacity-50"
          >
            일괄 등록 내용 확인
          </button>
        </form>
      </CollapsibleEditor>
      {open ? (
        <ModalDialog
          size="wide"
          title={result ? '참가팀 등록 결과' : '참가팀 등록 전 확인'}
          description={
            result
              ? '등록된 팀과 실패 원인을 확인하세요.'
              : '아직 등록하지 않았습니다. 내용을 직접 수정할 수 있으며, 수정하면 등록 가능 여부를 다시 확인합니다.'
          }
          onClose={busy ? undefined : close}
          closeOnBackdrop={!busy}
          footer={
            <>
              <ModalButton disabled={busy} onClick={close}>
                닫기
              </ModalButton>
              {result ? (
                result.data.errors.length || result.uncertain ? (
                  <ModalButton tone="primary" onClick={retryFailed}>
                    실패한 내용 수정 · 다시 확인
                  </ModalButton>
                ) : null
              ) : (
                <ModalButton
                  tone="primary"
                  disabled={busy || !valid}
                  onClick={() => void register()}
                >
                  {busy ? '등록 중…' : `확인한 ${rows.length}팀 등록`}
                </ModalButton>
              )}
            </>
          }
        >
          <div className="grid gap-4">
            {error ? (
              <p
                role="alert"
                className="rounded-lg bg-rose-50 p-3 text-sm leading-6 text-rose-800"
              >
                {error}
              </p>
            ) : null}
            {result ? (
              <>
                <p
                  role="status"
                  className="rounded-lg bg-indigo-50 p-3 text-sm font-semibold text-indigo-800"
                >
                  {result.data.created.length}팀 등록 완료 ·{' '}
                  {result.data.errors.length}팀 등록 실패
                </p>
                {result.uncertain ? (
                  <p role="alert" className="text-sm text-rose-700">
                    일부 결과의 행 번호를 확인하지 못했습니다. 참가팀 목록과
                    다시 대조한 뒤 수정하세요.
                  </p>
                ) : null}
                {result.rows.slice(offset, offset + 10).map((row, index) => {
                  const rowNumber = offset + index + 1;
                  const issue = result.data.errors.find(
                    (item) => item.row === rowNumber,
                  );
                  const outcome = result.data.results?.find(
                    (item) => item.row === rowNumber,
                  );
                  const createdIndex =
                    offset +
                    index -
                    result.data.errors.filter((item) => item.row < rowNumber)
                      .length;
                  const created = outcome?.participant_team_id
                    ? result.data.created.find(
                        (team) =>
                          team.participant_team_id ===
                          outcome.participant_team_id,
                      )
                    : result.data.created[createdIndex];
                  return (
                    <div
                      key={offset + index}
                      className="rounded-xl border border-slate-200 p-4 text-sm"
                    >
                      <strong>
                        {row.line}행 ·{' '}
                        {(issue
                          ? row.team.team_name
                          : created?.team_name ||
                            outcome?.team_name ||
                            row.team.team_name) || '(팀명 없음)'}
                      </strong>
                      <p
                        className={
                          issue ? 'mt-2 text-rose-700' : 'mt-2 text-emerald-700'
                        }
                      >
                        {issue
                          ? `등록 실패: ${issue.errors?.map(formatParticipantImportIssue).join(' · ') || (issue.field ? formatParticipantImportIssue({ code: issue.code || '', field: issue.field, message: issue.message }) : issue.message)}`
                          : result.uncertain
                            ? '참가팀 목록에서 등록 결과를 확인하세요.'
                            : '등록 완료'}
                      </p>
                      {!issue && created ? (
                        <div className="mt-2 text-xs leading-6 break-words text-slate-600">
                          <p>
                            참가 유형:{' '}
                            {divisions.find(
                              (division) =>
                                division.division_id === created.division_id,
                            )?.name || created.division_id}
                          </p>
                          {created.members.map((member) => (
                            <p key={member.team_member_id}>
                              {member.role === 'leader' ? '팀장' : '팀원'}:{' '}
                              {member.name} · {member.email}
                            </p>
                          ))}
                        </div>
                      ) : null}
                      {outcome?.warnings?.map((warning, warningIndex) => (
                        <p
                          key={warningIndex}
                          className="mt-2 text-xs leading-6 text-amber-800"
                        >
                          {warning.message}
                        </p>
                      ))}
                    </div>
                  );
                })}
              </>
            ) : (
              <>
                <p className="text-sm text-slate-700">
                  전체 {rows.length}팀 ·{' '}
                  {current?.data
                    ? `등록 가능 ${current.data.summary.ready}팀 · 오류 ${current.data.summary.invalid}팀`
                    : '내용을 확인하고 있습니다.'}
                </p>
                {draft?.corrections.length ? (
                  <div
                    role="status"
                    className="rounded-lg bg-indigo-50 p-3 text-xs leading-6 text-indigo-800"
                  >
                    {draft.corrections.join(' ')}
                  </div>
                ) : null}
                {formatErrors.length ? (
                  <div
                    role="alert"
                    className="rounded-lg bg-rose-50 p-3 text-sm text-rose-800"
                  >
                    <strong>입력 형식을 확인하세요.</strong>
                    <ul className="mt-2 list-disc pl-5">
                      {formatErrors.map((issue, index) => (
                        <li key={index}>{issue}</li>
                      ))}
                    </ul>
                    <p className="mt-2">
                      아래 원본 CSV·TSV를 수정하고 다시 검사할 수 있습니다.
                    </p>
                  </div>
                ) : null}
                {current?.error ? (
                  <div role="alert" className="text-sm text-rose-700">
                    {current.error}{' '}
                    <button
                      className="underline"
                      onClick={() => {
                        setValidation(null);
                        setRetry((value) => value + 1);
                      }}
                    >
                      다시 검사
                    </button>
                  </div>
                ) : null}
                {!current && !formatErrors.length && !sourceDirty ? (
                  <p role="status" className="text-xs text-slate-500">
                    서버에서 중복 이메일·참가 유형과 등록 가능 여부를 확인하고
                    있습니다.
                  </p>
                ) : null}
                <details
                  className="rounded-lg border border-slate-200 p-3"
                  open={!!formatErrors.length}
                >
                  <summary className="cursor-pointer text-sm font-semibold text-slate-700">
                    원본 CSV·TSV 수정
                  </summary>
                  <textarea
                    aria-label="확인창 원본 CSV·TSV"
                    className="mt-3 min-h-32 w-full rounded-lg border border-slate-200 p-2 font-mono text-xs"
                    value={source}
                    disabled={busy}
                    onChange={(event) => {
                      generation.current++;
                      sourceDirtyRef.current = true;
                      setSource(event.target.value);
                      setSourceDirty(true);
                      setValidation(null);
                    }}
                  />
                  <button
                    type="button"
                    disabled={busy}
                    className="mt-2 text-sm font-semibold text-indigo-700"
                    onClick={() => inspect(source)}
                  >
                    원본 다시 검사
                  </button>
                  {sourceDirty ? (
                    <p role="status" className="mt-2 text-xs text-amber-700">
                      원본이 바뀌었습니다. 원본을 다시 검사하면 팀별 수정과
                      등록을 계속할 수 있습니다.
                    </p>
                  ) : null}
                </details>
                <label className="flex items-center gap-2 text-sm text-slate-600">
                  <input
                    type="checkbox"
                    checked={onlyErrors}
                    onChange={(event) => {
                      setOnlyErrors(event.target.checked);
                      setPage(1);
                    }}
                  />
                  오류가 있는 팀만 보기
                </label>
                {onlyErrors && !shown.length ? (
                  <p role="status" className="text-sm text-slate-500">
                    현재 표시할 오류가 없습니다.
                  </p>
                ) : null}
                {shown.slice(offset, offset + 10).map(({ row, index }) => {
                  const server = current?.data?.rows[index];
                  const issues = [
                    ...row.warnings,
                    ...localErrors[index],
                    ...(server?.errors.map(formatParticipantImportIssue) ?? []),
                  ];
                  const prefix = `${row.line}행`;
                  const person = (
                    member: { name: string; email: string },
                    memberIndex: number | null,
                  ) => {
                    const role =
                      memberIndex === null ? '팀장' : `팀원 ${memberIndex + 1}`;
                    return (
                      <div className="grid gap-3 sm:grid-cols-2">
                        <Field
                          label={`${role} 이름`}
                          ariaLabel={`${prefix} ${role} 이름`}
                          value={member.name}
                          disabled={editingBlocked}
                          onChange={(value) =>
                            changeRow(index, (team) => {
                              (memberIndex === null
                                ? team.leader
                                : team.members[memberIndex]
                              ).name = value;
                            })
                          }
                        />
                        <Field
                          label={`${role} 이메일`}
                          ariaLabel={`${prefix} ${role} 이메일`}
                          value={member.email}
                          disabled={editingBlocked}
                          onChange={(value) =>
                            changeRow(index, (team) => {
                              (memberIndex === null
                                ? team.leader
                                : team.members[memberIndex]
                              ).email = value;
                            })
                          }
                        />
                      </div>
                    );
                  };
                  return (
                    <fieldset
                      key={index}
                      className="grid min-w-0 gap-3 rounded-xl border border-slate-200 p-4"
                    >
                      <legend className="px-1 text-sm font-bold text-slate-800">
                        원본 {row.line}행 · 팀 {index + 1}
                      </legend>
                      <button
                        type="button"
                        disabled={editingBlocked}
                        className="justify-self-end text-xs text-slate-500 underline"
                        onClick={() => {
                          const next = structuredClone(draftRef.current!);
                          next.rows.splice(index, 1);
                          replaceDraft(next);
                          if (
                            !next.errors.length &&
                            !next.rows.some((item) => item.warnings.length) &&
                            !sourceDirtyRef.current
                          )
                            setSource(
                              serializeTeamImportRows(
                                next.rows.map((item) => item.team),
                              ),
                            );
                        }}
                      >
                        이 팀 제외
                      </button>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <Field
                          label="팀명"
                          ariaLabel={`${prefix} 팀명`}
                          value={row.team.team_name}
                          disabled={editingBlocked}
                          onChange={(value) =>
                            changeRow(index, (team) => {
                              team.team_name = value;
                            })
                          }
                        />
                        <label className="grid gap-1 text-xs font-semibold text-slate-600">
                          참가 유형
                          <Select
                            aria-label={`${prefix} 참가 유형`}
                            value={row.team.division_id}
                            disabled={editingBlocked}
                            className={fieldClass}
                            onChange={(event) =>
                              changeRow(index, (team) => {
                                team.division_id = event.target.value;
                              })
                            }
                          >
                            {!divisions.some(
                              (division) =>
                                division.division_id === row.team.division_id,
                            ) ? (
                              <option value={row.team.division_id}>
                                확인 필요: {row.team.division_id || '유형 선택'}
                              </option>
                            ) : null}
                            {divisions.map((division) => (
                              <option
                                key={division.division_id}
                                value={division.division_id}
                              >
                                {division.name} · {division.code}
                              </option>
                            ))}
                          </Select>
                        </label>
                      </div>
                      {person(row.team.leader, null)}
                      {row.team.members.map((member, memberIndex) => (
                        <div key={memberIndex} className="grid gap-1">
                          {person(member, memberIndex)}
                          <button
                            type="button"
                            disabled={editingBlocked}
                            className="justify-self-end text-xs text-slate-500 underline"
                            onClick={() =>
                              changeRow(index, (team) => {
                                team.members.splice(memberIndex, 1);
                              })
                            }
                          >
                            {memberIndex + 1}번 팀원 삭제
                          </button>
                        </div>
                      ))}
                      <button
                        type="button"
                        disabled={editingBlocked}
                        className="w-fit text-xs font-semibold text-indigo-700"
                        onClick={() =>
                          changeRow(index, (team) => {
                            team.members.push({ name: '', email: '' });
                          })
                        }
                      >
                        팀원 추가
                      </button>
                      {issues.length ? (
                        <ul className="list-disc pl-5 text-xs leading-6 text-rose-700">
                          {[...new Set(issues)].map((issue) => (
                            <li key={issue}>{issue}</li>
                          ))}
                        </ul>
                      ) : server?.valid ? (
                        <p className="text-xs text-emerald-700">
                          등록 가능한 내용입니다.
                        </p>
                      ) : null}
                      {server?.warnings.length ? (
                        <ul className="list-disc pl-5 text-xs leading-6 text-amber-700">
                          {server.warnings.map((issue, issueIndex) => (
                            <li key={issueIndex}>
                              {formatParticipantImportIssue(issue)}
                            </li>
                          ))}
                        </ul>
                      ) : null}
                      {server?.corrections.length ? (
                        <ul className="list-disc pl-5 text-xs leading-6 text-indigo-700">
                          {server.corrections.map(
                            (correction, correctionIndex) => (
                              <li key={correctionIndex}>
                                {correction.message} (
                                {String(correction.before)} →{' '}
                                {String(correction.after)})
                              </li>
                            ),
                          )}
                        </ul>
                      ) : null}
                    </fieldset>
                  );
                })}
              </>
            )}
            {pages > 1 ? (
              <nav
                aria-label="일괄 등록 확인 페이지"
                className="flex flex-wrap items-center justify-between gap-3 text-xs text-slate-600"
              >
                <span>
                  {displayedPage} / {pages}페이지 · 한 번에 10팀 표시
                </span>
                <div className="flex gap-3">
                  <button
                    type="button"
                    disabled={displayedPage <= 1}
                    onClick={() => setPage(displayedPage - 1)}
                  >
                    이전
                  </button>
                  <button
                    type="button"
                    disabled={displayedPage >= pages}
                    onClick={() => setPage(displayedPage + 1)}
                  >
                    다음
                  </button>
                </div>
              </nav>
            ) : null}
          </div>
        </ModalDialog>
      ) : null}
    </>
  );
}

function Field({
  label,
  ariaLabel,
  value,
  disabled,
  onChange,
}: {
  label: string;
  ariaLabel: string;
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <label className="grid min-w-0 gap-1 text-xs font-semibold text-slate-600">
      {label}
      <input
        aria-label={ariaLabel}
        className={fieldClass}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}
