import type { FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  AdminAccessGate,
  AdminLayout,
  AdminPanel,
} from '@/components/admin/AdminShell';
import {
  getAdminUserDetail,
  listAdminUsers,
  adminUserSortKeys,
  type AdminUserSort,
} from '@/domains/identityAccess/adminUsers';
import { tokenQueryIdentity } from '@/domains/identityAccess/queryIdentity';
import { contestStatusLabel } from '@/domains/contestAdministration/logic';
import { formatApiError } from '@/shared/api/errors';
import { formatDateTime } from '@/shared/lib/dateTime';
import ModalDialog, { ModalButton } from '@/shared/ui/ModalDialog';
import Select from '@/shared/ui/Select';
import './AdminUsersPage.css';

const roleLabels: Record<string, string> = {
  service_master: '서비스 관리자',
  operator: '대회 운영자',
  participant: '참가자',
  general: '일반 사용자',
};
export default function AdminUsersPage() {
  return (
    <AdminAccessGate>
      {(session) => <UserDirectory token={session.accessToken} />}
    </AdminAccessGate>
  );
}
function PasswordBadge({ registered }: { registered: boolean }) {
  return (
    <span className={`admin-user-password ${registered ? 'is-set' : ''}`}>
      {registered ? '등록됨' : '미등록'}
    </span>
  );
}
function UserDirectory({ token }: { token: string }) {
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const requestedPassword = params.get('password') ?? 'all';
  const password = ['all', 'set', 'unset'].includes(requestedPassword)
    ? requestedPassword
    : 'all';
  const rawPage = Number(params.get('page') ?? 1);
  const page =
    Number.isSafeInteger(rawPage) && rawPage > 0
      ? Math.min(rawPage, 1000000)
      : 1;
  const email = params.get('user');
  const requestedSort = params.get('sort') ?? 'email';
  const sort: AdminUserSort = adminUserSortKeys.includes(
    requestedSort as AdminUserSort,
  )
    ? (requestedSort as AdminUserSort)
    : 'email';
  const order = params.get('order') === 'desc' ? 'desc' : 'asc';
  const query = useQuery({
    queryKey: [
      'admin',
      'users',
      tokenQueryIdentity(token),
      q,
      password,
      sort,
      order,
      page,
    ],
    queryFn: () =>
      listAdminUsers(token, {
        q,
        password,
        sort,
        order,
        offset: (page - 1) * 25,
      }),
  });
  function update(changes: Record<string, string | null>, replace = false) {
    setParams(
      (previous) => {
        const next = new URLSearchParams(previous);
        for (const [key, value] of Object.entries(changes)) {
          if (value) next.set(key, value);
          else next.delete(key);
        }
        return next;
      },
      { replace },
    );
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    const search = String(
      new FormData(event.currentTarget as HTMLFormElement).get('q') ?? '',
    );
    update({ q: search.trim().slice(0, 200), page: null });
  }
  const total = query.data?.page.total_count ?? 0;
  const pages = Math.max(1, Math.ceil(total / 25));
  return (
    <AdminLayout
      title="사용자 관리"
      description="이메일별 등록 정보와 대회 참가 이력을 확인합니다."
      actions={
        <button
          type="button"
          className="admin-action"
          disabled={query.isFetching}
          onClick={() => void query.refetch()}
        >
          새로고침
        </button>
      }
    >
      <AdminPanel
        title="등록 사용자"
        description="일반 계정, 대회 참가자와 운영자를 이메일 기준으로 모았습니다."
      >
        <form className="admin-users-toolbar" onSubmit={submit}>
          <label className="admin-users-search">
            이메일 · 이름 검색
            <input
              maxLength={200}
              placeholder="대회별 등록 이름으로도 검색할 수 있습니다"
              key={q}
              name="q"
              defaultValue={q}
            />
          </label>
          <label>
            비밀번호
            <Select
              value={password}
              onChange={(event) =>
                update({
                  password:
                    event.target.value === 'all' ? null : event.target.value,
                  page: null,
                })
              }
            >
              <option value="all">전체</option>
              <option value="set">등록됨</option>
              <option value="unset">미등록</option>
            </Select>
          </label>
          <button type="submit" className="admin-action admin-action--primary">
            검색
          </button>
        </form>
        <div className="admin-users-order">
          <label>
            정렬 기준
            <Select
              value={sort}
              onChange={(event) =>
                update({
                  sort:
                    event.target.value === 'email' ? null : event.target.value,
                  page: null,
                })
              }
            >
              <option value="email">이메일</option>
              <option value="name">이름</option>
              <option value="contest_count">참가 대회 수</option>
              <option value="created_at">계정 생성일</option>
              <option value="password_updated_at">비밀번호 설정일</option>
            </Select>
          </label>
          <label>
            정렬 방향
            <Select
              value={order}
              onChange={(event) =>
                update({
                  order:
                    event.target.value === 'asc' ? null : event.target.value,
                  page: null,
                })
              }
            >
              <option value="asc">
                {sort.endsWith('_at')
                  ? '오래된 순'
                  : sort === 'contest_count'
                    ? '적은 순'
                    : '오름차순'}
              </option>
              <option value="desc">
                {sort.endsWith('_at')
                  ? '최신 순'
                  : sort === 'contest_count'
                    ? '많은 순'
                    : '내림차순'}
              </option>
            </Select>
          </label>
        </div>
        {query.isPending ? (
          <p className="admin-empty" role="status">
            사용자를 불러오는 중입니다.
          </p>
        ) : query.isError ? (
          <div className="admin-error" role="alert">
            {formatApiError(query.error, '사용자 목록을 불러오지 못했습니다.')}{' '}
            <button type="button" onClick={() => void query.refetch()}>
              다시 시도
            </button>
          </div>
        ) : (
          <>
            <div className="admin-users-count" aria-live="polite">
              검색 결과 <strong>{total.toLocaleString()}명</strong>
              <span>이메일당 한 명으로 표시</span>
            </div>
            {query.data.data.length ? (
              <div className="admin-users-table-wrap">
                <table className="admin-users-table">
                  <thead>
                    <tr>
                      <th scope="col">사용자</th>
                      <th scope="col">등록된 이름</th>
                      <th scope="col">구분</th>
                      <th scope="col">참가 대회</th>
                      <th scope="col">비밀번호</th>
                      <th scope="col">상세</th>
                    </tr>
                  </thead>
                  <tbody>
                    {query.data.data.map((user) => (
                      <tr key={user.email}>
                        <td>
                          <strong>{user.display_name}</strong>
                          <span className="admin-user-email">{user.email}</span>
                          {sort === 'created_at' ? (
                            <small className="admin-user-sort-date">
                              계정 생성:{' '}
                              {user.account_created_at
                                ? formatDateTime(user.account_created_at)
                                : '생성 전'}
                            </small>
                          ) : null}
                        </td>
                        <td>
                          <div className="admin-user-names">
                            {user.names.map((name) => (
                              <span key={name}>{name}</span>
                            ))}
                          </div>
                        </td>
                        <td>
                          <div className="admin-user-roles">
                            {user.roles.map((role) => (
                              <span key={role}>{roleLabels[role] ?? role}</span>
                            ))}
                          </div>
                        </td>
                        <td>{user.participant_contest_count}개</td>
                        <td>
                          <PasswordBadge registered={user.has_password} />
                          {sort === 'password_updated_at' &&
                          user.password_updated_at ? (
                            <small className="admin-user-sort-date">
                              {formatDateTime(user.password_updated_at)}
                            </small>
                          ) : null}
                        </td>
                        <td>
                          <button
                            type="button"
                            className="admin-action"
                            aria-label={`${user.email} 상세`}
                            onClick={() => update({ user: user.email })}
                          >
                            상세
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="admin-empty">
                {total
                  ? '이 페이지에 사용자가 없습니다.'
                  : '조건에 맞는 사용자가 없습니다.'}
                <button
                  type="button"
                  className="admin-action"
                  onClick={() => {
                    update({ q: null, password: null, page: null });
                  }}
                >
                  전체 사용자 보기
                </button>
              </div>
            )}
            <div className="admin-users-pagination">
              <span>
                {page} / {pages} 페이지
              </span>
              <div>
                <button
                  type="button"
                  className="admin-action"
                  disabled={page <= 1}
                  onClick={() => update({ page: String(page - 1) })}
                >
                  이전
                </button>
                <button
                  type="button"
                  className="admin-action"
                  disabled={query.data.page.next_cursor === null}
                  onClick={() => update({ page: String(page + 1) })}
                >
                  다음
                </button>
              </div>
            </div>
          </>
        )}
      </AdminPanel>
      {email ? (
        <UserDetail
          key={email}
          token={token}
          email={email}
          onClose={() => update({ user: null }, true)}
        />
      ) : null}
    </AdminLayout>
  );
}
function UserDetail({
  token,
  email,
  onClose,
}: {
  token: string;
  email: string;
  onClose: () => void;
}) {
  const query = useQuery({
    queryKey: ['admin', 'user', tokenQueryIdentity(token), email],
    queryFn: () => getAdminUserDetail(token, email),
    retry: false,
  });
  const user = query.data;
  return (
    <ModalDialog
      title="사용자 상세"
      eyebrow="USER PROFILE"
      description={email}
      size="xl"
      onClose={onClose}
      footer={<ModalButton onClick={onClose}>닫기</ModalButton>}
    >
      {query.isPending ? (
        <p role="status">사용자 정보를 불러오는 중입니다.</p>
      ) : query.isError ? (
        <div className="admin-error" role="alert">
          {formatApiError(query.error, '사용자 정보를 불러오지 못했습니다.')}{' '}
          <button type="button" onClick={() => void query.refetch()}>
            다시 시도
          </button>
        </div>
      ) : user ? (
        <div className="admin-user-detail">
          <section className="admin-user-profile">
            <h3>{user.display_name}</h3>
            <div className="admin-user-names">
              {user.names.map((name) => (
                <span key={name}>{name}</span>
              ))}
            </div>
            <dl className="admin-user-facts">
              <div>
                <dt>사용자 구분</dt>
                <dd>
                  {user.roles
                    .map((role) => roleLabels[role] ?? role)
                    .join(' · ')}
                </dd>
              </div>
              <div>
                <dt>일반 계정 생성일</dt>
                <dd>
                  {user.account_created_at
                    ? formatDateTime(user.account_created_at)
                    : '일반 계정 생성 전'}
                </dd>
              </div>
              <div>
                <dt>비밀번호</dt>
                <dd>
                  <PasswordBadge registered={user.has_password} />
                </dd>
              </div>
              <div>
                <dt>비밀번호 최근 설정</dt>
                <dd>
                  {user.password_updated_at
                    ? formatDateTime(user.password_updated_at)
                    : '설정 이력 없음'}
                </dd>
              </div>
            </dl>
          </section>
          <section>
            <h3 className="admin-user-section-title">
              대회 참가 등록 <span>{user.participations.length}</span>
            </h3>
            {user.participations.length ? (
              <div className="admin-user-history">
                {user.participations.map((item) => (
                  <article className="admin-user-contest" key={item.contest_id}>
                    <header>
                      <div>
                        <Link
                          to={`/operator/contests/${item.contest_id}`}
                          onClick={onClose}
                        >
                          {item.contest_title}
                        </Link>
                        <p>
                          {item.organization_name} ·{' '}
                          {formatDateTime(item.start_at)} ~{' '}
                          {formatDateTime(item.end_at)}
                        </p>
                      </div>
                      <span className="admin-pill">
                        {contestStatusLabel(item.contest_status)}
                      </span>
                    </header>
                    <dl className="admin-user-facts">
                      <div>
                        <dt>대회 등록 이름</dt>
                        <dd>{item.registered_name}</dd>
                      </div>
                      <div>
                        <dt>팀 · 부문</dt>
                        <dd>
                          {item.team_name} · {item.division_name}
                        </dd>
                      </div>
                      <div>
                        <dt>팀 역할</dt>
                        <dd>
                          {item.member_role === 'leader' ? '팀장' : '팀원'}
                        </dd>
                      </div>
                      <div>
                        <dt>팀 등록 상태</dt>
                        <dd>
                          {{
                            invited: '초대됨',
                            active: '활성',
                            disabled: '비활성',
                          }[item.team_status] ?? item.team_status}
                        </dd>
                      </div>
                      <div>
                        <dt>팀 등록일</dt>
                        <dd>{formatDateTime(item.registered_at)}</dd>
                      </div>
                      <div>
                        <dt>최근 대회 로그인</dt>
                        <dd>
                          {item.last_login_at
                            ? formatDateTime(item.last_login_at)
                            : '로그인 이력 없음'}
                        </dd>
                      </div>
                      <div>
                        <dt>본인 제출</dt>
                        <dd>
                          {item.submission_count}건 · 정답 제출{' '}
                          {item.accepted_submission_count}건
                        </dd>
                      </div>
                    </dl>
                  </article>
                ))}
              </div>
            ) : (
              <p className="admin-user-no-history">
                대회 참가 등록 이력이 없습니다.
              </p>
            )}
          </section>
          <section>
            <h3 className="admin-user-section-title">
              대회 운영 권한 <span>{user.operator_contests.length}</span>
            </h3>
            {user.operator_contests.length ? (
              <ul className="admin-user-operator-list">
                {user.operator_contests.map((item) => (
                  <li key={item.contest_id}>
                    <Link
                      to={`/operator/contests/${item.contest_id}`}
                      onClick={onClose}
                    >
                      {item.contest_title}
                    </Link>
                    <span>
                      {item.display_name} · {item.role_title}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="admin-user-no-history">
                개별 대회에 배정된 운영 권한이 없습니다.
              </p>
            )}
          </section>
        </div>
      ) : null}
    </ModalDialog>
  );
}
