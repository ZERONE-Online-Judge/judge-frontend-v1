import Select from '@/shared/ui/Select';
import type { Division } from '@/domains/contestAdministration/types';
import type { TeamMember } from '@/domains/teamParticipation/types';
import type { ParticipantTeamFormValue } from '@/domains/teamParticipation/teamDraft';

export default function ParticipantTeamFormFields({
  divisions,
  value,
  members,
  onChange,
  onMembersChange,
  editing = false,
  disabled = false,
}: {
  divisions: Division[];
  value: ParticipantTeamFormValue;
  members: TeamMember[];
  onChange: (value: ParticipantTeamFormValue) => void;
  onMembersChange: (members: TeamMember[]) => void;
  editing?: boolean;
  disabled?: boolean;
}) {
  function updateMember(index: number, patch: Partial<TeamMember>) {
    onMembersChange(
      members.map((member, memberIndex) =>
        memberIndex === index ? { ...member, ...patch } : member,
      ),
    );
  }

  return (
    <fieldset disabled={disabled} className="grid min-w-0 gap-4">
      <div className="grid min-w-0 gap-4 rounded-lg border border-slate-200 bg-slate-50/70 p-4">
        <p className="text-xs font-semibold text-slate-600">팀 설정</p>
        <div className="grid min-w-0 gap-4 md:grid-cols-2">
          <TextInput
            label="팀명"
            value={value.teamName}
            onChange={(teamName) => onChange({ ...value, teamName })}
          />
          <label className="grid min-w-0 gap-2 text-sm font-semibold text-slate-700">
            참가 유형
            <Select
              disabled={disabled}
              className="h-11 w-full min-w-0 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100 disabled:opacity-60"
              value={value.divisionId}
              onChange={(event) =>
                onChange({ ...value, divisionId: event.target.value })
              }
            >
              <option value="">유형 선택</option>
              {divisions.map((division) => (
                <option key={division.division_id} value={division.division_id}>
                  {division.name}
                </option>
              ))}
            </Select>
          </label>
        </div>
        {editing ? (
          <label className="grid min-w-0 gap-2 text-sm font-semibold text-slate-700">
            상태
            <Select
              disabled={disabled}
              className="h-11 w-full min-w-0 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100 disabled:opacity-60"
              value={value.status}
              onChange={(event) =>
                onChange({ ...value, status: event.target.value })
              }
            >
              <option value="active">활성</option>
              <option value="disabled">비활성</option>
              <option value="disqualified">실격</option>
            </Select>
          </label>
        ) : null}
      </div>
      <div className="grid min-w-0 gap-4 rounded-lg border border-indigo-100 bg-indigo-50/60 p-4">
        <p className="text-xs font-semibold text-indigo-700">팀장 설정</p>
        <div className="grid min-w-0 gap-4 md:grid-cols-2">
          <TextInput
            label="팀장 이름"
            value={value.leaderName}
            onChange={(leaderName) => onChange({ ...value, leaderName })}
          />
          <TextInput
            label="팀장 이메일"
            value={value.leaderEmail}
            onChange={(leaderEmail) => onChange({ ...value, leaderEmail })}
          />
        </div>
      </div>
      <div className="grid min-w-0 gap-3 rounded-lg border border-slate-200 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold text-slate-600">팀원</p>
            <p className="mt-1 text-xs leading-5 font-medium text-slate-600">
              1인팀이면 비워두고, 여러 명이면 필요한 만큼 추가합니다.
            </p>
          </div>
          <button
            className="min-h-10 shrink-0 rounded-lg border border-indigo-200 bg-white px-3 py-2 text-xs font-semibold text-indigo-700 disabled:opacity-50"
            onClick={() =>
              onMembersChange([
                ...members,
                { email: '', name: '', role: 'member' },
              ])
            }
            type="button"
          >
            팀원 추가
          </button>
        </div>
        {members.length ? (
          <div className="grid min-w-0 gap-3">
            {members.map((member, index) => (
              <div
                className="grid min-w-0 gap-3 rounded-lg border border-slate-200 bg-white p-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]"
                key={`${member.team_member_id ?? 'new'}-${index}`}
              >
                <TextInput
                  label={`팀원 ${index + 1} 이름`}
                  value={member.name}
                  onChange={(name) => updateMember(index, { name })}
                />
                <TextInput
                  label={`팀원 ${index + 1} 이메일`}
                  value={member.email}
                  onChange={(email) => updateMember(index, { email })}
                />
                <button
                  className="min-h-11 self-end rounded-lg border border-rose-200 px-3 py-2 text-xs font-semibold text-rose-700 disabled:text-slate-400"
                  disabled={Boolean(member.team_member_id)}
                  onClick={() =>
                    onMembersChange(
                      members.filter((_, memberIndex) => memberIndex !== index),
                    )
                  }
                  title={
                    member.team_member_id
                      ? '이미 등록된 팀원은 이 화면에서 제거할 수 없습니다.'
                      : undefined
                  }
                  type="button"
                >
                  제거
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="rounded-lg border border-dashed border-slate-200 px-4 py-6 text-center text-sm font-medium text-slate-600">
            추가 팀원이 없습니다.
          </p>
        )}
      </div>
    </fieldset>
  );
}

function TextInput({
  label,
  onChange,
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  value: string;
}) {
  return (
    <label className="grid min-w-0 gap-2 text-sm font-semibold text-slate-700">
      {label}
      <input
        className="h-11 w-full min-w-0 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-950 transition outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100 disabled:opacity-60"
        onChange={(event) => onChange(event.target.value)}
        value={value}
      />
    </label>
  );
}
