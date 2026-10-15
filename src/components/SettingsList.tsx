import { useId, useState, type ReactNode } from "react";

/**
 * A titled card grouping related `SettingsItem` rows. `collapsible` groups
 * start folded unless `defaultOpen` is set.
 */
export function SettingsGroup({
  title,
  collapsible = false,
  defaultOpen = false,
  children,
}: {
  title: string;
  collapsible?: boolean;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(!collapsible || defaultOpen);
  const cardId = useId();
  return (
    <section className="settings-group">
      {collapsible ? (
        <button
          type="button"
          className="settings-group-title settings-group-toggle"
          aria-expanded={open}
          aria-controls={cardId}
          onClick={() => setOpen((value) => !value)}
        >
          {title}
          <span className="settings-group-chevron" aria-hidden="true" />
        </button>
      ) : (
        <h3 className="settings-group-title">{title}</h3>
      )}
      {open && (
        <div className="settings-card" id={cardId}>
          {children}
        </div>
      )}
    </section>
  );
}

/**
 * One settings row: label and a one-line description on the left, the
 * control on the right. `wide` controls (dropdowns, inputs, sliders) share a
 * fixed width so their edges line up across rows; compact controls (toggles,
 * buttons) are right-aligned.
 */
export function SettingsItem({
  label,
  description,
  error,
  htmlFor,
  wide = false,
  children,
}: {
  label: string;
  description?: ReactNode;
  /** Replaces the description, in the error color, when set. */
  error?: string | null;
  htmlFor?: string;
  wide?: boolean;
  children: ReactNode;
}) {
  const Label = htmlFor ? "label" : "span";
  return (
    <div className="settings-item">
      <div className="settings-item-text">
        <Label className="settings-item-label" htmlFor={htmlFor}>
          {label}
        </Label>
        {error ? (
          <span
            className="settings-item-desc settings-item-desc--danger"
            title={error}
          >
            {error}
          </span>
        ) : (
          description && (
            <span
              className="settings-item-desc"
              title={typeof description === "string" ? description : undefined}
            >
              {description}
            </span>
          )
        )}
      </div>
      <div
        className={`settings-item-control${wide ? " settings-item-control--wide" : ""}`}
      >
        {children}
      </div>
    </div>
  );
}
