import type { GanttSettings } from '../domain/gantt'

const storageKey = 'personal-task-manager:gantt-view'

export function loadGanttSettings(): GanttSettings {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) ?? 'null')
    return { showProjects: saved?.showProjects === true, showTodos: saved?.showTodos === true }
  } catch {
    return { showProjects: false, showTodos: false }
  }
}

export function storeGanttSettings(settings: GanttSettings) {
  try {
    localStorage.setItem(storageKey, JSON.stringify(settings))
  } catch {
    // 保存できない場合も、この画面では設定を変更できる。
  }
}
