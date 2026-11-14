import { useEffect, useId, useRef, useState } from 'react';
import InterfaceIcon from '@/components/common/InterfaceIcon';
import type { PresentationTheme } from '@/domains/submissionScoreboard/presentationDisplayPreferences';

type Division = { division_id: string; name: string };

type Props = {
  theme: PresentationTheme;
  fontScale: number;
  onThemeChange: (theme: PresentationTheme) => void;
  onFontScaleChange: (scale: number) => void;
  autoScrollVertical: boolean;
  autoScrollHorizontal: boolean;
  onAutoScrollVerticalChange: (enabled: boolean) => void;
  onAutoScrollHorizontalChange: (enabled: boolean) => void;
  onOpenChange?: (open: boolean) => void;
  availableDivisions: Division[];
  /** An empty selection represents all available divisions. */
  selectedDivisionIds: string[];
  onDivisionIdsChange: (ids: string[]) => void;
  soundEnabled: boolean;
  soundVolume: number;
  onSoundVolumeChange: (volume: number) => void;
  onSoundEnabledChange: (enabled: boolean) => void;
  onTestSound: () => void;
  soundStatus?: string;
};

const themes: { value: PresentationTheme; label: string }[] = [
  { value: 'dark', label: '다크' },
  { value: 'light', label: '라이트' },
  { value: 'contrast', label: '고대비' },
];

