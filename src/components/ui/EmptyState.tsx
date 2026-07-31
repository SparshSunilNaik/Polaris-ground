export function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <section className="empty-state">
      <p className="eyebrow">WORKSPACE</p>
      <h2>{title}</h2>
      <p>{description}</p>
    </section>
  )
}
