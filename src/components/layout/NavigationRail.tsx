const navigation = ['Operate', 'Mission', 'Vehicle', 'Diagnostics', 'Settings']
export function NavigationRail({ active, onSelect }: { active: string; onSelect: (item: string) => void }) {
  return (
    <aside className="navigation-rail">
      <div className="brand">
        <span className="brand-mark">P</span>
        <span>
          POLARIS <b>GROUND</b>
        </span>
      </div>
      <nav aria-label="Primary navigation">
        {navigation.map((item) => (
          <button key={item} className={active === item ? 'active' : ''} onClick={() => onSelect(item)}>
            {item}
          </button>
        ))}
      </nav>
      <div className="monitoring">Monitoring only</div>
    </aside>
  )
}
