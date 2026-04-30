interface ConfirmActionDialogProps {
  title: string;
  message: string;
  confirmLabel: string;
  tone: "normal" | "danger";
  onCancel: () => void;
  onConfirm: () => void;
}

export function ConfirmActionDialog({
  title,
  message,
  confirmLabel,
  tone,
  onCancel,
  onConfirm
}: ConfirmActionDialogProps) {
  return (
    <div className="dialog-backdrop">
      <section aria-label={title} aria-modal="true" className="confirm-dialog" role="dialog">
        <h2>{title}</h2>
        <p>{message}</p>
        <div className="dialog-actions">
          <button className="secondary-button" type="button" onClick={onCancel}>
            Cancel
          </button>
          <button className={tone === "danger" ? "danger-button" : "primary-button"} type="button" onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </section>
    </div>
  );
}
