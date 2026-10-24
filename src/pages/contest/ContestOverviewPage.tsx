import ContestTeamRoster from '@/components/contest/ContestTeamRoster';
import { getParticipantSessionMe } from '@/domains/teamParticipation/api';
import ContestParticipantSummary from '@/components/contest/ContestParticipantSummary';
import ContestPublicOverview from '@/components/contest/ContestPublicOverview';
import ContestProgressStatus from '@/components/contest/ContestProgressStatus';
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { PageHeading } from '@/components/common/PageLayout';
import ContestPageFrame from '@/components/contest/ContestPageFrame';
import ContestPageNavigation from '@/components/contest/ContestPageNavigation';
import ContestPageShell from '@/components/contest/ContestPageShell';
import NoticeSection from '@/components/main/NoticeSection';
import {
  canViewContestResource,
  contestAccessPhase,
  contestResourceAccess,
  contestResourceAccessMessage,
} from '@/domains/contestAdministration/logic';
import type {
  Contest,
  Division,
  PublicContestDetail,
} from '@/domains/contestAdministration/types';
import {
  contestQueryKeys,
  generalSessionQueryIdentity,
  participantSessionQueryIdentity,
} from '@/domains/contestRuntime/queryKeys';
import { useContestParticipantSession } from '@/domains/contestRuntime/useContestParticipantSession';
import { getContestNotices } from '@/domains/serviceCommunication/api';
import type { ContestNotice } from '@/domains/serviceCommunication/types';
import { formatDateTime } from '@/shared/lib/dateTime';
import PageNotice from '@/shared/ui/PageNotice';

type OverviewIcon = 'user' | 'team';

type OverviewCardProps = {
  icon: OverviewIcon;
  title: string;
  subtitle: string;
};

