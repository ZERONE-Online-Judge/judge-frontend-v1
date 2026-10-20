import { useLocation } from 'react-router-dom';
import HeaderAuthControls from '@/components/layout/HeaderAuthControls';
import HeaderShell, {
  type HeaderNavItem,
} from '@/components/layout/HeaderShell';
import { contestHeaderNavText } from '@/data/uiText';
import { contestLoginPath } from '@/shared/lib/loginRedirect';

type ContestHeaderProps = {
  contestId: string;
};

function contestNavItems(contestId: string): HeaderNavItem[] {
  return contestHeaderNavText.map(({ name, path }) => ({
    end: !path,
    key: path || 'overview',
    label: name,
    to: path ? `/contests/${contestId}/${path}` : `/contests/${contestId}`,
  }));
}

export default function ContestHeader({ contestId }: ContestHeaderProps) {
  const location = useLocation();
  const currentPath = `${location.pathname}${location.search}`;

  return (
    <HeaderShell
      actions={
        <HeaderAuthControls
          loginTo={contestLoginPath(contestId, currentPath)}
        />
      }
      ariaLabel="Contest navigation"
      navItems={contestNavItems(contestId)}
    />
  );
}
