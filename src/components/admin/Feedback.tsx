'use client'
import { createContext, ReactNode, useCallback, useContext, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { AlertTriangle, CheckCircle, XCircle } from 'lucide-react'

// In-page replacements for alert()/confirm(). The native dialogs look out of
// place on the phone and freeze browser automation for the whole tab.

type ToastKind = 'success' | 'error'
interface Toast { id: number; kind: ToastKind; text: string }
interface ConfirmOptions { title: string; body?: string; confirmLabel?: string; danger?: boolean }

interface FeedbackApi {
  toast: (text: string, kind?: ToastKind) => void
  confirm: (opts: ConfirmOptions) => Promise<boolean>
}

const FeedbackContext = createContext<FeedbackApi | null>(null)

export function useFeedback(): FeedbackApi {
  const ctx = useContext(FeedbackContext)
  if (!ctx) throw new Error('useFeedback must be used inside <FeedbackProvider>')
  return ctx
}

export function FeedbackProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const [dialog, setDialog] = useState<ConfirmOptions | null>(null)
  const resolver = useRef<((ok: boolean) => void) | null>(null)
  const nextId = useRef(1)

  const toast = useCallback((text: string, kind: ToastKind = 'success') => {
    const id = nextId.current++
    setToasts((prev) => [...prev, { id, kind, text }])
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), kind === 'error' ? 6000 : 3000)
  }, [])

  const confirm = useCallback((opts: ConfirmOptions) => {
    setDialog(opts)
    return new Promise<boolean>((resolve) => { resolver.current = resolve })
  }, [])

  function close(ok: boolean) {
    resolver.current?.(ok)
    resolver.current = null
    setDialog(null)
  }

  return (
    <FeedbackContext.Provider value={{ toast, confirm }}>
      {children}

      {/* Toasts sit above the mobile tab bar */}
      <div className="fixed inset-x-0 bottom-20 md:bottom-6 z-[60] flex flex-col items-center gap-2 px-4 pointer-events-none">
        <AnimatePresence>
          {toasts.map((t) => (
            <motion.div
              key={t.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 12 }}
              className={`pointer-events-auto flex items-start gap-2 max-w-sm w-full rounded-xl px-4 py-3 text-sm shadow-lg border ${
                t.kind === 'error'
                  ? 'bg-red-50 border-red-200 text-red-800'
                  : 'bg-white border-emerald-200 text-emerald-800'
              }`}
              role="status"
            >
              {t.kind === 'error' ? <XCircle size={16} className="shrink-0 mt-0.5" /> : <CheckCircle size={16} className="shrink-0 mt-0.5" />}
              <span>{t.text}</span>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      <AnimatePresence>
        {dialog && (
          <motion.div
            className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-ink/40 p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => close(false)}
          >
            <motion.div
              role="alertdialog"
              aria-modal="true"
              initial={{ y: 24, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 24, opacity: 0 }}
              className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start gap-3">
                {dialog.danger && (
                  <div className="w-9 h-9 rounded-full bg-red-50 flex items-center justify-center shrink-0">
                    <AlertTriangle size={18} className="text-red-500" />
                  </div>
                )}
                <div className="min-w-0">
                  <h3 className="font-bold">{dialog.title}</h3>
                  {dialog.body && <p className="text-sm text-gray-500 mt-1">{dialog.body}</p>}
                </div>
              </div>
              <div className="flex gap-2 mt-5">
                <button
                  onClick={() => close(false)}
                  className="flex-1 rounded-xl border border-gray-200 py-2.5 text-sm font-medium hover:bg-gray-50"
                >
                  ไม่ใช่
                </button>
                <button
                  onClick={() => close(true)}
                  autoFocus
                  className={`flex-1 rounded-xl py-2.5 text-sm font-medium text-white ${
                    dialog.danger ? 'bg-red-500 hover:bg-red-600' : 'bg-pink hover:bg-pink-light'
                  }`}
                >
                  {dialog.confirmLabel ?? 'ยืนยัน'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </FeedbackContext.Provider>
  )
}
