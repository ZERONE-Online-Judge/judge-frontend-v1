import Select from '@/shared/ui/Select';
import ContestEmergencyNotice from '@/components/contest/ContestEmergencyNotice';
import { useState, type FormEvent, type ReactNode } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import type { PublicContestDetail } from '@/domains/contestAdministration/types';
import type { GeneralSession } from '@/domains/identityAccess/types';
import { tokenQueryIdentity } from '@/domains/identityAccess/queryIdentity';
import { useSessionStore } from '@/domains/identityAccess/sessionStore';
import {
  createParticipantPreviewSession,
  getParticipantPreview,
} from '@/domains/teamParticipation/api';
import { formatApiError } from '@/shared/api/errors';
import PageNotice from '@/shared/ui/PageNotice';

export default function ParticipantPreviewShell({
  children,
  contestId,
  session,
}: {
  children: (detail: PublicContestDetail) => ReactNode;
  contestId: string;
  session: GeneralSession;
}) {
  const navigate = useNavigate();
  const participantSession = useSessionStore(
    (state) => state.participantSession,
  );
  const setParticipantSession = useSessionStore(
    (state) => state.setParticipantSession,
  );
  const [divisionId, setDivisionId] = useState('');
  const activeSession =
    participantSession?.contestId === contestId &&
    participantSession.isPreview &&
    participantSession.member.email === session.account.email
      ? participantSession
      : null;
  const preview = useQuery({
    queryKey: [
      'participant-preview',
      contestId,
      tokenQueryIdentity(session.accessToken),
    ],
    queryFn: () => getParticipantPreview(contestId, session.accessToken),
    refetchInterval: 15_000,
    refetchOnMount: 'always',
  });
  const activeDivision =
    preview.isFetchedAfterMount &&
    preview.data?.selected_division_id === activeSession?.division.division_id
      ? preview.data?.divisions.find(
          (division) =>
            division.division_id === activeSession?.division.division_id,
        )
      : undefined;
  const selectedDivisionId =
    divisionId ||
    activeDivision?.division_id ||
    preview.data?.selected_division_id ||
    preview.data?.divisions[0]?.division_id ||
    '';
  const start = useMutation({
    mutationFn: () =>
      createParticipantPreviewSession(
        contestId,
        session.accessToken,
        selectedDivisionId,
      ),
    onSuccess: async (next) => {
      setParticipantSession(next);
      setDivisionId('');
      await preview.refetch();
      navigate(`/contests/${encodeURIComponent(contestId)}`, { replace: true });
    },
  });

  function handleStart(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedDivisionId || start.isPending) return;
    start.mutate();
  }

  return (
    <section className="zoj-contest-shell mx-auto grid w-full max-w-[112rem] min-w-0 gap-5 px-4 py-6 font-sans sm:gap-6 sm:px-6 sm:py-8 lg:px-8">
      <section
        className="grid gap-4 rounded-xl border border-amber-200 bg-amber-50 p-5"
        aria-label="참가자 미리보기"
      >
        <div className="grid gap-1">
          <h1 className="text-lg font-semibold text-amber-950">
            참가자 미리보기
          </h1>
          <p className="text-sm leading-6 text-amber-800">
            {preview.data?.contest.title
              ? `${preview.data.contest.title} · `
              : ''}
            참가 유형을 선택해 대회 전 문제 풀이, 제출과 게시판을 점검하세요.
            미리보기 제출과 게시글은 실제 참가팀 기록에 반영되지 않습니다.
          </p>
        </div>
        {preview.isPending ? (
          <PageNotice
            message="미리보기 정보를 불러오는 중입니다."
            status="loading"
          />
        ) : null}
        {preview.error ? (
          <PageNotice
            message={formatApiError(
              preview.error,
              '미리보기 권한을 확인하지 못했습니다.',
            )}
            status="error"
          />
        ) : null}
        {preview.data && !preview.error ? (
          preview.data.divisions.length ? (
            <form
              className="flex flex-wrap items-end gap-3"
              onSubmit={handleStart}
            >
              <label className="grid min-w-40 flex-1 gap-2 text-sm font-medium text-amber-950 sm:max-w-sm">
                참가 유형
                <Select
                  className="h-11 rounded-lg border border-amber-200 bg-white px-3 text-slate-900"
                  value={selectedDivisionId}
                  onChange={(event) => setDivisionId(event.target.value)}
                  disabled={start.isPending}
                >
                  {preview.data.divisions.map((division) => (
                    <option
                      key={division.division_id}
                      value={division.division_id}
                    >
                      {division.name}
                    </option>
                  ))}
                </Select>
              </label>
              <button
                className="h-11 rounded-lg bg-amber-900 px-5 text-sm font-semibold text-white disabled:opacity-50"
                disabled={
                  start.isPending ||
                  !selectedDivisionId ||
                  activeDivision?.division_id === selectedDivisionId
                }
                type="submit"
              >
                {start.isPending
                  ? '준비 중…'
                  : activeDivision
                    ? '유형 변경'
                    : '미리보기 시작'}
              </button>
              {activeDivision ? (
                <p className="py-3 text-sm text-amber-800" role="status">
                  현재 {activeDivision.name} 참가자 화면
                </p>
              ) : null}
            </form>
          ) : (
            <PageNotice
              message="등록된 참가 유형이 없습니다. 대회 운영자에게 유형 등록을 요청하세요."
              status="idle"
            />
          )
        ) : null}
        {start.error ? (
          <PageNotice
            message={formatApiError(
              start.error,
              '참가자 미리보기를 시작하지 못했습니다.',
            )}
            status="error"
          />
        ) : null}
      </section>
      {preview.data && !preview.error && activeDivision && !start.isPending ? (
        <>
          <ContestEmergencyNotice
            contestId={contestId}
            notice={preview.data.contest.emergency_notice ?? ''}
            template={preview.data.contest.emergency_notice_template}
            contest={preview.data.contest}
          />
          {children(preview.data)}
        </>
      ) : null}
    </section>
  );
}
