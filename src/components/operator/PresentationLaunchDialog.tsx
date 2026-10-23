import { useState } from 'react';
import ModalDialog, { ModalButton } from '@/shared/ui/ModalDialog';

export default function PresentationLaunchDialog({
  divisions,
  initialSelection,
  onClose,
  onLaunch,
}: {
  divisions: { division_id: string; name: string }[];
  initialSelection: string[];
  onClose: () => void;
  onLaunch: (divisionIds: string[]) => void;
}) {
  const [selection, setSelection] = useState(initialSelection);
  const selectedIds = divisions
    .filter((division) => selection.includes(division.division_id))
    .map((division) => division.division_id);
  const allSelected = selectedIds.length === divisions.length;
  return (
    <ModalDialog
      title="프레젠테이션 설정"
      description="한 화면에 표시할 유형을 선택하세요."
      onClose={onClose}
      footer={
        <>
          <ModalButton onClick={onClose}>취소</ModalButton>
          <ModalButton
            tone="primary"
            disabled={!selectedIds.length}
            onClick={() => onLaunch(selectedIds)}
          >
            선택한 유형으로 열기
          </ModalButton>
        </>
      }
    >
      <fieldset className="grid min-w-0 gap-3">
        <legend className="mb-3 text-sm font-semibold text-slate-900">
          표시할 유형
        </legend>
        <div className="flex justify-end">
          <button
            type="button"
            className="text-xs font-semibold text-indigo-700"
            onClick={() =>
              setSelection(
                allSelected
                  ? []
                  : divisions.map((division) => division.division_id),
              )
            }
          >
            {allSelected ? '전체 해제' : '전체 선택'}
          </button>
        </div>
        {divisions.map((division) => (
          <label
            key={division.division_id}
            className={`flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-4 text-sm font-medium ${selectedIds.includes(division.division_id) ? 'border-indigo-300 bg-indigo-50 text-indigo-950' : 'border-slate-200 bg-white text-slate-700'}`}
          >
            <input
              type="checkbox"
              className="size-4 shrink-0 accent-indigo-600"
              checked={selectedIds.includes(division.division_id)}
              onChange={(event) =>
                setSelection((current) =>
                  event.target.checked
                    ? [...current, division.division_id]
                    : current.filter((id) => id !== division.division_id),
                )
              }
            />
            <span className="min-w-0 break-words">{division.name}</span>
          </label>
        ))}
        <p role="status" className="text-xs leading-6 text-slate-500">
          {selectedIds.length
            ? `${selectedIds.length}개 유형을 한 화면에 함께 표시합니다.`
            : '표시할 유형을 1개 이상 선택하세요.'}
        </p>
      </fieldset>
    </ModalDialog>
  );
}
