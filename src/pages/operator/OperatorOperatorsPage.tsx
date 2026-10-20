import OperatorList from '@/components/operator/OperatorList';
import CollapsibleEditor from '@/components/operator/CollapsibleEditor';
import useConfirmation from '@/shared/ui/useConfirmation';
import { type FormEvent, useId, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import PageLayout from '@/components/common/PageLayout';
import ContestOwnerPanel from '@/components/operator/ContestOwnerPanel';
import ContestRoleSelector from '@/components/operator/ContestRoleSelector';
import {
  OperatorAccessGate,
  OperatorPanel,
  OperatorTabs,
} from '@/components/operator/OperatorShell';
import { sharedUiText } from '@/data/uiText';
import {
  createContestOperator,
  getOperatorContestDashboard,
  listContestOperators,
  removeContestOperator,
  updateContestOperator,
  replaceContestOperatorAccount,
  transferContestOwner,
} from '@/domains/contestAdministration/api';
import {
  contestRolesForAccount,
  isAssignedContestMaster,
  isContestOwner,
  type ContestRole,
} from '@/domains/identityAccess/contestRoles';
import {
  hasContestPermission,
  isContestMaster,
} from '@/domains/identityAccess/permissions';
import { tokenQueryIdentity } from '@/domains/identityAccess/queryIdentity';
import { useSessionStore } from '@/domains/identityAccess/sessionStore';
import type {
  StaffAccount,
  StaffSession,
} from '@/domains/identityAccess/types';
import { formatApiError } from '@/shared/api/errors';

type OperatorForm = {
  displayName: string;
  email: string;
  editingEmail: string;
  nameOnly: boolean;
  roles: ContestRole[];
};

const emptyOperatorForm: OperatorForm = {
  displayName: '',
  editingEmail: '',
  email: '',
  nameOnly: false,
  roles: [],
};

export default function OperatorOperatorsPage() {
  const { contestId } = useParams();
  return (
    <OperatorAccessGate contestId={contestId} permission="contest.staff.manage">
      {(session) =>
        contestId ? (
          <OperatorOperatorsContent
            contestId={contestId}
            key={`${contestId}:${session.staff.email}`}
            session={session}
          />
        ) : (
          <PageLayout
            variant="management"
            title={sharedUiText.contestSelectionRequiredTitle}
          >
            {sharedUiText.contestSelectionRequiredBody}
          </PageLayout>
        )
      }
    </OperatorAccessGate>
  );
}

function OperatorOperatorsContent({
  contestId,
  session,
}: {
  contestId: string;
  session: StaffSession;
}) {
  const token = session.accessToken;
  const navigate = useNavigate();
  const { confirm, dialog } = useConfirmation();
  const canManageStaff = hasContestPermission(
    session,
    contestId,
    'contest.staff.manage',
  );
  const canAssignMaster = isContestMaster(session, contestId);
  const queryClient = useQueryClient();
  const queryIdentity = tokenQueryIdentity(token);
  const editorRef = useRef<HTMLDivElement>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [operatorForm, setOperatorForm] = useState(emptyOperatorForm);
  const [operatorFormError, setOperatorFormError] = useState('');
  const [savedMessage, setSavedMessage] = useState('');
  const dashboardQuery = useQuery({
    queryKey: ['operator', 'dashboard', contestId, queryIdentity],
    queryFn: () => getOperatorContestDashboard(contestId, token),
  });
  const operatorsQuery = useQuery({
    queryKey: ['operator', 'operators', contestId, queryIdentity],
    queryFn: () => listContestOperators(contestId, token),
  });
  const operators = (operatorsQuery.data ?? []).filter(
    (operator) => !operator.is_service_master,
  );
  const saveOperatorMutation = useMutation({
    mutationFn: (form: OperatorForm) =>
      form.editingEmail
        ? (form.editingEmail.trim().toLowerCase() !==
            form.email.trim().toLowerCase()
            ? replaceContestOperatorAccount
            : updateContestOperator)(contestId, form.editingEmail, token, {
            display_name: form.displayName.trim(),
            email: form.email.trim(),
            // The API preserves an existing owner's role for a master update.
            roles: form.nameOnly ? ['master'] : form.roles,
          })
        : createContestOperator(contestId, token, {
            display_name: form.displayName.trim(),
            roles: form.roles,
            email: form.email.trim(),
          }),
    onSuccess: async (operator, form) => {
      const previousEmail = form.editingEmail.trim().toLowerCase();
      const nextEmail = operator.email.trim().toLowerCase();
      const emailChanged = Boolean(
        previousEmail && previousEmail !== nextEmail,
      );
      // Account replacement changes this contest's assignment, not login identity.
      flushSync(() => setOperatorForm(emptyOperatorForm));
      setOperatorFormError('');
      setEditorOpen(false);
      if (
        emailChanged &&
        previousEmail === session.staff.email.trim().toLowerCase()
      ) {
        const current = useSessionStore.getState().generalSession;
        if (current?.operatorSession?.accessToken === token) {
          const staff = current.operatorSession.staff;
          const scopes = { ...staff.contest_scopes };
          const roles = { ...staff.contest_roles };
          delete scopes[contestId];
          delete roles[contestId];
          useSessionStore.getState().setGeneralSession({
            ...current,
            operatorContests: current.operatorContests.filter(
              (item) => item.contest.contest_id !== contestId,
            ),
            operatorSession: {
              ...current.operatorSession,
              defaultRedirect: '/contests',
              staff: { ...staff, contest_scopes: scopes, contest_roles: roles },
            },
          });
        }
        await queryClient.cancelQueries({ queryKey: ['operator'] });
        queryClient.removeQueries({ queryKey: ['operator'] });
        navigate('/contests', { replace: true });
        return;
      }
      const current = useSessionStore.getState().generalSession;
      if (
        current?.operatorSession?.accessToken === token &&
        current.operatorSession.staff.email.trim().toLowerCase() === nextEmail
      ) {
        useSessionStore.getState().setGeneralSession({
          ...current,
          account: { ...current.account, display_name: operator.display_name },
          operatorSession: {
            ...current.operatorSession,
            staff: {
              ...current.operatorSession.staff,
              display_name: operator.display_name,
            },
          },
        });
      }
      setSavedMessage(
        emailChanged
          ? `${nextEmail} 계정으로 이 대회의 운영자 권한을 옮겼습니다. 기존 계정의 로그인 정보와 작성 기록은 유지됩니다.`
          : '운영자 정보를 저장했습니다.',
      );
      void queryClient.invalidateQueries({
        queryKey: emailChanged
          ? ['operator']
          : ['operator', 'operators', contestId],
      });
    },
  });

  const transferMutation = useMutation({
    mutationFn: (email: string) =>
      transferContestOwner(contestId, token, email),
    onSuccess: (changed) => {
      const current = useSessionStore.getState().generalSession;
      const ownAccount = changed.find(
        (item) => item.email === current?.operatorSession?.staff.email,
      );
      if (
        current?.operatorSession &&
        ownAccount &&
        current.operatorSession.accessToken === token
      ) {
        const previous = current.operatorSession.staff;
        useSessionStore.getState().setGeneralSession({
          ...current,
          operatorContests: current.operatorContests.map((item) =>
            item.contest.contest_id === contestId
              ? { ...item, scopes: ownAccount.contest_scopes[contestId] }
              : item,
          ),
          operatorSession: {
            ...current.operatorSession,
            staff: {
              ...previous,
              contest_scopes: {
                ...previous.contest_scopes,
                ...ownAccount.contest_scopes,
              },
              contest_roles: {
                ...previous.contest_roles,
                ...ownAccount.contest_roles,
              },
              protected_master_contests: [
                ...(previous.protected_master_contests ?? []).filter(
                  (id) => id !== contestId,
                ),
                ...(ownAccount.protected_master_contests ?? []),
              ],
            },
          },
        });
      }
      setSavedMessage(
        '총괄을 위임했습니다. 기존 총괄은 대회 마스터로 남습니다.',
      );
      void queryClient.invalidateQueries({ queryKey: ['operator'] });
    },
    onError: () => {
      void queryClient.invalidateQueries({
        queryKey: ['operator', 'operators', contestId],
      });
    },
  });

  const removeOperatorMutation = useMutation({
    mutationFn: (operator: StaffAccount) =>
      removeContestOperator(contestId, operator.email, token),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ['operator', 'operators', contestId],
      });
    },
  });

  async function handleOperatorSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saveOperatorMutation.isPending || transferMutation.isPending) return;
    if (!canManageStaff) return;
    if (!operatorForm.email.trim() || !operatorForm.displayName.trim()) {
      setOperatorFormError('운영자의 이메일과 이름을 입력하세요.');
      return;
    }
    if (!operatorForm.roles.length) {
      setOperatorFormError('담당할 권한을 하나 이상 선택하세요.');
      return;
    }
    setOperatorFormError('');
    setSavedMessage('');
    if (
      operatorForm.editingEmail &&
      operatorForm.editingEmail.trim().toLowerCase() !==
        operatorForm.email.trim().toLowerCase()
    ) {
      const accepted = await confirm(
        `${operatorForm.editingEmail} 계정의 이 대회 운영자 권한을 ${operatorForm.email.trim()} 계정으로 옮깁니다. 다른 대회의 권한과 로그인 정보, 기존 작성 기록은 옮기지 않습니다. 이미 가입된 계정이면 기존 이름을 유지합니다.`,
        {
          title: '운영자 계정 변경',
          confirmLabel: '권한 옮기기',
          tone: 'primary',
        },
      );
      if (!accepted) return;
    }
    saveOperatorMutation.mutate(operatorForm);
  }

  return (
    <PageLayout
      navigation={<OperatorTabs contestId={contestId} />}
      variant="management"
      width="full"
      eyebrow="Operator"
      title="운영자 관리"
      description="이 대회를 운영할 구성원을 추가하고 이름, 이메일과 담당 권한을 관리합니다."
    >
      {dashboardQuery.error || operatorsQuery.error ? (
        <ErrorBox
          error={dashboardQuery.error || operatorsQuery.error}
          fallback="운영자 정보를 불러오지 못했습니다"
        />
      ) : null}
      <ContestOwnerPanel
        contestId={contestId}
        actorEmail={session.staff.email}
        operators={operators}
        loading={operatorsQuery.isPending}
        busy={
          transferMutation.isPending ||
          saveOperatorMutation.isPending ||
          removeOperatorMutation.isPending
        }
        error={transferMutation.error}
        onTransfer={(email) => transferMutation.mutate(email)}
      />
      <div ref={editorRef} className="scroll-mt-24">
        <CollapsibleEditor
          open={editorOpen}
          onOpenChange={setEditorOpen}
          busy={saveOperatorMutation.isPending || transferMutation.isPending}
          draft={Boolean(
            operatorForm.email ||
            operatorForm.displayName ||
            operatorForm.roles.length,
          )}
          description="운영자와 담당 권한을 관리합니다. 이메일을 바꾸면 이 대회의 운영자 권한을 다른 계정으로 옮깁니다. 대회 총괄은 별도의 위임 기능을 사용하세요."
          title={
            operatorForm.nameOnly
              ? '총괄 이름 수정'
              : operatorForm.editingEmail
                ? '운영자 수정'
                : '운영자 추가'
          }
        >
          <form className="grid gap-3" onSubmit={handleOperatorSubmit}>
            <div className="grid items-start gap-4 sm:grid-cols-2">
              <TextInput
                disabled={
                  operatorForm.nameOnly ||
                  saveOperatorMutation.isPending ||
                  transferMutation.isPending
                }
                helperText={
                  operatorForm.nameOnly
                    ? '총괄의 표시 이름을 수정합니다. 로그인 이메일은 유지됩니다.'
                    : operatorForm.editingEmail
                      ? '이미 가입된 이메일도 사용할 수 있습니다. 이 대회의 권한만 옮기며 양쪽 계정의 로그인 정보와 작성 기록은 유지합니다.'
                      : '권한을 부여할 계정의 이메일을 입력하세요. 이미 가입된 계정도 추가할 수 있습니다.'
                }
                label="이메일 (필수)"
                required
                type="email"
                onChange={(value) =>
                  setOperatorForm((prev) => ({ ...prev, email: value }))
                }
                value={operatorForm.email}
              />
              <TextInput
                label="이름 (필수)"
                helperText={
                  operatorForm.editingEmail &&
                  operatorForm.editingEmail.trim().toLowerCase() !==
                    operatorForm.email.trim().toLowerCase()
                    ? '이미 가입된 계정이면 해당 계정의 기존 이름을 사용합니다.'
                    : undefined
                }
                required
                disabled={
                  saveOperatorMutation.isPending || transferMutation.isPending
                }
                onChange={(value) =>
                  setOperatorForm((prev) => ({ ...prev, displayName: value }))
                }
                value={operatorForm.displayName}
              />
            </div>
            {operatorForm.nameOnly ? (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                <p className="font-semibold">대회 총괄 · 권한 유지</p>
                <p className="mt-1 text-xs leading-5">
                  이름을 바꿔도 총괄 권한은 유지됩니다. 총괄 변경은 위임
                  영역에서만 할 수 있습니다.
                </p>
              </div>
            ) : (
              <ContestRoleSelector
                canAssignMaster={canAssignMaster}
                disabled={
                  saveOperatorMutation.isPending || transferMutation.isPending
                }
                value={operatorForm.roles}
                onChange={(roles) =>
                  setOperatorForm((prev) => ({ ...prev, roles }))
                }
              />
            )}
            {operatorFormError || saveOperatorMutation.error ? (
              <ErrorBox
                error={saveOperatorMutation.error}
                fallback={operatorFormError || '운영자 저장에 실패했습니다'}
              />
            ) : null}
            <button
              className="h-10 w-fit rounded-lg bg-indigo-600 px-5 text-sm font-semibold text-white disabled:opacity-50"
              disabled={
                transferMutation.isPending ||
                saveOperatorMutation.isPending ||
                !operatorForm.email.trim() ||
                !operatorForm.displayName.trim() ||
                !operatorForm.roles.length
              }
              type="submit"
            >
              {saveOperatorMutation.isPending
                ? '저장 중…'
                : operatorForm.editingEmail
                  ? '변경사항 저장'
                  : '운영자 추가'}
            </button>
            {operatorForm.editingEmail ? (
              <button
                className="h-10 rounded-lg border border-slate-200 text-sm font-medium text-slate-600"
                disabled={
                  saveOperatorMutation.isPending || transferMutation.isPending
                }
                onClick={() => {
                  setOperatorForm(emptyOperatorForm);
                  setOperatorFormError('');
                  saveOperatorMutation.reset();
                }}
                type="button"
              >
                수정 취소 · 새 운영자 추가로 돌아가기
              </button>
            ) : null}
          </form>
        </CollapsibleEditor>
      </div>
      {savedMessage ? (
        <p
          className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800"
          role="status"
        >
          {savedMessage}
        </p>
      ) : null}
      <OperatorPanel
        title={`등록된 운영자 · ${operators.length}명`}
        description="구성원의 담당 권한을 확인하고 필요한 정보를 수정하세요."
      >
        {operatorsQuery.isPending ? (
          <p className="text-sm text-slate-600">
            운영자 목록을 불러오는 중입니다.
          </p>
        ) : null}
        {removeOperatorMutation.error ? (
          <ErrorBox
            error={removeOperatorMutation.error}
            fallback="운영자를 제거하지 못했습니다"
          />
        ) : null}
        <OperatorList
          contestId={contestId}
          canAssignMaster={canAssignMaster}
          disabled={
            transferMutation.isPending ||
            saveOperatorMutation.isPending ||
            removeOperatorMutation.isPending
          }
          onEdit={(operator) => {
            if (saveOperatorMutation.isPending || transferMutation.isPending)
              return;
            setEditorOpen(true);
            window.requestAnimationFrame(() => {
              editorRef.current
                ?.querySelector<HTMLInputElement>('input:not(:disabled)')
                ?.focus({ preventScroll: true });
              editorRef.current?.scrollIntoView({
                behavior: 'smooth',
                block: 'start',
              });
            });
            saveOperatorMutation.reset();
            setOperatorFormError('');
            setSavedMessage('');
            setOperatorForm({
              displayName: operator.display_name,
              editingEmail: operator.email,
              email: operator.email,
              nameOnly:
                isContestOwner(operator, contestId) ||
                isAssignedContestMaster(operator, contestId),
              roles: contestRolesForAccount(operator, contestId),
            });
          }}
          onRemove={(operator) => removeOperatorMutation.mutate(operator)}
          operators={operators}
        />
      </OperatorPanel>
      {dialog}
    </PageLayout>
  );
}

function TextInput({
  disabled,
  helperText,
  label,
  onChange,
  required,
  type = 'text',
  value,
}: {
  disabled?: boolean;
  helperText?: string;
  label: string;
  onChange: (value: string) => void;
  required?: boolean;
  type?: 'text' | 'email';
  value: string;
}) {
  const helpId = useId();
  return (
    <label className="grid gap-2 text-sm font-semibold text-slate-700">
      {label}
      <input
        aria-describedby={helperText ? helpId : undefined}
        className="h-11 rounded-lg border border-slate-200 px-3 text-sm font-medium text-slate-950 transition outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100 disabled:bg-slate-50 disabled:text-slate-600"
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        required={required}
        type={type}
        value={value}
      />
      {helperText ? (
        <span
          id={helpId}
          className="text-xs leading-5 font-normal text-slate-600"
        >
          {helperText}
        </span>
      ) : null}
    </label>
  );
}

function ErrorBox({ error, fallback }: { error: unknown; fallback: string }) {
  return (
    <p className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
      {error ? formatApiError(error, fallback) : fallback}
    </p>
  );
}
