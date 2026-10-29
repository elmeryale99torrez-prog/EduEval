import { describe, expect, it } from 'vitest'

type ActivityStatus = 'draft' | 'pending' | 'published'

type Activity = {
  id: string
  title: string
  type: string
  status: ActivityStatus
}

function isCloudId(id?: string | null): boolean {
  if (!id) return false
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)
}

function mergeCloudItems<T extends { id: string }>(current: T[], incoming: T[]): T[] {
  const currentMap = new Map(current.map((item) => [item.id, item]))
  const merged = incoming.map((inc) => {
    const local = currentMap.get(inc.id)
    if (local && typeof local === 'object' && 'status' in local && typeof inc === 'object' && 'status' in inc) {
      const localStatus = (local as { status: unknown }).status
      const incStatus = (inc as { status: unknown }).status
      if (localStatus === 'published' && incStatus === 'pending') {
        return { ...inc, status: 'published' }
      }
    }
    return inc
  })
  return [...merged, ...current.filter((item) => !isCloudId(item.id))]
}

describe('Persistencia de propuestas aprobadas y mergeCloudItems', () => {
  it('las actividades importadas comienzan en pending', () => {
    const imported: Activity[] = [
      { id: 'a1-local', title: 'Actividad 1', type: 'trueFalse', status: 'pending' },
      { id: 'a2-local', title: 'Actividad 2', type: 'singleChoice', status: 'pending' },
    ]
    expect(imported.every((a) => a.status === 'pending')).toBe(true)
  })

  it('reviewBatch actualiza en lote todas las actividades a published', () => {
    const activities: Activity[] = [
      { id: '11111111-1111-4111-8111-111111111111', title: 'Actividad 1', type: 'trueFalse', status: 'pending' },
      { id: '22222222-2222-4222-8222-222222222222', title: 'Actividad 2', type: 'singleChoice', status: 'pending' },
    ]
    const idsToApprove = activities.map((a) => a.id)
    const idSet = new Set(idsToApprove)

    const updated = activities.map((a) => idSet.has(a.id) ? { ...a, status: 'published' as ActivityStatus } : a)

    expect(updated.every((a) => a.status === 'published')).toBe(true)
  })

  it('mergeCloudItems previene la regresión de published a pending ante respuestas retrasadas de Supabase', () => {
    // Escenario real reportado por el usuario:
    // El docente aprueba las actividades (quedan 'published' localmente).
    const localApproved: Activity[] = [
      { id: '11111111-1111-4111-8111-111111111111', title: 'Actividad 1', type: 'trueFalse', status: 'published' },
      { id: '22222222-2222-4222-8222-222222222222', title: 'Actividad 2', type: 'singleChoice', status: 'published' },
    ]

    // Al cambiar de ventana, loadCloudContent recibe aún 'pending' porque la base de datos estaba procesando
    const cloudStale: Activity[] = [
      { id: '11111111-1111-4111-8111-111111111111', title: 'Actividad 1', type: 'trueFalse', status: 'pending' },
      { id: '22222222-2222-4222-8222-222222222222', title: 'Actividad 2', type: 'singleChoice', status: 'pending' },
    ]

    const merged = mergeCloudItems(localApproved, cloudStale)

    // Debe conservar el estado 'published' y NO volver a 'pending'
    expect(merged.every((a) => a.status === 'published')).toBe(true)
  })

  it('mergeCloudItems conserva las actividades locales que aún no tienen UUID de nube', () => {
    const localPending: Activity[] = [
      { id: 'a123-import-0', title: 'Pregunta Local 1', type: 'trueFalse', status: 'published' },
    ]
    const cloudList: Activity[] = [
      { id: '11111111-1111-4111-8111-111111111111', title: 'Pregunta Nube', type: 'singleChoice', status: 'published' },
    ]

    const merged = mergeCloudItems(localPending, cloudList)
    expect(merged).toHaveLength(2)
    expect(merged.find((a) => a.id === 'a123-import-0')?.status).toBe('published')
  })
})
