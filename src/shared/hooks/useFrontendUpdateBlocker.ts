import { useLayoutEffect } from 'react';
import {
  acquireFrontendUpdateBlocker,
  type FrontendUpdateBlockerKind,
} from '@/shared/lib/frontendUpdateSafety';

/** Keep drafts and multi-step operations intact when a new frontend is deployed. */
export function useFrontendUpdateBlocker(
  active: boolean,
  kind: FrontendUpdateBlockerKind = 'draft',
) {
  useLayoutEffect(() => {
    if (active) return acquireFrontendUpdateBlocker(kind);
  }, [active, kind]);
}
