export function dateKey(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${String(date.getFullYear()).padStart(4, '0')}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

export function localDate(key: string): Date {
  return new Date(`${key}T00:00:00`)
}

export function isDateKey(key: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(key) && key >= '0001-01-01' && dateKey(localDate(key)) === key
}

export function addDays(key: string, days: number): string {
  const date = localDate(key)
  date.setDate(date.getDate() + days)
  return dateKey(date)
}

export function timelineRange(startDate: string, endDate: string) {
  const end = localDate(endDate)
  end.setDate(end.getDate() + 1)
  return { start: localDate(startDate), end }
}

export function inclusiveRange(start: Date, exclusiveEnd: Date) {
  const startDate = dateKey(start)
  const end = new Date(exclusiveEnd)
  end.setDate(end.getDate() - 1)
  const endDate = dateKey(end)
  return { startDate, endDate: endDate < startDate ? startDate : endDate }
}
