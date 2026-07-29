import { clsx } from 'clsx'

interface Props {
  label: string
  variant?: 'available' | 'busy' | 'pending' | 'confirmed' | 'active' | 'returned' | 'cancelled'
}

const styles: Record<string, string> = {
  available: 'bg-emerald-50 text-emerald-600 border-emerald-200',
  busy: 'bg-pink-50 text-pink-600 border-pink-200',
  pending: 'bg-amber-50 text-amber-600 border-amber-200',
  confirmed: 'bg-blue-50 text-blue-600 border-blue-200',
  active: 'bg-emerald-50 text-emerald-600 border-emerald-200',
  returned: 'bg-gray-100 text-gray-500 border-gray-200',
  cancelled: 'bg-red-50 text-red-600 border-red-200',
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
