import ContestProgressStatus from '@/components/contest/ContestProgressStatus';
import type { Contest } from '@/domains/contestAdministration/types';

export default function OperatorContestStatus(props: {
  contest: Contest;
  canManageSettings: boolean;
  stale?: boolean;
}) {
  return <ContestProgressStatus {...props} audience="operator" />;
}
