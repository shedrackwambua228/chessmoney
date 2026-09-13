import { useEffect, useRef, type ReactNode } from 'react'

export default function Modal({ title, onClose, children }: { title: string; onClose?: () => void; children: ReactNode }) {
  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const element = dialog.current
    const previous = document.activeElement as HTMLElement | null
    element?.showModal()
    return () => { element?.close(); previous?.focus() }
  }, [])
  return <dialog ref={dialog} className="site-dialog" aria-label={title} onCancel={event => { event.preventDefault(); onClose?.() }} onClick={event => { if (event.target === event.currentTarget) onClose?.() }}><div><h2>{title}</h2>{children}</div></dialog>
}
