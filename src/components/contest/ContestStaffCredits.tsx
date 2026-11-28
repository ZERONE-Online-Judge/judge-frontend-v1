import { useId } from 'react';
import type { ContestStaffCredits as Credits } from '@/domains/contestAdministration/types';

export default function ContestStaffCredits({
  credits,
}: {
  credits?: Credits | null;
}) {
  const title = useId();
  if (!credits) return null;

  const groups: {
    label: string;
    members: { name: string; role?: string }[];
  }[] = [
    {
      label: '총괄/마스터',
      members: credits.leadership.map(({ name, role }) => ({
        name,
        role: role === 'owner' ? '총괄' : '마스터',
      })),
    },
    { label: '운영진', members: credits.operators.map((name) => ({ name })) },
    { label: '출제진', members: credits.authors.map((name) => ({ name })) },
    { label: '검수진', members: credits.reviewers.map((name) => ({ name })) },
  ].filter(({ members }) => members.length);
  if (!groups.length) return null;

  return (
    <section
      aria-labelledby={title}
      className="mt-6 grid min-w-0 gap-4 rounded-xl border border-slate-200 bg-white p-5 sm:p-6"
    >
      <h2
        id={title}
        className="text-lg font-semibold tracking-tight text-slate-950"
      >
        대회 크레딧
      </h2>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,11rem),1fr))] gap-3">
        {groups.map(({ label, members }) => (
          <div key={label} className="min-w-0 rounded-lg bg-slate-50 p-4">
            <h3 className="text-sm font-semibold text-slate-600">{label}</h3>
            <ul className="mt-2 grid gap-1.5 text-sm leading-6 font-medium text-slate-900">
              {members.map(({ name, role }, index) => (
                <li
                  key={`${index}:${name}`}
                  className="flex flex-wrap items-baseline gap-x-2"
                >
                  <span className="min-w-0 [overflow-wrap:anywhere]">
                    {name}
                  </span>
                  {role ? (
                    <span className="text-xs text-slate-500">{role}</span>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}
