import * as Dialog from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import type { ReactNode } from 'react'

// shadcn/ui の Dialog と同じ Radix プリミティブで構成する。
export function DialogContent({ title, description, children }: {
  title: string
  description: string
  children: ReactNode
}) {
  return <Dialog.Portal>
    <Dialog.Overlay className="dialog-overlay" />
    <Dialog.Content className="dialog-content">
      <Dialog.Title>{title}</Dialog.Title>
      <Dialog.Description>{description}</Dialog.Description>
      <Dialog.Close className="icon-button dialog-close" aria-label="閉じる"><X size={18} /></Dialog.Close>
      {children}
    </Dialog.Content>
  </Dialog.Portal>
}

export const DialogRoot = Dialog.Root
