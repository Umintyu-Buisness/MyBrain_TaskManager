import type { GanttSettings } from '../domain/gantt'
import { DialogContent, DialogRoot } from './ui/dialog'

export function GanttSettingsDialog({ settings, onChange, onClose }: {
  settings: GanttSettings
  onChange: (settings: GanttSettings) => void
  onClose: () => void
}) {
  return <DialogRoot open onOpenChange={open => { if (!open) onClose() }}>
    <DialogContent title="ガントの表示設定" description="表示する行を選びます。各設定は同時に有効にできます。">
      <div className="gantt-settings">
        <label><input type="checkbox" checked={settings.showProjects}
          onChange={event => onChange({ ...settings, showProjects: event.target.checked })} />
          <span>プロジェクト行を表示<small>プロジェクトの期間と、その配下のタスクをまとめて表示します。</small></span>
        </label>
        <label><input type="checkbox" checked={settings.showTodos}
          onChange={event => onChange({ ...settings, showTodos: event.target.checked })} />
          <span>タスクの下に Todo を表示<small>所属タスクの直下に Todo の期間を表示します。</small></span>
        </label>
      </div>
      <div className="flex justify-end mt-3">
        <button type="button" className="button primary" onClick={onClose}>完了</button>
      </div>
    </DialogContent>
  </DialogRoot>
}
