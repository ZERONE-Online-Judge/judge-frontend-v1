import { useState } from 'react';
import { Link } from 'react-router-dom';
import ContestAccessDeniedModal from '@/components/contest/ContestAccessDeniedModal';
import { contestListItemText } from '@/data/uiText';
import { useSessionStore } from '@/domains/identityAccess/sessionStore';
import { contestLoginPath } from '@/shared/lib/loginRedirect';
import { SvgIcon } from '@/utils/Icons';

export type ContestCardData = {
  contestId?: string;
  title: string;
  organization: string;
  status: string;
  period?: string;
  registrationDeadline?: string;
  isOpen?: boolean;
  href?: string;
};

type ContestCardProps = ContestCardData & {
  className?: string;
};

export default function ContestCard({
  contestId,
  title,
  organization,
  status,
  period,
  registrationDeadline,
  isOpen = false,
  href,
  className,
}: ContestCardProps) {
  const [isAccessDeniedOpen, setIsAccessDeniedOpen] = useState(false);
  const [isUnavailableMessageVisible, setIsUnavailableMessageVisible] =
    useState(false);
  const generalSession = useSessionStore((state) => state.generalSession);
  const contestHref = contestId
    ? `/contests/${encodeURIComponent(contestId)}`
    : undefined;
  const loginHref =
    contestId && contestHref
      ? contestLoginPath(contestId, contestHref)
      : undefined;
  const isParticipantContest = contestId
    ? generalSession?.participantContests.some(
        (item) => item.contest.contest_id === contestId,
      )
    : true;
  const isOperatorContest = Boolean(
    contestId &&
    generalSession?.operatorContests.some(
      (item) => item.contest.contest_id === contestId,
    ),
  );
  const canOpenContest =
    !generalSession || !contestId || isParticipantContest || isOperatorContest;
  const cardHref = canOpenContest
    ? (href ??
      (isOperatorContest
        ? `/operator/contests/${encodeURIComponent(contestId!)}`
        : generalSession
          ? contestHref
          : loginHref))
    : undefined;
  const canShowUnavailableMessage = canOpenContest && !cardHref;
  const cardClassName = [
    'zoj-card transition',
    cardHref || !canOpenContest || canShowUnavailableMessage
      ? 'hover:border-zoj-blue hover:shadow-sm'
      : 'opacity-70',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  const cardContent = (
    <>
      <div className="mb-5 flex flex-wrap items-center gap-2">
        {isOperatorContest ? (
          <span className="rounded-full bg-amber-50 px-4 py-1.5 text-sm font-semibold text-amber-800">
            운영
          </span>
        ) : null}
        {isParticipantContest ? (
          <span className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-4 py-1.5">
            <span className="bg-zoj-blue size-2 rounded-full" />
            <span className="text-sm font-semibold text-slate-700">
              내 참가
            </span>
          </span>
        ) : null}
        <span className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-4 py-1.5">
          <span
            className={
              isOpen
                ? 'size-2 rounded-full bg-emerald-500'
                : 'size-2 rounded-full bg-slate-300'
            }
          />
          <span className="text-sm font-semibold text-slate-700">{status}</span>
        </span>
      </div>

      <h3 className="min-h-16 text-xl leading-8 font-semibold break-keep text-slate-950">
        {title}
      </h3>
      <p className="mt-4 text-base font-medium break-keep text-slate-400">
        {organization}
      </p>

      <div className="mt-5 flex flex-wrap gap-2">
        {period ? (
          <span className="bg-zoj-blue/10 text-zoj-blue inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold">
            <SvgIcon name="timer" size={14} />
            {contestListItemText.periodPrefix}: {period}
          </span>
        ) : null}
        {registrationDeadline ? (
          <span className="bg-slate-100 px-3 py-1.5 text-sm font-semibold text-slate-600">
            {contestListItemText.registrationDeadlinePrefix}:{' '}
            {registrationDeadline}
          </span>
        ) : null}
      </div>
    </>
  );

  return (
    <li className={cardClassName}>
      {cardHref ? (
        <Link className="-m-8 block h-[calc(100%+4rem)] p-8" to={cardHref}>
          {cardContent}
        </Link>
      ) : !canOpenContest ? (
        <>
          <button
            aria-haspopup="dialog"
            className="-m-8 block h-[calc(100%+4rem)] w-[calc(100%+4rem)] cursor-pointer p-8 text-left"
            onClick={() => setIsAccessDeniedOpen(true)}
            type="button"
          >
            {cardContent}
          </button>
          {isAccessDeniedOpen ? (
            <ContestAccessDeniedModal
              onClose={() => setIsAccessDeniedOpen(false)}
            />
          ) : null}
        </>
      ) : canShowUnavailableMessage ? (
        <button
          className="-m-8 block h-[calc(100%+4rem)] w-[calc(100%+4rem)] p-8 text-left"
          onClick={() => setIsUnavailableMessageVisible(true)}
          type="button"
        >
          {cardContent}
          {isUnavailableMessageVisible ? (
            <p
              className="mt-5 rounded border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-800"
              role="alert"
            >
              {contestListItemText.unavailableMessage}
            </p>
          ) : null}
        </button>
      ) : (
        cardContent
      )}
    </li>
  );
}
