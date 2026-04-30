interface ConfirmDangerDialogProps {
  title: string;
  message: string;
  confirmLabel: string;
  onCancel: () => void;
  onConfirm: () => void;
}

export function ConfirmDangerDialog({
  title,
  message,
  confirmLabel,
  onCancel,
  onConfirm
}: ConfirmDangerDialogProps) {
  return (
    <div className="dialog-backdrop">
      <section aria-label={title} aria-modal="true" className="confirm-dialog" role="dialog">
        <h2>{title}</h2>
        <p>{message}</p>
        <div className="dialog-actions">
          <button className="secondary-button" type="button" onClick={onCancel}>
            Cancel
          </button>
          <button className="danger-button" type="button" onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </section>
    </div>
  );
}
