interface Props {
  percent: number;
}

export function ProgressBar({ percent }: Props) {
  return (
    <div className="progress-track">
      <div className="progress-fill" style={{ width: `${Math.min(100, Math.max(0, percent))}%` }} />
    </div>
  );
}
