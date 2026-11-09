import type { ContestCardVisibility } from '@/domains/contestAdministration/presentation';

const visibilityTags = {
  public: {
    label: '공개 대회',
    description: '누구나 대회 목록과 개요를 볼 수 있습니다.',
    className: 'bg-emerald-50 text-emerald-700',
  },
  private: {
    label: '비공개 대회',
    description: '등록된 참가자와 운영자만 볼 수 있습니다.',
    className: 'bg-amber-50 text-amber-800',
  },
  operators: {
    label: '운영자만 공개',
    description: '대회 준비 단계로 운영자만 볼 수 있습니다.',
    className: 'bg-violet-50 text-violet-700',
  },
};

export default function ContestVisibilityTag({
  visibility,
}: {
  visibility: ContestCardVisibility;
}) {
  const tag = visibilityTags[visibility];
  return (
    <span
      className={`contest-visibility-tag inline-flex items-center rounded-md px-3 py-1 text-xs font-semibold ${tag.className}`}
      data-visibility={visibility}
      title={tag.description}
    >
      {tag.label}
    </span>
  );
}
