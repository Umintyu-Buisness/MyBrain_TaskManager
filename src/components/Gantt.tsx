import { useEffect, useLayoutEffect, useRef } from 'react'
import { DataSet } from 'vis-data'
import { Timeline, type DataGroup, type DataItem, type TimelineEventPropertiesResult } from 'vis-timeline'
import { addDays, dateKey, inclusiveRange, localDate, timelineRange } from '../domain/dates'
import { visibleGanttRows, type GanttRow } from '../domain/gantt'
import type { Schedule } from '../domain/model'
import 'vis-timeline/styles/vis-timeline-graph2d.min.css'

export type Scale = 'day' | 'week' | 'month'
const addRow = 'add-task'
const periods = {
  day: { before: 3, after: 11, scale: 'day', step: 1 },
  week: { before: 14, after: 42, scale: 'week', step: 1 },
  month: { before: 30, after: 150, scale: 'month', step: 1 },
} as const

interface Props {
  rows: GanttRow[]
  collapsed: Set<string>
  scale: Scale
  jump: { date: string }
  onOpen: (row: GanttRow, issues?: boolean) => void
  onToggle: (id: string) => void
  onAdd: (date?: string, projectId?: string) => void
  onMove: (row: GanttRow, schedule: Schedule) => void
  onWindow: (center: string) => void
}

function rowLabel(row: GanttRow, collapsed: boolean) {
  const label = document.createElement('div')
  label.className = `task-row gantt-row-${row.kind}`
  label.style.paddingInlineStart = `${Math.min(row.depth, 10) * 13}px`
  if (row.hasChildren) {
    const toggle = document.createElement('button')
    toggle.type = 'button'
    toggle.dataset.toggle = row.id
    toggle.className = 'tree-toggle'
    toggle.textContent = collapsed ? '▸' : '▾'
    toggle.setAttribute('aria-expanded', String(!collapsed))
    toggle.setAttribute('aria-label', `${row.title}を${collapsed ? '展開' : '折りたたむ'}`)
    label.append(toggle)
  } else {
    const spacer = document.createElement('span')
    spacer.className = 'tree-spacer'
    label.append(spacer)
  }
  const button = document.createElement('button')
  button.type = 'button'
  button.dataset.row = row.id
  button.className = 'task-name'
  const parentLabel = row.kind === 'parent' ? '親タスク' : undefined
  if (parentLabel) button.setAttribute('aria-description', parentLabel)
  button.title = [row.title, parentLabel, row.subtitle, `階層 ${row.depth + 1}`, row.description].filter(Boolean).join(' · ')
  const title = document.createElement('span')
  title.className = 'task-title'
  title.textContent = row.title
  button.append(title)
  if (row.subtitle) {
    const subtitle = document.createElement('span')
    subtitle.className = 'task-subtitle'
    subtitle.textContent = row.subtitle
    button.append(subtitle)
  }
  label.append(button)
  if (row.unresolved) {
    const badge = document.createElement('button')
    badge.type = 'button'
    badge.dataset.issues = row.id
    badge.className = 'issue-badge'
    badge.textContent = `! ${row.unresolved}`
    badge.title = `未解消の疑問・懸念 ${row.unresolved} 件`
    badge.setAttribute('aria-label', `${row.title}の疑問・懸念（未解消 ${row.unresolved} 件）`)
    label.append(badge)
  }
  if (row.progress !== undefined) {
    const progress = document.createElement('span')
    progress.className = 'task-percent'
    progress.textContent = `${row.progress}%`
    label.append(progress)
  }
  return label
}

function bar(row: GanttRow, schedule: Schedule): DataItem {
  return {
    id: row.id,
    group: row.id,
    ...timelineRange(schedule.startDate, schedule.endDate),
    type: 'range',
    editable: { updateTime: row.editable, updateGroup: false, remove: false },
    content: row.title,
    className: `task-bar ${row.barClass}`,
    style: `--progress: ${row.progress ?? 0}%`,
  }
}