export default function PresentationDisplaySettings({
  theme,
  fontScale,
  onThemeChange,
  onFontScaleChange,
  autoScrollVertical,
  autoScrollHorizontal,
  onAutoScrollVerticalChange,
  onAutoScrollHorizontalChange,
  onOpenChange,
  availableDivisions,
  selectedDivisionIds,
  onDivisionIdsChange,
  soundEnabled,
  soundVolume,
  onSoundVolumeChange,
  onSoundEnabledChange,
  onTestSound,
  soundStatus,
}: Props) {
  const [open, setOpen] = useState(false);
  const openRef = useRef(false);
  const openChangeRef = useRef(onOpenChange);
  const [fullscreen, setFullscreen] = useState(
    Boolean(document.fullscreenElement),
  );
  const [fullscreenError, setFullscreenError] = useState('');
  const [showFullscreenHint, setShowFullscreenHint] = useState(false);
  const fullscreenSupported =
    typeof document.documentElement.requestFullscreen === 'function';
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const id = useId();
  const checkedIds =
    selectedDivisionIds.length === 0
      ? availableDivisions.map((division) => division.division_id)
      : selectedDivisionIds.filter((divisionId) =>
          availableDivisions.some(
            (division) => division.division_id === divisionId,
          ),
        );
  const allSelected =
    availableDivisions.length > 0 &&
    checkedIds.length === availableDivisions.length;

  useEffect(() => {
    openRef.current = open;
    openChangeRef.current = onOpenChange;
    onOpenChange?.(open);
  }, [open, onOpenChange]);

  useEffect(
    () => () => {
      if (openRef.current) openChangeRef.current?.(false);
    },
    [],
  );

  useEffect(() => {
    const update = () => {
      const active = Boolean(document.fullscreenElement);
      setFullscreen(active);
      setShowFullscreenHint(active);
      if (active) setOpen(false);
    };
    document.addEventListener('fullscreenchange', update);
    return () => document.removeEventListener('fullscreenchange', update);
  }, []);

  useEffect(() => {
    if (!fullscreen || !showFullscreenHint) return;
    const timer = window.setTimeout(() => setShowFullscreenHint(false), 3_000);
    return () => window.clearTimeout(timer);
  }, [fullscreen, showFullscreenHint]);

  async function toggleFullscreen() {
    setFullscreenError('');
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else {
        const display = containerRef.current?.closest<HTMLElement>(
          '.presentation-display',
        );
        await (display ?? document.documentElement).requestFullscreen();
      }
    } catch {
      setFullscreenError(
        '전체화면으로 전환하지 못했습니다. 브라우저 설정을 확인해 주세요.',
      );
      setOpen(true);
    }
  }

  useEffect(() => {
    if (!open) return;
    panelRef.current?.focus();
    const dismissOutside = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        !containerRef.current?.contains(event.target)
      ) {
        setOpen(false);
      }
    };
    const dismissEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
      triggerRef.current?.focus();
    };
    document.addEventListener('pointerdown', dismissOutside);
    document.addEventListener('keydown', dismissEscape, true);
    return () => {
      document.removeEventListener('pointerdown', dismissOutside);
      document.removeEventListener('keydown', dismissEscape, true);
    };
  }, [open]);

  function close() {
    setOpen(false);
    triggerRef.current?.focus();
  }

  function toggleDivision(divisionId: string) {
    const next = checkedIds.includes(divisionId)
      ? checkedIds.filter((value) => value !== divisionId)
      : [...checkedIds, divisionId];
    if (next.length === 0) return;
    onDivisionIdsChange(next.length === availableDivisions.length ? [] : next);
  }

  if (fullscreen) {
    return showFullscreenHint ? (
      <div className="presentation-fullscreen-hint" role="status">
        전체화면 · <kbd>Esc</kbd>를 눌러 종료
      </div>
    ) : null;
  }

  return (
    <div
      className="presentation-display-settings"
      ref={containerRef}
      onBlur={(event) => {
        if (
          event.relatedTarget instanceof Node &&
          !event.currentTarget.contains(event.relatedTarget)
        ) {
          setOpen(false);
        }
      }}
    >
      <button
        className="presentation-fullscreen-trigger"
        type="button"
        disabled={!fullscreenSupported}
        aria-label={fullscreen ? '전체화면 해제' : '전체화면'}
        title={
          fullscreenSupported
            ? undefined
            : '이 브라우저는 전체화면을 지원하지 않습니다.'
        }
        onClick={() => void toggleFullscreen()}
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
          aria-hidden="true"
        >
          <path
            d={
              fullscreen
                ? 'M9 3v6H3m12-6v6h6M3 15h6v6m12-6h-6v6'
                : 'M9 3H3v6m12-6h6v6M3 15v6h6m12-6v6h-6'
            }
          />
        </svg>
        <span>{fullscreen ? '전체화면 해제' : '전체화면'}</span>
      </button>
      <button
        className="presentation-settings-trigger"
        type="button"
        ref={triggerRef}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? `${id}-panel` : undefined}
        onClick={() => setOpen((previous) => !previous)}
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path
            d="m9 3-.6 2.4-2 1.2-2.4-.6-3 5 1.8 1.8v2.4L1 17l3 5 2.4-.6 2 1.2L9 25h6l.6-2.4 2-1.2 2.4.6 3-5-1.8-1.8v-2.4L23 11l-3-5-2.4.6-2-1.2L15 3Z"
            transform="translate(2 0) scale(.83)"
          />
          <circle cx="12" cy="12" r="3" />
        </svg>
        화면 설정
      </button>
      {open ? (
        <div
          className="presentation-settings-panel"
          ref={panelRef}
          id={`${id}-panel`}
          role="dialog"
          aria-label="프레젠테이션 화면 설정"
          tabIndex={-1}
        >
          <header className="presentation-settings-heading">
            <div>
              <h2>화면 설정</h2>
              <p>현재 열어 둔 화면에만 적용됩니다.</p>
            </div>
            <button
              className="presentation-settings-close"
              type="button"
              aria-label="화면 설정 닫기"
              onClick={close}
            >
              <InterfaceIcon name="close" size={18} />
            </button>
          </header>
          {fullscreenError ? (
            <p className="presentation-settings-error" role="status">
              {fullscreenError}
            </p>
          ) : null}
          <fieldset className="presentation-settings-group">
            <legend>테마</legend>
            <div className="presentation-theme-options">
              {themes.map((option) => (
                <button
                  type="button"
                  key={option.value}
                  aria-pressed={theme === option.value}
                  className="presentation-theme-option"
                  data-swatch={option.value}
                  onClick={() => onThemeChange(option.value)}
                >
                  <span aria-hidden="true">Aa</span>
                  {option.label}
                  {theme === option.value ? (
                    <InterfaceIcon name="check" size={14} />
                  ) : null}
                </button>
              ))}
            </div>
          </fieldset>
          <div className="presentation-settings-group">
            <div className="presentation-settings-label-row">
              <label htmlFor={`${id}-font`}>글자 크기</label>
              <output htmlFor={`${id}-font`}>
                {Math.round(fontScale * 100)}%
              </output>
              <button
                className="presentation-settings-text-button"
                type="button"
                disabled={fontScale === 1}
                onClick={() => onFontScaleChange(1)}
              >
                기본 크기
              </button>
            </div>
            <input
              id={`${id}-font`}
              className="presentation-font-slider"
              type="range"
              min="80"
              max="300"
              step="10"
              value={Math.round(fontScale * 100)}
              onChange={(event) =>
                onFontScaleChange(Number(event.target.value) / 100)
              }
              aria-valuetext={`${Math.round(fontScale * 100)}%`}
            />
            <div className="presentation-font-range" aria-hidden="true">
              <span>작게 80%</span>
              <span>크게 300%</span>
            </div>
          </div>
          <div className="presentation-settings-group">
            <div className="presentation-settings-label-row">
              <span>자동 스크롤</span>
            </div>
            <button
              className="presentation-sound-toggle"
              type="button"
              role="switch"
              aria-label="세로 자동 스크롤"
              aria-checked={autoScrollVertical}
              aria-describedby={`${id}-autoscroll-hint`}
              onClick={() => onAutoScrollVerticalChange(!autoScrollVertical)}
            >
              <span>
                <strong>세로 자동 스크롤</strong>
              </span>
              <i aria-hidden="true" />
            </button>
            <button
              className="presentation-sound-toggle"
              type="button"
              role="switch"
              aria-label="가로 자동 스크롤"
              aria-checked={autoScrollHorizontal}
              aria-describedby={`${id}-autoscroll-hint`}
              onClick={() =>
                onAutoScrollHorizontalChange(!autoScrollHorizontal)
              }
            >
              <span>
                <strong>가로 자동 스크롤</strong>
              </span>
              <i aria-hidden="true" />
            </button>
            <p
              id={`${id}-autoscroll-hint`}
              className="presentation-settings-hint"
            >
              각 유형의 표에서 넘치는 내용을 천천히 보여줍니다.
            </p>
          </div>
          <div className="presentation-settings-group">
            <div className="presentation-settings-label-row">
              <span>효과음</span>
              <button
                className="presentation-settings-text-button"
                type="button"
                onClick={onTestSound}
              >
                소리 테스트
              </button>
            </div>
            <button
              className="presentation-sound-toggle"
              type="button"
              role="switch"
              aria-checked={soundEnabled}
              aria-label="효과음"
              onClick={() => onSoundEnabledChange(!soundEnabled)}
            >
              <span>
                <strong>{soundEnabled ? '효과음 켜짐' : '효과음 꺼짐'}</strong>
                <small>
                  {soundStatus ||
                    '카운트다운과 일정 알림에 효과음을 재생합니다.'}
                </small>
              </span>
              <i aria-hidden="true" />
            </button>
            <div className="presentation-sound-level">
              <div className="presentation-settings-label-row">
                <label htmlFor={`${id}-volume`}>효과음 음량</label>
                <output htmlFor={`${id}-volume`}>
                  {soundVolume === 0
                    ? '무음'
                    : `${Math.round(soundVolume * 100)}%`}
                </output>
              </div>
              <input
                id={`${id}-volume`}
                className="presentation-font-slider"
                type="range"
                min="0"
                max="100"
                step="5"
                value={Math.round(soundVolume * 100)}
                aria-valuetext={
                  soundVolume === 0
                    ? '무음'
                    : `${Math.round(soundVolume * 100)}%`
                }
                onChange={(event) =>
                  onSoundVolumeChange(Number(event.target.value) / 100)
                }
              />
              <div className="presentation-font-range" aria-hidden="true">
                <span>무음 0%</span>
                <span>최대 100%</span>
              </div>
            </div>
            <p className="presentation-settings-hint">
              소리 테스트로 음량을 맞춰 주세요. 기기·브라우저의 음량도 함께
              적용됩니다.
            </p>
          </div>
          <fieldset className="presentation-settings-group">
            <legend>표시할 유형</legend>
            <button
              type="button"
              className="presentation-division-all"
              aria-pressed={allSelected}
              disabled={availableDivisions.length === 0}
              onClick={() => onDivisionIdsChange([])}
            >
              <InterfaceIcon name="check" size={15} />
              전체 유형
            </button>
            {availableDivisions.length ? (
              <div className="presentation-division-options">
                {availableDivisions.map((division) => (
                  <label key={division.division_id}>
                    <input
                      type="checkbox"
                      checked={checkedIds.includes(division.division_id)}
                      disabled={
                        checkedIds.length === 1 &&
                        checkedIds.includes(division.division_id)
                      }
                      onChange={() => toggleDivision(division.division_id)}
                    />
                    <span>{division.name}</span>
                  </label>
                ))}
              </div>
            ) : (
              <p className="presentation-settings-hint">
                유형을 불러오는 중입니다.
              </p>
            )}
            <p className="presentation-settings-hint">
              한 개 이상 선택해 주세요.
            </p>
          </fieldset>
        </div>
      ) : null}
    </div>
  );
}
