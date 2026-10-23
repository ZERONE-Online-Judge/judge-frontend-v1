import Select from '@/shared/ui/Select';
import {
  boardWritingSettingsFromContest,
  type BoardWritingPolicy,
} from '@/domains/serviceCommunication/boardPolicy';

export default function BoardWritingSettings({
  value,
  onChange,
}: {
  value: BoardWritingPolicy;
  onChange: (value: BoardWritingPolicy) => void;
}) {
  const change = (patch: Partial<BoardWritingPolicy>) =>
    onChange(boardWritingSettingsFromContest({ ...value, ...patch }));
  return (
    <div className="grid gap-6">
      <fieldset className="grid gap-3">
        <legend className="mb-3 text-sm font-semibold text-slate-800">
          게시글 공개 범위
        </legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="grid gap-2 text-sm text-slate-700">
            <span>게시글 공개 범위 선택</span>
            <Select
              value={value.board_question_visibility_policy}
              onChange={(e) =>
                change({
                  board_question_visibility_policy: e.target
                    .value as BoardWritingPolicy['board_question_visibility_policy'],
                })
              }
            >
              <option value="choice">작성자가 선택</option>
              <option value="public">공개 질문만 허용</option>
              <option value="private">비공개 질문만 허용</option>
            </Select>
          </label>
          <label className="grid gap-2 text-sm text-slate-700">
            <span>게시글 기본 공개 범위</span>
            <Select
              value={value.board_question_default_visibility}
              disabled={value.board_question_visibility_policy !== 'choice'}
              onChange={(e) =>
                change({
                  board_question_default_visibility: e.target.value as
                    | 'public'
                    | 'private',
                })
              }
            >
              <option value="public">공개</option>
              <option value="private">비공개 · 작성자 팀과 운영진</option>
            </Select>
          </label>
        </div>
        <p className="text-xs leading-6 text-slate-500">
          새 질문에 적용됩니다. 기존 글의 공개 범위는 게시판에서 개별 변경할 수
          있습니다.
        </p>
      </fieldset>
      <fieldset className="grid gap-3">
        <legend className="mb-3 text-sm font-semibold text-slate-800">
          댓글 작성 범위
        </legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="grid gap-2 text-sm text-slate-700">
            <span>댓글 작성 범위 선택</span>
            <Select
              value={value.board_comment_scope_policy}
              onChange={(e) =>
                change({
                  board_comment_scope_policy: e.target
                    .value as BoardWritingPolicy['board_comment_scope_policy'],
                })
              }
            >
              <option value="choice">작성자가 선택</option>
              <option value="all">전체로 고정</option>
              <option value="operators">운영진만으로 고정</option>
            </Select>
          </label>
          <label className="grid gap-2 text-sm text-slate-700">
            <span>댓글 기본 작성 범위</span>
            <Select
              value={value.board_comment_default_scope}
              disabled={value.board_comment_scope_policy !== 'choice'}
              onChange={(e) =>
                change({
                  board_comment_default_scope: e.target.value as
                    | 'all'
                    | 'operators',
                })
              }
            >
              <option value="all">
                전체 · 글을 볼 수 있는 참가자와 운영진
              </option>
              <option value="operators">운영진만</option>
            </Select>
          </label>
        </div>
        <p className="text-xs leading-6 text-slate-500">
          고정 정책은 기존 질문에도 적용됩니다. 비공개 질문은 작성자 팀과
          운영진만 볼 수 있으며, ‘운영진만’이면 질문 작성자도 댓글을 작성할 수
          없습니다.
        </p>
      </fieldset>
    </div>
  );
}
