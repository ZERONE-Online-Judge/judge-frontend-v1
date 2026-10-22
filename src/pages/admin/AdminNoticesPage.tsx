import { type FormEvent, useEffect, useRef, useState } from 'react';
import {
  Link,
  useLocation,
  useNavigate,
  useSearchParams,
} from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AdminAccessGate,
  AdminLayout,
  AdminPanel,
  AdminSectionTabs,
  AdminViewTabs,
} from '@/components/admin/AdminShell';
import ServiceNoticePreview from '@/components/admin/ServiceNoticePreview';
import {
  emptyNoticeDraft,
  hasNoticeDraft,
  loadNoticeDraft,
  type PickNotice,
} from '@/components/admin/noticeDraft';
import InterfaceIcon from '@/components/common/InterfaceIcon';
import { ChoiceCard } from '@/components/common/ManagementCards';
import {
  createAdminServiceNotice,
  deleteAdminServiceNotice,
  listAdminServiceNotices,
} from '@/domains/serviceCommunication/api';
import { tokenQueryIdentity } from '@/domains/identityAccess/queryIdentity';
import { formatDateTime } from '@/shared/lib/dateTime';
import { formatApiError } from '@/shared/api/errors';
import useDocumentVisibility from '@/shared/hooks/useDocumentVisibility';
import ModalDialog, { ModalButton } from '@/shared/ui/ModalDialog';
import useConfirmation from '@/shared/ui/useConfirmation';
import Select from '@/shared/ui/Select';
import './AdminNoticesPage.css';

