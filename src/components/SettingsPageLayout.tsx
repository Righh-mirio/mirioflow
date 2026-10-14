type SettingsPageLayoutProps = {
  title: string;
  description?: string;
  /** Small text under Done (e.g. region and version). */
  footer?: string;
  onDone: () => void;
  children: React.ReactNode;
};

export function SettingsPageLayout({
  title,
  description,
  footer,
  onDone,
  children,
}: SettingsPageLayoutProps) {
  return (
    <div className="setup-step setup-step-center setup-step--stretch settings-page">
      <h2 className="setup-title">{title}</h2>
      {description && (
        <p className="setup-desc setup-desc--tight">{description}</p>
      )}
      <div className="settings-form">{children}</div>
      {/* Pinned to the bottom so it never moves when content above changes. */}
      <div className="settings-page-bottom">
        <button className="btn btn-primary" onClick={onDone}>
          Done
        </button>
        {/* Always rendered so Done sits at the same height on every page. */}
        <p className="settings-region-footer" aria-hidden={!footer}>
          {footer || "\u00a0"}
        </p>
      </div>
    </div>
  );
}
