import { clsx } from 'clsx'

interface Props {
  label: string
  variant?: 'available' | 'busy' | 'pending' | 'confirmed' | 'active' | 'returned' | 'cancelled'
}

const styles: Record<string, string> = {
  available: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  busy: 'bg-pink/20 text-pink-light border-pink/30',
  pending: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  confirmed: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  active: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  returned: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
  cancelled: 'bg-red-500/20 text-red-400 border-red-500/30',
}

export default function Badge({ label, variant = 'available' }: Props) {
  return (
    <span
      className={clsx(
        'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border',
        styles[variant],
      )}
    >
      {label}
    </span>
  )
}
