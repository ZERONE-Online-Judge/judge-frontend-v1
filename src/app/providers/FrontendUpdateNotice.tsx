import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useIsMutating } from '@tanstack/react-query';
import { useLocation } from 'react-router-dom';
import { queryClient } from '@/shared/query/queryClient';
import {
  acquireFrontendUpdateBlocker,
  getFrontendUpdateSafety,
  subscribeFrontendUpdateSafety,
} from '@/shared/lib/frontendUpdateSafety';
import {
  claimFrontendReload,
  isPresentationUpdateDeferred,
  type FrontendVersion,
} from '@/shared/lib/frontendVersion';
import { startFrontendVersionMonitor } from '@/shared/lib/frontendVersionMonitor';
import ModalDialog, { ModalButton } from '@/shared/ui/ModalDialog';

const currentVersion = import.meta.env.VITE_FRONTEND_VERSION as
  | string
  | undefined;

function editableFocused() {
  return (
    document.activeElement?.matches(
      'input:not([type=button]):not([type=submit]), textarea, select, [contenteditable=true], [role=textbox]',
    ) ?? false
  );
}

function operationPending() {
  return (
    getFrontendUpdateSafety().operations > 0 || queryClient.isMutating() > 0
  );
}

function reloadToVersion(version: FrontendVersion) {
  const url = new URL(window.location.href);
  url.searchParams.set('__zojFrontendVersion', version.version);
  window.location.replace(url.toString());
}

