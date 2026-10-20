import { useMatch } from 'react-router-dom';
import HeaderAuthControls from '@/components/layout/HeaderAuthControls';
import HeaderShell, {
  type HeaderNavItem,
} from '@/components/layout/HeaderShell';
import { navigationRoutes } from '@/routes/routeConfig';

export default function Header() {
  const contestNestedMatch = useMatch('/contests/:contestId/*');
  const contestExactMatch = useMatch('/contests/:contestId');
  const contestMatch = contestNestedMatch ?? contestExactMatch;
  const contestId = contestMatch?.params.contestId;
  const navItems: HeaderNavItem[] = navigationRoutes.map(
    ({ name, path, navigationBadge }) => ({
      end: path === '/contests',
      key: path,
      label: name,
      badge: navigationBadge,
      to: path,
    }),
  );

  if (contestId) {
    navItems.push({
      activeClassName: 'text-zoj-blue',
      key: `contest-${contestId}`,
      label: '대회 개요',
      to: `/contests/${contestId}`,
    });
  }

  return (
    <HeaderShell
      actions={<HeaderAuthControls loginTo="/login" />}
      ariaLabel="Main navigation"
      navItems={navItems}
    />
  );
}
