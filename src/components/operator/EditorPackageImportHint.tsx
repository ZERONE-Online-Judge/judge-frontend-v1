import InterfaceIcon from '@/components/common/InterfaceIcon';

export default function EditorPackageImportHint() {
  return (
    <aside
      aria-label="Polygon Linux 패키지 가져오기 안내"
      className="flex min-w-0 flex-wrap items-center justify-between gap-x-5 gap-y-3 rounded-lg bg-white px-4 py-3 text-sm"
    >
      <div className="min-w-0 flex-1 basis-72">
        <p className="font-semibold text-slate-800">
          Polygon Linux 패키지(ZIP)는 Editor에서 가져올 수 있습니다.
        </p>
        <p className="mt-1 text-xs leading-5 text-slate-600">
          가져온 문제는 Editor의 공통 대회 등록·업데이트 창에서 대회에
          적용하세요.
        </p>
      </div>
      <a
        href="https://editor.zoj.kr/problems?action=import"
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-indigo-200 px-3 py-2 text-sm font-semibold text-indigo-700 hover:bg-indigo-50"
      >
        Editor에서 Linux ZIP 가져오기
        <InterfaceIcon name="arrowUpRight" />
        <span className="sr-only">(새 탭)</span>
      </a>
    </aside>
  );
}
