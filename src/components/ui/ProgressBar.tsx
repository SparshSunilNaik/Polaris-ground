export function ProgressBar({ value, label }: { value: number; label: string }) {
  return (
    <div className="progress-wrap">
      <div className="progress" aria-label={label}>
        <div style={{ width: `${value}%` }} />
      </div>
      <span>{value}%</span>
    </div>
  )
}
