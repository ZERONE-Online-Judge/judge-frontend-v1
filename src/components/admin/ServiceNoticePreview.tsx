import type { PickNotice } from './noticeDraft';

/** Service notices are plain text; preview the same line breaks as the public page. */
export default function ServiceNoticePreview({
  notice,
}: {
  notice: PickNotice;
}) {
  return (
    <article className="admin-notice-preview" aria-label="공지 미리보기">
      <div className="admin-preview-meta">
        <span
          className={['admin-pill', notice.emergency && 'admin-pill--urgent']
            .filter(Boolean)
            .join(' ')}
        >
          {notice.emergency ? '긴급 공지' : '서비스 공지'}
        </span>
        <span>ZOJ</span>
      </div>
      <h2>{notice.title.trim() || '공지 제목을 입력하세요'}</h2>
      {notice.summary.trim() &&
      notice.summary.trim() !== notice.title.trim() ? (
        <div className="admin-preview-summary">{notice.summary.trim()}</div>
      ) : null}
      <div className="admin-preview-body">
        {notice.body.trim() || '작성한 본문이 여기에 표시됩니다.'}
      </div>
    </article>
  );
}
