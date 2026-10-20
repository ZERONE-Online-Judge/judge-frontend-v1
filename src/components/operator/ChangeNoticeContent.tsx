export default function ChangeNoticeContent({
  title,
  body,
}: {
  title: string;
  body: string;
}) {
  return (
    <article className="grid gap-4 rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
      <div className="flex items-start gap-2.5">
        <span className="shrink-0 rounded bg-rose-50 px-2 py-1 text-xs font-semibold text-rose-700">
          긴급
        </span>
        <h3 className="min-w-0 text-base font-semibold break-words text-slate-950">
          {title}
        </h3>
      </div>
      <p className="max-h-80 overflow-y-auto text-sm leading-7 break-words whitespace-pre-wrap text-slate-700">
        {body}
      </p>
    </article>
  );
}