function OverviewIconBadge({ icon }: { icon: OverviewIcon }) {
  return (
    <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[#eee8ff] text-[#7c5cff]">
      {icon === 'user' ? (
        <svg
          aria-hidden="true"
          className="size-7"
          fill="none"
          viewBox="0 0 24 24"
        >
          <path
            d="M12 12.25a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM5.75 19.25a6.25 6.25 0 0 1 12.5 0"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2.1"
          />
        </svg>
      ) : null}
      {icon === 'team' ? (
        <svg
          aria-hidden="true"
          className="size-7"
          fill="none"
          viewBox="0 0 24 24"
        >
          <path
            d="M14 8a3 3 0 1 1-6 0 3 3 0 0 1 6 0ZM4 20v-2a6 6 0 0 1 12 0v2M17 5a3 3 0 0 1 0 6M20 20v-2a6 6 0 0 0-3-5.2"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.7"
          />
        </svg>
      ) : null}
    </span>
  );
}

function OverviewCard({ icon, title, subtitle }: OverviewCardProps) {
  return (
    <article className="zoj-overview-card zoj-card flex items-start gap-4">
      <OverviewIconBadge icon={icon} />
      <div>
        <h2 className="text-lg font-semibold tracking-tight break-words text-slate-900">
          {title}
        </h2>
        <p className="mt-1 text-sm leading-6 break-all text-slate-500">
          {subtitle}
        </p>
      </div>
    </article>
  );
}

function sortNotices(notices: ContestNotice[]) {
  return [...notices].sort(
    (a, b) =>
      Number(b.emergency) - Number(a.emergency) ||
      Number(b.pinned) - Number(a.pinned) ||
      new Date(b.published_at).getTime() - new Date(a.published_at).getTime(),
  );
}

function noticeBadgeLabel(notice: ContestNotice) {
  const base = notice.pinned ? '고정' : '공지';
  return notice.emergency ? `${base} · 긴급` : base;
}

function NoticePreview({
  contestId,
  notices,
  isError,
  isLoading,
  unavailableMessage,
}: {
  contestId: string;
  notices: ContestNotice[];
  isError: boolean;
  isLoading: boolean;
  unavailableMessage?: string;
}) {
  return (
    <NoticeSection
      notices={notices.map((notice) => ({
        date: formatDateTime(notice.published_at),
        href: `/contests/${contestId}/board?noticeId=${encodeURIComponent(
          notice.contest_notice_id,
        )}`,
        label: noticeBadgeLabel(notice),
        title: notice.title,
        tone: notice.pinned ? 'pinned' : 'default',
      }))}
      title="공지사항"
      titleHref={`/contests/${contestId}/board`}
      titleSize="small"
    >
      {unavailableMessage || isLoading || isError || notices.length === 0 ? (
        <div className="border-y border-slate-200">
          {unavailableMessage ? (
            <PageNotice message={unavailableMessage} status="idle" />
          ) : null}
          {isLoading ? (
            <PageNotice
              message="공지사항을 불러오는 중입니다."
              status="loading"
            />
          ) : null}
          {isError ? (
            <PageNotice
              message="공지사항을 불러오지 못했습니다."
              status="error"
            />
          ) : null}
          {!unavailableMessage &&
          !isLoading &&
          !isError &&
          notices.length === 0 ? (
            <p className="zoj-contest-empty">표시할 공지사항이 없습니다.</p>
          ) : null}
        </div>
      ) : null}
    </NoticeSection>
  );
}

function ContestOverviewContent({
  contest,
  divisions,
}: {
  contest: Contest;
  divisions: Division[];
}) {
  const {
    activeParticipantSession,
    isPreview,
    ensureParticipantSession,
    generalSession,
    participantContest,
    participantSession,
    token,
  } = useContestParticipantSession(contest.contest_id);
  const roster = useQuery({
    queryKey: [
      'participant-roster',
      contest.contest_id,
      participantSessionQueryIdentity(
        activeParticipantSession,
        participantContest,
      ),
    ],
    enabled: Boolean(
      activeParticipantSession &&
      !activeParticipantSession.team.members &&
      !participantContest?.team.members,
    ),
    queryFn: async () => {
      const session = await ensureParticipantSession();
      if (!session) throw new Error('참가자 세션이 필요합니다.');
      return getParticipantSessionMe(contest.contest_id, session.accessToken);
    },
  });
  const noticeAccess = contestResourceAccess(contest, 'notice');
  const hasParticipantAccess = Boolean(
    participantContest || activeParticipantSession,
  );
  const generalQueryIdentity = generalSessionQueryIdentity(generalSession);
  const participantQueryIdentity = participantSessionQueryIdentity(
    activeParticipantSession,
    participantContest,
  );
  const canViewNotices =
    isPreview ||
    contestAccessPhase(contest) !== 'ended' ||
    canViewContestResource(contest, hasParticipantAccess, noticeAccess);
  const noticesQuery = useQuery({
    enabled: canViewNotices,
    queryKey: contestQueryKeys.notices(
      contest.contest_id,
      generalQueryIdentity,
      participantContest?.contest.contest_id,
      participantQueryIdentity,
    ),
    queryFn: async () => {
      const session =
        participantContest ||
        activeParticipantSession ||
        noticeAccess === 'participants'
          ? await ensureParticipantSession()
          : null;
      return getContestNotices(
        contest.contest_id,
        session?.accessToken ?? token,
      );
    },
    refetchInterval: 5_000,
    refetchIntervalInBackground: false,
  });
  const notices = useMemo(
    () => sortNotices(noticesQuery.data ?? []),
    [noticesQuery.data],
  );
  const teamName =
    participantContest?.team.team_name ??
    (participantSession?.contestId === contest.contest_id
      ? participantSession.team.team_name
      : '팀 정보 없음');
  const memberName =
    participantContest?.member.name ??
    participantSession?.member.name ??
    generalSession?.account.display_name ??
    '로그인 필요';
  const memberEmail =
    participantContest?.member.email ??
    participantSession?.member.email ??
    generalSession?.account.email ??
    '참가자 이메일';
  const divisionName =
    participantContest?.division.name ??
    participantSession?.division.name ??
    divisions[0]?.name ??
    'division';

  return (
    <ContestPageFrame>
      <PageHeading
        className="gap-3"
        description={divisionName}
        title={contest.title}
        variant="contest"
      />

      <ContestPageNavigation contest={contest} contestId={contest.contest_id} />

      <div className="mt-6">
        <ContestProgressStatus contest={contest} />
      </div>

      <ContestParticipantSummary contest={contest} />

      <section className="zoj-overview-cards mt-4 grid gap-4">
        <OverviewCard icon="user" subtitle={memberEmail} title={memberName} />
        <ContestTeamRoster
          teamName={teamName}
          divisionName={divisionName}
          members={
            roster.data?.team.members ??
            participantContest?.team.members ??
            activeParticipantSession?.team.members
          }
          currentEmail={memberEmail}
          currentName={memberName}
        />
      </section>

      <div className="zoj-overview-notices zoj-card mt-6">
        <NoticePreview
          contestId={contest.contest_id}
          isError={noticesQuery.isError}
          isLoading={canViewNotices && noticesQuery.isPending}
          notices={notices}
          unavailableMessage={
            canViewNotices
              ? undefined
              : contestResourceAccessMessage(
                  contest,
                  'notice',
                  hasParticipantAccess,
                )
          }
        />
      </div>
    </ContestPageFrame>
  );
}

function ContestOverview({ detail }: { detail: PublicContestDetail }) {
  const { participantContest, activeParticipantSession, isPreview } =
    useContestParticipantSession(detail.contest.contest_id);
  if (!isPreview && !participantContest && !activeParticipantSession) {
    return <ContestPublicOverview detail={detail} />;
  }
  return (
    <ContestOverviewContent
      contest={detail.contest}
      divisions={detail.divisions}
    />
  );
}

export default function ContestOverviewPage() {
  return (
    <ContestPageShell>
      {(detail) => <ContestOverview detail={detail} />}
    </ContestPageShell>
  );
}
