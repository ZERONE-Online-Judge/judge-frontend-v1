import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { FileDropZone } from './FileDropZone';
import { useFileDrop } from '../hooks/useFileDrop';
import {
  imageEditContextMatches,
  insertStatementImage,
  moveStatementImage,
  parseStatementImages,
  replaceStatementImage,
  statementImageMarkup,
  statementImagePreviewSource,
  statementImageTextEditable,
  validateStatementImageUpload,
  type ImageAlignment,
  type StatementImageAsset,
  type StatementImageOccurrence,
} from '../lib/statementImages';
import StatementImage from './StatementImage';
import { statementImageStyle, statementUrl } from '../lib/statementHtml';
import './StatementImageTools.css';

export type { StatementImageAsset } from '../lib/statementImages';
export type StatementImageToolsProps = {
  identity: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  assets: StatementImageAsset[];
  onUpload?: (file: File) => Promise<StatementImageAsset>;
  readOnly?: boolean;
  children: ReactNode;
  renderThumbnail?: (asset: StatementImageAsset) => ReactNode;
};
type Context = {
  identity: string;
  value: string;
  position: number;
  version: number;
};

function ImageDialog({
  context,
  label,
  assets,
  busy,
  valid,
  onClose,
  onApply,
  onUpload,
  renderThumbnail,
}: {
  context: Context;
  label: string;
  assets: StatementImageAsset[];
  busy: boolean;
  valid: boolean;
  onClose: () => void;
  onApply: (value: string | null) => void;
  onUpload?: (file: File) => void;
  renderThumbnail?: (asset: StatementImageAsset) => ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const title = useId();
  const images = useMemo(
    () => parseStatementImages(context.value),
    [context.value],
  );
  const [selected, setSelected] = useState<StatementImageOccurrence | null>(
    null,
  );
  const [assetId, setAssetId] = useState(assets[0]?.id ?? '');
  const [alt, setAlt] = useState(assets[0]?.name ?? '');
  const [align, setAlign] = useState<ImageAlignment>('center');
  const [sizeMode, setSizeMode] = useState('');
  const [sizeValue, setSizeValue] = useState('70');
  const [sizeUnit, setSizeUnit] = useState<'%' | 'px'>('%');
  const [sizeTouched, setSizeTouched] = useState(false);
  const width =
    sizeMode === 'custom'
      ? `${sizeValue}${sizeUnit}`
      : sizeMode === 'legacy'
        ? ''
        : sizeMode;
  const sizeNumber = Number(sizeValue);
  const sizeError =
    sizeMode === 'custom' &&
    (!/^\d+(?:\.\d+)?$/.test(sizeValue) ||
      !Number.isFinite(sizeNumber) ||
      sizeNumber < 1 ||
      sizeNumber > (sizeUnit === '%' ? 100 : 4096))
      ? `너비는 1~${sizeUnit === '%' ? '100%' : '4096px'}로 입력해 주세요.`
      : '';
  const legacy = selected && !sizeTouched ? selected.legacy : undefined;
  const layoutProperties = {
    ...legacy,
    'data-zoj-align': align,
    'data-zoj-width': sizeError ? undefined : width,
  };
  const asset = assets.find((item) => item.id === assetId);
  const source = selected?.source ?? asset?.source ?? '';
  const previewSource = statementUrl(
    statementImagePreviewSource(source, assets),
    'src',
  );
  const locked = busy || !valid;
  const layoutLocked = locked || !source || selected?.layoutEditable === false;
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const previous = document.activeElement;
    dialog.showModal();
    dialog.focus();
    return () => {
      dialog.close();
      if (previous instanceof HTMLElement && previous.isConnected)
        previous.focus({ preventScroll: true });
    };
  }, []);
  function selectImage(image: StatementImageOccurrence) {
    setSelected(image);
    setAlt(image.alt);
    setAlign(image.align ?? 'center');
    const match = /^(\d+(?:\.\d+)?)(%|px)$/.exec(image.width ?? '');
    setSizeMode(
      Object.keys(image.legacy ?? {}).length
        ? 'legacy'
        : image.width
          ? ['25%', '50%', '70%', '100%'].includes(image.width)
            ? image.width
            : 'custom'
          : '',
    );
    setSizeValue(match?.[1] ?? '70');
    setSizeUnit(match?.[2] === 'px' ? 'px' : '%');
    setSizeTouched(false);
  }
  return createPortal(
    <dialog
      ref={ref}
      className="statement-image-dialog"
      tabIndex={-1}
      aria-labelledby={title}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <section className="statement-image-dialog__panel">
        <header>
          <div>
            <h2 id={title}>이미지 추가·관리</h2>
            <p>{label} · 그림을 고르면 위치와 크기를 바꿀 수 있습니다.</p>
          </div>
          <button type="button" aria-label="이미지 관리 닫기" onClick={onClose}>
            ✕
          </button>
        </header>
        <div className="statement-image-dialog__body">
          {!valid && (
            <p className="statement-image-warning" role="status">
              편집 내용이 바뀌었습니다. 창을 닫고 이미지 관리를 다시 열어
              주세요.
            </p>
          )}
          {onUpload && (
            <FileDropZone
              accept="image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp"
              disabled={locked}
              onFiles={(files) => onUpload(files[0])}
              label="이미지를 끌어 놓으세요"
              hint="PNG · JPEG · WEBP 이미지 한 개를 추가합니다."
            >
              <label
                className={`statement-image-upload ${locked ? 'is-disabled' : ''}`}
              >
                새 이미지 업로드
                <input
                  aria-label="새 이미지 업로드"
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  disabled={locked}
                  onChange={(e) => {
                    const file = e.currentTarget.files?.[0];
                    e.currentTarget.value = '';
                    if (file) onUpload(file);
                  }}
                />
              </label>
            </FileDropZone>
          )}
          <p className="statement-image-help">
            PNG · JPEG · WEBP, 최대 16MiB. 붙여넣거나 편집 영역에 끌어 놓아도
            추가됩니다.
          </p>
          <section
            aria-label="사용할 이미지"
            className="statement-image-section"
          >
            <h3>첨부 이미지</h3>
            {assets.length ? (
              <div className="statement-image-gallery">
                {assets.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    aria-pressed={!selected && item.id === assetId}
                    disabled={locked}
                    onClick={() => {
                      setSelected(null);
                      setAssetId(item.id);
                      setAlt(item.name);
                      setAlign('center');
                      setSizeMode('');
                      setSizeTouched(false);
                    }}
                  >
                    <span className="statement-image-thumbnail">
                      {renderThumbnail ? (
                        renderThumbnail(item)
                      ) : item.previewUrl ? (
                        <StatementImage
                          src={item.previewUrl || ''}
                          alt={item.name}
                          compact
                        />
                      ) : (
                        <span aria-hidden="true">▧</span>
                      )}
                    </span>
                    <span>{item.name}</span>
                  </button>
                ))}
              </div>
            ) : (
              <p className="statement-image-empty">첨부된 이미지가 없습니다.</p>
            )}
          </section>
          {images.length > 0 && (
            <section
              className="statement-image-section"
              aria-label="본문에 사용한 이미지"
            >
              <h3>
                본문에 사용한 이미지 <span>{images.length}개</span>
              </h3>
              <div className="statement-image-occurrences">
                {images.map((image, index) => (
                  <button
                    key={image.start}
                    type="button"
                    aria-pressed={selected?.start === image.start}
                    disabled={locked}
                    onClick={() => selectImage(image)}
                  >
                    <span>{index + 1}</span>
                    <span>{image.alt || image.source}</span>
                    <small>{image.width || '자동 크기'}</small>
                  </button>
                ))}
              </div>
            </section>
          )}
          <section className="statement-image-section">
            <h3>{selected ? '선택한 이미지 수정' : '이미지 삽입'}</h3>
            {selected?.layoutEditable === false && (
              <p className="statement-image-warning" role="status">
                회전·자르기 등 별도 TeX 설정이 있는 이미지입니다. 정렬과 크기는
                원문에서 수정해 주세요. 문단 이동과 제거는 할 수 있습니다.
              </p>
            )}
            <label>
              이미지 설명
              <input
                value={alt}
                disabled={layoutLocked}
                onChange={(e) => setAlt(e.target.value)}
                placeholder="그림을 설명해 주세요"
              />
            </label>
            <div className="statement-image-options">
              <div className="statement-image-alignment">
                <span>정렬</span>
                <div
                  className="statement-image-align"
                  role="group"
                  aria-label="이미지 정렬"
                >
                  {(
                    [
                      ['left', '왼쪽'],
                      ['center', '가운데'],
                      ['right', '오른쪽'],
                    ] as const
                  ).map(([value, text]) => (
                    <button
                      type="button"
                      key={value}
                      aria-pressed={align === value}
                      disabled={layoutLocked}
                      onClick={() => setAlign(value)}
                    >
                      {text}
                    </button>
                  ))}
                </div>
              </div>
              <label>
                너비
                <select
                  aria-label="이미지 너비"
                  value={sizeMode}
                  disabled={layoutLocked}
                  onChange={(e) => {
                    setSizeMode(e.target.value);
                    setSizeTouched(true);
                  }}
                >
                  <option value="">자동 · 화면에 맞게</option>
                  {['25%', '50%', '70%', '100%'].map((size) => (
                    <option key={size}>{size}</option>
                  ))}
                  <option value="custom">직접 입력</option>
                  {sizeMode === 'legacy' && (
                    <option value="legacy">기존 크기 유지</option>
                  )}
                </select>
              </label>
            </div>
            {sizeMode === 'custom' && (
              <div className="statement-image-custom-size">
                <label>
                  너비 값
                  <input
                    type="number"
                    inputMode="decimal"
                    min="1"
                    max={sizeUnit === '%' ? 100 : 4096}
                    step="any"
                    aria-label="이미지 너비 값"
                    aria-invalid={Boolean(sizeError)}
                    aria-describedby={
                      sizeError ? `${title}-size-error` : undefined
                    }
                    value={sizeValue}
                    disabled={layoutLocked}
                    onChange={(e) => {
                      setSizeValue(e.target.value);
                      setSizeTouched(true);
                    }}
                  />
                </label>
                <label>
                  단위
                  <select
                    aria-label="이미지 너비 단위"
                    value={sizeUnit}
                    disabled={layoutLocked}
                    onChange={(e) => {
                      setSizeUnit(e.target.value as '%' | 'px');
                      setSizeTouched(true);
                    }}
                  >
                    <option value="%">%</option>
                    <option value="px">px</option>
                  </select>
                </label>
              </div>
            )}
            {sizeError && (
              <p
                className="statement-image-size-error"
                role="alert"
                id={`${title}-size-error`}
              >
                {sizeError}
              </p>
            )}
            <p className="statement-image-help">
              자동 크기는 본문 폭에 맞춰 최대 70~100%로 표시하며 작은 원본은
              확대하지 않습니다. 너비를 지정하면 원본 비율을 유지합니다.
            </p>
            {previewSource && !sizeError && (
              <div
                className="statement-image-layout-preview"
                aria-label="이미지 배치 미리보기"
              >
                <span>배치 미리보기</span>
                <div>
                  <StatementImage
                    src={previewSource}
                    alt={alt}
                    style={statementImageStyle(layoutProperties)}
                  />
                </div>
              </div>
            )}
            {selected && (
              <div className="statement-image-moves">
                <button
                  type="button"
                  disabled={locked}
                  onClick={() =>
                    onApply(
                      moveStatementImage(context.value, selected, 'above'),
                    )
                  }
                >
                  위 문단으로
                </button>
                <button
                  type="button"
                  disabled={locked}
                  onClick={() =>
                    onApply(
                      moveStatementImage(context.value, selected, 'below'),
                    )
                  }
                >
                  아래 문단으로
                </button>
                <button
                  type="button"
                  disabled={locked}
                  onClick={() =>
                    onApply(
                      moveStatementImage(
                        context.value,
                        selected,
                        context.position,
                      ),
                    )
                  }
                >
                  커서 위치로
                </button>
                <button
                  className="statement-image-remove"
                  type="button"
                  disabled={locked}
                  onClick={() =>
                    onApply(replaceStatementImage(context.value, selected, ''))
                  }
                >
                  본문에서 제거
                </button>
              </div>
            )}
          </section>
        </div>
        <footer>
          <p>
            {busy
              ? '이미지 업로드 중…'
              : '원본 파일은 보존됩니다. 변경 후 지문을 저장해 주세요.'}
          </p>
          <button type="button" onClick={onClose}>
            닫기
          </button>
          <button
            type="button"
            className="statement-image-primary"
            disabled={layoutLocked || Boolean(sizeError)}
            onClick={() => {
              if (sizeError) return;
              const markup = statementImageMarkup(
                { source, alt, align, width },
                legacy,
              );
              onApply(
                selected
                  ? replaceStatementImage(context.value, selected, markup)
                  : insertStatementImage(
                      context.value,
                      context.position,
                      markup,
                    ),
              );
            }}
          >
            {selected ? '변경 적용' : '커서 위치에 삽입'}
          </button>
        </footer>
      </section>
    </dialog>,
    document.body,
  );
}

