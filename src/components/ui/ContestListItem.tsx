import { contestListItemText } from '@/data/uiText';
import ContestDirectoryCardContent, {
  type ContestDirectoryMeta,
} from '@/components/ui/ContestDirectoryCardContent';
import { Link } from 'react-router-dom';
import { useSessionStore } from '@/domains/identityAccess/sessionStore';
import { SvgIcon } from '@/utils/Icons';

export type ContestListItemData = {
  contestId: string;
  title: string;
  organization: string;
  status: string;
  operatorOnlyVisible?: boolean;
  countdownLabel?: string;
  period?: string;
  registrationDeadline?: string;
  isOpen?: boolean;
  publicResourceLabels?: string[];
  href?: string;
  directoryMeta?: ContestDirectoryMeta;
};

type ContestListItemProps = ContestListItemData;

export default function ContestListItem({
  contestId,
  title,
  organization,
  status,
  operatorOnlyVisible = false,
  countdownLabel,
  period,
  registrationDeadline,
  isOpen = false,
  publicResourceLabels = [],
  href,
  directoryMeta,
}: ContestListItemProps) {
  const generalSession = useSessionStore((state) => state.generalSession);
  const contestHref = `/contests/${encodeURIComponent(contestId)}`;
  const isParticipantContest = generalSession?.participantContests.some(
    (item) => item.contest.contest_id === contestId,
  );
  const isOperatorContest = generalSession?.operatorContests.some(
    (item) => item.contest.contest_id === contestId,
  );
  const operatorHref = `/operator/contests/${encodeURIComponent(contestId)}`;
  const itemHref = href ?? (isOperatorContest ? operatorHref : contestHref);

  const content = directoryMeta ? (
    <ContestDirectoryCardContent
      title={title}
      organization={organization}
      meta={directoryMeta}
      participant={Boolean(isParticipantContest)}
      operator={Boolean(isOperatorContest || href?.startsWith('/operator/'))}
      privateContest={operatorOnlyVisible}
      countdown={countdownLabel}
      publicLabels={publicResourceLabels}
    />
  ) : (
    <div className="flex min-w-0 flex-col gap-4 md:flex-row md:items-center md:justify-between">
      <div className="grid min-w-0 gap-3 sm:gap-4">
        <div className="flex flex-wrap items-center gap-2">
          {isParticipantContest ? (
            <span className="inline-flex h-7 items-center gap-2 rounded-full bg-sky-50 px-3 text-xs font-black text-sky-700">
              <span className="size-2 rounded-full bg-sky-500" />
              <span>내 참가</span>
            </span>
          ) : null}
          {isOperatorContest ? (
            <span className="inline-flex h-7 items-center gap-2 rounded-full bg-indigo-50 px-3 text-xs font-black text-indigo-700">
              <span className="size-2 rounded-full bg-indigo-500" />
              <span>운영</span>
            </span>
          ) : null}
          <span className="inline-flex h-7 items-center gap-2 rounded-full bg-slate-100 px-3 text-xs font-black text-slate-700">
            <span
              className={
                isOpen
                  ? 'size-2 rounded-full bg-emerald-500'
                  : 'size-2 rounded-full bg-slate-300'
              }
            />
            {status}
            {operatorOnlyVisible ? (
              <span className="text-slate-400">* 비공개됨</span>
            ) : null}
          </span>
          <span className="min-w-0 text-xs font-bold break-keep text-slate-400 sm:text-sm">
            {organization}
          </span>
        </div>
        <h2 className="text-lg leading-6 font-black break-keep text-slate-950 sm:text-xl sm:leading-7">
          {title}
        </h2>
        {publicResourceLabels.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {publicResourceLabels.map((label) => (
              <span
                className="inline-flex h-7 items-center rounded-full bg-emerald-50 px-3 text-xs font-black text-emerald-700"
                key={label}
              >
                {label}
              </span>
            ))}
          </div>
        ) : null}
      </div>

      <div className="flex w-full shrink-0 flex-wrap gap-2 md:w-auto md:justify-end">
        {countdownLabel ? (
          <span className="inline-flex items-center gap-1.5 bg-amber-50 px-2.5 py-1.5 text-xs font-black text-amber-700 sm:px-3 sm:text-sm">
            <SvgIcon name="timer" size={14} />
            {countdownLabel}
          </span>
        ) : null}
        {period ? (
          <span className="bg-zoj-blue/15 text-zoj-blue inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-bold sm:px-3 sm:text-sm">
            <SvgIcon name="timer" size={14} />
            {contestListItemText.periodPrefix}: {period}
          </span>
        ) : null}
        {registrationDeadline ? (
          <span className="bg-slate-100 px-2.5 py-1.5 text-xs font-bold text-slate-600 sm:px-3 sm:text-sm">
            {contestListItemText.registrationDeadlinePrefix}:{' '}
            {registrationDeadline}
          </span>
        ) : null}
      </div>
    </div>
  );

  return (
    <li
      className={[
        directoryMeta ? 'directory-card' : '',
        'zoj-surface zoj-surface-hover relative overflow-hidden rounded border border-slate-200 bg-white transition',
        'hover:border-zoj-blue hover:shadow-sm',
      ].join(' ')}
    >
      {!directoryMeta && (isParticipantContest || isOperatorContest) ? (
        <span
          aria-hidden="true"
          className={[
            'absolute inset-y-0 left-0 w-2',
            isOperatorContest ? 'bg-indigo-500' : 'bg-sky-500',
          ].join(' ')}
        />
      ) : null}
      <Link
        className="block px-4 py-5 transition-colors duration-200 sm:px-6 sm:py-6 lg:px-8 lg:py-7"
        to={itemHref}
      >
        {content}
      </Link>
    </li>
  );
}