export default function FrontendUpdateNotice() {
  const { pathname, key: locationKey } = useLocation();
  const [pending, setPending] = useState<FrontendVersion | null>(null);
  const [confirmationKey, setConfirmationKey] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState('');
  const safety = useSyncExternalStore(
    subscribeFrontendUpdateSafety,
    getFrontendUpdateSafety,
  );
  const mutations = useIsMutating();
  const monitor = useRef<ReturnType<typeof startFrontendVersionMonitor> | null>(
    null,
  );
  const updateGeneration = useRef(0);
  const presentation = isPresentationUpdateDeferred(pathname);
  const busy = safety.operations > 0 || mutations > 0;

  useEffect(
    () => () => {
      updateGeneration.current++;
    },
    [locationKey],
  );

  function closeConfirmation() {
    updateGeneration.current++;
    setConfirmationKey(null);
  }

  useEffect(() => {
    // Defensive protection for less common forms. Keep it after blur and modal
    // close: hidden fields can still hold unsaved state. Navigation ends it.
    let release: (() => void) | undefined;
    const edited = (event: Event) => {
      if (
        !(event.target instanceof Element) ||
        event.target.closest('[data-frontend-update-controls]')
      )
        return;
      if (
        !event.target.matches(
          'input:not([type=button]):not([type=submit]):not([type=search]):not([type=range]), textarea, select, [contenteditable=true], [role=textbox]',
        )
      )
        return;
      updateGeneration.current++;
      release ??= acquireFrontendUpdateBlocker('draft');
    };
    document.addEventListener('input', edited, true);
    document.addEventListener('change', edited, true);
    return () => {
      document.removeEventListener('input', edited, true);
      document.removeEventListener('change', edited, true);
      release?.();
    };
  }, [pathname]);

  useEffect(() => {
    if (!currentVersion || !import.meta.env.PROD) return;
    const instance = startFrontendVersionMonitor({
      currentVersion,
      isBlocked: () =>
        operationPending() ||
        getFrontendUpdateSafety().drafts > 0 ||
        Date.now() - getFrontendUpdateSafety().changedAt < 2_000 ||
        isPresentationUpdateDeferred(window.location.pathname) ||
        !!document.fullscreenElement ||
        !!document.querySelector(
          'dialog[open], [role=dialog][aria-modal=true]',
        ) ||
        editableFocused(),
      onVersion: setPending,
      onAutoReload: (version) => {
        if (claimFrontendReload(currentVersion, version.version))
          reloadToVersion(version);
        else setError('업데이트 버튼을 눌러 최신 화면을 불러와 주세요.');
      },
    });
    monitor.current = instance;
    return () => {
      instance.stop();
      monitor.current = null;
    };
  }, []);

  async function update(confirmed = false) {
    if (operationPending() || checking) return;
    if (
      !confirmed &&
      (getFrontendUpdateSafety().drafts > 0 ||
        presentation ||
        document.fullscreenElement)
    ) {
      setConfirmationKey(locationKey);
      return;
    }
    const generation = ++updateGeneration.current;
    const scope = window.location.href;
    const approvedSafety = getFrontendUpdateSafety();
    setChecking(true);
    setError('');
    const target = await monitor.current?.check();
    setChecking(false);
    // Cancelling the dialog, navigating or editing revokes an earlier approval.
    if (
      generation !== updateGeneration.current ||
      scope !== window.location.href
    )
      return;
    if (!target) {
      setError('버전을 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.');
      return;
    }
    if (target.version === currentVersion) {
      setConfirmationKey(null);
      return;
    }
    // A request may have started while checking the version.
    if (
      operationPending() ||
      document.visibilityState !== 'visible' ||
      navigator.onLine === false
    )
      return;
    if (confirmed && approvedSafety !== getFrontendUpdateSafety()) {
      setError('화면의 변경 내용을 확인한 뒤 다시 업데이트해 주세요.');
      return;
    }
    if (
      !confirmed &&
      (getFrontendUpdateSafety().drafts > 0 ||
        isPresentationUpdateDeferred(window.location.pathname) ||
        document.fullscreenElement ||
        document.querySelector(
          'dialog[open], [role=dialog][aria-modal=true]',
        ) ||
        editableFocused())
    ) {
      setConfirmationKey(locationKey);
      return;
    }
    claimFrontendReload(currentVersion ?? '', target.version);
    reloadToVersion(target);
  }

  if (!pending) return null;
  return (
    <>
      <aside
        aria-label="서비스 업데이트"
        data-frontend-update-controls
        className="fixed right-4 bottom-4 left-4 z-[90] mx-auto flex max-w-xl flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl border border-violet-200 bg-white px-5 py-4 text-slate-800 shadow-lg sm:left-auto"
      >
        <div className="min-w-0 flex-1" role="status">
          <p className="text-sm font-bold">새 버전이 준비되었습니다.</p>
          <p className="mt-1 text-xs leading-relaxed text-slate-500">
            {error ||
              (busy
                ? '진행 중인 작업이 끝나면 업데이트할 수 있습니다.'
                : presentation
                  ? '발표가 끝난 뒤 업데이트해 주세요.'
                  : safety.drafts > 0
                    ? '작성 중인 내용을 저장한 뒤 업데이트해 주세요.'
                    : '잠시 후 최신 화면으로 전환합니다.')}
          </p>
        </div>
        <button
          className="shrink-0 rounded-lg bg-violet-600 px-3 py-2 text-sm font-bold text-white hover:bg-violet-700 disabled:opacity-50"
          disabled={busy || checking}
          onClick={() => {
            void update();
          }}
          type="button"
        >
          {checking ? '확인 중…' : '업데이트'}
        </button>
      </aside>
      {confirmationKey === locationKey ? (
        <ModalDialog
          title="최신 화면으로 업데이트할까요?"
          description={
            presentation
              ? '페이지를 다시 불러옵니다. 전체화면과 효과음은 다시 켜야 할 수 있습니다.'
              : '저장하지 않은 내용은 사라질 수 있습니다. 필요한 내용을 먼저 저장해 주세요.'
          }
          onClose={closeConfirmation}
          footer={
            <div
              data-frontend-update-controls
              className="flex flex-wrap justify-end gap-3"
            >
              <ModalButton onClick={closeConfirmation}>나중에</ModalButton>
              <ModalButton
                tone="primary"
                disabled={busy || checking}
                onClick={() => {
                  void update(true);
                }}
              >
                {checking ? '확인 중…' : '업데이트'}
              </ModalButton>
            </div>
          }
        >
          {error ? (
            <p role="status" className="text-sm text-rose-700">
              {error}
            </p>
          ) : null}
        </ModalDialog>
      ) : null}
    </>
  );
}
