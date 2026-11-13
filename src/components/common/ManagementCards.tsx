import { useId, type ReactNode } from 'react';

export function ManagementPanel({
  actions,
  children,
  className,
  description,
  title,
}: {
  actions?: ReactNode;
  className?: string;
  children: ReactNode;
  description?: ReactNode;
  title: string;
}) {
  const titleId = useId();

  return (
    <section
      aria-labelledby={titleId}
      className={['zoj-management-panel', className].filter(Boolean).join(' ')}
      data-edit-card
    >
      <header className="zoj-management-panel__header">
        <div className="zoj-management-panel__heading">
          <h2 id={titleId}>{title}</h2>
          {description ? <p>{description}</p> : null}
        </div>
        {actions ? (
          <div className="zoj-management-panel__actions">{actions}</div>
        ) : null}
      </header>
      {children}
    </section>
  );
}

export function SettingsCard({
  children,
  description,
  disabled,
  hint,
  title,
}: {
  children: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
  hint?: ReactNode;
  title: string;
}) {
  const descriptionId = useId();
  const hintId = useId();

  return (
    <fieldset
      aria-describedby={
        [description && descriptionId, hint && hintId]
          .filter(Boolean)
          .join(' ') || undefined
      }
      className="zoj-settings-card"
      disabled={disabled}
    >
      <legend>{title}</legend>
      <div className="zoj-settings-card__body">
        {description ? (
          <p className="zoj-settings-card__description" id={descriptionId}>
            {description}
          </p>
        ) : null}
        {children}
        {hint ? (
          <p className="zoj-settings-note" id={hintId}>
            {hint}
          </p>
        ) : null}
      </div>
    </fieldset>
  );
}

export function ChoiceCard({
  checked,
  description,
  disabled,
  hint,
  name,
  onChange,
  title,
  type = 'radio',
  value,
}: {
  checked: boolean;
  description?: ReactNode;
  disabled?: boolean;
  hint?: ReactNode;
  name?: string;
  onChange: (checked: boolean) => void;
  title: string;
  type?: 'radio' | 'checkbox';
  value?: string;
}) {
  const titleId = useId();
  const descriptionId = useId();
  const hintId = useId();

  return (
    <label className="zoj-choice-card" data-selected={checked}>
      <input
        aria-labelledby={titleId}
        aria-describedby={
          [description && descriptionId, hint && hintId]
            .filter(Boolean)
            .join(' ') || undefined
        }
        checked={checked}
        disabled={disabled}
        name={name}
        onChange={(event) => onChange(event.target.checked)}
        type={type}
        value={value}
      />
      <span className="zoj-choice-card__content">
        <strong id={titleId}>{title}</strong>
        {description ? (
          <span className="zoj-choice-card__description" id={descriptionId}>
            {description}
          </span>
        ) : null}
        {hint ? (
          <span className="zoj-choice-card__hint" id={hintId}>
            {hint}
          </span>
        ) : null}
      </span>
    </label>
  );
}
