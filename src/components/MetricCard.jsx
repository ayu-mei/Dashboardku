export default function MetricCard({ label, value, caption, icon: Icon, accent }) {
  return <article className={`metric ${accent ? 'accent' : ''}`}><div className="metric-top"><span>{label}</span><Icon size={19}/></div><strong>{value}</strong><small>{caption}</small></article>;
}