const tabs = [
  { label: '발행한 공지', value: '/admin/notices' },
  { label: '새 공지 작성', value: '/admin/notices/new' },
];
export default function AdminNoticesPage() {
  const location = useLocation();
  return (
    <AdminAccessGate>
      {(session) =>
        location.pathname.endsWith('/new') ? (
          <NoticeComposer
            key={session.staff.email}
            token={session.accessToken}
            draftKey={`zoj.admin.notice-draft:${session.staff.email}`}
          />
        ) : (
          <NoticeList token={session.accessToken} />
        )
      }
    </AdminAccessGate>
  );
}
function NoticeList({ token }: { token: string }) {
  const visible = useDocumentVisibility();
  const client = useQueryClient();
  const [params, setParams] = useSearchParams();
  const { confirm, dialog } = useConfirmation();
  const [deleted, setDeleted] = useState('');
  const query = useQuery({
    queryKey: ['admin', 'service-notices', tokenQueryIdentity(token)],
    queryFn: () => listAdminServiceNotices(token),
    refetchInterval: visible ? 30000 : false,
  });
  const text = params.get('q') ?? '';
  const kind = params.get('kind') ?? 'all';
  const expanded = params.get('notice');
  const rows = [...(query.data ?? [])]
    .sort((a, b) => b.published_at.localeCompare(a.published_at))
    .filter(
      (notice) =>
        `${notice.title}\n${notice.summary}\n${notice.body}`
          .toLowerCase()
          .includes(text.trim().toLowerCase()) &&
        (kind === 'all' ||
          (kind === 'urgent' ? notice.emergency : !notice.emergency)),
    );
  const pages = Math.max(1, Math.ceil(rows.length / 20));
  const requestedPage = Number(
    params.get('page') ??
      (expanded
        ? Math.floor(
            Math.max(
              0,
              rows.findIndex((n) => n.service_notice_id === expanded),
            ) / 20,
          ) + 1
        : 1),
  );
  const page = Math.min(
    pages,
    Number.isSafeInteger(requestedPage) && requestedPage > 0
      ? requestedPage
      : 1,
  );
  const mutation = useMutation({
    mutationFn: (id: string) => deleteAdminServiceNotice(id, token),
    onSuccess: () => {
      setDeleted('공지를 삭제했습니다.');
      void client.invalidateQueries({ queryKey: ['admin', 'service-notices'] });
      void client.invalidateQueries({ queryKey: ['public-service-notices'] });
    },
  });
  function filter(key: string, value: string) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    next.delete('page');
    next.delete('notice');
    setParams(next, { replace: true });
  }
  async function remove(id: string, title: string) {
    if (
      await confirm(
        `“${title}” 공지를 삭제할까요? 삭제한 공지는 복구할 수 없습니다.`,
        { title: '서비스 공지 삭제' },
      )
    )
      mutation.mutate(id);
  }
  return (
    <AdminLayout
      title="서비스 공지"
      description="발행한 공지를 검색하고 공개된 내용을 확인합니다."
      actions={
        <Link
          className="admin-action admin-action--primary"
          to="/admin/notices/new"
        >
          <InterfaceIcon name="list" />새 공지 작성
        </Link>
      }
    >
      {dialog}
      <AdminSectionTabs items={tabs} label="서비스 공지 메뉴" />
      {deleted && (
        <p className="admin-inline-status" role="status">
          {deleted}
        </p>
      )}
      {(query.error || mutation.error) && (
        <p className="admin-error" role="alert">
          {formatApiError(
            query.error || mutation.error,
            '서비스 공지를 처리하지 못했습니다.',
          )}
        </p>
      )}
      <AdminPanel
        title="발행한 공지"
        description={
          query.data
            ? `전체 ${query.data.length.toLocaleString('ko-KR')}건 · 검색 결과 ${rows.length.toLocaleString('ko-KR')}건`
            : '서비스 공지 목록'
        }
      >
        <div className="admin-toolbar">
          <label className="admin-search">
            <InterfaceIcon name="search" />
            <input
              type="search"
              aria-label="공지 검색"
              placeholder="제목, 요약, 본문 검색"
              value={text}
              onChange={(e) => filter('q', e.target.value)}
            />
          </label>
          <Select
            aria-label="공지 유형"
            className="admin-notice-filter"
            value={kind}
            onChange={(e) => filter('kind', e.target.value)}
          >
            <option value="all">전체 공지</option>
            <option value="general">일반 공지</option>
            <option value="urgent">긴급 공지</option>
          </Select>
        </div>
        {query.isPending ? (
          <p className="admin-empty" role="status">
            공지를 불러오는 중입니다.
          </p>
        ) : !rows.length && !query.error ? (
          <div className="admin-empty">
            <InterfaceIcon name="list" size={28} />
            <p>
              {text || kind !== 'all'
                ? '검색 조건에 맞는 공지가 없습니다.'
                : '아직 발행한 공지가 없습니다.'}
            </p>
            <Link className="admin-action" to="/admin/notices/new">
              공지 작성하기
            </Link>
          </div>
        ) : (
          <div className="admin-notice-list">
            {rows.slice((page - 1) * 20, page * 20).map((notice) => (
              <article
                key={notice.service_notice_id}
                className="admin-notice-row"
              >
                <div className="admin-notice-row-heading">
                  <button
                    type="button"
                    className="admin-notice-toggle"
                    aria-expanded={expanded === notice.service_notice_id}
                    aria-controls={`admin-notice-${notice.service_notice_id}`}
                    onClick={() => {
                      const next = new URLSearchParams(params);
                      if (expanded === notice.service_notice_id)
                        next.delete('notice');
                      else next.set('notice', notice.service_notice_id);
                      next.set('page', String(page));
                      setParams(next);
                    }}
                  >
                    <span
                      className={[
                        'admin-pill',
                        notice.emergency && 'admin-pill--urgent',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                    >
                      {notice.emergency ? '긴급' : '일반'}
                    </span>
                    <span>
                      <strong>{notice.title}</strong>
                      {notice.summary && notice.summary !== notice.title ? (
                        <span className="admin-notice-row-summary">
                          {notice.summary}
                        </span>
                      ) : null}
                      <time dateTime={notice.published_at}>
                        {formatDateTime(notice.published_at)}
                      </time>
                    </span>
                    <InterfaceIcon
                      name={
                        expanded === notice.service_notice_id
                          ? 'chevronUp'
                          : 'chevronDown'
                      }
                    />
                  </button>
                  <button
                    className="admin-action admin-action--danger"
                    type="button"
                    disabled={mutation.isPending}
                    onClick={() =>
                      void remove(notice.service_notice_id, notice.title)
                    }
                  >
                    삭제
                  </button>
                </div>
                <div
                  id={`admin-notice-${notice.service_notice_id}`}
                  hidden={expanded !== notice.service_notice_id}
                >
                  {expanded === notice.service_notice_id && (
                    <div className="admin-notice-expanded">
                      <ServiceNoticePreview notice={notice} />
                      <Link
                        className="admin-action"
                        to={`/notices/${encodeURIComponent(notice.service_notice_id)}`}
                      >
                        공개 페이지에서 보기{' '}
                        <InterfaceIcon name="arrowUpRight" />
                      </Link>
                    </div>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
        {pages > 1 && (
          <nav
            className="admin-notice-pagination"
            aria-label="공지 목록 페이지"
          >
            <button
              className="admin-action"
              type="button"
              disabled={page === 1}
              onClick={() => {
                const next = new URLSearchParams(params);
                next.set('page', String(page - 1));
                next.delete('notice');
                setParams(next);
              }}
            >
              이전
            </button>
            <span>
              {page} / {pages}
            </span>
            <button
              className="admin-action"
              type="button"
              disabled={page === pages}
              onClick={() => {
                const next = new URLSearchParams(params);
                next.set('page', String(page + 1));
                next.delete('notice');
                setParams(next);
              }}
            >
              다음
            </button>
          </nav>
        )}
      </AdminPanel>
    </AdminLayout>
  );
}
function NoticeComposer({
  token,
  draftKey,
}: {
  token: string;
  draftKey: string;
}) {
  const client = useQueryClient();
  const navigate = useNavigate();
  const [form, setForm] = useState<PickNotice>(() => loadNoticeDraft(draftKey));
  const [storageAvailable, setStorageAvailable] = useState(true);
  const [error, setError] = useState('');
  const [mode, setMode] = useState<'write' | 'split' | 'preview'>('split');
  const [review, setReview] = useState(false);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const dirty = hasNoticeDraft(form);
  const { confirm, dialog } = useConfirmation();
  function persist(next: PickNotice) {
    try {
      if (hasNoticeDraft(next))
        window.sessionStorage.setItem(draftKey, JSON.stringify(next));
      else window.sessionStorage.removeItem(draftKey);
      setStorageAvailable(true);
    } catch {
      setStorageAvailable(false);
    }
  }
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  const mutation = useMutation({
    mutationFn: () =>
      createAdminServiceNotice(token, {
        title: form.title.trim(),
        summary: form.summary.trim(),
        body: form.body.trim(),
        emergency: form.emergency,
      }),
    onSuccess: (notice) => {
      try {
        window.sessionStorage.removeItem(draftKey);
      } catch {
        /* Browser storage may be disabled. */
      }
      setForm({ ...emptyNoticeDraft });
      setReview(false);
      void client.invalidateQueries({ queryKey: ['admin', 'service-notices'] });
      void client.invalidateQueries({ queryKey: ['public-service-notices'] });
      navigate(
        `/admin/notices?notice=${encodeURIComponent(notice.service_notice_id)}`,
      );
    },
  });
  function change(patch: Partial<PickNotice>) {
    const next = { ...form, ...patch };
    setForm(next);
    persist(next);
    setError('');
    if (mutation.error) mutation.reset();
  }
  function insert(value: string) {
    const field = bodyRef.current;
    if (!field) return;
    const start = field.selectionStart,
      end = field.selectionEnd;
    const prefix = start > 0 && form.body[start - 1] !== '\n' ? '\n' : '';
    const inserted = prefix + value;
    change({
      body: form.body.slice(0, start) + inserted + form.body.slice(end),
    });
    window.requestAnimationFrame(() => {
      field.focus();
      field.setSelectionRange(start + inserted.length, start + inserted.length);
    });
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (mutation.isPending) return;
    if (!form.title.trim() || !form.body.trim()) {
      setError('제목과 본문을 입력해 주세요.');
      if (!form.title.trim()) titleRef.current?.focus();
      else {
        setMode('write');
        window.requestAnimationFrame(() => bodyRef.current?.focus());
      }
      return;
    }
    setError('');
    setReview(true);
  }
  async function clear() {
    if (!dirty) return;
    if (
      await confirm('작성 중인 제목, 요약과 본문을 비울까요?', {
        title: '작성 내용 비우기',
        confirmLabel: '비우기',
      })
    ) {
      setForm({ ...emptyNoticeDraft });
      persist(emptyNoticeDraft);
      setError('');
      mutation.reset();
    }
  }
  return (
    <AdminLayout
      title="새 공지 작성"
      description="안내 내용을 작성하고, 공개 화면을 확인한 뒤 발행하세요."
      actions={
        <>
          <Link className="admin-action" to="/admin/notices">
            공지 목록
          </Link>
          <button
            className="admin-action admin-action--primary"
            form="admin-notice-form"
            type="submit"
            disabled={mutation.isPending}
          >
            발행 전 확인 <InterfaceIcon name="arrowRight" />
          </button>
        </>
      }
    >
      {dialog}
      <AdminSectionTabs items={tabs} label="서비스 공지 메뉴" />
      <form
        id="admin-notice-form"
        onSubmit={submit}
        noValidate
        className="admin-composer-grid"
      >
        <div className="admin-composer-main">
          <AdminPanel
            title="공지 내용"
            actions={
              <span className="admin-draft-status">
                {storageAvailable
                  ? dirty
                    ? '이 탭에 임시 저장됨'
                    : '새 공지'
                  : '임시 저장을 사용할 수 없습니다'}
              </span>
            }
          >
            <fieldset
              disabled={mutation.isPending}
              className="admin-composer-fields"
            >
              <label className="admin-field">
                제목 <span className="admin-required">필수</span>
                <input
                  ref={titleRef}
                  required
                  value={form.title}
                  onChange={(e) => change({ title: e.target.value })}
                  placeholder="공지의 핵심 내용을 한 문장으로 입력하세요"
                  className="admin-notice-title-input"
                />
              </label>
              <label className="admin-field">
                요약 <span className="admin-optional">선택</span>
                <input
                  value={form.summary}
                  onChange={(e) => change({ summary: e.target.value })}
                  placeholder="목록에서 보여 줄 짧은 설명을 입력하세요"
                />
              </label>
              <div className="admin-body-header">
                <label
                  htmlFor="admin-notice-body"
                  className="admin-field-label"
                >
                  본문 <span className="admin-required">필수</span>
                </label>
                <AdminViewTabs
                  label="본문 편집 보기"
                  value={mode}
                  onChange={setMode}
                  items={[
                    { label: '작성', value: 'write' },
                    { label: '함께 보기', value: 'split' },
                    { label: '미리보기', value: 'preview' },
                  ]}
                />
              </div>
              <div className={`admin-editor-layout mode-${mode}`}>
                <div className="admin-editor" hidden={mode === 'preview'}>
                  <div
                    className="admin-editor-toolbar"
                    role="group"
                    aria-label="본문 구성 도구"
                  >
                    <button type="button" onClick={() => insert('■ 소제목\n')}>
                      소제목
                    </button>
                    <button type="button" onClick={() => insert('• 항목\n')}>
                      글머리표
                    </button>
                    <button
                      type="button"
                      onClick={() => insert('1. 항목\n2. 항목\n')}
                    >
                      번호 목록
                    </button>
                    <button
                      type="button"
                      onClick={() => insert('────────────────────\n')}
                    >
                      구분선
                    </button>
                  </div>
                  <textarea
                    id="admin-notice-body"
                    ref={bodyRef}
                    required
                    value={form.body}
                    onChange={(e) => change({ body: e.target.value })}
                    placeholder={
                      '공지 내용을 입력하세요.\n\n대상, 일정, 변경 사항과 문의 방법을 안내해 주세요.'
                    }
                  />
                  <div className="admin-editor-footnote">
                    <span>줄바꿈과 목록 기호가 그대로 표시됩니다.</span>
                    <span>{form.body.length.toLocaleString('ko-KR')}자</span>
                  </div>
                </div>
                <div className="admin-editor-preview" hidden={mode === 'write'}>
                  <div className="admin-preview-label">공개 화면 미리보기</div>
                  <ServiceNoticePreview notice={form} />
                </div>
              </div>
            </fieldset>
            {(error || mutation.error) && (
              <p className="admin-error" role="alert">
                {error ||
                  formatApiError(
                    mutation.error,
                    '공지 발행에 실패했습니다. 작성 내용은 유지됩니다.',
                  )}
              </p>
            )}
          </AdminPanel>
        </div>
        <aside className="admin-composer-settings">
          <AdminPanel title="발행 설정">
            <fieldset
              disabled={mutation.isPending}
              className="admin-publication-options"
            >
              <legend className="sr-only">공지 유형</legend>
              <ChoiceCard
                name="notice-kind"
                checked={!form.emergency}
                title="일반 공지"
                description="서비스 공지 목록에 표시합니다."
                onChange={() => change({ emergency: false })}
              />
              <ChoiceCard
                name="notice-kind"
                checked={form.emergency}
                title="긴급 공지"
                description="서비스 공지와 긴급 안내 영역에 표시합니다."
                onChange={() => change({ emergency: true })}
              />
            </fieldset>
            <dl className="admin-publication-meta">
              <div>
                <dt>공개 대상</dt>
                <dd>모든 이용자</dd>
              </div>
              <div>
                <dt>발행 시점</dt>
                <dd>발행 즉시 공개</dd>
              </div>
            </dl>
            <button
              type="submit"
              className="admin-action admin-action--primary admin-publish-button"
              disabled={mutation.isPending}
            >
              발행 전 확인 <InterfaceIcon name="arrowRight" />
            </button>
            <button
              type="button"
              className="admin-clear-draft"
              disabled={!dirty || mutation.isPending}
              onClick={() => void clear()}
            >
              작성 내용 비우기
            </button>
          </AdminPanel>
        </aside>
      </form>
      {review && (
        <ModalDialog
          title="공지 발행 확인"
          description={
            form.emergency
              ? '긴급 안내 영역에도 표시되는 공지입니다. 내용을 확인해 주세요.'
              : '발행하면 모든 이용자에게 공개됩니다.'
          }
          size="lg"
          onClose={mutation.isPending ? undefined : () => setReview(false)}
          closeOnBackdrop={false}
          footer={
            <>
              <ModalButton
                disabled={mutation.isPending}
                onClick={() => setReview(false)}
              >
                돌아가기
              </ModalButton>
              <ModalButton
                tone="primary"
                disabled={mutation.isPending}
                onClick={() => {
                  if (!mutation.isPending) mutation.mutate();
                }}
              >
                {mutation.isPending ? '발행 중…' : '공지 발행'}
              </ModalButton>
            </>
          }
        >
          <ServiceNoticePreview notice={form} />
          {mutation.error && (
            <p className="admin-error" role="alert">
              {formatApiError(
                mutation.error,
                '공지 발행에 실패했습니다. 다시 시도할 수 있습니다.',
              )}
            </p>
          )}
        </ModalDialog>
      )}
    </AdminLayout>
  );
}