export default function StatementImageTools(props: StatementImageToolsProps) {
  const [context, setContext] = useState<Context | null>(null);
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const latest = useRef(props);
  const version = useRef(0);
  const mounted = useRef(false);
  const uploading = useRef(false);
  const selection = useRef({
    identity: props.identity,
    value: props.value,
    position: props.value.length,
  });
  const readOnly = props.readOnly || !statementImageTextEditable(props.value);
  useLayoutEffect(() => {
    if (
      latest.current.identity !== props.identity ||
      latest.current.value !== props.value ||
      Boolean(latest.current.readOnly) !== Boolean(readOnly)
    )
      version.current++;
    latest.current = { ...props, readOnly };
  });
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  function capture(target: EventTarget | null) {
    if (
      !(target instanceof HTMLTextAreaElement) ||
      target.value !== props.value
    )
      return;
    selection.current = {
      identity: props.identity,
      value: props.value,
      position: target.selectionStart,
    };
  }
  function currentContext(): Context {
    return {
      ...(imageEditContextMatches(props, selection.current)
        ? selection.current
        : {
            identity: props.identity,
            value: props.value,
            position: props.value.length,
          }),
      version: version.current,
    };
  }
  const matches = (captured: Context) =>
    captured.version === version.current &&
    imageEditContextMatches(latest.current, captured);
  function apply(captured: Context, value: string | null) {
    if (!mounted.current || !matches(captured)) {
      if (mounted.current)
        setNotice(
          '편집 내용이 바뀌었습니다. 이미지를 추가할 위치를 다시 선택해 주세요.',
        );
      return;
    }
    if (value === null) {
      setNotice(
        '코드나 이미지 중간에는 삽입할 수 없습니다. 문단 사이에 커서를 놓아 주세요.',
      );
      return;
    }
    latest.current.onChange(value);
    setContext(null);
    setNotice('이미지를 반영했습니다. 지문을 저장해 주세요.');
  }
  async function upload(file: File, captured: Context) {
    if (!props.onUpload || readOnly || uploading.current) return;
    uploading.current = true;
    setBusy(true);
    setNotice('');
    try {
      await validateStatementImageUpload(file);
      if (!mounted.current || !matches(captured)) return;
      const asset = await props.onUpload(file);
      if (!mounted.current) return;
      if (!matches(captured)) {
        setNotice(
          '이미지는 업로드했지만 편집 내용이 바뀌어 삽입하지 않았습니다. 첨부 이미지에서 다시 선택해 주세요.',
        );
        return;
      }
      apply(
        captured,
        insertStatementImage(
          captured.value,
          captured.position,
          statementImageMarkup({
            source: asset.source,
            alt: asset.name,
            align: 'center',
          }),
        ),
      );
    } catch (error) {
      if (mounted.current && latest.current.identity === captured.identity)
        setNotice(
          error instanceof Error
            ? error.message
            : '이미지를 업로드하지 못했습니다. 다시 시도해 주세요.',
        );
    } finally {
      uploading.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  const fileDrop = useFileDrop({
    accept: 'image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp',
    disabled: readOnly || !props.onUpload || busy,
    onFiles: async (files, event) => {
      capture(event?.target ?? null);
      await upload(files[0], currentContext());
    },
    onReject: setNotice,
  });
  return (
    <div
      className="statement-image-tools"
      data-file-drop-zone=""
      data-file-drop-active={fileDrop.isDragging || undefined}
      onSelectCapture={(e) => capture(e.target)}
      onFocusCapture={(e) => capture(e.target)}
      onPasteCapture={(e) => {
        if (readOnly || !props.onUpload) return;
        const file = [...e.clipboardData.files].find((item) =>
          item.type.startsWith('image/'),
        );
        if (!file) return;
        e.preventDefault();
        capture(e.target);
        void upload(file, currentContext());
      }}
      onDragEnterCapture={fileDrop.dropProps.onDragEnter}
      onDragOverCapture={fileDrop.dropProps.onDragOver}
      onDragLeaveCapture={fileDrop.dropProps.onDragLeave}
      onDropCapture={fileDrop.dropProps.onDrop}
    >
      {props.children}
      {!readOnly && (
        <div className="statement-image-toolbar">
          <button
            type="button"
            disabled={busy}
            onClick={(e) => {
              e.preventDefault();
              setNotice('');
              setContext(currentContext());
            }}
          >
            <span aria-hidden="true">▧</span> 이미지 추가·관리
          </button>
          <span>이미지를 끌어 놓거나 붙여넣기 · 정렬과 크기 조절</span>
        </div>
      )}
      {notice && (
        <p className="statement-image-feedback" role="status">
          {notice}
        </p>
      )}
      {context && !readOnly && (
        <ImageDialog
          context={context}
          label={props.label}
          assets={props.assets}
          busy={busy}
          valid={imageEditContextMatches(props, context)}
          onClose={() => {
            version.current++;
            setContext(null);
          }}
          onApply={(value) => apply(context, value)}
          onUpload={
            props.onUpload ? (file) => void upload(file, context) : undefined
          }
          renderThumbnail={props.renderThumbnail}
        />
      )}
    </div>
  );
}
