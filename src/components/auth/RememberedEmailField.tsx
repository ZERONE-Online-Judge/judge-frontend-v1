import { useEffect, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { isPresentationEmail } from '@/domains/presentationAccess/session';
import './RememberedEmailField.css';

type RememberedEmailFieldProps = {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  readOnly?: boolean;
  placeholder?: string;
  error?: string;
  remembered: {
    enabled: boolean;
    emails: string[];
    setEnabled: (enabled: boolean) => void;
    remove: (email: string) => void;
    clear: () => void;
  };
};

export default function RememberedEmailField({
  id,
  label,
  value,
  onChange,
  disabled = false,
  readOnly = false,
  placeholder,
  error,
  remembered,
}: RememberedEmailFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [browseAll, setBrowseAll] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const presentation = isPresentationEmail(value);
  const editable = !disabled && !readOnly && !presentation;
  const query = value.trim().toLowerCase();
  const emails = remembered.emails.filter(
    (email) => !isPresentationEmail(email),
  );
  const filtered =
    browseAll || emails.includes(query)
      ? emails
      : emails.filter((email) => email.includes(query));
  const expanded = open && editable && filtered.length > 0;
  const selectedIndex = activeIndex < filtered.length ? activeIndex : -1;
  const listId = `${id}-saved-list`;

  useEffect(() => {
    if (!expanded || selectedIndex < 0) return;
    const dropdown = dropdownRef.current;
    const option = dropdown?.querySelector<HTMLElement>(
      '[role="option"][aria-selected="true"]',
    );
    if (!dropdown || !option || !dropdown.clientHeight) return;
    const top = option.offsetTop;
    const bottom = top + option.offsetHeight;
    if (top < dropdown.scrollTop) dropdown.scrollTop = top;
    else if (bottom > dropdown.scrollTop + dropdown.clientHeight)
      dropdown.scrollTop = bottom - dropdown.clientHeight;
  }, [expanded, selectedIndex]);

  function select(email: string) {
    inputRef.current?.focus();
    onChange(email);
    setOpen(false);
    setBrowseAll(false);
    setActiveIndex(-1);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (!editable || !filtered.length) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const direction = event.key === 'ArrowDown' ? 1 : -1;
      setActiveIndex(
        expanded && selectedIndex >= 0
          ? (selectedIndex + direction + filtered.length) % filtered.length
          : direction > 0
            ? 0
            : filtered.length - 1,
      );
      setOpen(true);
    } else if (event.key === 'Enter' && expanded && selectedIndex >= 0) {
      event.preventDefault();
      select(filtered[selectedIndex]);
    } else if (event.key === 'Escape' && expanded) {
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
      setBrowseAll(false);
      setActiveIndex(-1);
    }
  }

  return (
    <div className="remembered-email-field">
      <div className="login-field">
        <label htmlFor={id}>{label}</label>
        <div
          className="remembered-email-control"
          onBlur={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget)) {
              setOpen(false);
              setBrowseAll(false);
              setActiveIndex(-1);
            }
          }}
        >
          <input
            ref={inputRef}
            id={id}
            name="username"
            type="email"
            role="combobox"
            autoComplete="username"
            inputMode="email"
            autoCapitalize="none"
            spellCheck={false}
            value={value}
            disabled={disabled}
            readOnly={readOnly}
            placeholder={placeholder}
            aria-autocomplete="list"
            aria-expanded={expanded}
            aria-controls={expanded ? listId : undefined}
            aria-activedescendant={
              expanded && selectedIndex >= 0
                ? `${id}-saved-${selectedIndex}`
                : undefined
            }
            aria-invalid={Boolean(error)}
            aria-describedby={error ? `${id}-error` : undefined}
            className={
              !readOnly && !presentation && emails.length
                ? 'remembered-email-input-with-toggle'
                : undefined
            }
            onFocus={() => {
              if (editable && filtered.length) setOpen(true);
            }}
            onChange={(event) => {
              onChange(event.target.value);
              setActiveIndex(-1);
              setBrowseAll(false);
              setOpen(true);
            }}
            onKeyDown={handleKeyDown}
          />
          {!readOnly && !presentation && emails.length > 0 && (
            <button
              type="button"
              className="remembered-email-toggle"
              disabled={disabled}
              aria-label="저장된 이메일 보기"
              aria-expanded={expanded}
              aria-controls={expanded ? listId : undefined}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                const nextOpen = !expanded;
                inputRef.current?.focus();
                setBrowseAll(nextOpen);
                setOpen(nextOpen);
                setActiveIndex(-1);
              }}
            >
              <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
                <path
                  d="m5.5 7.5 4.5 4.5 4.5-4.5"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          )}
          {expanded && (
            <div ref={dropdownRef} className="remembered-email-dropdown">
              <div className="remembered-email-dropdown-heading">
                <span>저장된 이메일</span>
                <button
                  type="button"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => {
                    remembered.clear();
                    setOpen(false);
                    setActiveIndex(-1);
                  }}
                >
                  모두 삭제
                </button>
              </div>
              <div id={listId} role="listbox" aria-label="저장된 이메일">
                {filtered.map((email, index) => (
                  <div
                    key={email}
                    role="presentation"
                    className="remembered-email-option-row"
                  >
                    <button
                      id={`${id}-saved-${index}`}
                      type="button"
                      role="option"
                      aria-selected={selectedIndex === index}
                      tabIndex={-1}
                      className="remembered-email-option"
                      onMouseDown={(event) => event.preventDefault()}
                      onPointerMove={() => setActiveIndex(index)}
                      onClick={() => select(email)}
                    >
                      {email}
                    </button>
                    <button
                      type="button"
                      className="remembered-email-remove"
                      aria-label={`${email} 저장 삭제`}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => {
                        remembered.remove(email);
                        setActiveIndex(-1);
                      }}
                    >
                      <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
                        <path
                          d="m6.5 6.5 7 7m0-7-7 7"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          strokeLinecap="round"
                        />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
        {error && (
          <p id={`${id}-error`} role="alert" className="login-field-error">
            {error}
          </p>
        )}
      </div>
      {!presentation && (
        <div className="remembered-email-preference">
          <label>
            <input
              type="checkbox"
              checked={remembered.enabled}
              disabled={disabled}
              onChange={(event) => remembered.setEnabled(event.target.checked)}
            />
            <span>이메일(아이디) 저장</span>
          </label>
          <span className="remembered-email-device-note">
            이 브라우저에만 저장됩니다.
          </span>
        </div>
      )}
    </div>
  );
}
