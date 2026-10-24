export type SyncKind = 'activity' | 'template' | 'room' | 'room_transition' | 'activity_status' | 'attempt'

export type SyncQueueItem = {
  id: string
  kind: SyncKind
  payload: unknown
  createdAt: string
  attempts: number
  lastError?: string
}

const syncQueueKey = 'edueval-sync-queue'
export const syncQueueChangedEvent = 'edueval-sync-changed'

function canUseStorage() {
  return typeof window !== 'undefined' && Boolean(window.localStorage)
}

export function readSyncQueue(): SyncQueueItem[] {
  if (!canUseStorage()) return []
  try {
    const value = window.localStorage.getItem(syncQueueKey)
    const parsed = value ? JSON.parse(value) as unknown : []
    return Array.isArray(parsed) ? parsed.filter(isSyncQueueItem) : []
  } catch {
    return []
  }
}

export function enqueueSyncItem(kind: SyncKind, payload: unknown): SyncQueueItem[] {
  const current = readSyncQueue()
  const identity = syncIdentity(kind, payload)
  const nextItem: SyncQueueItem = {
    id: `${kind}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    kind,
    payload,
    createdAt: new Date().toISOString(),
    attempts: 0,
  }
  const withoutDuplicate = current.filter((item) => syncIdentity(item.kind, item.payload) !== identity)
  const next = [...withoutDuplicate, nextItem]
  writeSyncQueue(next)
  return next
}

export function removeSyncItem(id: string): SyncQueueItem[] {
  const next = readSyncQueue().filter((item) => item.id !== id)
  writeSyncQueue(next)
  return next
}

export function markSyncItemFailed(id: string, error: string): SyncQueueItem[] {
  const next = readSyncQueue().map((item) => item.id === id ? { ...item, attempts: item.attempts + 1, lastError: error } : item)
  writeSyncQueue(next)
  return next
}

export function writeSyncQueue(items: SyncQueueItem[]) {
  if (!canUseStorage()) return
  try {
    window.localStorage.setItem(syncQueueKey, JSON.stringify(items))
    window.dispatchEvent(new CustomEvent(syncQueueChangedEvent))
  } catch {
    // A full or unavailable localStorage should never break the evaluation flow.
  }
}

function syncIdentity(kind: SyncKind, payload: unknown) {
  if (payload && typeof payload === 'object') {
    const candidate = payload as Record<string, unknown>
    const key = candidate.localId ?? candidate.id ?? candidate.roomCode ?? candidate.code
    if (typeof key === 'string') return `${kind}:${key}`
  }
  return `${kind}:${JSON.stringify(payload)}`
}

function isSyncQueueItem(value: unknown): value is SyncQueueItem {
  if (!value || typeof value !== 'object') return false
  const item = value as Record<string, unknown>
  return typeof item.id === 'string' && typeof item.kind === 'string' && typeof item.createdAt === 'string' && typeof item.attempts === 'number' && 'payload' in item
}