export function Gantt(props: Props) {
  const host = useRef<HTMLDivElement>(null)
  const timeline = useRef<Timeline | null>(null)
  const groups = useRef(new DataSet<DataGroup>())
  const items = useRef(new DataSet<DataItem>())
  const latest = useRef(props)
  useLayoutEffect(() => { latest.current = props }, [props])

  useEffect(() => {
    const element = host.current!
    const findRow = (id: string) => latest.current.rows.find(row => row.id === id)
    function onRowClick(event: MouseEvent) {
      const target = (event.target as HTMLElement).closest<HTMLButtonElement>('button')
      if (target?.dataset.toggle) latest.current.onToggle(target.dataset.toggle)
      const rowId = target?.dataset.row ?? target?.dataset.issues
      const row = rowId && findRow(rowId)
      if (row) latest.current.onOpen(row, Boolean(target?.dataset.issues))
      if (target?.dataset.add) latest.current.onAdd()
    }
    element.addEventListener('click', onRowClick)
    const instance = new Timeline(element, items.current, groups.current, {
      orientation: 'top',
      groupOrder: 'order',
      stack: false,
      verticalScroll: true,
      height: '100%',
      zoomable: false,
      editable: { add: false, remove: false, updateGroup: false, updateTime: true },
      itemsAlwaysDraggable: { item: true, range: true },
      margin: { item: { vertical: 12, horizontal: 0 }, axis: 8 },
      format: {
        minorLabels: { day: 'D日', week: 'M/D', month: 'M月' },
        majorLabels: { day: 'YYYY年 M月', week: 'YYYY年 M月', month: 'YYYY年' },
      },
      template(item?: DataItem) {
        const label = document.createElement('span')
        label.textContent = item?.content ?? ''
        return label
      },
      snap(date) {
        const midnight = localDate(dateKey(date))
        if (date.getHours() >= 12) midnight.setDate(midnight.getDate() + 1)
        return midnight
      },
      onMove(item, callback) {
        callback(null)
        const row = findRow(String(item.id))
        if (!row?.editable || item.end == null) return
        latest.current.onMove(row, inclusiveRange(new Date(item.start), new Date(item.end)))
      },
    })
    timeline.current = instance
    instance.on('click', (event: TimelineEventPropertiesResult) => {
      const row = findRow(String(event.item))
      if (row) latest.current.onOpen(row)
    })
    instance.on('doubleClick', (event: TimelineEventPropertiesResult) => {
      const target = event.event.target
      const emptyCenter = event.what == null && target instanceof Element && target.matches('.vis-panel.vis-center')
      if (event.what !== 'background' && event.what !== 'axis' && !emptyCenter) return
      latest.current.onAdd(dateKey(event.time), findRow(String(event.group))?.projectId)
    })
    instance.on('rangechanged', ({ start, end, byUser }: { start: Date; end: Date; byUser: boolean }) => {
      if (byUser) latest.current.onWindow(dateKey(new Date((+start + +end) / 2)))
    })
    return () => {
      instance.destroy()
      element.removeEventListener('click', onRowClick)
      timeline.current = null
    }
  }, [])

  useEffect(() => {
    const visible = visibleGanttRows(props.rows, props.collapsed)
    const currentIds = new Set(visible.map(row => row.id))
    const bars = visible.flatMap(row => row.schedule ? [bar(row, row.schedule)] : [])
    const barIds = new Set(bars.map(item => item.id))
    items.current.remove(items.current.getIds().filter(id => !barIds.has(id)))
    groups.current.remove(groups.current.getIds().filter(id => id !== addRow && !currentIds.has(String(id))))
    groups.current.update(visible.map((row, order) => ({
      id: row.id,
      content: rowLabel(row, props.collapsed.has(row.id)),
      order,
    })))
    const add = document.createElement('button')
    add.type = 'button'
    add.className = 'row-add'
    add.dataset.add = 'true'
    add.textContent = '＋ タスクを追加'
    const creationGroup = { id: addRow, className: 'add-row', order: visible.length, content: add }
    groups.current.update(creationGroup)
    items.current.update(bars)
  }, [props.rows, props.collapsed])

  useEffect(() => {
    const period = periods[props.scale]
    timeline.current?.setOptions({ timeAxis: { scale: period.scale, step: period.step } })
    timeline.current?.setWindow(
      localDate(addDays(props.jump.date, -period.before)),
      localDate(addDays(props.jump.date, period.after)),
      { animation: false },
    )
  }, [props.scale, props.jump])

  return <div className="timeline-host" ref={host} aria-label="ガントチャート" onPointerDownCapture={event => {
    // vis-timeline のジェスチャー処理がクリック時の既定のフォーカス移動を止めることがある。
    const active = document.activeElement
    if (event.button === 0 && (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement)) {
      active.blur()
    }
  }} />
}
