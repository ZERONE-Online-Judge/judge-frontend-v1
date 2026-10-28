import InterfaceIcon from '@/components/common/InterfaceIcon';

export default function EditorTransferLink({
  contestId,
  activeDivisionId,
}: {
  contestId: string;
  activeDivisionId: string;
}) {
  const query = new URLSearchParams({ contest: contestId });
  if (activeDivisionId) query.set('division', activeDivisionId);
  return (
    <a
      href={`https://editor.zoj.kr/problems/zoj-transfer?${query}`}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-2 rounded-lg border border-indigo-200 bg-white px-3 py-2 text-sm font-semibold text-indigo-700"
    >
      Editor에서 가져오기
      <InterfaceIcon name="arrowUpRight" />
      <span className="sr-only">(새 탭)</span>
    </a>
  );
}
