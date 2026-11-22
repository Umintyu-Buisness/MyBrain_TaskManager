import { useState, type FormEvent } from 'react'
import { DialogContent, DialogRoot } from './ui/dialog'

export function ProjectDialog({ onSave, onClose }: {
  onSave: (name: string, description: string) => Promise<void>
  onClose: () => void
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    setBusy(true)
    setError('')
    try {
      await onSave(String(form.get('name')), String(form.get('description')))
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'プロジェクトを保存できませんでした。')
      setBusy(false)
    }
  }

  return <DialogRoot open onOpenChange={open => { if (!open && !busy) onClose() }}>
    <DialogContent title="プロジェクトを作成" description="家事や引越し準備など、関連するタスクをまとめます。">
      <form onSubmit={submit} className="form-stack">
        <label>プロジェクト名<input name="name" placeholder="例：引越し準備" required autoFocus /></label>
        <label>説明<textarea name="description" rows={3} /></label>
        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" className="button" onClick={onClose} disabled={busy}>キャンセル</button>
          <button type="submit" className="button primary" disabled={busy}>作成</button>
        </div>
      </form>
    </DialogContent>
  </DialogRoot>
}
