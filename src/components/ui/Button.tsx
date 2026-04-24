'use client'
import { ReactNode } from 'react'
import { clsx } from 'clsx'

interface Props {
  children: ReactNode
  variant?: 'primary' | 'outline' | 'ghost'
  size?: 'sm' | 'md' | 'lg'
  disabled?: boolean
  loading?: boolean
  onClick?: () => void
  type?: 'button' | 'submit'
  className?: string
  fullWidth?: boolean
}

export default function Button({
  children,
  variant = 'primary',
  size = 'md',
  disabled,
  loading,
  onClick,
  type = 'button',
  className,
  fullWidth,
}: Props) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || loading}
      className={clsx(
        'relative inline-flex items-center justify-center gap-2 font-medium rounded-xl transition-all duration-200 select-none',
        fullWidth && 'w-full',
        size === 'sm' && 'px-4 py-2 text-sm',
        size === 'md' && 'px-6 py-3 text-base',
        size === 'lg' && 'px-8 py-4 text-lg',
        variant === 'primary' && [
          'bg-pink text-white',
          'hover:bg-pink-light hover:shadow-pink-glow',
          'active:scale-95',
          'disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:shadow-none',
        ],
        variant === 'outline' && [
          'border border-pink text-pink',
          'hover:bg-pink/10',
          'active:scale-95',
          'disabled:opacity-40 disabled:cursor-not-allowed',
        ],
        variant === 'ghost' && [
          'text-white/70',
          'hover:text-white hover:bg-white/5',
          'active:scale-95',
        ],
        className,
      )}
    >
      {loading && (
        <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
      )}
      {children}
    </button>
  )
}
