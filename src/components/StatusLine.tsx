interface Props {
  message: string;
}

export function StatusLine({ message }: Props) {
  return <div className="status-line">{message}</div>;
}
