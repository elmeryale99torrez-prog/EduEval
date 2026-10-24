import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import type { Session } from '@supabase/supabase-js'
import {
  activityRuntime,
  createInitialResponse,
  evaluateActivityResponse,
  isResponseComplete,
} from './lib/activityEngine'
import type { Activity, ActivityDetails, ActivityResponse, ActivityType, ChoiceOption, MatchingPair, ScenarioOption, ScenarioStage, SortingItem } from './lib/activityEngine'
import { canAccessPanel, createTeacherProfile, getProfile } from './lib/auth'
import type { Profile } from './lib/auth'
import { isSupabaseConfigured, supabase } from './lib/supabase'
import { enqueueSyncItem, markSyncItemFailed, readSyncQueue, removeSyncItem, syncQueueChangedEvent, type SyncKind, type SyncQueueItem } from './lib/sync'
import { detectContentCompatibility, OFFICIAL_IMPORT_PROMPT, type ContentImportDocument, parseContentImport } from './lib/contentImport'

type Role = 'admin' | 'teacher' | 'student'
type View = 'overview' | 'content' | 'proposals' | 'rooms' | 'results' | 'play' | 'adminUsers' | 'adminAudit'

type ContentConcept = { id: string; name: string; definition: string; example: string }
type ContentSituation = { id: string; title: string; context: string; decision: string; consequence: string }
type EvaluationTemplate = {
  id: string
  title: string
  subject: string
  description: string
  objective: string
  competency: string
  difficulty: 'Inicial' | 'Intermedio' | 'Avanzado'
  concepts: ContentConcept[]
  situations: ContentSituation[]
  processSteps: string[]
  categories: string[]
  status: 'draft' | 'accepted'
  updatedAt: string
  source?: 'manual' | 'json'
  schemaVersion?: number
}

type RoomStatus = 'draft' | 'ready' | 'waiting' | 'active' | 'finished' | 'archived'
type RoomSettings = { name: string; instructions: string; activityIds: string[]; questionCount: number; limit: number; time: number | null; scorePerQuestion: number; shuffleQuestions: boolean; allowBack: boolean }
type Room = RoomSettings & { id: string; code: string; activities: string[]; status: RoomStatus; createdAt: string; startedAt?: string; finishedAt?: string; archivedAt?: string }
type AttemptAnswer = { index: number; activityId: string; activityTitle: string; activityType: ActivityType; response: string; status: 'answered' | 'omitted'; correct: boolean | null; score: number; timeSeconds: number }
type AttemptEvent = { type: 'joined' | 'answer_submitted' | 'omitted' | 'navigated_back' | 'finished' | 'timeout'; at: string; detail?: string }
type StudentAttempt = { id: string; roomId: string; roomName: string; roomCode: string; studentName: string; startedAt: string; finishedAt: string; status: 'completed' | 'timeout'; totalQuestions: number; answeredCount: number; omittedCount: number; correctCount: number; score: number; maxScore: number; answers: AttemptAnswer[]; events: AttemptEvent[] }
type StudentSessionSnapshot = { studentName: string; roomCode: string; room: Room; participantId: string; guestToken: string; questionIds: string[]; responses: Record<number, ActivityResponse>; answerTimes: Record<number, number>; startedAt: string; events: AttemptEvent[]; finished: boolean; playIndex: number; submitted: boolean }
type InstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> }

const studentSessionStorageKey = 'edueval-student-session'

const allowedPanelViews: Record<'teacher' | 'admin', View[]> = {
  teacher: ['overview', 'content', 'proposals', 'rooms', 'results'],
  admin: ['overview', 'adminUsers', 'rooms', 'adminAudit', 'results'],
}

const types: Record<ActivityType, { label: string; icon: string; description: string }> = {
  scenario: { label: 'Escenario de decisiones', icon: '◈', description: 'Elige una respuesta ante una situación real.' },
  trueFalse: { label: 'Falso / verdadero', icon: '◉', description: 'Comprueba una afirmación en un clic.' },
  matching: { label: 'Asociación', icon: '⌘', description: 'Relaciona conceptos y definiciones.' },
  sorting: { label: 'Clasificación', icon: '⬡', description: 'Arrastra elementos a su categoría.' },
  ordering: { label: 'Ordenamiento', icon: '↕', description: 'Ordena los pasos de un proceso.' },
  singleChoice: { label: 'Selección múltiple', icon: '✓', description: 'Una sola opción es correcta.' },
}

const initialActivities: Activity[] = [
  { id: 'a1', title: 'Decidir con empatía', type: 'scenario', topic: 'Convivencia', difficulty: 'Inicial', prompt: 'Tu equipo no está de acuerdo. ¿Qué haces primero?', options: ['Escuchar las razones de cada persona', 'Imponer la decisión más rápida', 'Dejar que el conflicto crezca'], answer: 'Escuchar las razones de cada persona', feedback: 'Escuchar permite comprender el problema antes de decidir.', status: 'published' },
  { id: 'a2', title: 'Recursos compartidos', type: 'trueFalse', topic: 'Sostenibilidad', difficulty: 'Inicial', prompt: 'Reutilizar materiales reduce la cantidad de residuos.', options: ['Verdadero', 'Falso'], answer: 'Verdadero', feedback: 'La reutilización extiende la vida útil de los materiales.', status: 'published' },
  { id: 'a3', title: 'Mapa de actores', type: 'matching', topic: 'Participación', difficulty: 'Intermedio', prompt: 'Relaciona cada actor con su aporte.', options: ['Estudiante → propone ideas', 'Docente → facilita el proceso', 'Comunidad → aporta contexto'], answer: ['Estudiante → propone ideas', 'Docente → facilita el proceso', 'Comunidad → aporta contexto'], feedback: 'Cada actor aporta una perspectiva distinta.', status: 'published' },
  { id: 'a4', title: '¿Dónde va cada residuo?', type: 'sorting', topic: 'Sostenibilidad', difficulty: 'Inicial', prompt: 'Clasifica cada elemento en la categoría correcta.', options: ['Botella de vidrio', 'Cáscara de fruta', 'Papel limpio', 'Pila usada'], answer: ['Reciclable', 'Orgánico', 'Reciclable', 'Peligroso'], feedback: 'Separar correctamente facilita el aprovechamiento y evita riesgos.', status: 'published' },
  { id: 'a5', title: 'Pasos para dialogar', type: 'ordering', topic: 'Convivencia', difficulty: 'Intermedio', prompt: 'Ordena el proceso para resolver un desacuerdo.', options: ['Escuchar', 'Reconocer el problema', 'Proponer alternativas', 'Acordar un siguiente paso'], answer: ['Reconocer el problema', 'Escuchar', 'Proponer alternativas', 'Acordar un siguiente paso'], feedback: 'Nombrar el problema y escuchar son la base de un acuerdo.', status: 'published' },
  { id: 'a6', title: 'Una acción sostenible', type: 'singleChoice', topic: 'Sostenibilidad', difficulty: 'Inicial', prompt: '¿Cuál acción disminuye el consumo de agua?', options: ['Cerrar el grifo mientras te cepillas', 'Dejar correr el agua', 'Usar agua potable para limpiar la acera'], answer: 'Cerrar el grifo mientras te cepillas', feedback: 'Pequeñas acciones diarias pueden reducir el consumo.', status: 'published' },
]

const initialRooms: Room[] = [{ id: 'r1', name: 'Diagnóstico 1 · Convivencia', instructions: 'Responde con calma y revisa tu razonamiento.', activityIds: ['a1', 'a2', 'a6'], questionCount: 3, limit: 24, time: null, scorePerQuestion: 10, shuffleQuestions: false, allowBack: true, code: 'ECO-274', activities: ['a1', 'a2', 'a6'], status: 'active', createdAt: '2026-10-20T08:00:00.000Z', startedAt: '2026-10-20T08:15:00.000Z' }]

function normalizeRoom(room: Partial<Room>): Room {
  const activities = room.activities ?? room.activityIds ?? []
  const legacyStatus = room.status === ('closed' as RoomStatus) ? 'finished' : room.status
  return { id: room.id ?? `r${Date.now()}`, name: room.name ?? 'Nueva sala', instructions: room.instructions ?? 'Responde con calma y revisa tu razonamiento.', activityIds: room.activityIds ?? activities, questionCount: room.questionCount ?? (activities.length || 1), limit: room.limit ?? 30, time: room.time ?? null, scorePerQuestion: room.scorePerQuestion ?? 10, shuffleQuestions: room.shuffleQuestions ?? false, allowBack: room.allowBack ?? true, code: room.code ?? 'EDU-000', activities, status: legacyStatus ?? 'waiting', createdAt: room.createdAt ?? new Date().toISOString(), startedAt: room.startedAt, finishedAt: room.finishedAt, archivedAt: room.archivedAt }
}

type CloudTemplateRow = {
  id: string
  title: string
  subject: string
  description: string
  objective: string
  competency: string
  difficulty: EvaluationTemplate['difficulty']
  content: unknown
  status: EvaluationTemplate['status']
  updated_at: string
}

type CloudActivityRow = {
  id: string
  template_id: string | null
  type: ActivityType
  title: string
  topic: string
  difficulty: Activity['difficulty']
  prompt: string
  options: unknown
  answer: unknown
  feedback: string
  details: unknown
  status: Activity['status']
}

type CloudRoomRow = {
  id: string
  owner_id: string
  name: string
  code: string
  instructions: string
  status: RoomStatus
  question_count: number
  student_limit: number
  time_minutes: number | null
  score_per_question: number
  shuffle_questions: boolean
  allow_back: boolean
  created_at: string
  started_at: string | null
  finished_at: string | null
  archived_at: string | null
}

type CloudRoomActivityRow = { room_id: string; activity_id: string; position: number }
type CloudParticipantRow = { id: string; room_id: string; display_name: string; joined_at: string; status: string }
type CloudAttemptRow = { id: string; room_id: string; participant_id: string; started_at: string; finished_at: string; status: string; total_questions: number; answered_count: number; omitted_count: number; correct_count: number; score: number; max_score: number; events: unknown }
type CloudAttemptAnswerRow = { attempt_id: string; activity_id: string | null; question_index: number; response: unknown; response_text: string | null; status: 'answered' | 'omitted'; correct: boolean | null; score: number; time_seconds: number }
type AdminUser = { id: string; email: string; displayName: string; role: 'admin' | 'teacher'; roles: ('admin' | 'teacher')[]; status: string; createdAt: string; lastSignInAt: string | null }
type AdminRoom = { id: string; name: string; code: string; status: RoomStatus; questionCount: number; limit: number; ownerName: string; activities: { id: string; title: string; type: ActivityType; position: number }[]; createdAt: string }
type AdminAuditEvent = { id: string; eventType: string; actorName: string; roomName: string; createdAt: string; metadata: unknown }
type AdminSnapshot = { loadedAt: string; users: AdminUser[]; rooms: AdminRoom[]; attempts: StudentAttempt[]; auditEvents: AdminAuditEvent[]; metrics: { users: number; rooms: number; publishedActivities: number; templates: number; attempts: number } }

type CloudTemplateContent = Pick<EvaluationTemplate, 'concepts' | 'situations' | 'processSteps' | 'categories'> & { source?: EvaluationTemplate['source']; schemaVersion?: number }

function isCloudId(value: string | undefined): value is string {
  return Boolean(value && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value))
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}

function stringOrArray(value: unknown): string | string[] {
  if (typeof value === 'string') return value
  return stringArray(value)
}

function cloudTemplateToLocal(row: CloudTemplateRow): EvaluationTemplate {
  const content = (isRecord(row.content) ? row.content : {}) as Partial<CloudTemplateContent>
  return {
    id: row.id,
    title: row.title,
    subject: row.subject,
    description: row.description,
    objective: row.objective,
    competency: row.competency,
    difficulty: row.difficulty,
    concepts: Array.isArray(content.concepts) ? content.concepts : [],
    situations: Array.isArray(content.situations) ? content.situations : [],
    processSteps: stringArray(content.processSteps),
    categories: stringArray(content.categories),
    status: row.status,
    updatedAt: row.updated_at,
    source: content.source,
    schemaVersion: typeof content.schemaVersion === 'number' ? content.schemaVersion : undefined,
  }
}

function cloudActivityToLocal(row: CloudActivityRow): Activity {
  return {
    id: row.id,
    templateId: row.template_id ?? undefined,
    title: row.title,
    type: row.type,
    topic: row.topic,
    difficulty: row.difficulty,
    prompt: row.prompt,
    options: stringArray(row.options),
    answer: stringOrArray(row.answer),
    feedback: row.feedback,
    details: isRecord(row.details) ? row.details as ActivityDetails : undefined,
    status: row.status,
  }
}

function mergeCloudItems<T extends { id: string }>(current: T[], incoming: T[]): T[] {
  return [...incoming, ...current.filter((item) => !isCloudId(item.id))]
}

function cloudRoomToLocal(row: CloudRoomRow, relationRows: CloudRoomActivityRow[] = []): Room {
  const activities = relationRows
    .filter((relation) => relation.room_id === row.id)
    .sort((left, right) => left.position - right.position)
    .map((relation) => relation.activity_id)
  return normalizeRoom({
    id: row.id,
    name: row.name,
    code: row.code,
    instructions: row.instructions,
    activityIds: activities,
    activities,
    questionCount: row.question_count,
    limit: row.student_limit,
    time: row.time_minutes,
    scorePerQuestion: row.score_per_question,
    shuffleQuestions: row.shuffle_questions,
    allowBack: row.allow_back,
    status: row.status,
    createdAt: row.created_at,
    startedAt: row.started_at ?? undefined,
    finishedAt: row.finished_at ?? undefined,
    archivedAt: row.archived_at ?? undefined,
  })
}

function patchRoomFromRealtime(room: Room, row: unknown): Room {
  if (!isRecord(row)) return room
  return normalizeRoom({
    ...room,
    name: typeof row.name === 'string' ? row.name : room.name,
    code: typeof row.code === 'string' ? row.code : room.code,
    instructions: typeof row.instructions === 'string' ? row.instructions : room.instructions,
    status: typeof row.status === 'string' ? row.status as RoomStatus : room.status,
    questionCount: typeof row.question_count === 'number' ? row.question_count : room.questionCount,
    limit: typeof row.student_limit === 'number' ? row.student_limit : room.limit,
    time: typeof row.time_minutes === 'number' || row.time_minutes === null ? row.time_minutes : room.time,
    scorePerQuestion: typeof row.score_per_question === 'number' ? row.score_per_question : room.scorePerQuestion,
    shuffleQuestions: typeof row.shuffle_questions === 'boolean' ? row.shuffle_questions : room.shuffleQuestions,
    allowBack: typeof row.allow_back === 'boolean' ? row.allow_back : room.allowBack,
    createdAt: typeof row.created_at === 'string' ? row.created_at : room.createdAt,
    startedAt: row.started_at === null ? undefined : typeof row.started_at === 'string' ? row.started_at : room.startedAt,
    finishedAt: row.finished_at === null ? undefined : typeof row.finished_at === 'string' ? row.finished_at : room.finishedAt,
    archivedAt: row.archived_at === null ? undefined : typeof row.archived_at === 'string' ? row.archived_at : room.archivedAt,
  })
}

function cloudAttemptToLocal(row: CloudAttemptRow, participant: CloudParticipantRow | undefined, room: Room | undefined, answers: CloudAttemptAnswerRow[], activityById: Map<string, Activity>): StudentAttempt | null {
  if (!participant || !room) return null
  const attemptAnswers: AttemptAnswer[] = answers.map((answer) => {
    const activity = answer.activity_id ? activityById.get(answer.activity_id) : undefined
    const responseValue = isRecord(answer.response) && typeof answer.response.value === 'string' ? answer.response.value : answer.response_text ?? ''
    return { index: answer.question_index, activityId: answer.activity_id ?? '', activityTitle: activity?.title ?? 'Actividad', activityType: activity?.type ?? 'singleChoice', response: responseValue, status: answer.status, correct: answer.correct, score: Number(answer.score ?? 0), timeSeconds: Number(answer.time_seconds ?? 0) }
  })
  const status = row.status === 'timeout' ? 'timeout' : 'completed'
  return { id: row.id, roomId: row.room_id, roomName: room.name, roomCode: room.code, studentName: participant.display_name, startedAt: row.started_at, finishedAt: row.finished_at, status, totalQuestions: row.total_questions, answeredCount: row.answered_count, omittedCount: row.omitted_count, correctCount: row.correct_count, score: Number(row.score ?? 0), maxScore: Number(row.max_score ?? 0), answers: attemptAnswers, events: Array.isArray(row.events) ? row.events as AttemptEvent[] : [] }
}

async function functionErrorMessage(error: unknown, data: unknown, fallback: string): Promise<string> {
  if (isRecord(data)) {
    if (typeof data.error === 'string') return data.error
    if (typeof data.message === 'string') return data.message
  }
  if (isRecord(error) && error.context instanceof Response) {
    try {
      const payload = await error.context.clone().json() as unknown
      if (isRecord(payload)) {
        if (typeof payload.error === 'string') return payload.error
        if (typeof payload.message === 'string') return payload.message
      }
    } catch { /* Keep the friendly fallback when the function response is not JSON. */ }
    if (error.context.status === 401) return 'Tu sesión expiró. Cierra sesión y vuelve a ingresar.'
    if (error.context.status === 403) return 'No tienes permisos de administrador para realizar esta acción.'
  }
  return fallback
}

function roleFromUrl(): Role | null {
  if (typeof window === 'undefined') return null
  const requested = new URLSearchParams(window.location.search).get('panel')
  return requested === 'teacher' || requested === 'student' || requested === 'admin' ? requested : null
}

function panelUrl(nextRole: Role) {
  const url = new URL(window.location.href)
  url.search = ''
  url.searchParams.set('panel', nextRole)
  url.hash = ''
  return `${url.pathname}${url.search}`
}

function hasInviteLink() {
  if (typeof window === 'undefined') return false
  const search = new URLSearchParams(window.location.search)
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''))
  return search.get('type') === 'invite' || hash.get('type') === 'invite'
}

function hasPasswordRecoveryLink() {
  if (typeof window === 'undefined') return false
  const search = new URLSearchParams(window.location.search)
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''))
  return search.get('type') === 'recovery' || search.get('reset') === 'password' || hash.get('type') === 'recovery'
}

const publicAppOrigin = (import.meta.env.VITE_PUBLIC_APP_URL?.trim() || 'https://evaluedu.elmer-yale99-torrez.chatgpt.site').replace(/\/$/, '')

function authRedirectUrl(role: Role, flow: 'recovery' | 'invite' = 'recovery') {
  const url = new URL(`${publicAppOrigin}/`)
  url.searchParams.set('panel', role)
  if (flow === 'invite') url.searchParams.set('type', 'invite')
  return url.toString()
}

function App() {
  const initialRole = roleFromUrl()
  const [role, setRole] = useState<Role>(() => initialRole ?? 'teacher')
  const [view, setView] = useState<View>('overview')
  const [activities, setActivities] = useState<Activity[]>(() => readStorage('edueval-activities', initialActivities))
  const [rooms, setRooms] = useState<Room[]>(() => readStorage<Partial<Room>[]>('edueval-rooms', initialRooms).map(normalizeRoom))
  const [templates, setTemplates] = useState<EvaluationTemplate[]>(() => readStorage('edueval-templates', []))
  const [toast, setToast] = useState('')
  const [selectedActivity, setSelectedActivity] = useState<Activity | null>(null)
  const [studentName, setStudentName] = useState('')
  const [roomCode, setRoomCode] = useState('')
  const [studentRoom, setStudentRoom] = useState<Room | null>(null)
  const [studentParticipantId, setStudentParticipantId] = useState<string | null>(() => readSessionStorage('edueval-student-participant-id'))
  const [studentGuestToken, setStudentGuestToken] = useState<string | null>(() => readSessionStorage('edueval-student-guest-token'))
  const [studentQuestionIds, setStudentQuestionIds] = useState<string[]>([])
  const [studentResponses, setStudentResponses] = useState<Record<number, ActivityResponse>>({})
  const [studentAnswerTimes, setStudentAnswerTimes] = useState<Record<number, number>>({})
  const [studentStartedAt, setStudentStartedAt] = useState('')
  const [studentQuestionStartedAt, setStudentQuestionStartedAt] = useState(Date.now())
  const [studentEvents, setStudentEvents] = useState<AttemptEvent[]>([])
  const [studentFinished, setStudentFinished] = useState(false)
  const [playIndex, setPlayIndex] = useState(0)
  const [submitted, setSubmitted] = useState(false)
  const [hasChosenRole, setHasChosenRole] = useState(() => Boolean(initialRole))
  const [inviteFlow, setInviteFlow] = useState(() => hasInviteLink())
  const [passwordRecoveryFlow, setPasswordRecoveryFlow] = useState(() => hasPasswordRecoveryLink())
  const [authChecked, setAuthChecked] = useState(!isSupabaseConfigured)
  const [authSession, setAuthSession] = useState<Session | null>(null)
  const [authProfile, setAuthProfile] = useState<Profile | null>(null)
  const [authProfileError, setAuthProfileError] = useState<string | null>(null)
  const [authProfileChecked, setAuthProfileChecked] = useState(!isSupabaseConfigured)
  const [attempts, setAttempts] = useState<StudentAttempt[]>(() => readStorage('edueval-attempt-records', []))
  const [adminSnapshot, setAdminSnapshot] = useState<AdminSnapshot | null>(null)
  const [syncQueue, setSyncQueue] = useState<SyncQueueItem[]>(() => readSyncQueue())
  const [isOnline, setIsOnline] = useState(() => typeof navigator === 'undefined' ? true : navigator.onLine)
  const [syncing, setSyncing] = useState(false)
  const [lastSyncedAt, setLastSyncedAt] = useState(() => readStorage('edueval-last-sync', ''))
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null)
  const [showPasswordChange, setShowPasswordChange] = useState(false)
  const [currentDate, setCurrentDate] = useState(() => new Date())
  const [mobileNavOpen, setMobileNavOpen] = useState(false)

  useEffect(() => localStorage.setItem('edueval-activities', JSON.stringify(activities)), [activities])
  useEffect(() => localStorage.setItem('edueval-rooms', JSON.stringify(rooms)), [rooms])
  useEffect(() => localStorage.setItem('edueval-templates', JSON.stringify(templates)), [templates])
  useEffect(() => localStorage.setItem('edueval-attempt-records', JSON.stringify(attempts)), [attempts])
  useEffect(() => {
    const refreshQueue = () => setSyncQueue(readSyncQueue())
    const handleOnline = () => setIsOnline(true)
    const handleOffline = () => setIsOnline(false)
    window.addEventListener(syncQueueChangedEvent, refreshQueue)
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      window.removeEventListener(syncQueueChangedEvent, refreshQueue)
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])
  useEffect(() => {
    const handleInstallPrompt = (event: Event) => {
      event.preventDefault()
      setInstallPrompt(event as InstallPromptEvent)
    }
    const handleInstalled = () => setInstallPrompt(null)
    window.addEventListener('beforeinstallprompt', handleInstallPrompt)
    window.addEventListener('appinstalled', handleInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', handleInstallPrompt)
      window.removeEventListener('appinstalled', handleInstalled)
    }
  }, [])
  useEffect(() => { if (toast) { const timer = window.setTimeout(() => setToast(''), 2600); return () => window.clearTimeout(timer) } }, [toast])
  useEffect(() => {
    const timer = window.setInterval(() => setCurrentDate(new Date()), 60_000)
    return () => window.clearInterval(timer)
  }, [])
  useEffect(() => {
    const snapshot = readSessionJson<StudentSessionSnapshot>(studentSessionStorageKey)
    if (role !== 'student' || !snapshot?.room || !snapshot.participantId || !snapshot.guestToken) return
    let mounted = true
    const restoreStudentSession = async () => {
      let restoredRoom = snapshot.room
      if (supabase && isCloudId(restoredRoom.id)) {
        const { data, error } = await supabase.functions.invoke('student-room-guest', { body: { action: 'status', code: snapshot.roomCode, participantId: snapshot.participantId, guestToken: snapshot.guestToken } })
        if (error || !data?.room) {
          sessionStorage.removeItem(studentSessionStorageKey)
          return
        }
        restoredRoom = normalizeRoom({ ...restoredRoom, status: data.room.status as RoomStatus, startedAt: data.room.started_at ?? restoredRoom.startedAt, finishedAt: data.room.finished_at ?? restoredRoom.finishedAt, archivedAt: data.room.archived_at ?? restoredRoom.archivedAt })
      }
      if (!mounted) return
      setStudentName(snapshot.studentName)
      setRoomCode(snapshot.roomCode)
      setStudentParticipantId(snapshot.participantId)
      setStudentGuestToken(snapshot.guestToken)
      setStudentRoom(restoredRoom)
      setStudentQuestionIds(snapshot.questionIds)
      setStudentResponses(snapshot.responses)
      setStudentAnswerTimes(snapshot.answerTimes)
      setStudentStartedAt(snapshot.startedAt)
      setStudentQuestionStartedAt(Date.now())
      setStudentEvents(snapshot.events)
      setStudentFinished(snapshot.finished)
      setPlayIndex(snapshot.playIndex)
      setSubmitted(snapshot.submitted)
      setView(snapshot.finished ? 'overview' : 'play')
    }
    void restoreStudentSession()
    return () => { mounted = false }
  }, [role])
  useEffect(() => {
    if (role !== 'student' || !studentRoom || !studentParticipantId || !studentGuestToken) return
    const snapshot: StudentSessionSnapshot = { studentName, roomCode: studentRoom.code, room: studentRoom, participantId: studentParticipantId, guestToken: studentGuestToken, questionIds: studentQuestionIds, responses: studentResponses, answerTimes: studentAnswerTimes, startedAt: studentStartedAt, events: studentEvents, finished: studentFinished, playIndex, submitted }
    sessionStorage.setItem(studentSessionStorageKey, JSON.stringify(snapshot))
  }, [role, studentRoom, studentParticipantId, studentGuestToken, studentName, roomCode, studentQuestionIds, studentResponses, studentAnswerTimes, studentStartedAt, studentEvents, studentFinished, playIndex, submitted])
  useEffect(() => {
    if (!supabase) return
    let mounted = true
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return
      if (hasPasswordRecoveryLink() && data.session) setPasswordRecoveryFlow(true)
      setAuthSession(data.session)
      setAuthChecked(true)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return
      if (event === 'PASSWORD_RECOVERY' || (hasPasswordRecoveryLink() && session)) setPasswordRecoveryFlow(true)
      setAuthSession(session)
      setAuthChecked(true)
    })
    return () => { mounted = false; subscription.unsubscribe() }
  }, [])
  useEffect(() => {
    if (!supabase || !authSession) { setAuthProfile(null); setAuthProfileError(null); setAuthProfileChecked(true); return }
    let mounted = true
    setAuthProfileChecked(false)
    setAuthProfileError(null)
    getProfile(authSession.user.id).then(({ profile, error }) => { if (mounted) { setAuthProfile(profile); setAuthProfileError(error); setAuthProfileChecked(true) } })
    return () => { mounted = false }
  }, [authSession])
  useEffect(() => {
    if (authSession?.user.app_metadata?.invitation_pending === true && authSession.user.user_metadata?.password_initialized !== true) setInviteFlow(true)
  }, [authSession])
  useEffect(() => {
    const client = supabase
    if (!client || !authSession || !authProfile) return
    let mounted = true
    const loadCloudContent = async () => {
      const [templateResult, activityResult, roomResult] = await Promise.all([
        client.from('evaluation_templates').select('id, title, subject, description, objective, competency, difficulty, content, status, updated_at').eq('owner_id', authProfile.id).order('updated_at', { ascending: false }),
        client.from('activities').select('id, template_id, type, title, topic, difficulty, prompt, options, answer, feedback, details, status').eq('owner_id', authProfile.id).order('updated_at', { ascending: false }),
        client.from('rooms').select('id, owner_id, name, code, instructions, status, question_count, student_limit, time_minutes, score_per_question, shuffle_questions, allow_back, created_at, started_at, finished_at, archived_at').eq('owner_id', authProfile.id).order('created_at', { ascending: false }),
      ])
      if (!mounted) return
      if (templateResult.error || activityResult.error || roomResult.error) {
        setToast('No pudimos cargar todo el contenido de Supabase; se conserva el respaldo local.')
        return
      }
      const cloudTemplates = (templateResult.data ?? []).map((row) => cloudTemplateToLocal(row as CloudTemplateRow))
      const cloudActivities = (activityResult.data ?? []).map((row) => cloudActivityToLocal(row as CloudActivityRow))
      const cloudRoomRows = (roomResult.data ?? []) as CloudRoomRow[]
      const relationResult = cloudRoomRows.length
        ? await client.from('room_activities').select('room_id, activity_id, position').in('room_id', cloudRoomRows.map((room) => room.id)).order('position', { ascending: true })
        : { data: [], error: null }
      if (!mounted) return
      if (relationResult.error) {
        setToast('Las salas se cargaron, pero no pudimos recuperar sus actividades.')
        return
      }
      const cloudRooms = cloudRoomRows.map((row) => cloudRoomToLocal(row, (relationResult.data ?? []) as CloudRoomActivityRow[]))
      const roomIds = cloudRooms.map((room) => room.id)
      if (roomIds.length) {
        const [participantResult, attemptResult] = await Promise.all([
          client.from('room_participants').select('id, room_id, display_name, joined_at, status').in('room_id', roomIds),
          client.from('attempts').select('id, room_id, participant_id, started_at, finished_at, status, total_questions, answered_count, omitted_count, correct_count, score, max_score, events').in('room_id', roomIds).neq('status', 'in_progress'),
        ])
        if (!mounted) return
        if (participantResult.error || attemptResult.error) {
          setToast('Las salas se cargaron, pero sus participantes o intentos no pudieron actualizarse.')
        } else {
          const cloudAttemptRows = (attemptResult.data ?? []) as CloudAttemptRow[]
          const answerResult = cloudAttemptRows.length
            ? await client.from('attempt_answers').select('attempt_id, activity_id, question_index, response, response_text, status, correct, score, time_seconds').in('attempt_id', cloudAttemptRows.map((attempt) => attempt.id)).order('question_index', { ascending: true })
            : { data: [], error: null }
          if (!mounted) return
          if (!answerResult.error) {
            const roomById = new Map(cloudRooms.map((room) => [room.id, room]))
            const participantById = new Map(((participantResult.data ?? []) as CloudParticipantRow[]).map((participant) => [participant.id, participant]))
            const answersByAttempt = new Map<string, CloudAttemptAnswerRow[]>()
            for (const answer of (answerResult.data ?? []) as CloudAttemptAnswerRow[]) answersByAttempt.set(answer.attempt_id, [...(answersByAttempt.get(answer.attempt_id) ?? []), answer])
            const activityById = new Map([...cloudActivities, ...activities].map((activity) => [activity.id, activity]))
            const cloudAttempts = cloudAttemptRows.map((attempt) => cloudAttemptToLocal(attempt, participantById.get(attempt.participant_id), roomById.get(attempt.room_id), answersByAttempt.get(attempt.id) ?? [], activityById)).filter(Boolean) as StudentAttempt[]
            setAttempts((current) => {
              const merged = [...cloudAttempts, ...current.filter((attempt) => !cloudAttempts.some((cloudAttempt) => sameAttemptIdentity(cloudAttempt, attempt)))]
              const seen = new Set<string>()
              return merged.filter((attempt) => {
                const identity = `${attempt.roomCode.trim().toUpperCase()}::${attempt.studentName.trim().toLowerCase()}`
                if (seen.has(identity)) return false
                seen.add(identity)
                return true
              })
            })
          }
        }
      }
      setTemplates((current) => mergeCloudItems(current, cloudTemplates))
      setActivities((current) => mergeCloudItems(current, cloudActivities))
      setRooms((current) => mergeCloudItems(current, cloudRooms))
      markSynced()
    }
    void loadCloudContent()
    return () => { mounted = false }
  }, [authSession, authProfile, view])

  const loadAdminSnapshot = async (showError = true) => {
    if (!supabase || !authSession || !authProfile || authSession.user.is_anonymous || !canAccessPanel(authProfile, 'admin')) {
      setAdminSnapshot(null)
      return
    }
    const { data, error } = await supabase.functions.invoke('admin-platform-data', { body: {} })
    if (error || !data?.ok) {
      if (showError) setToast('No pudimos cargar los datos globales de administración; se conserva el respaldo local.')
      return
    }
    setAdminSnapshot(data as AdminSnapshot)
  }

  useEffect(() => {
    void loadAdminSnapshot()
  }, [authSession, authProfile, view])

  const published = activities.filter((item) => item.status === 'published')
  const pending = activities.filter((item) => item.status === 'pending')
  const backendReady = isSupabaseConfigured
  const syncLabel = !backendReady ? 'Respaldo local' : !isOnline ? 'Sin conexión · respaldo local' : syncing ? 'Sincronizando…' : syncQueue.length ? `${syncQueue.length} pendiente${syncQueue.length === 1 ? '' : 's'}` : lastSyncedAt ? 'Sincronizado' : 'Supabase conectado'
  const panelView = role === 'student' ? view : allowedPanelViews[role].includes(view) ? view : 'overview'
  const displayName = authProfile?.display_name?.trim() || authSession?.user.email?.split('@')[0] || 'Docente'
  const firstName = displayName.split(/\s+/)[0]
  const todayLabel = new Intl.DateTimeFormat('es-BO', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(currentDate)
  const displayedAttempts = role === 'admin' && adminSnapshot ? adminSnapshot.attempts : attempts
  const hasTemplateDraft = Boolean(readStorage<Partial<EvaluationTemplate> | null>('edueval-template-draft', null)?.title || readStorage<Partial<EvaluationTemplate> | null>('edueval-template-draft', null)?.subject)
  const resultRooms = role === 'admin' && adminSnapshot
    ? adminSnapshot.rooms.map((room) => normalizeRoom({
        id: room.id,
        name: room.name,
        code: room.code,
        status: room.status,
        questionCount: room.questionCount,
        limit: room.limit,
        activities: room.activities.map((activity) => activity.id),
        activityIds: room.activities.map((activity) => activity.id),
        createdAt: room.createdAt,
      }))
    : rooms

  const show = (next: View) => { setView(next); setSelectedActivity(null); setSubmitted(false); setMobileNavOpen(false) }
  const notify = (message: string) => setToast(message)
  const queueSync = (kind: SyncKind, payload: unknown, message: string) => {
    setSyncQueue(enqueueSyncItem(kind, payload))
    notify(message)
  }
  const markSynced = () => {
    const stamp = new Date().toISOString()
    setLastSyncedAt(stamp)
    localStorage.setItem('edueval-last-sync', JSON.stringify(stamp))
  }
  const installApp = async () => {
    if (!installPrompt) return
    await installPrompt.prompt()
    await installPrompt.userChoice
    setInstallPrompt(null)
  }
  useEffect(() => {
    const client = supabase
    if (!client || !authSession || !authProfile || authSession.user.is_anonymous || (!canAccessPanel(authProfile, 'teacher') && !canAccessPanel(authProfile, 'admin'))) return
    const channel = client
      .channel(`rooms-owner:${authProfile.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rooms', filter: `owner_id=eq.${authProfile.id}` }, (payload) => {
        const row = payload.new as unknown
        if (payload.eventType === 'DELETE') {
          const deletedId = isRecord(payload.old) && typeof payload.old.id === 'string' ? payload.old.id : null
          if (deletedId) setRooms((current) => current.filter((room) => room.id !== deletedId))
          return
        }
        if (!isRecord(row) || typeof row.id !== 'string') return
        setRooms((current) => current.map((room) => room.id === row.id ? patchRoomFromRealtime(room, row) : room))
      })
      .subscribe()
    return () => { void client.removeChannel(channel) }
  }, [authSession, authProfile])
  useEffect(() => {
    const client = supabase
    if (!client || !authSession?.user.is_anonymous || !studentRoom || !studentParticipantId || !isCloudId(studentRoom.id)) return
    const channel = client
      .channel(`room-status:${studentRoom.id}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'rooms', filter: `id=eq.${studentRoom.id}` }, (payload) => {
        const row = payload.new as unknown
        if (!isRecord(row)) return
        const status = typeof row.status === 'string' ? row.status as RoomStatus : null
        if (!status) return
        setStudentRoom((current) => current ? patchRoomFromRealtime(current, row) : current)
        if (status === 'active') {
          setStudentQuestionStartedAt(Date.now())
          setStudentEvents((events) => [...events, { type: 'joined', at: new Date().toISOString(), detail: 'La sala fue iniciada por el docente.' }])
          setView('play')
          notify('La evaluación comenzó.')
        } else if (status === 'finished' || status === 'archived') {
          setStudentFinished(true)
          setView('overview')
          notify('El docente cerró esta sala.')
        }
      })
      .subscribe()
    return () => { void client.removeChannel(channel) }
  }, [authSession, studentRoom?.id, studentParticipantId])
  const changeRole = (next: Role) => {
    if (next !== 'student' && authProfile && !canAccessPanel(authProfile, next)) return notify(`Tu cuenta tiene acceso de ${authProfile.roles.map((item) => item === 'admin' ? 'administrador' : 'docente').join(' y ')}, no de ${next === 'admin' ? 'administrador' : 'docente'}.`)
    setRole(next); setHasChosenRole(true); show('overview')
  }
  const signOut = async (message = 'Sesión cerrada.') => {
    try {
      if (supabase) await supabase.auth.signOut({ scope: 'local' })
    } catch {
      // La interfaz y el almacenamiento de este dispositivo se limpian aunque la red no responda.
    } finally {
      sessionStorage.removeItem(studentSessionStorageKey)
      sessionStorage.removeItem('edueval-student-participant-id')
      sessionStorage.removeItem('edueval-student-guest-token')
      setStudentRoom(null)
      setStudentParticipantId(null)
      setStudentGuestToken(null)
      setHasChosenRole(false)
      setRole('teacher')
      setView('overview')
      notify(message)
    }
  }
  useEffect(() => {
    if (!authSession || authSession.user.is_anonymous) return
    const inactivityMs = 30 * 60 * 1000
    let timer = window.setTimeout(() => { void signOut('Tu sesión se cerró por inactividad.') }, inactivityMs)
    const reset = () => { window.clearTimeout(timer); timer = window.setTimeout(() => { void signOut('Tu sesión se cerró por inactividad.') }, inactivityMs) }
    const events = ['pointerdown', 'keydown', 'touchstart', 'scroll'] as const
    events.forEach((event) => window.addEventListener(event, reset, { passive: true }))
    return () => { window.clearTimeout(timer); events.forEach((event) => window.removeEventListener(event, reset)) }
  }, [authSession])
  useEffect(() => {
    const keepAppHistory = () => window.history.pushState({ edueval: true }, '', window.location.href)
    const handleBack = () => {
      if (mobileNavOpen) { setMobileNavOpen(false); keepAppHistory(); return }
      if (selectedActivity) { setSelectedActivity(null); keepAppHistory(); return }
      if (showPasswordChange) { setShowPasswordChange(false); keepAppHistory(); return }
      if (view === 'play' && playIndex > 0 && studentRoom?.allowBack) { previousStudentQuestion(); return }
      if (view !== 'overview') { show('overview'); keepAppHistory(); return }
      if (!authSession && hasChosenRole) { setHasChosenRole(false); keepAppHistory(); return }
      if (window.confirm('¿Salir de la app? Se cerrará tu sesión en este dispositivo.')) void signOut('Saliste de EvaluEdu.')
      else keepAppHistory()
    }
    window.history.pushState({ edueval: true }, '', window.location.href)
    window.addEventListener('popstate', handleBack)
    return () => window.removeEventListener('popstate', handleBack)
  }, [view, playIndex, studentRoom?.allowBack, selectedActivity, showPasswordChange, authSession, hasChosenRole, mobileNavOpen])
  const clearInviteUrl = () => { window.history.replaceState({}, document.title, window.location.pathname) }
  const cancelInvite = async () => { clearInviteUrl(); setInviteFlow(false); await signOut() }
  const completeInvite = () => { clearInviteUrl(); setInviteFlow(false); setRole('teacher'); setHasChosenRole(true); show('overview'); notify('Acceso docente activado.') }
  const completePasswordRecovery = () => {
    clearInviteUrl()
    setPasswordRecoveryFlow(false)
    const nextRole = authProfile?.role ?? 'teacher'
    setRole(nextRole)
    setHasChosenRole(true)
    show('overview')
    notify('Contraseña actualizada. Ya puedes ingresar a tu panel.')
  }
  const cancelPasswordRecovery = async () => {
    clearInviteUrl()
    setPasswordRecoveryFlow(false)
    await signOut('Recuperación cancelada.')
  }

  const persistCloudActivity = async (activity: Activity, localId: string, queueOnFailure = true) => {
    if (!supabase || !authProfile) return false
    let data: unknown = null
    let error: { message: string } | null = null
    if (!queueOnFailure) {
      const existing = await supabase.from('activities').select('id, template_id, type, title, topic, difficulty, prompt, options, answer, feedback, details, status').eq('owner_id', authProfile.id).eq('type', activity.type).eq('title', activity.title).limit(1).maybeSingle()
      data = existing.data
      error = existing.error
    }
    if (!data && !error) {
      const inserted = await supabase.from('activities').insert({
      owner_id: authProfile.id,
      template_id: isCloudId(activity.templateId) ? activity.templateId : null,
      type: activity.type,
      title: activity.title,
      topic: activity.topic,
      difficulty: activity.difficulty,
      prompt: activity.prompt,
      options: activity.options,
      answer: activity.answer,
      feedback: activity.feedback,
      details: activity.details ?? {},
      status: activity.status,
      }).select('id, template_id, type, title, topic, difficulty, prompt, options, answer, feedback, details, status').single()
      data = inserted.data
      error = inserted.error
    }
    if (error || !data) {
      if (queueOnFailure) queueSync('activity', { activity, localId }, 'Actividad guardada en el respaldo local; quedó pendiente de sincronización.')
      return false
    }
    const cloudActivity = cloudActivityToLocal(data as CloudActivityRow)
    setActivities((current) => current.map((item) => item.id === localId ? cloudActivity : item))
    markSynced()
    return true
  }

  const persistCloudTemplate = async (template: EvaluationTemplate, generated: Activity[], queueOnFailure = true) => {
    if (!supabase || !authProfile) return false
    const templateColumns = 'id, title, subject, description, objective, competency, difficulty, content, status, updated_at'
    let data: unknown = null
    let error: { message: string } | null = null
    if (!queueOnFailure) {
      const existing = await supabase.from('evaluation_templates').select(templateColumns).eq('owner_id', authProfile.id).eq('title', template.title).eq('objective', template.objective).order('updated_at', { ascending: false }).limit(1).maybeSingle()
      data = existing.data
      error = existing.error
    }
    if (!data && !error) {
      const inserted = await supabase.from('evaluation_templates').insert({
        owner_id: authProfile.id,
        title: template.title,
        subject: template.subject,
        description: template.description,
        objective: template.objective,
        competency: template.competency,
        difficulty: template.difficulty,
        content: {
          concepts: template.concepts,
          situations: template.situations,
          processSteps: template.processSteps,
          categories: template.categories,
          source: template.source,
          schemaVersion: template.schemaVersion,
        },
        status: template.status,
        accepted_at: template.status === 'accepted' ? template.updatedAt : null,
      }).select(templateColumns).single()
      data = inserted.data
      error = inserted.error
    }
    if (error || !data) {
      if (queueOnFailure) queueSync('template', { template, generated }, 'Plantilla guardada en el respaldo local; quedó pendiente de sincronización.')
      return false
    }
    const cloudTemplate = cloudTemplateToLocal(data as CloudTemplateRow)
    setTemplates((current) => current.map((item) => item.id === template.id ? cloudTemplate : item))
    if (template.status !== 'accepted' || !generated.length) {
      notify('Plantilla sincronizada con Supabase.')
      markSynced()
      return true
    }
    const rows = generated.map((activity) => ({
      owner_id: authProfile.id,
      template_id: cloudTemplate.id,
      type: activity.type,
      title: activity.title,
      topic: activity.topic,
      difficulty: activity.difficulty,
      prompt: activity.prompt,
      options: activity.options,
      answer: activity.answer,
      feedback: activity.feedback,
      details: activity.details ?? {},
      status: activity.status,
    }))
    let activityRows: unknown[] | null = null
    let activityError: { message: string } | null = null
    if (!queueOnFailure) {
      const existingActivities = await supabase.from('activities').select('id, template_id, type, title, topic, difficulty, prompt, options, answer, feedback, details, status').eq('owner_id', authProfile.id).eq('template_id', cloudTemplate.id)
      activityRows = existingActivities.data
      activityError = existingActivities.error
    }
    if (!activityRows?.length && !activityError) {
      const insertedActivities = await supabase.from('activities').insert(rows).select('id, template_id, type, title, topic, difficulty, prompt, options, answer, feedback, details, status')
      activityRows = insertedActivities.data
      activityError = insertedActivities.error
    }
    if (activityError || !activityRows) {
      if (queueOnFailure) queueSync('template', { template, generated }, 'La plantilla se sincronizó, pero sus actividades quedaron pendientes.')
      return false
    }
    const cloudActivities = (activityRows as CloudActivityRow[]).map(cloudActivityToLocal)
    const cloudByKey = new Map(cloudActivities.map((activity) => [activity.type + '|' + activity.title, activity]))
    setActivities((current) => current.map((item) => generated.some((local) => local.id === item.id) ? cloudByKey.get(item.type + '|' + item.title) ?? item : item))
    notify('Plantilla y actividades sincronizadas con Supabase.')
    markSynced()
    return true
  }

  const createActivity = (activity: Activity) => {
    const localId = `a${Date.now()}`
    const localActivity = { ...activity, id: localId, status: 'published' as const }
    setActivities((current) => [localActivity, ...current])
    void persistCloudActivity(localActivity, localId)
    notify('Actividad creada y disponible para evaluar el contenido.')
  }

  const deleteActivity = async (activity: Activity) => {
    const localRoomUsesActivity = rooms.filter((room) => room.activities.includes(activity.id) || room.activityIds.includes(activity.id))
    if (localRoomUsesActivity.length) {
      return notify(`No se puede eliminar “${activity.title}” porque forma parte de ${localRoomUsesActivity.length === 1 ? 'una sala' : `${localRoomUsesActivity.length} salas`}. Archiva la sala si ya no la usarás.`)
    }
    if (!window.confirm(`¿Eliminar la actividad “${activity.title}”? Esta acción no se puede deshacer.`)) return
    if (isCloudId(activity.id)) {
      if (!supabase || !authProfile) return notify('No pudimos verificar tu sesión para eliminar esta actividad.')
      const { data: roomLinks, error: roomLinksError } = await supabase.from('room_activities').select('room_id').eq('activity_id', activity.id).limit(1)
      if (roomLinksError) return notify('No pudimos comprobar si la actividad está vinculada a una sala.')
      if (roomLinks?.length) return notify('La actividad está vinculada a una sala y conserva datos de evaluación; no se puede eliminar.')
      const { data: answerLinks, error: answerLinksError } = await supabase.from('attempt_answers').select('id').eq('activity_id', activity.id).limit(1)
      if (answerLinksError) return notify('No pudimos comprobar si la actividad aparece en resultados.')
      if (answerLinks?.length) return notify('La actividad aparece en resultados históricos; consérvala para no romper la trazabilidad.')
      const { error } = await supabase.from('activities').delete().eq('id', activity.id).eq('owner_id', authProfile.id)
      if (error) return notify(`No se pudo eliminar la actividad: ${error.message}`)
      markSynced()
    }
    setActivities((current) => current.filter((item) => item.id !== activity.id))
    setSelectedActivity(null)
    notify('Actividad eliminada.')
  }
  const createTemplate = (template: EvaluationTemplate) => {
    const savedTemplate = { ...template, id: `t${Date.now()}`, updatedAt: new Date().toISOString() }
    setTemplates((current) => [savedTemplate, ...current])
    let generated: Activity[] = []
    if (template.status === 'accepted') {
      generated = buildActivitiesFromTemplate(savedTemplate)
      setActivities((current) => [...generated, ...current])
      notify(`${generated.length} actividad${generated.length === 1 ? '' : 'es'} creada${generated.length === 1 ? '' : 's'} desde la plantilla aprobada.`)
    } else notify('Borrador de plantilla guardado.')
    void persistCloudTemplate(savedTemplate, generated)
  }
  const importContent = (document: ContentImportDocument) => {
    const stamp = Date.now()
    const savedTemplate: EvaluationTemplate = {
      id: `t${stamp}`,
      title: document.content.title,
      subject: document.content.subject,
      description: document.content.description,
      objective: document.content.objective,
      competency: document.content.competency,
      difficulty: document.content.difficulty,
      concepts: document.content.concepts.map((concept, index) => ({ ...concept, id: `c-import-${stamp}-${index}`, example: concept.example ?? '' })),
      situations: document.content.situations.map((situation, index) => ({ ...situation, id: `s-import-${stamp}-${index}` })),
      processSteps: document.content.processSteps,
      categories: document.content.categories,
      status: 'accepted',
      updatedAt: new Date().toISOString(),
      source: 'json',
      schemaVersion: document.version,
    }
    const generated = buildActivitiesFromTemplate(savedTemplate).map((activity, index) => ({ ...activity, id: `a${stamp}-import-${index}`, status: 'pending' as const }))
    setTemplates((current) => [savedTemplate, ...current])
    setActivities((current) => [...generated, ...current])
    void persistCloudTemplate(savedTemplate, generated)
    notify(generated.length ? `JSON válido: ${generated.length} propuesta${generated.length === 1 ? '' : 's'} creada${generated.length === 1 ? '' : 's'} para revisión.` : 'JSON válido, pero no contiene información suficiente para crear actividades.')
    show('proposals')
  }
  const reviewActivity = (id: string, status: 'published' | 'draft') => {
    setActivities((current) => current.map((item) => item.id === id ? { ...item, status } : item))
    if (supabase && authProfile && isCloudId(id)) {
      void supabase.from('activities').update({ status }).eq('id', id).eq('owner_id', authProfile.id).then(({ error }) => {
        if (error) queueSync('activity_status', { id, status }, 'El estado se actualizó localmente; quedó pendiente de sincronización.')
        else markSynced()
      })
    }
    notify(status === 'published' ? 'Propuesta aprobada y publicada.' : 'Propuesta devuelta a borradores.')
  }

  const persistCloudRoom = async (room: Room, localId: string, queueOnFailure = true) => {
    if (!supabase || !authProfile || !room.activityIds.every(isCloudId)) return false
    const roomColumns = 'id, owner_id, name, code, instructions, status, question_count, student_limit, time_minutes, score_per_question, shuffle_questions, allow_back, created_at, started_at, finished_at, archived_at'
    let data: unknown = null
    let error: { message: string } | null = null
    if (!queueOnFailure) {
      const existing = await supabase.from('rooms').select(roomColumns).eq('owner_id', authProfile.id).eq('code', room.code).maybeSingle()
      data = existing.data
      error = existing.error
    }
    if (!data && !error) {
      const inserted = await supabase.from('rooms').insert({
        owner_id: authProfile.id,
        name: room.name,
        code: room.code,
        instructions: room.instructions,
        status: room.status,
        question_count: room.questionCount,
        student_limit: room.limit,
        time_minutes: room.time,
        score_per_question: room.scorePerQuestion,
        shuffle_questions: room.shuffleQuestions,
        allow_back: room.allowBack,
        created_at: room.createdAt,
      }).select(roomColumns).single()
      data = inserted.data
      error = inserted.error
    }
    if (error || !data) {
      if (queueOnFailure) queueSync('room', { room, localId }, 'Sala creada en el respaldo local; quedó pendiente de sincronización.')
      return false
    }
    const cloudRoomRow = data as CloudRoomRow
    let relations: CloudRoomActivityRow[] = []
    let relationError: { message: string } | null = null
    if (!queueOnFailure) {
      const existingRelations = await supabase.from('room_activities').select('room_id, activity_id, position').eq('room_id', cloudRoomRow.id).order('position', { ascending: true })
      relations = (existingRelations.data ?? []) as CloudRoomActivityRow[]
      relationError = existingRelations.error
    }
    if (!relations.length && !relationError) {
      const relationRows = room.activities.map((activityId, position) => ({ room_id: cloudRoomRow.id, activity_id: activityId, position }))
      const relationResult = await supabase.from('room_activities').insert(relationRows)
      relations = relationRows
      relationError = relationResult.error
    }
    if (relationError) {
      if (queueOnFailure) await supabase.from('rooms').delete().eq('id', cloudRoomRow.id).eq('owner_id', authProfile.id)
      if (queueOnFailure) queueSync('room', { room, localId }, 'La sala quedó local; sus actividades quedaron pendientes de vinculación.')
      return false
    }
    const cloudRoom = cloudRoomToLocal(cloudRoomRow, relations)
    setRooms((current) => current.map((item) => item.id === localId ? cloudRoom : item))
    notify('Sala sincronizada con Supabase y lista para compartir.')
    markSynced()
    return true
  }

  const persistCloudRoomTransition = async (room: Room, status: RoomStatus, at: string, queueOnFailure = true) => {
    if (!supabase || !authProfile) return false
    const cloudRoom = isCloudId(room.id) ? room : rooms.find((item) => item.code === room.code && isCloudId(item.id))
    if (!cloudRoom) {
      if (queueOnFailure) queueSync('room_transition', { roomCode: room.code, status, at }, 'El cambio de estado quedó pendiente hasta sincronizar la sala.')
      return false
    }
    const update: Record<string, string | null> = { status }
    if (status === 'active') update.started_at = at
    if (status === 'finished') update.finished_at = at
    if (status === 'archived') update.archived_at = at
    const { error } = await supabase.from('rooms').update(update).eq('id', cloudRoom.id).eq('owner_id', authProfile.id)
    if (error) {
      if (queueOnFailure) queueSync('room_transition', { roomCode: room.code, status, at }, 'El estado quedó localmente; el cambio quedó pendiente de sincronización.')
      return false
    }
    markSynced()
    return true
  }

  const createRoom = (settings: RoomSettings) => {
    if (settings.activityIds.length < 1) return notify('Selecciona al menos una actividad para crear la sala.')
    const selected = settings.activityIds.map((id) => published.find((item) => item.id === id)).filter(Boolean) as Activity[]
    if (new Set(selected.map((item) => item.type)).size > 3) return notify('Una sala puede combinar como máximo tres tipos de actividad.')
    const activities = Array.from({ length: Math.max(1, settings.questionCount) }, (_, index) => settings.activityIds[index % settings.activityIds.length])
    const room: Room = { ...settings, id: `r${Date.now()}`, code: `EDU-${Math.floor(100 + Math.random() * 899)}`, activities, status: 'ready', createdAt: new Date().toISOString() }
    setRooms((current) => [room, ...current])
    void persistCloudRoom(room, room.id)
    notify('Sala lista para iniciar. Ábrela cuando quieras compartir el código.')
  }
  const transitionRoom = (id: string, status: RoomStatus) => {
    const room = rooms.find((item) => item.id === id)
    if (!room) return
    const at = new Date().toISOString()
    const nextRoom = { ...room, status, startedAt: status === 'active' ? at : room.startedAt, finishedAt: status === 'finished' ? at : room.finishedAt, archivedAt: status === 'archived' ? at : room.archivedAt }
    setRooms((current) => current.map((item) => item.id === id ? nextRoom : item))
    void persistCloudRoomTransition(room, status, at)
    const labels: Record<RoomStatus, string> = { draft: 'borrador', ready: 'lista para iniciar', waiting: 'abierta para estudiantes', active: 'iniciada', finished: 'finalizada', archived: 'archivada' }
    notify(`Sala ${labels[status]}.`)
  }
  const duplicateRoom = (room: Room) => {
    const copy: Room = { ...room, id: `r${Date.now()}`, code: `EDU-${Math.floor(100 + Math.random() * 899)}`, status: 'ready', createdAt: new Date().toISOString(), startedAt: undefined, finishedAt: undefined, archivedAt: undefined }
    setRooms((current) => [copy, ...current])
    void persistCloudRoom(copy, copy.id)
    notify('Sala duplicada como una nueva evaluación lista para iniciar.')
  }

  const deleteRoom = async (room: Room) => {
    const localAttempts = attempts.filter((attempt) => attempt.roomId === room.id || attempt.roomCode === room.code)
    if (localAttempts.length) return notify('Esta sala tiene resultados registrados. Archívala para conservar la trazabilidad.')
    if (!window.confirm(`¿Eliminar la sala “${room.name}”? Esta acción no se puede deshacer.`)) return
    if (isCloudId(room.id)) {
      if (!supabase || !authProfile) return notify('No pudimos verificar tu sesión para eliminar esta sala.')
      const [participantsResult, attemptsResult, auditResult] = await Promise.all([
        supabase.from('room_participants').select('id').eq('room_id', room.id).limit(1),
        supabase.from('attempts').select('id').eq('room_id', room.id).limit(1),
        supabase.from('audit_events').select('id').eq('room_id', room.id).limit(1),
      ])
      if (participantsResult.error || attemptsResult.error || auditResult.error) return notify('No pudimos comprobar si la sala tiene participantes o resultados.')
      if (participantsResult.data?.length || attemptsResult.data?.length || auditResult.data?.length) return notify('La sala tiene trazabilidad o participantes. Usa “Archivar sala” para conservar sus datos.')
      const { error: linksError } = await supabase.from('room_activities').delete().eq('room_id', room.id)
      if (linksError) return notify(`No se pudieron quitar las actividades vinculadas: ${linksError.message}`)
      const { error } = await supabase.from('rooms').delete().eq('id', room.id).eq('owner_id', authProfile.id)
      if (error) return notify(`No se pudo eliminar la sala: ${error.message}`)
      markSynced()
    }
    setRooms((current) => current.filter((item) => item.id !== room.id))
    if (studentRoom?.id === room.id) leaveStudentSession()
    notify('Sala eliminada.')
  }
  const shareRoomCode = async (room: Room) => {
    try { await navigator.clipboard?.writeText(room.code); notify(`Código ${room.code} copiado para compartir.`) } catch { notify(`Comparte el código ${room.code} con tu grupo.`) }
  }

  const persistCloudAttempt = async (record: StudentAttempt, participantId: string | null, guestToken = studentGuestToken, queueOnFailure = true, responses = studentResponses) => {
    if (!supabase || !participantId || !guestToken || !isCloudId(record.roomId)) return false
    const { error } = await supabase.functions.invoke('student-room-guest', {
      body: {
        action: 'submit_attempt',
        roomId: record.roomId,
        participantId,
        guestToken,
        code: record.roomCode,
        responses: record.answers.map((answer, index) => ({ activityId: answer.activityId, index, response: responses[index] ?? null, timeSeconds: answer.timeSeconds })),
        attempt: {
          startedAt: record.startedAt,
          finishedAt: record.finishedAt,
          status: record.status,
          totalQuestions: record.totalQuestions,
          answeredCount: record.answeredCount,
          omittedCount: record.omittedCount,
          correctCount: record.correctCount,
          score: record.score,
          maxScore: record.maxScore,
          answers: record.answers,
          events: record.events,
        },
      },
    })
    if (error) {
      if (queueOnFailure) queueSync('attempt', { record, participantId, responses }, 'El intento quedó en el respaldo local; se sincronizará cuando vuelva la conexión.')
      return false
    }
    notify('Tu participación fue registrada y sincronizada.')
    markSynced()
    return true
  }

  const flushSyncQueue = async () => {
    if (!supabase || !authProfile || !isOnline || syncing) return
    const pending = readSyncQueue()
    if (!pending.length) return
    setSyncing(true)
    try {
      for (const item of pending) {
        const payload = isRecord(item.payload) ? item.payload : {}
        let synced = false
        if (item.kind === 'activity' && isRecord(payload.activity) && typeof payload.localId === 'string') {
          synced = await persistCloudActivity(payload.activity as Activity, payload.localId, false)
        } else if (item.kind === 'template' && isRecord(payload.template) && Array.isArray(payload.generated)) {
          synced = await persistCloudTemplate(payload.template as EvaluationTemplate, payload.generated as Activity[], false)
        } else if (item.kind === 'room' && isRecord(payload.room) && typeof payload.localId === 'string') {
          synced = await persistCloudRoom(payload.room as Room, payload.localId, false)
        } else if (item.kind === 'room_transition' && typeof payload.roomCode === 'string' && typeof payload.status === 'string' && typeof payload.at === 'string') {
          const room = rooms.find((candidate) => candidate.code === payload.roomCode)
          synced = room ? await persistCloudRoomTransition(room, payload.status as RoomStatus, payload.at, false) : false
        } else if (item.kind === 'activity_status' && typeof payload.id === 'string' && typeof payload.status === 'string') {
          const result = await supabase.from('activities').update({ status: payload.status }).eq('id', payload.id).eq('owner_id', authProfile.id)
          synced = !result.error
          if (synced) markSynced()
        } else if (item.kind === 'attempt' && isRecord(payload.record) && typeof payload.participantId === 'string') {
          synced = await persistCloudAttempt(payload.record as StudentAttempt, payload.participantId, studentGuestToken ?? readSessionStorage('edueval-student-guest-token'), false, isRecord(payload.responses) ? payload.responses as Record<number, ActivityResponse> : {})
        }
        if (synced) setSyncQueue(removeSyncItem(item.id))
        else setSyncQueue(markSyncItemFailed(item.id, 'No se pudo completar la sincronización.'))
      }
    } finally {
      setSyncing(false)
    }
  }

  useEffect(() => {
    if (!isOnline || !authSession || !authProfile || syncQueue.length === 0) return
    void flushSyncQueue()
  }, [isOnline, authSession, authProfile, syncQueue.length])

  const finishStudentAttempt = (reason: 'completed' | 'timeout' = 'completed', finalEvent?: AttemptEvent) => {
    if (!studentRoom) return
    const key = studentAttemptKey(studentRoom.id, studentName)
    const attempts = readStorage<string[]>('edueval-attempts', [])
    if (!attempts.includes(key)) localStorage.setItem('edueval-attempts', JSON.stringify([...attempts, key]))
    const activityIds = studentQuestionIds.length ? studentQuestionIds : studentRoom.activities
    const finishTime = new Date().toISOString()
    const answerRows: AttemptAnswer[] = activityIds.map((activityId, index) => {
      const activity = published.find((item) => item.id === activityId)
      const response = studentResponses[index]
      const evaluated = activity ? evaluateActivityResponse(activity, response, studentRoom.scorePerQuestion) : { response: '', status: 'omitted' as const, correct: null, score: 0 }
      return { index, activityId, activityTitle: activity?.title ?? 'Actividad eliminada', activityType: activity?.type ?? 'singleChoice', ...evaluated, timeSeconds: studentAnswerTimes[index] ?? 0 }
    })
    const record: StudentAttempt = { id: `${studentRoom.id}-${studentName.trim().toLowerCase()}-${Date.now()}`, roomId: studentRoom.id, roomName: studentRoom.name, roomCode: studentRoom.code, studentName: studentName.trim(), startedAt: studentStartedAt || finishTime, finishedAt: finishTime, status: reason, totalQuestions: answerRows.length, answeredCount: answerRows.filter((answer) => answer.status === 'answered').length, omittedCount: answerRows.filter((answer) => answer.status === 'omitted').length, correctCount: answerRows.filter((answer) => answer.correct === true).length, score: answerRows.reduce((total, answer) => total + answer.score, 0), maxScore: answerRows.length * studentRoom.scorePerQuestion, answers: answerRows, events: [...studentEvents, ...(finalEvent ? [finalEvent] : []), { type: reason === 'timeout' ? 'timeout' : 'finished', at: finishTime }] }
    setAttempts((current) => current.some((item) => studentAttemptKey(item.roomId, item.studentName) === key) ? current : [record, ...current])
    void persistCloudAttempt(record, studentParticipantId)
    setStudentFinished(true)
    setSubmitted(false)
    notify(reason === 'timeout' ? 'El tiempo terminó. Tu participación fue registrada.' : 'Tu participación fue registrada. El resultado queda disponible para el docente.')
  }
  const joinRoom = async () => {
    if (!roomCode.trim() || !studentName.trim()) return notify('Escribe tu nombre y el código de sala.')
    let room = rooms.find((item) => item.code.toUpperCase() === roomCode.trim().toUpperCase())
    let cloudJoinData: { participant?: { id?: string }; activities?: CloudActivityRow[]; room?: CloudRoomRow; activityIds?: string[]; guestToken?: string } | null = null
    if (!room && supabase) {
      const { data, error } = await supabase.functions.invoke('student-room-guest', { body: { action: 'join', code: roomCode.trim(), displayName: studentName.trim(), participantId: studentParticipantId, guestToken: studentGuestToken } })
      if (error || !data?.ok) return notify(await functionErrorMessage(error, data, 'No pudimos registrar tu ingreso. Intenta nuevamente.'))
      if (data.alreadyAttempted) return notify('Ya tienes un intento registrado para esta sala.')
      cloudJoinData = data
      if (typeof data.guestToken === 'string') {
        setStudentGuestToken(data.guestToken)
        sessionStorage.setItem('edueval-student-guest-token', data.guestToken)
      }
      if (data.room) {
        const relations = (data.activityIds ?? []).map((activityId: string, position: number) => ({ room_id: data.room.id, activity_id: activityId, position }))
        room = cloudRoomToLocal(data.room, relations)
        setRooms((current) => mergeCloudItems(current, [room as Room]))
      }
    }
    if (!room) return notify('No encontramos una sala con ese código.')
    if (room.status === 'ready' || room.status === 'draft') return notify('La sala todavía no fue abierta por el docente.')
    if (room.status === 'finished' || room.status === 'archived') return notify('Esta sala ya no acepta participantes.')
    if (hasStudentAttempt(room.id, studentName)) return notify('Ya tienes un intento registrado para esta sala.')
    let participantId: string | null = null
    if (supabase && isCloudId(room.id)) {
      if (!cloudJoinData) {
        const { data, error } = await supabase.functions.invoke('student-room-guest', { body: { action: 'join', code: room.code, displayName: studentName.trim(), participantId: studentParticipantId, guestToken: studentGuestToken } })
        if (error || !data?.ok) return notify(await functionErrorMessage(error, data, 'No pudimos registrar tu ingreso. Intenta nuevamente.'))
        if (data.alreadyAttempted) return notify('Ya tienes un intento registrado para esta sala.')
        cloudJoinData = data
        if (typeof data.guestToken === 'string') {
          setStudentGuestToken(data.guestToken)
          sessionStorage.setItem('edueval-student-guest-token', data.guestToken)
        }
      }
      const data = cloudJoinData
      if (!data) return notify('No pudimos registrar tu ingreso. Intenta nuevamente.')
      participantId = typeof data.participant?.id === 'string' ? data.participant.id : null
      if (typeof data.guestToken === 'string') {
        setStudentGuestToken(data.guestToken)
        sessionStorage.setItem('edueval-student-guest-token', data.guestToken)
      }
      const cloudActivities = Array.isArray(data.activities) ? data.activities.map((item: CloudActivityRow) => cloudActivityToLocal(item)) : []
      if (cloudActivities.length) setActivities((current) => mergeCloudItems(current, cloudActivities))
    }
    setStudentRoom(room)
    setStudentParticipantId(participantId)
    if (participantId) sessionStorage.setItem('edueval-student-participant-id', participantId)
    setStudentQuestionIds(room.shuffleQuestions ? shuffleItems(room.activities) : room.activities)
    setStudentResponses({})
    const joinedAt = new Date().toISOString()
    setStudentStartedAt(joinedAt)
    setStudentQuestionStartedAt(Date.now())
    setStudentAnswerTimes({})
    setStudentEvents([{ type: 'joined', at: joinedAt }])
    setStudentFinished(false)
    setPlayIndex(0)
    setSubmitted(false)
    if (room.status === 'active') { show('play'); notify('Te has unido a la evaluación.') } else notify('Te has unido. Espera a que el docente inicie la evaluación.')
  }
  const refreshStudentRoom = async () => {
    if (!studentRoom) return
    if (supabase && isCloudId(studentRoom.id) && studentParticipantId && studentGuestToken) {
      const previousStatus = studentRoom.status
      const { data, error } = await supabase.functions.invoke('student-room-guest', { body: { action: 'status', code: studentRoom.code, participantId: studentParticipantId, guestToken: studentGuestToken } })
      if (error || !data?.room) return notify(await functionErrorMessage(error, data, 'No pudimos actualizar el estado de la sala.'))
      const status = data.room.status as RoomStatus
      const current = { ...studentRoom, status, startedAt: data.room.started_at ?? studentRoom.startedAt, finishedAt: data.room.finished_at ?? studentRoom.finishedAt, archivedAt: data.room.archived_at ?? studentRoom.archivedAt }
      setStudentRoom(current)
      if (status === 'active' && previousStatus !== 'active') { setStudentQuestionStartedAt(Date.now()); setStudentEvents((events) => [...events, { type: 'joined', at: new Date().toISOString(), detail: 'La sala fue iniciada por el docente.' }]); show('play'); notify('La evaluación comenzó.') }
      else if ((status === 'finished' || status === 'archived') && previousStatus !== status) notify('El docente cerró esta sala.')
      return
    }
    const current = rooms.find((room) => room.code === studentRoom.code)
    if (!current) return notify('La sala ya no está disponible.')
    setStudentRoom(current)
    if (current.status === 'active') { setStudentQuestionStartedAt(Date.now()); setStudentEvents((events) => [...events, { type: 'joined', at: new Date().toISOString(), detail: 'La sala fue iniciada por el docente.' }]); show('play'); notify('La evaluación comenzó.') }
    else if (current.status === 'finished' || current.status === 'archived') notify('El docente cerró esta sala.')
  }
  useEffect(() => {
    if (!studentRoom || !studentParticipantId || !studentGuestToken || !isCloudId(studentRoom.id) || !['waiting', 'active'].includes(studentRoom.status)) return
    const timer = window.setInterval(() => { void refreshStudentRoom() }, 2500)
    return () => window.clearInterval(timer)
  }, [studentRoom?.id, studentRoom?.status, studentParticipantId, studentGuestToken])
  const leaveStudentSession = () => {
    setStudentRoom(null)
    setStudentParticipantId(null)
    setStudentGuestToken(null)
    sessionStorage.removeItem('edueval-student-participant-id')
    sessionStorage.removeItem('edueval-student-guest-token')
    setStudentFinished(false)
    setRoomCode('')
    setStudentResponses({})
    sessionStorage.removeItem(studentSessionStorageKey)
    show('overview')
  }
  const exportCsv = () => {
    const rows = [['intento_id', 'estudiante', 'sala', 'codigo_sala', 'estado', 'inicio', 'finalizacion', 'preguntas', 'respondidas', 'omitidas', 'correctas', 'puntaje', 'puntaje_maximo', 'actividad', 'tipo_actividad', 'estado_respuesta', 'respuesta', 'correcta', 'puntaje_respuesta', 'tiempo_segundos']]
    displayedAttempts.forEach((attempt) => attempt.answers.forEach((answer) => rows.push([attempt.id, attempt.studentName, attempt.roomName, attempt.roomCode, attempt.status === 'timeout' ? 'tiempo_agotado' : 'finalizada', attempt.startedAt, attempt.finishedAt, String(attempt.totalQuestions), String(attempt.answeredCount), String(attempt.omittedCount), String(attempt.correctCount), String(attempt.score), String(attempt.maxScore), answer.activityTitle, types[answer.activityType].label, answer.status === 'answered' ? 'respondida' : 'omitida', answer.response || 'Sin respuesta', answer.correct === null ? 'no evaluada' : answer.correct ? 'si' : 'no', String(answer.score), String(answer.timeSeconds)])))
    if (rows.length === 1) rows.push(['', 'Sin intentos registrados', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', ''])
    const csv = rows.map((row) => row.map((cell) => `"${cell.replaceAll('"', '""')}"`).join(';')).join('\n')
    const link = document.createElement('a'); link.href = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' })); link.download = 'edueval-resultados.csv'; link.click(); URL.revokeObjectURL(link.href)
    notify(`${displayedAttempts.length} intento${displayedAttempts.length === 1 ? '' : 's'} exportado${displayedAttempts.length === 1 ? '' : 's'} para abrir en Excel.`)
  }

  const studentActivities = studentRoom ? (studentQuestionIds.length ? studentQuestionIds : studentRoom.activities).map((id) => published.find((item) => item.id === id)).filter(Boolean) as Activity[] : published
  const playActivity = selectedActivity ?? studentActivities[playIndex % Math.max(studentActivities.length, 1)]
  const submitAnswer = (response: ActivityResponse) => { setStudentResponses((current) => ({ ...current, [playIndex]: response })); setStudentAnswerTimes((current) => ({ ...current, [playIndex]: Math.max(0, Math.round((Date.now() - studentQuestionStartedAt) / 1000)) })); setStudentEvents((events) => [...events, { type: 'answer_submitted', at: new Date().toISOString(), detail: studentActivities[playIndex]?.id }]); setSubmitted(true); notify('Respuesta registrada. La retroalimentación aparece sin revelar la solución.') }
  const goToStudentQuestion = (nextIndex: number) => { setPlayIndex(nextIndex); setStudentQuestionStartedAt(Date.now()); setSubmitted(Object.prototype.hasOwnProperty.call(studentResponses, nextIndex)) }
  const nextStudentQuestion = () => { if (playIndex + 1 >= studentActivities.length) finishStudentAttempt(); else goToStudentQuestion(playIndex + 1) }
  const skipStudentQuestion = () => { const event: AttemptEvent = { type: 'omitted', at: new Date().toISOString(), detail: studentActivities[playIndex]?.id }; setStudentEvents((events) => [...events, event]); if (playIndex + 1 >= studentActivities.length) finishStudentAttempt('completed', event); else goToStudentQuestion(playIndex + 1) }
  const previousStudentQuestion = () => { if (studentRoom?.allowBack && playIndex > 0) { setStudentEvents((events) => [...events, { type: 'navigated_back', at: new Date().toISOString(), detail: studentActivities[playIndex - 1]?.id }]); goToStudentQuestion(playIndex - 1) } }

  if (isSupabaseConfigured && !authChecked) return <AuthLoading />
  if (isSupabaseConfigured && passwordRecoveryFlow && !authSession) return <PasswordRecoveryUnavailableScreen onBack={() => { clearInviteUrl(); setPasswordRecoveryFlow(false) }} />
  if (isSupabaseConfigured && passwordRecoveryFlow && authSession) return <PasswordRecoveryScreen email={authSession.user.email ?? ''} onComplete={completePasswordRecovery} onCancel={cancelPasswordRecovery} />
  if (isSupabaseConfigured && authSession && !authProfileChecked) return <AuthLoading />
  if (isSupabaseConfigured && inviteFlow && !authSession) return <InviteLinkErrorScreen onBack={() => { clearInviteUrl(); setInviteFlow(false) }} />
  if (isSupabaseConfigured && inviteFlow && authSession && authProfileError) return <ProfileVerificationErrorScreen email={authSession.user.email ?? ''} error={authProfileError} onBack={cancelInvite} />
  if (isSupabaseConfigured && inviteFlow && authSession && authProfile) return <InviteAcceptanceScreen email={authSession.user.email ?? ''} onComplete={completeInvite} onCancel={cancelInvite} />
  if (isSupabaseConfigured && inviteFlow && authSession && authProfileChecked && !authProfile) return <ProfileUnavailableScreen email={authSession.user.email ?? ''} onBack={cancelInvite} />
  if (isSupabaseConfigured && hasChosenRole && role !== 'student' && !authSession) return <AuthScreen role={role} onBack={() => setHasChosenRole(false)} />
  if (isSupabaseConfigured && hasChosenRole && role !== 'student' && authSession && authProfileError) return <ProfileVerificationErrorScreen email={authSession.user.email ?? ''} error={authProfileError} onBack={signOut} />
  if (isSupabaseConfigured && hasChosenRole && role !== 'student' && authSession && authProfile && !canAccessPanel(authProfile, role)) return <RoleMismatchScreen selectedRole={role} actualRole={authProfile.role} onUseActualRole={() => { setRole(authProfile.role); show('overview') }} onBack={signOut} />
  if (isSupabaseConfigured && hasChosenRole && role === 'teacher' && authSession && !authProfile) return <ProfileSetupScreen user={authSession.user} onBack={signOut} onCreated={setAuthProfile} />
  if (isSupabaseConfigured && hasChosenRole && role === 'admin' && authSession && !authProfile) return <ProfileUnavailableScreen email={authSession.user.email ?? ''} onBack={signOut} />
  return !hasChosenRole ? <RoleLanding onChoose={changeRole} /> : <div className="app-shell">
    <header className="topbar">
      <button className="brand" onClick={() => show('overview')} aria-label="Ir al inicio"><span className="brand-mark">E</span><span><strong>EvaluEdu</strong><small>aprendizaje activo</small></span></button>
       <div className="topbar-actions"><span className={`connection-pill ${backendReady ? 'ready' : ''} ${!isOnline ? 'offline' : ''} ${syncQueue.length ? 'pending' : ''}`} title={lastSyncedAt ? `Última sincronización: ${formatDate(lastSyncedAt)}` : undefined}><i />{syncLabel}</span>{syncQueue.length > 0 && isOnline && <button className="sync-button" type="button" onClick={() => void flushSyncQueue()} disabled={syncing}>{syncing ? '↻' : '↻ Sincronizar'}</button>}{installPrompt && <button className="install-button" type="button" onClick={() => void installApp()}>＋ Instalar app</button>}{authSession ? <details className="account-menu"><summary className="avatar" aria-label="Abrir opciones de cuenta">{authProfile?.display_name.slice(0, 2).toUpperCase() ?? authSession.user.email?.slice(0, 2).toUpperCase() ?? 'LM'}</summary><div>{!authSession.user.is_anonymous && <button type="button" onClick={() => setShowPasswordChange(true)}>Cambiar contraseña</button>}<button type="button" onClick={() => void signOut()}>Cerrar sesión</button></div></details> : <button className="avatar" aria-label="Perfil">LM</button>}</div>
    </header>
    {role !== 'student' && mobileNavOpen && <button className="mobile-nav-backdrop" type="button" aria-label="Cerrar navegación" onClick={() => setMobileNavOpen(false)} />}
    <div className="layout">
      {role !== 'student' && <aside className={`sidebar${mobileNavOpen ? ' mobile-open' : ''}`}><div className="role-label"><span className="role-icon">{role === 'admin' ? '⚙' : '✦'}</span><div><b>{role === 'admin' ? 'Administración' : 'Panel docente'}</b><small>{role === 'admin' ? 'control de la plataforma' : 'crear · revisar · acompañar'}</small></div></div><nav>{role === 'admin' ? <><NavButton active={panelView === 'overview'} icon="▦" label="Resumen general" onClick={() => show('overview')} /><NavButton active={panelView === 'adminUsers'} icon="♙" label="Usuarios" onClick={() => show('adminUsers')} /><NavButton active={panelView === 'rooms'} icon="⌘" label="Salas globales" onClick={() => show('rooms')} /><NavButton active={panelView === 'adminAudit'} icon="◌" label="Auditoría" onClick={() => show('adminAudit')} /><NavButton active={panelView === 'results'} icon="↗" label="Resultados" onClick={() => show('results')} /></> : <><NavButton active={panelView === 'overview'} icon="⌂" label="Inicio" onClick={() => show('overview')} /><NavButton active={panelView === 'content'} icon="✎" label="Contenido" onClick={() => show('content')} /><NavButton active={panelView === 'proposals'} icon="◌" label="Propuestas" badge={pending.length} onClick={() => show('proposals')} /><NavButton active={panelView === 'rooms'} icon="⌘" label="Salas" onClick={() => show('rooms')} /><NavButton active={panelView === 'results'} icon="↗" label="Resultados" onClick={() => show('results')} /></>}</nav><div className="sidebar-footer"><div className="help-card"><span>?</span><p><b>¿Necesitas ayuda?</b><br />Explora la guía rápida de EvaluEdu.</p></div><small>EvaluEdu MVP · v0.1</small></div></aside>}
      <main className="main-content">{role !== 'student' && <div className="panel-toolbar"><button className="mobile-nav-toggle" type="button" aria-label="Abrir navegación" aria-expanded={mobileNavOpen} onClick={() => setMobileNavOpen((current) => !current)}>{mobileNavOpen ? '×' : '☰'} <span>Navegación</span></button><details className="panel-window-menu"><summary>↗ Abrir panel</summary><div>{canAccessPanel(authProfile, 'teacher') && <a href={panelUrl('teacher')} target="_blank" rel="noopener noreferrer">Docente</a>}<a href={panelUrl('student')} target="_blank" rel="noopener noreferrer">Estudiante</a>{canAccessPanel(authProfile, 'admin') && <a href={panelUrl('admin')} target="_blank" rel="noopener noreferrer">Administración</a>}</div></details></div>}{role === 'student' && panelView !== 'play' ? studentFinished ? <StudentCompletion room={studentRoom} onLeave={leaveStudentSession} /> : <StudentView room={studentRoom} roomCode={roomCode} setRoomCode={setRoomCode} studentName={studentName} setStudentName={setStudentName} onStart={joinRoom} onRefresh={refreshStudentRoom} onLeave={leaveStudentSession} /> : role === 'admin' && panelView === 'overview' ? <AdminDashboard activities={activities} rooms={rooms} templates={templates} attempts={displayedAttempts} adminData={adminSnapshot} onNavigate={show} /> : role === 'admin' && panelView === 'adminUsers' ? <AdminUsersView attempts={displayedAttempts} profile={authProfile} adminData={adminSnapshot} onRefresh={() => loadAdminSnapshot(false)} onHome={() => show('overview')} /> : role === 'admin' && panelView === 'adminAudit' ? <AdminAuditView attempts={displayedAttempts} rooms={rooms} adminData={adminSnapshot} onHome={() => show('overview')} /> : role === 'admin' && panelView === 'rooms' ? <AdminRoomsView rooms={rooms} activities={activities} adminData={adminSnapshot} onHome={() => show('overview')} /> : panelView === 'overview' ? <Overview activities={published} rooms={rooms} pending={pending} onNavigate={show} onSelect={setSelectedActivity} firstName={firstName} todayLabel={todayLabel} /> : panelView === 'content' ? <ContentView templates={templates} activities={activities} onCreateTemplate={createTemplate} onCreate={createActivity} onImport={importContent} onSelect={setSelectedActivity} onHome={() => show('overview')} /> : panelView === 'proposals' ? <ProposalsView activities={pending} hasDraft={hasTemplateDraft} onReview={reviewActivity} onContinueDraft={() => show('content')} onHome={() => show('overview')} /> : panelView === 'rooms' ? <RoomsView rooms={rooms} activities={activities} onCreate={createRoom} onTransition={transitionRoom} onDuplicate={duplicateRoom} onShare={shareRoomCode} onDelete={(room) => void deleteRoom(room)} onHome={() => show('overview')} /> : panelView === 'results' ? <ResultsView attempts={displayedAttempts} rooms={resultRooms} onExport={exportCsv} onHome={() => show('overview')} /> : studentFinished ? <StudentCompletion room={studentRoom} onLeave={leaveStudentSession} /> : <PlayView activity={playActivity} index={playIndex} totalCount={studentActivities.length || 6} allowBack={studentRoom?.allowBack ?? true} timeLimit={studentRoom?.time ?? null} startedAt={studentRoom?.startedAt} savedResponse={studentResponses[playIndex]} submitted={submitted} onSubmit={submitAnswer} onSkip={skipStudentQuestion} onPrevious={previousStudentQuestion} onTimeExpired={() => finishStudentAttempt('timeout')} onNext={nextStudentQuestion} />}</main>
    </div>{toast && <div className="toast" role="status">✓ {toast}</div>}
    {showPasswordChange && authSession && <ChangePasswordModal onClose={() => setShowPasswordChange(false)} onSaved={() => { setShowPasswordChange(false); notify('Contraseña actualizada correctamente.') }} />}
    {selectedActivity && role !== 'student' && <ActivityPreview activity={selectedActivity} onClose={() => setSelectedActivity(null)} onDelete={role === 'teacher' ? () => void deleteActivity(selectedActivity) : undefined} />}
  </div>
}

function RoleLanding({ onChoose }: { onChoose: (role: Role) => void }) { return <div className="role-landing"><div className="landing-brand"><span className="brand-mark">E</span><div><strong>EvaluEdu</strong><small>aprendizaje activo</small></div></div><div className="landing-copy"><p className="eyebrow">EVALUACIÓN EDUCATIVA</p><h1>¿Cómo quieres entrar?</h1><p>Elige tu espacio para continuar. Cada rol tiene una experiencia diseñada para sus necesidades.</p></div><div className="role-cards"><RoleCard icon="✦" title="Docente" description="Crea contenido, prepara actividades y acompaña a tu grupo." onClick={() => onChoose('teacher')} tone="teacher" /><RoleCard icon="→" title="Estudiante" description="Ingresa a una sala con el código de tu docente." onClick={() => onChoose('student')} tone="student" /><RoleCard icon="⚙" title="Administrador" description="Gestiona docentes, permisos y configuración general." onClick={() => onChoose('admin')} tone="admin" /></div><small className="landing-note">EvaluEdu · v1.0</small></div> }
function RoleCard({ icon, title, description, onClick, tone }: { icon: string; title: string; description: string; onClick: () => void; tone: string }) { return <button className={`role-card ${tone}`} onClick={onClick}><span className="role-card-icon">{icon}</span><span className="role-card-copy"><b>{title}</b><small>{description}</small></span><span className="role-card-arrow">→</span></button> }

function AuthLoading() { return <div className="auth-shell"><div className="auth-card"><span className="brand-mark">E</span><p className="eyebrow">EVALUDEU</p><h1>Verificando tu sesión</h1><p>Estamos comprobando tu acceso seguro.</p><div className="auth-loader" /></div></div> }

function ChangePasswordModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!supabase) return setError('Supabase no está configurado.')
    if (password.length < 6) return setError('La contraseña debe tener al menos 6 caracteres.')
    if (password !== confirmation) return setError('Las contraseñas no coinciden.')
    setSaving(true)
    setError('')
    const { error: updateError } = await supabase.auth.updateUser({ password, data: { password_initialized: true } })
    setSaving(false)
    if (updateError) return setError(updateError.message)
    onSaved()
  }
  return <div className="modal-backdrop"><form className="modal-card admin-invite-modal auth-form" onSubmit={submit}><div className="modal-head"><div><p className="eyebrow">SEGURIDAD DE LA CUENTA</p><h2>Cambiar contraseña</h2><p className="modal-subtitle">Usa una contraseña personal de al menos seis caracteres.</p></div><button type="button" className="icon-button" onClick={onClose}>×</button></div><label>Nueva contraseña<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" required /></label><label>Repetir contraseña<input type="password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} autoComplete="new-password" required /></label>{error && <div className="auth-message error">{error}</div>}<div className="modal-actions"><button type="button" className="outline-button" onClick={onClose}>Cancelar</button><button type="submit" className="primary-button" disabled={saving}>{saving ? 'Guardando…' : 'Guardar contraseña'}</button></div></form></div>
}

function InviteAcceptanceScreen({ email, onComplete, onCancel }: { email: string; onComplete: () => void; onCancel: () => void }) {
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!supabase) return
    if (password.length < 6) return setError('La contraseña debe tener al menos 6 caracteres.')
    if (password !== confirmation) return setError('Las contraseñas no coinciden.')
    setSaving(true)
    setError('')
    const { error: updateError } = await supabase.auth.updateUser({ password, data: { password_initialized: true } })
    setSaving(false)
    if (updateError) return setError(updateError.message)
    onComplete()
  }
  return <div className="auth-shell"><div className="auth-card"><button className="auth-back" onClick={onCancel}>← Cancelar</button><span className="brand-mark">E</span><p className="eyebrow">INVITACIÓN ACEPTADA</p><h1>Activa tu acceso docente</h1><p>La invitación para <b>{email}</b> es válida. Define una contraseña para ingresar a tu panel.</p><form onSubmit={submit} className="auth-form"><label>Nueva contraseña<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} minLength={6} autoComplete="new-password" required /></label><label>Repite la contraseña<input type="password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} minLength={6} autoComplete="new-password" required /></label>{error && <div className="auth-message error">{error}</div>}<button className="primary-button wide" type="submit" disabled={saving}>{saving ? 'Activando…' : 'Activar acceso docente →'}</button></form><small className="auth-footnote">Después de activarlo podrás entrar con tu correo y esta contraseña desde el panel docente.</small></div></div>
}

function PasswordRecoveryScreen({ email, onComplete, onCancel }: { email: string; onComplete: () => void; onCancel: () => void }) {
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!supabase) return setError('Supabase no está configurado.')
    if (password.length < 6) return setError('La contraseña debe tener al menos 6 caracteres.')
    if (password !== confirmation) return setError('Las contraseñas no coinciden.')
    setSaving(true)
    setError('')
    const { error: updateError } = await supabase.auth.updateUser({ password, data: { password_initialized: true } })
    setSaving(false)
    if (updateError) return setError(updateError.message)
    onComplete()
  }
  return <div className="auth-shell"><div className="auth-card"><button className="auth-back" onClick={onCancel}>← Cancelar</button><span className="brand-mark">E</span><p className="eyebrow">RECUPERACIÓN DE ACCESO</p><h1>Crea tu contraseña</h1><p>El enlace es válido para <b>{email}</b>. Define una contraseña nueva para continuar.</p><form onSubmit={submit} className="auth-form"><label>Nueva contraseña<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} minLength={6} autoComplete="new-password" required /></label><label>Repite la contraseña<input type="password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} minLength={6} autoComplete="new-password" required /></label>{error && <div className="auth-message error">{error}</div>}<button className="primary-button wide" type="submit" disabled={saving}>{saving ? 'Guardando…' : 'Guardar contraseña →'}</button></form><small className="auth-footnote">Después podrás entrar con tu correo y la contraseña que acabas de crear.</small></div></div>
}

function PasswordRecoveryUnavailableScreen({ onBack }: { onBack: () => void }) {
  return <div className="auth-shell"><div className="auth-card"><button className="auth-back" onClick={onBack}>← Volver al acceso</button><span className="brand-mark">E</span><p className="eyebrow">RECUPERACIÓN NO DISPONIBLE</p><h1>El enlace ya no es válido</h1><p>El enlace de recuperación expiró o ya fue utilizado. Regresa al acceso y solicita otro enlace con tu correo.</p><div className="auth-message error">Si eres docente, usa “No pude crear mi contraseña” en el formulario de ingreso.</div></div></div>
}

function InviteLinkErrorScreen({ onBack }: { onBack: () => void }) { return <div className="auth-shell"><div className="auth-card"><button className="auth-back" onClick={onBack}>← Volver al inicio</button><span className="brand-mark">E</span><p className="eyebrow">INVITACIÓN NO DISPONIBLE</p><h1>El enlace ya no es válido</h1><p>La invitación pudo haber expirado, haber sido abierta anteriormente o haber sido revisada por el sistema de seguridad del correo.</p><div className="auth-message error">Solicita al administrador que envíe una nueva invitación y ábrela una sola vez desde el mismo navegador.</div><small className="auth-footnote">Para una prueba desde el celular, abre el nuevo enlace con la URL de red local de EvaluEdu.</small></div></div> }

function AuthScreen({ role, onBack }: { role: Role; onBack: () => void }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [recoverySent, setRecoverySent] = useState(false)
  const [recoverySending, setRecoverySending] = useState(false)
  const roleLabel = role === 'admin' ? 'administrador' : 'docente'
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!supabase) return
    setError('')
    setRecoverySent(false)
    const result = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    if (result.error) return setError(result.error.message)
  }
  const requestRecovery = async () => {
    const cleanEmail = email.trim().toLowerCase()
    if (!cleanEmail || !/^\S+@\S+\.\S+$/.test(cleanEmail)) return setError('Escribe primero un correo electrónico válido.')
    if (!supabase) return setError('Supabase no está configurado.')
    setRecoverySending(true)
    setError('')
    setRecoverySent(false)
    const { error: recoveryError } = await supabase.auth.resetPasswordForEmail(cleanEmail, { redirectTo: authRedirectUrl(role) })
    setRecoverySending(false)
    if (recoveryError) return setError(recoveryError.message)
    setRecoverySent(true)
  }
  return <div className="auth-shell"><div className="auth-card"><button className="auth-back" onClick={onBack}>← Cambiar rol</button><span className="brand-mark">E</span><p className="eyebrow">ACCESO VERIFICADO</p><h1>Ingresa a tu panel</h1><p>Cuenta de {roleLabel}. El acceso requiere una cuenta creada o invitada por administración.</p><form onSubmit={submit} className="auth-form"><label>Correo electrónico<input type="email" value={email} onChange={(event) => { setEmail(event.target.value); setRecoverySent(false) }} placeholder="tu@institucion.edu" required /></label><label>Contraseña<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Tu contraseña" minLength={6} required /></label>{error && <div className="auth-message error">{error}</div>}<button className="primary-button wide" type="submit">Verificar e ingresar →</button></form><button className="recovery-link" type="button" onClick={() => void requestRecovery()} disabled={recoverySending}>{recoverySending ? 'Enviando enlace…' : 'No pude crear mi contraseña / Recuperar acceso'}</button>{recoverySent && <div className="auth-message success">Si el correo está registrado, recibirás un enlace para crear o restablecer tu contraseña. Revisa también la carpeta de spam.</div>}<div className="auth-message success">¿Aún no tienes acceso? Un administrador debe invitar tu correo desde <b>Usuarios → Agregar usuario</b>.</div><small className="auth-footnote">La sesión se conserva de forma segura en este navegador. Nunca se usa la clave service_role.</small></div></div>
}

function ProfileSetupScreen({ user, onBack, onCreated }: { user: Session['user']; onBack: () => void; onCreated: (profile: Profile) => void }) {
  const [displayName, setDisplayName] = useState(user.user_metadata?.display_name ?? '')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setSaving(true); setError('')
    const result = await createTeacherProfile(user, displayName)
    setSaving(false)
    if (result.error || !result.profile) return setError(result.error ?? 'No pudimos crear tu perfil.')
    onCreated(result.profile)
  }
  return <div className="auth-shell"><div className="auth-card"><button className="auth-back" onClick={onBack}>← Cerrar sesión</button><span className="brand-mark">E</span><p className="eyebrow">PRIMER INGRESO</p><h1>Completa tu perfil docente</h1><p>Usaremos este nombre en tus plantillas, salas y resultados privados.</p><form onSubmit={submit} className="auth-form"><label>Nombre visible<input value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="Ej. Lucía Martínez" minLength={2} required /></label><label>Correo verificado<input value={user.email ?? ''} disabled /></label>{error && <div className="auth-message error">{error}</div>}<button className="primary-button wide" type="submit" disabled={saving}>{saving ? 'Guardando…' : 'Guardar perfil →'}</button></form><small className="auth-footnote">Tu rol se asigna en la base de datos. No puedes convertirte en administrador desde esta pantalla.</small></div></div>
}

function ProfileUnavailableScreen({ email, onBack }: { email: string; onBack: () => void }) { return <div className="auth-shell"><div className="auth-card"><button className="auth-back" onClick={onBack}>← Cerrar sesión</button><span className="brand-mark">E</span><p className="eyebrow">ACCESO RESTRINGIDO</p><h1>Cuenta pendiente de asignación</h1><p>La cuenta <b>{email}</b> está autenticada, pero todavía no tiene un perfil administrativo autorizado.</p><div className="auth-message error">Solicita a un administrador que cree tu perfil con el rol correspondiente.</div><small className="auth-footnote">El panel administrativo no se habilita únicamente por elegir el icono Admin.</small></div></div> }

function ProfileVerificationErrorScreen({ email, error, onBack }: { email: string; error: string; onBack: () => void }) { return <div className="auth-shell"><div className="auth-card"><button className="auth-back" onClick={onBack}>← Cerrar sesión</button><span className="brand-mark">E</span><p className="eyebrow">VERIFICACIÓN DETENIDA</p><h1>No pudimos verificar tu rol</h1><p>La sesión de <b>{email}</b> está activa, pero no pudimos leer su perfil autorizado.</p><div className="auth-message error">{error}</div><p className="auth-footnote">Por seguridad no se habilita ningún panel hasta confirmar el rol en Supabase. Revisa la conexión o solicita al administrador que verifique tu perfil.</p></div></div> }

function RoleMismatchScreen({ selectedRole, actualRole, onUseActualRole, onBack }: { selectedRole: Role; actualRole: 'admin' | 'teacher'; onUseActualRole: () => void; onBack: () => void }) {
  const selectedLabel = selectedRole === 'admin' ? 'administrador' : 'docente'
  const actualLabel = actualRole === 'admin' ? 'administrador' : 'docente'
  return <div className="auth-shell"><div className="auth-card"><button className="auth-back" onClick={onBack}>← Cerrar sesión</button><span className="brand-mark">E</span><p className="eyebrow">ROL VERIFICADO</p><h1>Este panel no corresponde a tu cuenta</h1><p>Elegiste <b>{selectedLabel}</b>, pero Supabase verificó que tu cuenta tiene rol de <b>{actualLabel}</b>.</p><div className="auth-message error">El icono de entrada no concede permisos. El rol persistido es el que determina el acceso.</div><button className="primary-button wide" onClick={onUseActualRole}>Entrar como {actualLabel} →</button></div></div>
}

function NavButton({ active, icon, label, badge, onClick }: { active: boolean; icon: string; label: string; badge?: number; onClick: () => void }) { return <button className={`nav-button ${active ? 'active' : ''}`} onClick={onClick}><span>{icon}</span>{label}{badge ? <em>{badge}</em> : null}</button> }

const demoAdminUsers = [
  { name: 'Lucía Martínez', email: 'lucia@evaluedu.demo', role: 'Docente', status: 'Activo', lastAccess: 'Hoy, 08:42' },
  { name: 'Marco Quispe', email: 'marco@evaluedu.demo', role: 'Docente', status: 'Activo', lastAccess: 'Ayer, 16:20' },
  { name: 'Ana Rivera', email: 'ana@evaluedu.demo', role: 'Administrador', status: 'Activo', lastAccess: 'Hoy, 09:10' },
]

function AdminDashboard({ activities, rooms, templates, attempts, adminData, onNavigate }: { activities: Activity[]; rooms: Room[]; templates: EvaluationTemplate[]; attempts: StudentAttempt[]; adminData: AdminSnapshot | null; onNavigate: (view: View) => void }) {
  const activeRooms = adminData ? adminData.rooms.filter((room) => ['waiting', 'active'].includes(room.status)).length : rooms.filter((room) => ['waiting', 'active'].includes(room.status)).length
  const published = adminData?.metrics.publishedActivities ?? activities.filter((activity) => activity.status === 'published').length
  const completion = attempts.length ? Math.round((attempts.filter((attempt) => attempt.status === 'completed').length / attempts.length) * 100) : 0
  const users = adminData?.users ?? []
  const sourceRooms = adminData?.rooms ?? rooms
  return <><PageIntro eyebrow="CONTROL DE LA PLATAFORMA" title="Resumen general" description="Supervisa usuarios, contenidos y evaluaciones desde la administración de EvaluEdu." action={<span className="tag published">{adminData ? 'Supabase conectado' : 'Cargando datos globales'}</span>} onHome={() => onNavigate('overview')} /><div className="admin-notice"><span>✓</span><div><b>{adminData ? 'Datos administrativos sincronizados.' : 'Cargando datos administrativos.'}</b><p>{adminData ? 'Usuarios, salas, auditoría e intentos se consultan desde Supabase con permisos de administrador.' : 'Mientras se consulta Supabase, se conserva la copia local como respaldo temporal.'}</p></div></div><div className="metric-grid admin-metrics"><Metric icon="♙" value={adminData?.metrics.users ?? users.length} label="Usuarios registrados" trend="Docentes y administración" tone="mint" /><Metric icon="⌘" value={activeRooms} label="Salas abiertas" trend={`${adminData?.metrics.rooms ?? sourceRooms.length} salas en total`} tone="lavender" /><Metric icon="◈" value={published} label="Actividades publicadas" trend={`${adminData?.metrics.templates ?? templates.length} plantillas guardadas`} tone="peach" /><Metric icon="✓" value={`${completion}%`} label="Intentos finalizados" trend={`${adminData?.metrics.attempts ?? attempts.length} registros`} tone="mint" /></div><div className="dashboard-grid admin-grid"><section className="panel"><div className="panel-heading"><div><h2>Usuarios y permisos</h2><p>{adminData ? 'Directorio real de Supabase.' : 'Directorio temporal de esta sesión.'}</p></div><button className="text-button" onClick={() => onNavigate('adminUsers')}>Ver usuarios →</button></div>{adminData ? users.slice(0, 4).map((user) => <div className="admin-user-row" key={user.id}><span className="admin-avatar">{user.displayName.split(' ').map((part) => part[0]).slice(0, 2).join('')}</span><div><b>{user.displayName}</b><small>{user.email}</small></div><span className="admin-role">{user.roles.map((item) => item === 'admin' ? 'Administrador' : 'Docente').join(' · ')}</span><span className="admin-status">{user.status}</span></div>) : demoAdminUsers.map((user) => <div className="admin-user-row" key={user.email}><span className="admin-avatar">{user.name.split(' ').map((part) => part[0]).slice(0, 2).join('')}</span><div><b>{user.name}</b><small>{user.email}</small></div><span className="admin-role">{user.role}</span><span className="admin-status">{user.status}</span></div>)}</section><section className="panel admin-health"><div className="panel-heading"><div><h2>Estado del sistema</h2><p>Indicadores de la instalación actual.</p></div></div><div className="health-line"><span className="health-dot local" /><div><b>Persistencia local</b><small>Respaldo temporal del navegador.</small></div><strong>Activa</strong></div><div className="health-line"><span className="health-dot ready" /><div><b>Supabase Auth</b><small>Sesiones y roles verificados.</small></div><strong>Activa</strong></div><div className="health-line"><span className="health-dot ready" /><div><b>RLS y Realtime</b><small>Permisos y estados de sala conectados.</small></div><strong>Activos</strong></div></section></div><section className="panel admin-quick-actions"><div><p className="eyebrow">ACCIONES DE CONTROL</p><h2>Revisión rápida</h2><p>Consulta las áreas sincronizadas con el backend.</p></div><div className="admin-action-grid"><button className="outline-button" onClick={() => onNavigate('rooms')}>⌘ Revisar salas</button><button className="outline-button" onClick={() => onNavigate('adminAudit')}>◌ Ver auditoría</button><button className="outline-button" onClick={() => onNavigate('results')}>↗ Revisar resultados</button></div></section></>
}

function AdminUsersView({ attempts, profile, adminData, onRefresh, onHome }: { attempts: StudentAttempt[]; profile: Profile | null; adminData: AdminSnapshot | null; onRefresh: () => void; onHome: () => void }) {
  const [showInvite, setShowInvite] = useState(false)
  const [email, setEmail] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [status, setStatus] = useState<{ kind: 'success' | 'error'; message: string } | null>(null)
  const [saving, setSaving] = useState(false)
  const [removingId, setRemovingId] = useState<string | null>(null)
  const [resendingId, setResendingId] = useState<string | null>(null)
  const canManageUsers = !isSupabaseConfigured || canAccessPanel(profile, 'admin')

  const inviteTeacher = async (event: FormEvent) => {
    event.preventDefault()
    if (!canManageUsers) {
      setStatus({ kind: 'error', message: 'Tu perfil no tiene permisos de administrador para invitar usuarios.' })
      return
    }
    if (!supabase) {
      setStatus({ kind: 'error', message: 'Supabase no está configurado en este entorno.' })
      return
    }
    setSaving(true)
    setStatus(null)
    const { data: refreshedSession, error: refreshError } = await supabase.auth.refreshSession()
    if (refreshError || !refreshedSession.session) {
      setSaving(false)
      setStatus({ kind: 'error', message: 'Tu sesión expiró. Cierra sesión y vuelve a ingresar para continuar.' })
      return
    }
    const { data, error } = await supabase.functions.invoke('admin-invite-teacher', {
      body: { email: email.trim(), displayName: displayName.trim(), redirectTo: authRedirectUrl('teacher', 'invite') },
    })
    setSaving(false)
    if (error || !data?.ok) {
      setStatus({ kind: 'error', message: await functionErrorMessage(error, data, 'No se pudo enviar la invitación.') })
      return
    }
    setShowInvite(false)
    setEmail('')
    setDisplayName('')
    onRefresh()
    setStatus({ kind: 'success', message: `Invitación enviada a ${data.email}. El docente deberá completar su acceso desde el enlace recibido.` })
  }

  const removeUser = async (user: AdminUser) => {
    if (!supabase || !canManageUsers || user.roles.includes('admin')) return
    if (!window.confirm(`¿Desactivar a ${user.displayName}? Se bloqueará su acceso, pero sus datos y resultados se conservarán.`)) return
    setRemovingId(user.id)
    setStatus(null)
    const { data, error } = await supabase.functions.invoke('admin-remove-user', { body: { userId: user.id } })
    setRemovingId(null)
    if (error || !data?.ok) { setStatus({ kind: 'error', message: await functionErrorMessage(error, data, 'No se pudo desactivar al usuario.') }); return }
    setStatus({ kind: 'success', message: `${user.displayName} fue desactivado. Sus datos y resultados se conservaron.` })
    onRefresh()
  }

  const resendAccess = async (user: AdminUser) => {
    if (!supabase || !canManageUsers || user.roles.includes('admin') || user.status === 'Bloqueado') return
    if (!window.confirm(`¿Enviar un enlace para que ${user.displayName} cree o restablezca su contraseña?`)) return
    setResendingId(user.id)
    setStatus(null)
    const { data, error } = await supabase.functions.invoke('admin-resend-access', {
      body: { email: user.email, redirectTo: authRedirectUrl('teacher') },
    })
    setResendingId(null)
    if (error || !data?.ok) {
      setStatus({ kind: 'error', message: await functionErrorMessage(error, data, 'No se pudo enviar el enlace de recuperación.') })
      return
    }
    setStatus({ kind: 'success', message: `Se envió un enlace de recuperación a ${user.email}.` })
  }

  const users = adminData?.users ?? []
  return <>
    <PageIntro eyebrow="ADMINISTRACIÓN" title="Usuarios y permisos" description="Invita docentes autorizados y conserva la separación entre administración y enseñanza." action={canManageUsers ? <button className="primary-button" onClick={() => { setStatus(null); setShowInvite(true) }}>＋ Agregar usuario</button> : <span className="demo-admin-tag">Acceso de solo lectura</span>} onHome={onHome} />
    <div className="admin-notice"><span>✓</span><div><b>Alta segura de docentes.</b><p>La invitación se valida en una función protegida. No se generan ni se envían contraseñas permanentes; cada persona establece su acceso desde el enlace de Supabase.</p></div></div>
    {status && <div className={`auth-message ${status.kind}`}>{status.message}</div>}
    <section className="panel"><div className="panel-heading"><div><h2>Directorio de la plataforma</h2><p>{adminData ? `${users.length} usuarios registrados · ${attempts.length} intentos sincronizados` : 'Cargando usuarios desde Supabase…'}</p></div><span className="tag published">{adminData ? 'Supabase' : 'Respaldo local'}</span></div><div className="results-table-wrap"><table><thead><tr><th>Persona</th><th>Rol</th><th>Estado</th><th>Último acceso</th><th>Acceso previsto</th><th>Acción</th></tr></thead><tbody>{users.length ? users.map((user) => <tr key={user.id}><td><b>{user.displayName}</b><small>{user.email}</small></td><td>{user.roles.map((item) => item === 'admin' ? 'Administrador' : 'Docente').join(' · ')}</td><td><span className="result-status">{user.status}</span></td><td>{user.lastSignInAt ? formatDate(user.lastSignInAt) : 'Aún no'}</td><td>{user.roles.includes('admin') ? 'Global' : 'Su institución'}</td><td>{user.roles.includes('admin') ? <span className="muted">Protegido</span> : user.status === 'Bloqueado' ? <span className="muted">Desactivado</span> : <div className="table-actions"><button className="text-button" disabled={resendingId === user.id} onClick={() => void resendAccess(user)}>{resendingId === user.id ? 'Enviando…' : user.status === 'Pendiente' ? 'Reenviar acceso' : 'Restablecer acceso'}</button><button className="text-button danger-text-button" disabled={removingId === user.id} onClick={() => void removeUser(user)}>{removingId === user.id ? 'Desactivando…' : 'Desactivar usuario'}</button></div>}</td></tr>) : <tr><td colSpan={6}>Aún no hay perfiles administrativos para mostrar.</td></tr>}</tbody></table></div></section>
    <section className="panel admin-permission-grid"><div><p className="eyebrow">MODELO DE PERMISOS</p><h2>Separación de responsabilidades</h2></div><div className="permission-card"><b>Administrador</b><span>Usuarios, instituciones, auditoría y configuración global.</span></div><div className="permission-card"><b>Docente</b><span>Sus plantillas, salas, actividades y resultados privados.</span></div><div className="permission-card"><b>Estudiante</b><span>Solo las salas autorizadas y su participación actual.</span></div></section>
    {showInvite && <div className="modal-backdrop"><div className="modal-card admin-invite-modal"><div className="modal-head"><div><p className="eyebrow">NUEVO ACCESO</p><h2>Invitar docente</h2><p className="modal-subtitle">El correo recibirá un enlace para crear su acceso seguro.</p></div><button type="button" className="icon-button" onClick={() => setShowInvite(false)}>×</button></div><form className="auth-form" onSubmit={inviteTeacher}><label>Nombre visible<input value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="Ej. Lucía Martínez" minLength={2} required /></label><label>Correo del docente<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="docente@institucion.edu" required /></label><div className="auth-message success">El rol se asignará como docente. Los administradores no se crean desde esta pantalla.</div><div className="modal-actions"><button type="button" className="outline-button" onClick={() => setShowInvite(false)}>Cancelar</button><button type="submit" className="primary-button" disabled={saving}>{saving ? 'Enviando…' : 'Enviar invitación →'}</button></div></form></div></div>}
  </>
}

function AdminAuditView({ attempts, rooms, adminData, onHome }: { attempts: StudentAttempt[]; rooms: Room[]; adminData: AdminSnapshot | null; onHome: () => void }) { const events = adminData ? adminData.auditEvents.map((event) => ({ type: event.eventType, subject: event.actorName, room: event.roomName, at: event.createdAt, detail: '' })) : attempts.flatMap((attempt) => attempt.events.map((event) => ({ ...event, subject: attempt.studentName, room: attempt.roomName }))).sort((left, right) => right.at.localeCompare(left.at)); return <><PageIntro eyebrow="ADMINISTRACIÓN" title="Auditoría de actividad" description="Registro de eventos relevantes para revisar trazabilidad y seguridad." action={<span className="tag published">{adminData ? 'Solo lectura · Servidor' : 'Cargando auditoría'}</span>} onHome={onHome} /><div className="admin-notice"><span>{adminData ? '✓' : '!'}</span><div><b>{adminData ? 'Auditoría sincronizada con Supabase.' : 'Cargando auditoría del servidor.'}</b><p>{adminData ? 'Los eventos se leen desde el registro protegido de la plataforma.' : 'Mientras carga, se conserva la trazabilidad local como respaldo temporal.'}</p></div></div><section className="panel"><div className="panel-heading"><div><h2>Eventos recientes</h2><p>{events.length} eventos registrados · {adminData?.metrics.rooms ?? rooms.length} salas visibles</p></div></div>{events.length ? <div className="audit-list">{events.slice(0, 20).map((event, index) => <div className="audit-row" key={`${event.at}-${index}`}><span className="audit-icon">{event.type === 'finished' ? '✓' : event.type === 'timeout' ? '◷' : event.type === 'omitted' ? '→' : '•'}</span><div><b>{auditEventLabel(event.type)}</b><small>{event.subject} · {event.room}{event.detail ? ` · ${event.detail}` : ''}</small></div><time>{formatDate(event.at)}</time></div>)}</div> : <div className="results-empty"><span>◌</span><h3>Aún no hay eventos</h3><p>Los eventos aparecerán cuando un estudiante ingrese y responda una evaluación.</p></div>}</section></> }

function AdminRoomsView({ rooms, activities, adminData, onHome }: { rooms: Room[]; activities: Activity[]; adminData: AdminSnapshot | null; onHome: () => void }) { const globalRooms = adminData?.rooms ?? []; return <><PageIntro eyebrow="ADMINISTRACIÓN" title="Salas globales" description="Supervisa el ciclo de las evaluaciones sin modificar la configuración del docente." action={<span className="tag published">{adminData ? 'Solo lectura · Supabase' : 'Cargando salas'}</span>} onHome={onHome} /><div className="admin-notice"><span>{adminData ? '✓' : '!'}</span><div><b>{adminData ? 'Vista global sincronizada.' : 'Cargando salas globales.'}</b><p>{adminData ? 'La administración puede supervisar las salas de todos los docentes sin modificar su configuración.' : 'La copia local se mantiene disponible mientras se consulta el servidor.'}</p></div></div><section className="panel"><div className="panel-heading"><div><h2>{adminData ? globalRooms.length : rooms.length} salas visibles</h2><p>Las salas archivadas conservan su trazabilidad y resultados.</p></div></div><div className="results-table-wrap"><table><thead><tr><th>Sala</th><th>Docente</th><th>Código</th><th>Estado</th><th>Preguntas</th><th>Estudiantes</th><th>Actividades</th></tr></thead><tbody>{adminData ? globalRooms.map((room) => <tr key={room.id}><td><b>{room.name}</b><small>{formatDate(room.createdAt)}</small></td><td>{room.ownerName}</td><td>{room.code}</td><td><span className={`result-status ${room.status === 'active' ? '' : 'timeout'}`}>{roomStatusLabel(room.status)}</span></td><td>{room.questionCount}</td><td>Máx. {room.limit}</td><td>{room.activities.map((activity) => activity.title).join(' · ') || 'Sin actividades'}</td></tr>) : rooms.map((room) => <tr key={room.id}><td><b>{room.name}</b><small>{room.instructions}</small></td><td>Docente local</td><td>{room.code}</td><td><span className={`result-status ${room.status === 'active' ? '' : 'timeout'}`}>{roomStatusLabel(room.status)}</span></td><td>{room.questionCount}</td><td>Máx. {room.limit}</td><td>{room.activities.map((id) => activities.find((activity) => activity.id === id)?.title ?? 'Actividad').join(' · ')}</td></tr>)}</tbody></table></div></section></> }

function Overview({ activities, rooms, pending, onNavigate, onSelect, firstName, todayLabel }: { activities: Activity[]; rooms: Room[]; pending: Activity[]; onNavigate: (view: View) => void; onSelect: (activity: Activity) => void; firstName: string; todayLabel: string }) { return <><PageIntro eyebrow={todayLabel.toUpperCase()} title={`Buenos días, ${firstName}`} description="Un vistazo claro para preparar experiencias que hagan pensar." action={<button className="primary-button" onClick={() => onNavigate('content')}>＋ Crear actividad</button>} onHome={() => onNavigate('overview')} /><section className="metric-grid"><Metric icon="◈" value={activities.filter((item) => item.status === 'published').length} label="Actividades publicadas" trend="Disponibles para reutilizar" tone="mint" /><Metric icon="⌘" value={rooms.filter((item) => !['finished', 'archived'].includes(item.status)).length} label="Salas activas" trend="Preparadas o en curso" tone="lavender" /><Metric icon="◌" value={pending.length} label="Por revisar" trend="Requieren tu atención" tone="peach" /></section><div className="dashboard-grid"><section className="panel activity-panel"><div className="panel-heading"><div><h2>Actividad reciente</h2><p>Lo que está pasando en tus clases.</p></div><button className="text-button" onClick={() => onNavigate('results')}>Ver resultados →</button></div>{rooms.slice(0, 2).map((room) => <div className="activity-row" key={room.id}><span className="row-icon room">⌘</span><div><b>{room.name}</b><small>{roomStatusLabel(room.status)} · código {room.code}</small></div><strong>{room.activities.length} activ.</strong></div>)}<div className="activity-row"><span className="row-icon check">✓</span><div><b>Contenido listo para usar</b><small>{activities.length} actividades en tu biblioteca</small></div><strong>Biblioteca</strong></div></section><section className="panel tip-panel"><span className="tip-spark">✦</span><p className="eyebrow">SUGERENCIA DE HOY</p><h2>Combina formatos</h2><p>Una sala con decisión, clasificación y reflexión ayuda a observar distintos tipos de razonamiento.</p><button className="outline-button" onClick={() => onNavigate('rooms')}>Crear una sala →</button></section></div><section className="section-block"><div className="section-heading"><div><p className="eyebrow">TU BIBLIOTECA</p><h2>Actividades destacadas</h2></div><button className="text-button" onClick={() => onNavigate('content')}>Ver todas →</button></div>{activities.length ? <div className="activity-cards">{activities.slice(0, 3).map((activity) => <ActivityCard key={activity.id} activity={activity} onOpen={() => onSelect(activity)} />)}</div> : <div className="empty-state"><span>◈</span><h2>Crea tu primera actividad</h2><p>Empieza con una plantilla para generar actividades que puedas reutilizar en tus salas.</p><button className="primary-button" onClick={() => onNavigate('content')}>Ir a Contenido</button></div>}</section></> }

function Metric({ icon, value, label, trend, tone }: { icon: string; value: number | string; label: string; trend: string; tone: string }) { return <div className={`metric-card ${tone}`}><span className="metric-icon">{icon}</span><strong>{value}</strong><b>{label}</b><small>{trend}</small></div> }
function PageIntro({ eyebrow, title, description, action, onHome }: { eyebrow: string; title: string; description: string; action?: React.ReactNode; onHome?: () => void }) { const homeProps = onHome ? { className: 'page-intro-copy page-intro-home-link', role: 'button' as const, tabIndex: 0, title: 'Volver al inicio', onClick: onHome, onKeyDown: (event: React.KeyboardEvent<HTMLDivElement>) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onHome() } } } : { className: 'page-intro-copy' }; return <div className="page-intro"><div {...homeProps}><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p>{description}</p></div>{action}</div> }
function ActivityCard({ activity, onOpen }: { activity: Activity; onOpen?: () => void }) { return <button type="button" className="activity-card" onClick={onOpen}><div className={`activity-type type-${activity.type}`}><span>{types[activity.type].icon}</span><small>{types[activity.type].label}</small></div><h3>{activity.title}</h3><p>{activity.topic} · {activity.difficulty}</p><div className="card-footer"><span className={`status-dot ${activity.status}`} />{activity.status === 'published' ? 'Publicada' : activity.status === 'pending' ? 'Por revisar' : 'Borrador'}<span className="card-arrow">↗</span></div></button> }

function ActivityPreview({ activity, onClose, onDelete }: { activity: Activity; onClose: () => void; onDelete?: () => void }) { const reusable = activity.status === 'published'; return <div className="modal-backdrop"><div className="modal-card"><div className="modal-head"><div><p className="eyebrow">VISTA DE ACTIVIDAD</p><h2>{activity.title}</h2><p className="modal-subtitle">{types[activity.type].label} · {activity.topic} · {activity.difficulty}</p></div><button type="button" className="icon-button" onClick={onClose}>×</button></div><div className="admin-notice"><span>{reusable ? '✓' : '!'}</span><div><b>{reusable ? 'Lista para reutilizar' : 'Pendiente de publicación'}</b><p>{reusable ? 'Esta actividad puede seleccionarse nuevamente al crear una sala.' : 'Aprueba esta actividad desde Propuestas para incluirla en una nueva sala.'}</p></div></div><p>{activity.prompt}</p>{activity.options?.length ? <div className="activity-check-list">{activity.options.map((option, index) => <div className="activity-check" key={`${activity.id}-option-${index}`}><span className="list-type">{index + 1}</span><span><b>{option}</b></span></div>)}</div> : null}<div className="modal-actions">{onDelete && <button type="button" className="outline-button danger-button" onClick={onDelete}>Eliminar actividad</button>}<button type="button" className="primary-button" onClick={onClose}>Cerrar</button></div></div></div> }

function ContentView({ templates, activities, onCreateTemplate, onCreate, onImport, onSelect, onHome }: { templates: EvaluationTemplate[]; activities: Activity[]; onCreateTemplate: (template: EvaluationTemplate) => void; onCreate: (activity: Activity) => void; onImport: (document: ContentImportDocument) => void; onSelect: (activity: Activity) => void; onHome: () => void }) {
  const [tab, setTab] = useState<'all' | ActivityType>('all')
  const [activityDraft, setActivityDraft] = useState<{ type: ActivityType; template: EvaluationTemplate } | null>(null)
  const [requestedType, setRequestedType] = useState<ActivityType | null>(null)
  const [showActivityPicker, setShowActivityPicker] = useState(false)
  const [showTemplateForm, setShowTemplateForm] = useState(false)
  const [showJsonImport, setShowJsonImport] = useState(false)
  const filtered = tab === 'all' ? activities : activities.filter((item) => item.type === tab)
  const hasSavedDraft = Boolean(readStorage<Partial<EvaluationTemplate> | null>('edueval-template-draft', null)?.title || readStorage<Partial<EvaluationTemplate> | null>('edueval-template-draft', null)?.subject)
  return <>
    <PageIntro eyebrow="BIBLIOTECA DE CONTENIDO" title="Crea experiencias que importan" description="Aprueba una plantilla y EvaluEdu generará las actividades compatibles para evaluar ese contenido." action={<div className="content-actions"><button className="outline-button" onClick={() => setShowJsonImport(true)}>⇧ Importar JSON</button><button className="outline-button" onClick={() => setShowTemplateForm(true)}>＋ Nueva plantilla</button><button className="primary-button" onClick={() => { setRequestedType(null); setShowActivityPicker(true) }}>＋ Nueva actividad</button></div>} onHome={onHome} />
    <section className="template-section"><div className="section-heading"><div><p className="eyebrow">MODELO PEDAGÓGICO</p><h2>Plantillas de contenido</h2></div><span className="muted">La fuente de tus actividades</span></div>{hasSavedDraft && <div className="admin-notice"><span>✎</span><div><b>Tienes un borrador pendiente.</b><p>Continúa la plantilla guardada automáticamente para terminarla y aceptarla.</p></div><button className="outline-button" onClick={() => setShowTemplateForm(true)}>Continuar borrador</button></div>}{templates.length ? <div className="template-list">{templates.map((template) => <TemplateCard key={template.id} template={template} />)}</div> : <div className="template-empty"><span>◎</span><div><b>Aún no tienes una plantilla estructurada</b><p>Define objetivos, conceptos, situaciones y procesos para que EvaluEdu pueda habilitar los formatos adecuados.</p></div><button className="outline-button" onClick={() => setShowTemplateForm(true)}>Crear la primera</button></div>}</section>
    <div className="type-grid">{Object.entries(types).map(([key, value]) => <button key={key} className="type-tile" onClick={() => { setTab(key as ActivityType); setRequestedType(key as ActivityType); setShowActivityPicker(true) }}><span>{value.icon}</span><b>{value.label}</b><small>{value.description}</small></button>)}</div>
    <div className="library-toolbar"><div className="tabs"><button className={tab === 'all' ? 'active' : ''} onClick={() => setTab('all')}>Todas <span>{activities.length}</span></button>{Object.entries(types).slice(0, 3).map(([key, value]) => <button key={key} className={tab === key ? 'active' : ''} onClick={() => setTab(key as ActivityType)}>{value.label}</button>)}</div><span className="muted">Guardado local automático</span></div>
    {filtered.length ? <div className="activity-list">{filtered.map((activity) => <button className="activity-list-row" key={activity.id} onClick={() => onSelect(activity)}><span className={`list-type type-${activity.type}`}>{types[activity.type].icon}</span><span className="list-copy"><b>{activity.title}</b><small>{types[activity.type].label} · {activity.topic}</small></span><span className={`tag ${activity.status}`}>{activity.status === 'published' ? 'Publicada' : activity.status === 'pending' ? 'Por revisar' : 'Borrador'}</span><span className="chevron">›</span></button>)}</div> : <div className="empty-state"><span>◈</span><h2>Aún no tienes actividades</h2><p>Crea tu primera plantilla para generar actividades reutilizables en tus salas.</p><button className="primary-button" onClick={() => setShowTemplateForm(true)}>Crear mi primera plantilla</button></div>}
    {showTemplateForm && <TemplateBuilder onCancel={() => setShowTemplateForm(false)} onSave={(template) => { onCreateTemplate(template); setShowTemplateForm(false) }} />}
    {showJsonImport && <JsonImportModal onCancel={() => setShowJsonImport(false)} onImport={(document) => { onImport(document); setShowJsonImport(false) }} />}
    {showActivityPicker && <TemplateActivityPicker templates={templates} requestedType={requestedType} onCancel={() => setShowActivityPicker(false)} onSelect={(template, type) => { setShowActivityPicker(false); setActivityDraft({ template, type }) }} />}
    {activityDraft && <ActivityForm initialType={activityDraft.type} template={activityDraft.template} onCancel={() => setActivityDraft(null)} onSave={(activity) => { onCreate(activity); setActivityDraft(null) }} />}
  </>
}

function JsonImportModal({ onCancel, onImport }: { onCancel: () => void; onImport: (document: ContentImportDocument) => void }) {
  const [raw, setRaw] = useState('')
  const [fileName, setFileName] = useState('')
  const [copyStatus, setCopyStatus] = useState('Copiar prompt oficial')
  const [result, setResult] = useState<ReturnType<typeof parseContentImport> | null>(null)
  const validResult = result?.ok ? result : null
  const compatibleEntries = validResult ? Object.entries(validResult.compatibility).filter(([, item]) => item.available) : []
  const readFile = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    setFileName(file.name)
    if (file.size > 1_000_000) {
      setResult({ ok: false, issues: [{ path: '$', message: 'El archivo supera el límite de 1 MB.' }] })
      return
    }
    void file.text().then((text) => { setRaw(text); setResult(null) })
  }
  const copyPrompt = async () => {
    if (!navigator.clipboard) return setCopyStatus('Selecciona y copia el prompt manualmente')
    try {
      await navigator.clipboard.writeText(OFFICIAL_IMPORT_PROMPT)
      setCopyStatus('Prompt copiado')
    } catch {
      setCopyStatus('Selecciona y copia el prompt manualmente')
    }
  }
  return <div className="modal-backdrop"><div className="modal-card json-import-modal"><div className="modal-head"><div><p className="eyebrow">IMPORTACIÓN CONTROLADA</p><h2>Importar contenido JSON</h2><p className="modal-subtitle">EduEval no genera contenido con IA: valida el archivo, lo convierte en una plantilla interna y propone actividades para revisión docente.</p></div><button type="button" className="icon-button" onClick={onCancel}>×</button></div><div className="admin-notice"><span>i</span><div><b>Usa el prompt oficial con tu IA externa.</b><p>El prompt está bloqueado en modo solo lectura. EduEval no confía en el prompt: valida siempre el JSON recibido y rechaza cualquier campo o estructura no autorizada.</p></div></div><details className="import-prompt-help"><summary>Ver prompt oficial del docente · solo lectura</summary><textarea className="import-prompt-readonly" value={OFFICIAL_IMPORT_PROMPT} readOnly rows={22} aria-label="Prompt oficial de importación, solo lectura" /><button type="button" className="outline-button" onClick={() => void copyPrompt()}>{copyStatus}</button></details><label>Seleccionar archivo JSON<input type="file" accept="application/json,.json" onChange={readFile} /></label>{fileName && <small className="field-hint">Archivo seleccionado: {fileName}</small>}<label>Pegar JSON<textarea value={raw} onChange={(event) => { setRaw(event.target.value); setResult(null) }} rows={10} placeholder={'{\n  "schema": "edueval.content",\n  "version": 1,\n  "content": { ... }\n}'} /></label><div className="modal-actions import-actions"><button type="button" className="outline-button" onClick={() => setResult(parseContentImport(raw))} disabled={!raw.trim()}>Validar JSON</button></div>{result && !result.ok && <div className="form-error import-errors"><b>No se puede importar todavía.</b><ul>{result.issues.map((issue, index) => <li key={`${issue.path}-${index}`}><code>{issue.path}</code> · {issue.message}</li>)}</ul></div>}{validResult && <section className="import-validation"><div className="admin-notice success"><span>✓</span><div><b>JSON válido · esquema {validResult.document.version}</b><p>{validResult.document.content.title} · {compatibleEntries.length} formato{compatibleEntries.length === 1 ? '' : 's'} compatible{compatibleEntries.length === 1 ? '' : 's'} detectado{compatibleEntries.length === 1 ? '' : 's'}.</p></div></div><div className="compatibility-grid">{Object.entries(validResult.compatibility).map(([key, item]) => <div className={`compatibility-item ${item.available ? '' : 'unavailable'}`} key={key}><span>{item.available ? '✓' : '×'}</span><b>{types[key as ActivityType].label}</b><small>{item.available ? 'Se propondrá para revisión' : item.reason}</small></div>)}</div>{!compatibleEntries.length && <div className="form-error">El esquema es válido, pero falta información para detectar una actividad compatible. Completa conceptos, situaciones, pasos o categorías y vuelve a validar.</div>}</section>}<div className="modal-actions"><button type="button" className="outline-button" onClick={onCancel}>Cancelar</button><button type="button" className="primary-button" disabled={!validResult || !compatibleEntries.length} onClick={() => validResult && onImport(validResult.document)}>Aceptar e ir a propuestas →</button></div></div></div>
}

function compatibility(template: EvaluationTemplate): Record<ActivityType, { available: boolean; reason: string }> {
  return detectContentCompatibility(template)
}

function buildActivitiesFromTemplate(template: EvaluationTemplate): Activity[] {
  const matches = compatibility(template)
  const concepts = template.concepts.filter((item) => item.name.trim() && item.definition.trim())
  const situations = template.situations.filter((item) => item.title.trim() && item.context.trim() && item.decision.trim() && item.consequence.trim())
  const steps = template.processSteps.filter(Boolean)
  const categories = template.categories.filter(Boolean)
  const firstSituation = situations[0]
  const conceptOptions = concepts.map((item) => item.name)
  const definitions = concepts.map((item) => `${item.name} → ${item.definition}`)
  const generated = (type: ActivityType, title: string, prompt: string, options: string[], answer: string | string[], feedback: string): Activity => ({ id: `a${Date.now()}-${type}`, templateId: template.id, title, type, topic: template.subject, difficulty: template.difficulty, prompt, options, answer, feedback, status: 'published' })
  const activities: Activity[] = []
  if (matches.scenario.available && firstSituation) activities.push(generated('scenario', `${template.title} · Decisión`, firstSituation.context, [firstSituation.decision, 'Analizar otra alternativa antes de decidir', 'Ignorar las consecuencias'], firstSituation.decision, firstSituation.consequence))
  if (matches.trueFalse.available) activities.push(generated('trueFalse', `${template.title} · Comprueba`, concepts[0] ? `${concepts[0].name}: ${concepts[0].definition}` : firstSituation.context, ['Verdadero', 'Falso'], 'Verdadero', 'Relaciona tu respuesta con el objetivo y revisa la evidencia del contenido.'))
  if (matches.matching.available) activities.push(generated('matching', `${template.title} · Relaciona`, 'Relaciona cada concepto con su definición.', definitions, definitions, 'Las relaciones se construyen a partir de las definiciones de la plantilla.'))
  if (matches.sorting.available) activities.push(generated('sorting', `${template.title} · Clasifica`, 'Clasifica los elementos del contenido en las categorías definidas.', conceptOptions, categories, 'La clasificación permite observar cómo se organiza el contenido.'))
  if (matches.ordering.available) activities.push(generated('ordering', `${template.title} · Ordena`, 'Ordena los pasos del proceso según la secuencia del contenido.', steps, steps, 'La secuencia debe seguir la lógica del proceso trabajado.'))
  if (matches.singleChoice.available) activities.push(generated('singleChoice', `${template.title} · Elige`, 'Selecciona la opción que mejor representa el contenido aprendido.', conceptOptions.length ? [...conceptOptions, 'Ninguna de las anteriores'] : [firstSituation?.decision ?? 'Revisar el contenido'], conceptOptions[0] ?? firstSituation?.decision ?? '', 'Explica por qué esa opción se relaciona con el objetivo de aprendizaje.'))
  return activities
}

function TemplateActivityPicker({ templates, requestedType, onCancel, onSelect }: { templates: EvaluationTemplate[]; requestedType: ActivityType | null; onCancel: () => void; onSelect: (template: EvaluationTemplate, type: ActivityType) => void }) {
  const accepted = templates.filter((template) => template.status === 'accepted')
  return <div className="modal-backdrop"><div className="modal-card activity-picker"><div className="modal-head"><div><p className="eyebrow">CREAR DESDE CONTENIDO</p><h2>Elige una plantilla</h2><p className="modal-subtitle">La actividad se construirá a partir del contenido que ya aprobaste.</p></div><button type="button" className="icon-button" onClick={onCancel}>×</button></div>{accepted.length ? <div className="picker-list">{accepted.map((template) => { const matches = compatibility(template); const available = Object.entries(types).filter(([key]) => matches[key as ActivityType].available && (!requestedType || key === requestedType)); return <article className="picker-card" key={template.id}><div><p className="eyebrow">PLANTILLA ACEPTADA</p><h3>{template.title}</h3><small>{template.subject} · {template.difficulty}</small></div><div className="picker-types">{available.length ? available.map(([key, value]) => <button key={key} className="picker-type" onClick={() => onSelect(template, key as ActivityType)}><span>{value.icon}</span><b>{value.label}</b><small>Usar este contenido</small></button>) : <div className="picker-unavailable">{requestedType ? `Esta plantilla todavía no tiene información suficiente para ${types[requestedType].label.toLowerCase()}.` : 'Esta plantilla no tiene formatos compatibles.'}</div>}</div></article> })}</div> : <div className="empty-state"><span>◎</span><h2>Primero acepta una plantilla</h2><p>Las actividades se crean desde una plantilla de contenido aprobada.</p></div>}<div className="modal-actions"><button type="button" className="outline-button" onClick={onCancel}>Cancelar</button></div></div></div>
}

function TemplateCard({ template }: { template: EvaluationTemplate }) { const matches = compatibility(template); const imported = template.source === 'json'; return <article className="template-card"><div className="template-card-head"><div><p className="eyebrow">{imported ? 'IMPORTADO · REVISIÓN PENDIENTE' : template.status === 'accepted' ? 'CONTENIDO ACEPTADO' : 'BORRADOR'}</p><h3>{template.title || 'Sin título'}</h3><p>{template.subject || 'Sin asignatura'} · {template.difficulty}</p></div><span className={`tag ${template.status === 'accepted' ? 'published' : 'draft'}`}>{imported ? 'Importado' : template.status === 'accepted' ? 'Aceptada' : 'Borrador'}</span></div><p className="template-description">{template.description || 'Sin descripción todavía.'}</p><div className="template-stats"><span>{template.concepts.length} conceptos</span><span>{template.situations.length} situaciones</span><span>{template.processSteps.length} pasos</span></div>{template.status === 'accepted' && <div className="generated-note">{imported ? '◌ Las actividades compatibles quedaron como propuestas para revisión docente.' : '✓ Las actividades compatibles se crearon automáticamente desde esta plantilla.'}</div>}<div className="compatibility-grid">{Object.entries(types).map(([key, value]) => { const item = matches[key as ActivityType]; return <div className={`compatibility-item ${item.available ? '' : 'unavailable'}`} key={key}><span>{item.available ? '✓' : '×'}</span><b>{value.label}</b><small>{item.available ? imported ? 'Propuesta para revisar' : 'Actividad creada' : item.reason}</small></div> })}</div></article> }


type TemplateProgress = { percent: number; completed: number; total: number; checks: { label: string; done: boolean }[] }

function getTemplateProgress(title: string, subject: string, objective: string, concepts: ContentConcept[], situations: ContentSituation[], processSteps: string[], categories: string[]): TemplateProgress {
  const checks = [
    { label: 'Título de la plantilla', done: Boolean(title.trim()) },
    { label: 'Asignatura o área', done: Boolean(subject.trim()) },
    { label: 'Objetivo de aprendizaje', done: Boolean(objective.trim()) },
    { label: 'Concepto con definición', done: concepts.some((item) => item.name.trim() && item.definition.trim()) },
    { label: 'Situación con decisión', done: situations.some((item) => item.title.trim() && item.context.trim() && item.decision.trim() && item.consequence.trim()) },
    { label: 'Dos pasos de proceso', done: processSteps.filter(Boolean).length >= 2 },
    { label: 'Dos categorías', done: categories.filter(Boolean).length >= 2 },
  ]
  const completed = checks.filter((item) => item.done).length
  return { percent: Math.round((completed / checks.length) * 100), completed, total: checks.length, checks }
}

function TemplatePreview({ template, onClose, onPrint }: { template: EvaluationTemplate; onClose: () => void; onPrint: () => void }) {
  const matches = compatibility(template)
  return <div className="modal-backdrop"><article className="modal-card template-preview printable-template"><div className="modal-head"><div><p className="eyebrow">VISTA PREVIA DE PLANTILLA</p><h2>{template.title || 'Sin título'}</h2><p className="modal-subtitle">{template.subject || 'Sin asignatura'} · Dificultad {template.difficulty}</p></div><button type="button" className="icon-button no-print" onClick={onClose}>×</button></div><div className="preview-hero"><p>{template.description || 'Sin descripción breve.'}</p><div><b>Objetivo</b><span>{template.objective || 'Pendiente de completar.'}</span></div><div><b>Competencia</b><span>{template.competency || 'No especificada.'}</span></div></div><div className="preview-grid"><section><p className="eyebrow">CONCEPTOS</p>{template.concepts.filter((item) => item.name.trim() || item.definition.trim()).length ? template.concepts.filter((item) => item.name.trim() || item.definition.trim()).map((item) => <div className="preview-item" key={item.id}><b>{item.name || 'Sin nombre'}</b><span>{item.definition || 'Sin definición'}</span>{item.example && <small>Ejemplo: {item.example}</small>}</div>) : <p className="preview-empty">No hay conceptos cargados.</p>}</section><section><p className="eyebrow">SITUACIONES</p>{template.situations.filter((item) => item.title.trim() || item.context.trim()).length ? template.situations.filter((item) => item.title.trim() || item.context.trim()).map((item) => <div className="preview-item" key={item.id}><b>{item.title || 'Sin título'}</b><span>{item.context || 'Sin contexto'}</span><small>Decisión: {item.decision || 'Pendiente'} · Consecuencia: {item.consequence || 'Pendiente'}</small></div>) : <p className="preview-empty">No hay situaciones cargadas.</p>}</section></div><div className="preview-grid"><section><p className="eyebrow">PROCESO</p>{template.processSteps.length ? <ol className="preview-list">{template.processSteps.map((step, index) => <li key={'preview-step-' + index}>{step}</li>)}</ol> : <p className="preview-empty">No hay pasos cargados.</p>}</section><section><p className="eyebrow">CATEGORÍAS</p>{template.categories.length ? <div className="preview-tags">{template.categories.map((category, index) => <span key={'preview-category-' + index}>{category}</span>)}</div> : <p className="preview-empty">No hay categorías cargadas.</p>}</section></div><section className="preview-compatibility"><p className="eyebrow">FORMATOS COMPATIBLES</p><div className="compatibility-grid">{Object.entries(types).map(([key, value]) => <div className={'compatibility-item ' + (matches[key as ActivityType].available ? '' : 'unavailable')} key={key}><span>{matches[key as ActivityType].available ? '✓' : '×'}</span><b>{value.label}</b><small>{matches[key as ActivityType].available ? 'Se generará al aceptar' : matches[key as ActivityType].reason}</small></div>)}</div></section><div className="modal-actions no-print"><button type="button" className="outline-button" onClick={onClose}>Volver a editar</button><button type="button" className="primary-button" onClick={onPrint}>Imprimir / guardar PDF</button></div></article></div>
}

function TemplateBuilder({ onCancel, onSave }: { onCancel: () => void; onSave: (template: EvaluationTemplate) => void }) {
  const savedDraft = readStorage<Partial<EvaluationTemplate>>('edueval-template-draft', {})
  const [title, setTitle] = useState(savedDraft.title ?? 'Nueva plantilla')
  const [subject, setSubject] = useState(savedDraft.subject ?? '')
  const [description, setDescription] = useState(savedDraft.description ?? '')
  const [objective, setObjective] = useState(savedDraft.objective ?? '')
  const [competency, setCompetency] = useState(savedDraft.competency ?? '')
  const [difficulty, setDifficulty] = useState<EvaluationTemplate['difficulty']>(savedDraft.difficulty ?? 'Inicial')
  const [concepts, setConcepts] = useState<ContentConcept[]>(savedDraft.concepts?.length ? savedDraft.concepts : [{ id: 'c1', name: '', definition: '', example: '' }])
  const [situations, setSituations] = useState<ContentSituation[]>(savedDraft.situations?.length ? savedDraft.situations : [{ id: 's1', title: '', context: '', decision: '', consequence: '' }])
  const [processSteps, setProcessSteps] = useState((savedDraft.processSteps ?? []).join('\n'))
  const [categories, setCategories] = useState((savedDraft.categories ?? []).join('\n'))
  const [error, setError] = useState('')
  const [autosaveStatus, setAutosaveStatus] = useState('')
  const [showPreview, setShowPreview] = useState(false)
  const processStepList = processSteps.split('\n').map((item) => item.trim()).filter(Boolean)
  const categoryList = categories.split('\n').map((item) => item.trim()).filter(Boolean)
  const currentTemplate: EvaluationTemplate = { id: 'preview', title, subject, description, objective, competency, difficulty, concepts, situations, processSteps: processStepList, categories: categoryList, status: 'draft', updatedAt: new Date().toISOString() }
  const matches = compatibility(currentTemplate)
  const progress = getTemplateProgress(title, subject, objective, concepts, situations, processStepList, categoryList)

  useEffect(() => {
    localStorage.setItem('edueval-template-draft', JSON.stringify(currentTemplate))
    setAutosaveStatus('Borrador guardado automáticamente')
    const timer = window.setTimeout(() => setAutosaveStatus(''), 1800)
    return () => window.clearTimeout(timer)
  }, [title, subject, description, objective, competency, difficulty, concepts, situations, processSteps, categories])

  const handleSave = (status: EvaluationTemplate['status']) => {
    if (!title.trim() || !subject.trim() || !objective.trim()) return setError('Completa título, asignatura y objetivo antes de guardar.')
    if (status === 'accepted' && !Object.values(matches).some((item) => item.available)) return setError('Para aceptar la plantilla, completa al menos un bloque de contenido compatible.')
    setError('')
    localStorage.removeItem('edueval-template-draft')
    onSave({ ...currentTemplate, id: '', status, updatedAt: new Date().toISOString() })
  }
  const updateConcept = (id: string, key: keyof ContentConcept, value: string) => setConcepts((current) => current.map((item) => item.id === id ? { ...item, [key]: value } : item))
  const updateSituation = (id: string, key: keyof ContentSituation, value: string) => setSituations((current) => current.map((item) => item.id === id ? { ...item, [key]: value } : item))
  return <div className="modal-backdrop"><form className="modal-card template-modal" onSubmit={(event) => { event.preventDefault(); handleSave('draft') }}><div className="modal-head"><div><p className="eyebrow">CONSTRUCTOR DE PLANTILLA</p><h2>Estructura tu contenido</h2><p className="modal-subtitle">La plantilla es la fuente; al aprobarla se generan las actividades compatibles.</p></div><button type="button" className="icon-button" onClick={onCancel}>×</button></div><div className="template-progress"><div className="template-progress-head"><div><b>Progreso de la plantilla</b><small>{progress.completed} de {progress.total} criterios completos</small></div><strong>{progress.percent}%</strong></div><div className="progress-track"><span style={{ width: progress.percent + '%' }} /></div><div className="progress-checks">{progress.checks.map((check) => <span className={check.done ? 'done' : ''} key={check.label}>{check.done ? '✓' : '○'} {check.label}</span>)}</div></div><div className="autosave-status">{autosaveStatus || 'Los cambios se guardan localmente mientras editas.'}</div><div className="form-grid"><label>Título de la plantilla *<input required value={title} onChange={(event) => setTitle(event.target.value)} /></label><label>Asignatura o área *<input required value={subject} onChange={(event) => setSubject(event.target.value)} placeholder="Ej. Ciencias naturales" /></label></div><label>Descripción breve<textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={2} placeholder="¿Qué aprenderá el grupo?" /></label><div className="form-grid"><label>Objetivo de aprendizaje *<textarea required value={objective} onChange={(event) => setObjective(event.target.value)} rows={3} /></label><label>Competencia o capacidad<textarea value={competency} onChange={(event) => setCompetency(event.target.value)} rows={3} /></label></div><div className="form-grid"><label>Dificultad<select value={difficulty} onChange={(event) => setDifficulty(event.target.value as EvaluationTemplate['difficulty'])}><option>Inicial</option><option>Intermedio</option><option>Avanzado</option></select></label><label>Respaldo<div className="backup-actions"><button type="button" className="outline-button" onClick={() => setShowPreview(true)}>Vista previa</button><small>Desde la vista previa puedes imprimir o guardar como PDF.</small></div></label></div><div className="template-block"><div className="block-heading"><div><p className="eyebrow">CONCEPTOS Y DEFINICIONES</p><b>Ideas que deben comprender</b></div><button type="button" className="text-button" onClick={() => setConcepts((current) => [...current, { id: 'c' + Date.now(), name: '', definition: '', example: '' }])}>＋ Agregar concepto</button></div>{concepts.map((concept) => <div className="repeatable-card" key={concept.id}><div className="repeatable-row"><input aria-label="Nombre del concepto" placeholder="Concepto" value={concept.name} onChange={(event) => updateConcept(concept.id, 'name', event.target.value)} /><button type="button" className="remove-button" onClick={() => setConcepts((current) => current.length > 1 ? current.filter((item) => item.id !== concept.id) : current)}>×</button></div><textarea aria-label="Definición" placeholder="Definición" value={concept.definition} onChange={(event) => updateConcept(concept.id, 'definition', event.target.value)} rows={2} /><input aria-label="Ejemplo" placeholder="Ejemplo o característica" value={concept.example} onChange={(event) => updateConcept(concept.id, 'example', event.target.value)} /></div>)}</div><div className="template-block"><div className="block-heading"><div><p className="eyebrow">SITUACIONES Y CONSECUENCIAS</p><b>Casos para decidir y reflexionar</b></div><button type="button" className="text-button" onClick={() => setSituations((current) => [...current, { id: 's' + Date.now(), title: '', context: '', decision: '', consequence: '' }])}>＋ Agregar situación</button></div>{situations.map((situation) => <div className="repeatable-card" key={situation.id}><div className="repeatable-row"><input aria-label="Título de situación" placeholder="Título del caso" value={situation.title} onChange={(event) => updateSituation(situation.id, 'title', event.target.value)} /><button type="button" className="remove-button" onClick={() => setSituations((current) => current.length > 1 ? current.filter((item) => item.id !== situation.id) : current)}>×</button></div><textarea aria-label="Contexto" placeholder="Contexto de la situación" value={situation.context} onChange={(event) => updateSituation(situation.id, 'context', event.target.value)} rows={2} /><div className="form-grid"><input aria-label="Decisión esperada" placeholder="Decisión o pregunta" value={situation.decision} onChange={(event) => updateSituation(situation.id, 'decision', event.target.value)} /><input aria-label="Consecuencia" placeholder="Consecuencia o feedback" value={situation.consequence} onChange={(event) => updateSituation(situation.id, 'consequence', event.target.value)} /></div></div>)}</div><div className="form-grid"><label>Pasos de un proceso<span className="field-hint">Un paso por línea; habilita ordenamiento desde dos pasos.</span><textarea value={processSteps} onChange={(event) => setProcessSteps(event.target.value)} rows={5} placeholder={'Observar\nAnalizar\nDecidir'} /></label><label>Categorías<span className="field-hint">Una categoría por línea; habilita clasificación.</span><textarea value={categories} onChange={(event) => setCategories(event.target.value)} rows={5} placeholder={'Causa\nConsecuencia'} /></label></div><section className="compatibility-preview"><div className="block-heading"><div><p className="eyebrow">COMPATIBILIDAD EN TIEMPO REAL</p><b>Formatos que se generarán al aceptar</b></div></div><div className="compatibility-grid">{Object.entries(types).map(([key, value]) => { const item = matches[key as ActivityType]; return <div className={'compatibility-item ' + (item.available ? '' : 'unavailable')} key={key}><span>{item.available ? '✓' : '×'}</span><b>{value.label}</b><small>{item.available ? 'Se creará automáticamente' : item.reason}</small></div> })}</div></section>{error && <div className="form-error">! {error}</div>}<div className="form-note">✓ Guardar borrador conserva la estructura. Aceptar contenido aprueba la plantilla y crea automáticamente las actividades compatibles; no requiere una segunda aprobación por actividad.</div><div className="modal-actions"><button type="button" className="outline-button" onClick={onCancel}>Cancelar</button><button type="button" className="outline-button" onClick={() => setShowPreview(true)}>Vista previa</button><button type="submit" className="outline-button">Guardar borrador</button><button type="button" className="primary-button" onClick={() => handleSave('accepted')}>Aceptar contenido</button></div>{showPreview && <TemplatePreview template={currentTemplate} onClose={() => setShowPreview(false)} onPrint={() => window.print()} />}</form></div>
}
function optionsForTemplate(template: EvaluationTemplate, type: ActivityType): string[] {
  const concepts = template.concepts.filter((item) => item.name.trim()).map((item) => item.name)
  const definitions = template.concepts.filter((item) => item.name.trim() && item.definition.trim()).map((item) => `${item.name} → ${item.definition}`)
  const situation = template.situations.find((item) => item.title.trim() && item.context.trim())
  if (type === 'ordering') return template.processSteps.filter(Boolean)
  if (type === 'matching') return definitions
  if (type === 'sorting') return concepts
  if (type === 'scenario') return situation ? [situation.decision, 'Analizar otra alternativa antes de decidir', 'Ignorar las consecuencias'] : []
  if (type === 'trueFalse') return ['Verdadero', 'Falso']
  return concepts.length ? [...concepts, 'Ninguna de las anteriores'] : situation ? [situation.decision, 'Revisar otra posibilidad'] : []
}


type ActivityEditorState = {
  scenario: { situation: string; stages: ScenarioStage[] }
  trueFalse: { statement: string; correct: boolean; explanation: string }
  matching: { pairs: MatchingPair[] }
  sorting: { categories: string[]; items: SortingItem[] }
  ordering: { steps: string[] }
  singleChoice: { options: ChoiceOption[] }
}

function makeEditorId(prefix: string): string {
  return prefix + Date.now() + Math.random().toString(36).slice(2, 6)
}

function createEditorState(template: EvaluationTemplate | undefined): ActivityEditorState {
  const concepts = template?.concepts.filter((item) => item.name.trim()) ?? []
  const completeConcepts = concepts.filter((item) => item.definition.trim())
  const situation = template?.situations.find((item) => item.title.trim() && item.context.trim())
  const categories = template?.categories.filter(Boolean) ?? []
  const steps = template?.processSteps.filter(Boolean) ?? []
  const firstSituation = situation ? situation.title + ': ' + situation.context : ''
  const scenarioDecision = situation?.decision || template?.objective || ''
  const scenarioConsequence = situation?.consequence || 'Explica qué consecuencia tendría esta decisión.'
  const scenarioOptions: ScenarioOption[] = [
    { id: makeEditorId('option-'), text: scenarioDecision, consequence: scenarioConsequence, feedback: 'Relaciona esta decisión con la situación planteada.', recommended: true },
    { id: makeEditorId('option-'), text: 'Analizar otra alternativa antes de decidir', consequence: 'Se necesita más información para elegir con seguridad.', feedback: 'Compara las consecuencias antes de seleccionar.', recommended: false },
    { id: makeEditorId('option-'), text: 'Ignorar las consecuencias', consequence: 'El problema puede crecer y afectar al grupo.', feedback: 'Considera cómo cada decisión afecta a otras personas.', recommended: false },
  ]
  return {
    scenario: {
      situation: firstSituation,
      stages: [{ id: makeEditorId('stage-'), title: 'Decisión principal', prompt: situation?.decision || template?.objective || '', options: scenarioOptions }],
    },
    trueFalse: {
      statement: completeConcepts[0] ? completeConcepts[0].name + ': ' + completeConcepts[0].definition : template?.objective || '',
      correct: true,
      explanation: completeConcepts[0]?.example || completeConcepts[0]?.definition || 'Escribe la evidencia que permite justificar la respuesta.',
    },
    matching: {
      pairs: (completeConcepts.length ? completeConcepts : [{ id: 'empty-1', name: '', definition: '', example: '' }, { id: 'empty-2', name: '', definition: '', example: '' }]).slice(0, 6).map((item) => ({ id: makeEditorId('pair-'), left: item.name, right: item.definition })),
    },
    sorting: {
      categories: (categories.length >= 2 ? categories : ['Categoría A', 'Categoría B']).slice(0, 6),
      items: (concepts.length ? concepts : [{ id: 'item-1', name: '', definition: '', example: '' }, { id: 'item-2', name: '', definition: '', example: '' }]).slice(0, 12).map((item, index) => ({ id: makeEditorId('sort-'), label: item.name, category: (categories.length >= 2 ? categories : ['Categoría A', 'Categoría B'])[index % 2] })),
    },
    ordering: { steps: (steps.length >= 2 ? steps : ['Paso inicial', 'Paso siguiente']).slice(0, 12) },
    singleChoice: {
      options: (concepts.length ? concepts.map((item) => item.name) : [scenarioDecision, 'Otra opción']).filter(Boolean).slice(0, 6).map((label, index) => ({ id: makeEditorId('choice-'), label, correct: index === 0 })),
    },
  }
}

function validateActivityEditor(type: ActivityType, title: string, prompt: string, value: ActivityEditorState): string {
  if (!title.trim()) return 'Escribe un título para la actividad.'
  if (!prompt.trim()) return 'Escribe la consigna que verá el estudiante.'
  if (type === 'scenario') {
    if (!value.scenario.situation.trim()) return 'Completa el contexto del escenario.'
    if (!value.scenario.stages.length) return 'Agrega al menos una etapa de decisión.'
    if (value.scenario.stages.some((stage) => !stage.prompt.trim() || stage.options.length < 2 || stage.options.some((option) => !option.text.trim() || !option.consequence.trim() || !option.feedback.trim()))) return 'Cada etapa necesita una consigna y dos opciones completas con consecuencia y feedback.'
    if (!value.scenario.stages.some((stage) => stage.options.some((option) => option.recommended))) return 'Marca una opción recomendada en el escenario.'
  }
  if (type === 'trueFalse' && (!value.trueFalse.statement.trim() || !value.trueFalse.explanation.trim())) return 'Completa la afirmación y la explicación del falso/verdadero.'
  if (type === 'matching' && (value.matching.pairs.length < 2 || value.matching.pairs.some((pair) => !pair.left.trim() || !pair.right.trim()))) return 'La asociación necesita al menos dos pares completos.'
  if (type === 'sorting' && (value.sorting.categories.filter(Boolean).length < 2 || value.sorting.items.length < 2 || value.sorting.items.some((item) => !item.label.trim() || !item.category))) return 'La clasificación necesita dos categorías y dos elementos asignados.'
  if (type === 'ordering' && (value.ordering.steps.length < 2 || value.ordering.steps.some((step) => !step.trim()))) return 'El ordenamiento necesita al menos dos pasos completos.'
  if (type === 'singleChoice' && (value.singleChoice.options.length < 2 || value.singleChoice.options.some((option) => !option.label.trim()) || value.singleChoice.options.filter((option) => option.correct).length !== 1)) return 'La selección necesita dos opciones y exactamente una respuesta correcta.'
  return ''
}

function editorStateToActivity(type: ActivityType, value: ActivityEditorState, common: { templateId?: string; title: string; topic: string; difficulty: Activity['difficulty']; prompt: string; feedback: string }): Activity {
  if (type === 'scenario') {
    const stages = value.scenario.stages
    const options = stages.flatMap((stage) => stage.options.map((option) => option.text))
    const recommended = stages.flatMap((stage) => stage.options).find((option) => option.recommended)
    return { id: '', templateId: common.templateId, title: common.title, type, topic: common.topic, difficulty: common.difficulty, prompt: common.prompt, options, answer: recommended?.text ?? options[0] ?? '', feedback: recommended?.feedback ?? common.feedback, details: { scenario: value.scenario }, status: 'published' }
  }
  if (type === 'trueFalse') {
    return { id: '', templateId: common.templateId, title: common.title, type, topic: common.topic, difficulty: common.difficulty, prompt: common.prompt, options: ['Verdadero', 'Falso'], answer: value.trueFalse.correct ? 'Verdadero' : 'Falso', feedback: value.trueFalse.explanation, details: { trueFalse: value.trueFalse }, status: 'published' }
  }
  if (type === 'matching') {
    const options = value.matching.pairs.map((pair) => pair.left + ' → ' + pair.right)
    return { id: '', templateId: common.templateId, title: common.title, type, topic: common.topic, difficulty: common.difficulty, prompt: common.prompt, options, answer: options, feedback: common.feedback, details: { matching: value.matching }, status: 'published' }
  }
  if (type === 'sorting') {
    const options = value.sorting.items.map((item) => item.label)
    return { id: '', templateId: common.templateId, title: common.title, type, topic: common.topic, difficulty: common.difficulty, prompt: common.prompt, options, answer: value.sorting.items.map((item) => item.category), feedback: common.feedback, details: { sorting: value.sorting }, status: 'published' }
  }
  if (type === 'ordering') {
    return { id: '', templateId: common.templateId, title: common.title, type, topic: common.topic, difficulty: common.difficulty, prompt: common.prompt, options: value.ordering.steps, answer: value.ordering.steps, feedback: common.feedback, details: { ordering: value.ordering }, status: 'published' }
  }
  const options = value.singleChoice.options.map((option) => option.label)
  const correct = value.singleChoice.options.find((option) => option.correct)?.label ?? ''
  return { id: '', templateId: common.templateId, title: common.title, type, topic: common.topic, difficulty: common.difficulty, prompt: common.prompt, options, answer: correct, feedback: common.feedback, details: { singleChoice: value.singleChoice }, status: 'published' }
}

function ScenarioEditor({ value, onChange }: { value: ActivityEditorState['scenario']; onChange: (value: ActivityEditorState['scenario']) => void }) {
  const updateStage = (id: string, patch: Partial<ScenarioStage>) => onChange({ ...value, stages: value.stages.map((stage) => stage.id === id ? { ...stage, ...patch } : stage) })
  const updateOption = (stageId: string, optionId: string, patch: Partial<ScenarioOption>) => onChange({ ...value, stages: value.stages.map((stage) => stage.id === stageId ? { ...stage, options: stage.options.map((option) => option.id === optionId ? { ...option, ...patch } : option) } : stage) })
  const addStage = () => onChange({ ...value, stages: [...value.stages, { id: makeEditorId('stage-'), title: 'Nueva etapa', prompt: '', options: [{ id: makeEditorId('option-'), text: '', consequence: '', feedback: '', recommended: true }, { id: makeEditorId('option-'), text: '', consequence: '', feedback: '', recommended: false }] }] })
  const addOption = (stageId: string) => onChange({ ...value, stages: value.stages.map((stage) => stage.id === stageId ? { ...stage, options: [...stage.options, { id: makeEditorId('option-'), text: '', consequence: '', feedback: '', recommended: false }] } : stage) })
  const removeStage = (id: string) => onChange({ ...value, stages: value.stages.length > 1 ? value.stages.filter((stage) => stage.id !== id) : value.stages })
  const removeOption = (stageId: string, optionId: string) => onChange({ ...value, stages: value.stages.map((stage) => stage.id === stageId && stage.options.length > 2 ? { ...stage, options: stage.options.filter((option) => option.id !== optionId) } : stage) })
  return <section className="editor-section"><div className="editor-heading"><div><p className="eyebrow">EDITOR DE ESCENARIO</p><b>Decisiones, etapas y consecuencias</b></div><button type="button" className="text-button" onClick={addStage}>＋ Agregar etapa</button></div><label>Contexto general<textarea rows={3} value={value.situation} onChange={(event) => onChange({ ...value, situation: event.target.value })} placeholder="Describe la situación real que deberá analizar el estudiante." /></label>{value.stages.map((stage, stageIndex) => <div className="editor-card" key={stage.id}><div className="editor-card-head"><b>Etapa {stageIndex + 1}</b><button type="button" className="remove-button" onClick={() => removeStage(stage.id)}>×</button></div><div className="form-grid"><label>Nombre de la etapa<input value={stage.title} onChange={(event) => updateStage(stage.id, { title: event.target.value })} /></label><label>Consigna de la etapa<textarea rows={2} value={stage.prompt} onChange={(event) => updateStage(stage.id, { prompt: event.target.value })} /></label></div><div className="editor-options">{stage.options.map((option, optionIndex) => <div className="editor-option" key={option.id}><div className="editor-card-head"><b>{'Opción ' + (optionIndex + 1)}</b><button type="button" className="remove-button" onClick={() => removeOption(stage.id, option.id)}>×</button></div><input placeholder="Texto de la opción" value={option.text} onChange={(event) => updateOption(stage.id, option.id, { text: event.target.value })} /><input placeholder="Consecuencia de elegirla" value={option.consequence} onChange={(event) => updateOption(stage.id, option.id, { consequence: event.target.value })} /><textarea rows={2} placeholder="Feedback orientador" value={option.feedback} onChange={(event) => updateOption(stage.id, option.id, { feedback: event.target.value })} /><label className="radio-row"><input type="radio" name={'recommended-' + stage.id} checked={option.recommended} onChange={() => onChange({ ...value, stages: value.stages.map((item) => item.id === stage.id ? { ...item, options: item.options.map((entry) => ({ ...entry, recommended: entry.id === option.id })) } : item) })} /> Opción recomendada</label></div>)}</div><button type="button" className="text-button" onClick={() => addOption(stage.id)}>＋ Agregar opción</button></div>)}</section>
}

function TrueFalseEditor({ value, onChange }: { value: ActivityEditorState['trueFalse']; onChange: (value: ActivityEditorState['trueFalse']) => void }) {
  return <section className="editor-section"><div className="editor-heading"><div><p className="eyebrow">EDITOR FALSO / VERDADERO</p><b>Afirmación y evidencia</b></div></div><label>Afirmación<textarea rows={3} value={value.statement} onChange={(event) => onChange({ ...value, statement: event.target.value })} placeholder="Escribe una afirmación que el estudiante deba evaluar." /></label><div className="form-grid"><label>Respuesta esperada<select value={value.correct ? 'true' : 'false'} onChange={(event) => onChange({ ...value, correct: event.target.value === 'true' })}><option value="true">Verdadero</option><option value="false">Falso</option></select></label><label>Explicación de la respuesta<textarea rows={2} value={value.explanation} onChange={(event) => onChange({ ...value, explanation: event.target.value })} placeholder="Evidencia o razonamiento, sin mostrarse como respuesta directa al estudiante." /></label></div><p className="editor-help">La explicación se guarda como guía docente y feedback orientador.</p></section>
}

function MatchingEditor({ value, onChange }: { value: ActivityEditorState['matching']; onChange: (value: ActivityEditorState['matching']) => void }) {
  const updatePair = (id: string, patch: Partial<MatchingPair>) => onChange({ ...value, pairs: value.pairs.map((pair) => pair.id === id ? { ...pair, ...patch } : pair) })
  const addPair = () => onChange({ ...value, pairs: [...value.pairs, { id: makeEditorId('pair-'), left: '', right: '' }] })
  const removePair = (id: string) => onChange({ ...value, pairs: value.pairs.length > 2 ? value.pairs.filter((pair) => pair.id !== id) : value.pairs })
  return <section className="editor-section"><div className="editor-heading"><div><p className="eyebrow">EDITOR DE ASOCIACIÓN</p><b>Pares correctos y relación conceptual</b></div><button type="button" className="text-button" onClick={addPair}>＋ Agregar par</button></div><p className="editor-help">Cada fila representa una relación correcta; el estudiante verá los elementos separados.</p>{value.pairs.map((pair, index) => <div className="form-grid editor-card" key={pair.id}><label>Idea {index + 1}<input value={pair.left} onChange={(event) => updatePair(pair.id, { left: event.target.value })} placeholder="Concepto o idea" /></label><label>Se relaciona con<input value={pair.right} onChange={(event) => updatePair(pair.id, { right: event.target.value })} placeholder="Definición o aporte" /><button type="button" className="remove-inline" onClick={() => removePair(pair.id)}>Eliminar fila</button></label></div>)}</section>
}

function SortingEditor({ value, onChange }: { value: ActivityEditorState['sorting']; onChange: (value: ActivityEditorState['sorting']) => void }) {
  const updateItem = (id: string, patch: Partial<SortingItem>) => onChange({ ...value, items: value.items.map((item) => item.id === id ? { ...item, ...patch } : item) })
  const addItem = () => onChange({ ...value, items: [...value.items, { id: makeEditorId('sort-'), label: '', category: value.categories[0] || '' }] })
  const addCategory = () => onChange({ ...value, categories: [...value.categories, ''] })
  const removeItem = (id: string) => onChange({ ...value, items: value.items.length > 2 ? value.items.filter((item) => item.id !== id) : value.items })
  const updateCategory = (index: number, next: string) => onChange({ ...value, categories: value.categories.map((category, categoryIndex) => categoryIndex === index ? next : category), items: value.items.map((item) => item.category === value.categories[index] ? { ...item, category: next } : item) })
  return <section className="editor-section"><div className="editor-heading"><div><p className="eyebrow">EDITOR DE CLASIFICACIÓN</p><b>Categorías y elementos</b></div><button type="button" className="text-button" onClick={addItem}>＋ Agregar elemento</button></div><div className="category-editor"><div className="block-heading"><b>Categorías destino</b><button type="button" className="text-button" onClick={addCategory}>＋ Agregar categoría</button></div>{value.categories.map((category, index) => <div className="repeatable-row" key={'category-' + index}><input value={category} placeholder={'Categoría ' + (index + 1)} onChange={(event) => updateCategory(index, event.target.value)} /></div>)}</div><div className="editor-options">{value.items.map((item, index) => <div className="editor-option" key={item.id}><div className="editor-card-head"><b>{'Elemento ' + (index + 1)}</b><button type="button" className="remove-button" onClick={() => removeItem(item.id)}>×</button></div><div className="form-grid"><label>Texto<input value={item.label} onChange={(event) => updateItem(item.id, { label: event.target.value })} /></label><label>Categoría correcta<select value={item.category} onChange={(event) => updateItem(item.id, { category: event.target.value })}>{value.categories.filter(Boolean).map((category) => <option key={category} value={category}>{category}</option>)}</select></label></div></div>)}</div></section>
}

function OrderingEditor({ value, onChange }: { value: ActivityEditorState['ordering']; onChange: (value: ActivityEditorState['ordering']) => void }) {
  const updateStep = (index: number, next: string) => onChange({ steps: value.steps.map((step, stepIndex) => stepIndex === index ? next : step) })
  const addStep = () => onChange({ steps: [...value.steps, ''] })
  const removeStep = (index: number) => onChange({ steps: value.steps.length > 2 ? value.steps.filter((_, stepIndex) => stepIndex !== index) : value.steps })
  return <section className="editor-section"><div className="editor-heading"><div><p className="eyebrow">EDITOR DE ORDENAMIENTO</p><b>Secuencia correcta del proceso</b></div><button type="button" className="text-button" onClick={addStep}>＋ Agregar paso</button></div><p className="editor-help">El estudiante verá los pasos mezclados y deberá ordenarlos.</p><div className="editor-options">{value.steps.map((step, index) => <div className="repeatable-row editor-step" key={'step-' + index}><span className="step-number">{index + 1}</span><input value={step} placeholder="Describe el paso" onChange={(event) => updateStep(index, event.target.value)} /><button type="button" className="remove-button" onClick={() => removeStep(index)}>×</button></div>)}</div></section>
}

function SingleChoiceEditor({ value, onChange }: { value: ActivityEditorState['singleChoice']; onChange: (value: ActivityEditorState['singleChoice']) => void }) {
  const updateOption = (id: string, patch: Partial<ChoiceOption>) => onChange({ ...value, options: value.options.map((option) => option.id === id ? { ...option, ...patch } : option) })
  const addOption = () => onChange({ ...value, options: [...value.options, { id: makeEditorId('choice-'), label: '', correct: false }] })
  const removeOption = (id: string) => onChange({ ...value, options: value.options.length > 2 ? value.options.filter((option) => option.id !== id) : value.options })
  return <section className="editor-section"><div className="editor-heading"><div><p className="eyebrow">EDITOR DE SELECCIÓN MÚLTIPLE</p><b>Opciones con una sola respuesta correcta</b></div><button type="button" className="text-button" onClick={addOption}>＋ Agregar opción</button></div><p className="editor-help">Aunque el formato se llama selección múltiple, esta versión valida una sola opción correcta.</p><div className="editor-options">{value.options.map((option, index) => <div className="editor-option choice-editor" key={option.id}><div className="editor-card-head"><b>{'Opción ' + (index + 1)}</b><button type="button" className="remove-button" onClick={() => removeOption(option.id)}>×</button></div><div className="choice-line"><input value={option.label} onChange={(event) => updateOption(option.id, { label: event.target.value })} placeholder="Texto de la opción" /><label className="radio-row"><input type="radio" name="single-choice-correct" checked={option.correct} onChange={() => onChange({ ...value, options: value.options.map((item) => ({ ...item, correct: item.id === option.id })) })} /> Correcta</label></div></div>)}</div></section>
}

function SpecificActivityEditor({ type, value, onChange }: { type: ActivityType; value: ActivityEditorState; onChange: (value: ActivityEditorState) => void }) {
  if (type === 'scenario') return <ScenarioEditor value={value.scenario} onChange={(scenario) => onChange({ ...value, scenario })} />
  if (type === 'trueFalse') return <TrueFalseEditor value={value.trueFalse} onChange={(trueFalse) => onChange({ ...value, trueFalse })} />
  if (type === 'matching') return <MatchingEditor value={value.matching} onChange={(matching) => onChange({ ...value, matching })} />
  if (type === 'sorting') return <SortingEditor value={value.sorting} onChange={(sorting) => onChange({ ...value, sorting })} />
  if (type === 'ordering') return <OrderingEditor value={value.ordering} onChange={(ordering) => onChange({ ...value, ordering })} />
  return <SingleChoiceEditor value={value.singleChoice} onChange={(singleChoice) => onChange({ ...value, singleChoice })} />
}

function ActivityForm({ initialType, template, onCancel, onSave }: { initialType: ActivityType; template?: EvaluationTemplate; onCancel: () => void; onSave: (activity: Activity) => void }) {
  const availableTypes = template ? Object.entries(types).filter(([key]) => compatibility(template)[key as ActivityType].available).map(([key]) => key as ActivityType) : Object.keys(types) as ActivityType[]
  const [type, setType] = useState<ActivityType>(initialType)
  const [title, setTitle] = useState(template ? template.title + ' · ' + types[initialType].label : 'Nueva actividad')
  const [prompt, setPrompt] = useState(template?.objective ?? 'Escribe aquí la consigna de aprendizaje.')
  const [topic, setTopic] = useState(template?.subject ?? 'Convivencia')
  const [difficulty, setDifficulty] = useState<Activity['difficulty']>(template?.difficulty ?? 'Inicial')
  const [feedback, setFeedback] = useState('Relaciona tu respuesta con el objetivo de aprendizaje y revisa la evidencia del contenido.')
  const [editorState, setEditorState] = useState<ActivityEditorState>(() => createEditorState(template))
  const [error, setError] = useState('')
  const changeType = (nextType: ActivityType) => {
    setType(nextType)
    setTitle(template ? template.title + ' · ' + types[nextType].label : 'Nueva actividad')
    setEditorState(createEditorState(template))
    setError('')
  }
  const save = (event: React.FormEvent) => {
    event.preventDefault()
    const validation = validateActivityEditor(type, title, prompt, editorState)
    if (validation) return setError(validation)
    onSave(editorStateToActivity(type, editorState, { templateId: template?.id, title: title.trim(), topic: topic.trim(), difficulty: template?.difficulty ?? difficulty, prompt: prompt.trim(), feedback: feedback.trim() }))
  }
  return <div className="modal-backdrop"><form className="modal-card activity-editor-modal" onSubmit={save}><div className="modal-head"><div><p className="eyebrow">{template ? 'ACTIVIDAD DESDE PLANTILLA' : 'ACTIVIDAD MANUAL'}</p><h2>Crear actividad</h2><p className="modal-subtitle">{template ? 'Contenido fuente: ' + template.title : 'Actividad adicional independiente.'}</p></div><button type="button" className="icon-button" onClick={onCancel}>×</button></div><div className="form-grid"><label>Título de la actividad *<input value={title} onChange={(event) => setTitle(event.target.value)} /></label><label>Tema<input value={topic} onChange={(event) => setTopic(event.target.value)} /></label></div><label>Consigna general *<textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} rows={2} /></label><div className="form-grid"><label>Dificultad<select value={template?.difficulty ?? difficulty} disabled={Boolean(template)} onChange={(event) => setDifficulty(event.target.value as Activity['difficulty'])}><option>Inicial</option><option>Intermedio</option><option>Avanzado</option></select></label><label>Feedback general<textarea value={feedback} onChange={(event) => setFeedback(event.target.value)} rows={2} /></label></div><label>Tipo de actividad<select value={type} onChange={(event) => changeType(event.target.value as ActivityType)}>{availableTypes.map((key) => <option key={key} value={key}>{types[key].label}</option>)}</select><span className="field-hint">{types[type].description}</span></label><SpecificActivityEditor type={type} value={editorState} onChange={setEditorState} />{error && <div className="form-error">! {error}</div>}<div className="form-note">✓ Esta actividad guarda un esquema específico para {types[type].label.toLowerCase()}. La aprobación docente ocurre en la plantilla seleccionada.</div><div className="modal-actions"><button type="button" className="outline-button" onClick={onCancel}>Cancelar</button><button className="primary-button">Crear actividad publicada</button></div></form></div>
}
function ProposalsView({ activities, hasDraft, onReview, onContinueDraft, onHome }: { activities: Activity[]; hasDraft: boolean; onReview: (id: string, status: 'published' | 'draft') => void; onContinueDraft: () => void; onHome: () => void }) { return <><PageIntro eyebrow="REVISIÓN Y CONTINUIDAD" title="Propuestas y borradores" description="Revisa actividades pendientes y retoma las plantillas que todavía no terminaste." onHome={onHome} />{hasDraft && <div className="admin-notice proposal-draft-notice"><span>✎</span><div><b>Tienes una plantilla en borrador.</b><p>La estructura se guardó automáticamente. Puedes continuarla desde el último punto antes de aprobarla.</p></div><button className="outline-button" onClick={onContinueDraft}>Continuar borrador</button></div>}<div className="review-banner"><span>◌</span><div><b>{activities.length ? `${activities.length} propuesta${activities.length === 1 ? '' : 's'} esperando revisión` : 'No hay propuestas pendientes'}</b><p>La publicación es una decisión del docente.</p></div></div><div className="proposal-list">{activities.length ? activities.map((activity) => <article className="proposal-card" key={activity.id}><div className={`list-type type-${activity.type}`}>{types[activity.type].icon}</div><div className="proposal-copy"><p className="eyebrow">PROPUESTA · {activity.topic.toUpperCase()}</p><h2>{activity.title}</h2><p>{activity.prompt}</p><small>Generada desde el formulario interno · sin archivos adjuntos</small></div><div className="proposal-actions"><button className="outline-button" onClick={() => onReview(activity.id, 'draft')}>Devolver</button><button className="primary-button" onClick={() => onReview(activity.id, 'published')}>✓ Aprobar</button></div></article>) : <div className="empty-state"><span>✓</span><h2>Buen trabajo, no hay propuestas pendientes.</h2><p>Las actividades nuevas aparecerán aquí antes de publicarse. Los borradores se retoman desde la tarjeta superior.</p></div>}</div></> }


function roomStatusLabel(status: RoomStatus): string {
  const labels: Record<RoomStatus, string> = { draft: 'Borrador', ready: 'Lista para iniciar', waiting: 'En espera', active: 'En curso', finished: 'Finalizada', archived: 'Archivada' }
  return labels[status]
}

function RoomsView({ rooms, activities, onCreate, onTransition, onDuplicate, onShare, onDelete, onHome }: { rooms: Room[]; activities: Activity[]; onCreate: (settings: RoomSettings) => void; onTransition: (id: string, status: RoomStatus) => void; onDuplicate: (room: Room) => void; onShare: (room: Room) => void; onDelete: (room: Room) => void; onHome: () => void }) {
  const [showBuilder, setShowBuilder] = useState(false)
  const publishedActivities = activities.filter((item) => item.status === 'published')
  return <>
    <PageIntro eyebrow="EXPERIENCIAS EN VIVO" title="Salas para tu grupo" description="Configura, abre y controla cada evaluación desde un solo lugar." action={<div className="room-create-actions"><button className="outline-button" onClick={() => setShowBuilder(true)}>⚙ Ajustes del examen</button><button className="primary-button" onClick={() => setShowBuilder(true)}>＋ Nueva sala</button></div>} onHome={onHome} />
    <div className="room-rules"><span>01</span><p><b>Lista para iniciar</b><br /><small>Revisa los ajustes antes de abrirla.</small></p><span>02</span><p><b>En espera</b><br /><small>Comparte el código y espera al grupo.</small></p><span>03</span><p><b>En curso</b><br /><small>Al iniciar, la sala queda bloqueada.</small></p></div>
    <div className="rooms-list">{rooms.map((room) => <article className={'room-card room-' + room.status} key={room.id}><div className="room-card-head"><div><span className={'room-status ' + room.status} /> {roomStatusLabel(room.status)}<h2>{room.name}</h2><p className="room-instructions">{room.instructions}</p></div><div className="room-code"><small>CÓDIGO DE ACCESO</small><b>{room.code}</b>{room.status !== 'archived' && room.status !== 'finished' && <button className="text-button" onClick={() => onShare(room)}>Copiar código</button>}</div></div><div className="room-card-meta"><span>⌘ {room.questionCount} preguntas</span><span>♧ Máx. {room.limit} estudiantes</span><span>◷ {room.time ? room.time + ' min' : 'Sin límite'}</span><span>◉ {room.scorePerQuestion} pts/pregunta</span></div><div className="room-activities">{room.activities.map((id, index) => { const activity = activities.find((item) => item.id === id); return <span key={id + '-' + index}><i>{index + 1}</i>{activity?.title ?? 'Actividad'}</span> })}</div><div className="room-card-actions">{room.status === 'ready' && <button className="primary-button" onClick={() => onTransition(room.id, 'waiting')}>Abrir sala</button>}{room.status === 'waiting' && <button className="primary-button" onClick={() => onTransition(room.id, 'active')}>▶ Iniciar evaluación</button>}{room.status === 'active' && <button className="primary-button" onClick={() => onTransition(room.id, 'finished')}>Finalizar evaluación</button>}{room.status === 'finished' && <><button className="outline-button" onClick={() => onDuplicate(room)}>Duplicar sala</button><button className="primary-button" onClick={() => onTransition(room.id, 'archived')}>Archivar sala</button></>}{room.status === 'archived' && <button className="outline-button" onClick={() => onDuplicate(room)}>Duplicar como nueva</button>}<button className="outline-button danger-button" onClick={() => onDelete(room)}>Eliminar sala</button></div></article>)}</div>
    {showBuilder && <RoomBuilder activities={publishedActivities} onCancel={() => setShowBuilder(false)} onSave={(settings) => { onCreate(settings); setShowBuilder(false) }} />}
  </>
}

function RoomBuilder({ activities, onCancel, onSave }: { activities: Activity[]; onCancel: () => void; onSave: (settings: RoomSettings) => void }) {
  const [name, setName] = useState('Nueva evaluación')
  const [instructions, setInstructions] = useState('Lee cada consigna y responde según el contenido trabajado.')
  const [activityIds, setActivityIds] = useState<string[]>(activities.slice(0, 1).map((item) => item.id))
  const [questionCount, setQuestionCount] = useState(5)
  const [limit, setLimit] = useState(30)
  const [time, setTime] = useState<number | null>(null)
  const [scorePerQuestion, setScorePerQuestion] = useState(10)
  const [shuffleQuestions, setShuffleQuestions] = useState(true)
  const [allowBack, setAllowBack] = useState(true)
  const [error, setError] = useState('')
  const selectedTypes = new Set(activityIds.map((id) => activities.find((item) => item.id === id)?.type).filter(Boolean))
  const toggleActivity = (id: string) => setActivityIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id])
  const reuseFeatured = () => setActivityIds(activities.filter((item) => item.status === 'published').slice(0, 3).map((item) => item.id))
  const save = () => {
    if (!name.trim()) return setError('Escribe un nombre para la evaluación.')
    if (!activityIds.length) return setError('Selecciona al menos una actividad.')
    if (selectedTypes.size > 3) return setError('Puedes combinar como máximo tres tipos diferentes.')
    setError('')
    onSave({ name: name.trim(), instructions: instructions.trim(), activityIds, questionCount: Math.max(1, questionCount), limit: Math.max(1, limit), time, scorePerQuestion: Math.max(0, scorePerQuestion), shuffleQuestions, allowBack })
  }
  return <div className="modal-backdrop"><div className="modal-card room-builder"><div className="modal-head"><div><p className="eyebrow">CONFIGURACIÓN DE EVALUACIÓN</p><h2>Prepara tu sala</h2><p className="modal-subtitle">Estos ajustes se definen antes de compartir el código.</p></div><button type="button" className="icon-button" onClick={onCancel}>×</button></div><div className="form-grid"><label>Nombre de la evaluación *<input value={name} onChange={(event) => setName(event.target.value)} /></label><label>Cantidad de estudiantes<input type="number" min="1" max="200" value={limit} onChange={(event) => setLimit(Number(event.target.value))} /></label></div><label>Instrucciones para estudiantes<textarea value={instructions} onChange={(event) => setInstructions(event.target.value)} rows={2} /></label><div className="form-grid"><label>Cantidad de preguntas<span className="field-hint">Las actividades seleccionadas se repiten si hace falta.</span><input type="number" min="1" max="50" value={questionCount} onChange={(event) => setQuestionCount(Number(event.target.value))} /></label><label>Puntaje por pregunta<input type="number" min="0" max="1000" value={scorePerQuestion} onChange={(event) => setScorePerQuestion(Number(event.target.value))} /></label></div><div className="form-grid"><label>Tiempo total<select value={time ?? ''} onChange={(event) => setTime(event.target.value ? Number(event.target.value) : null)}><option value="">Sin límite</option><option value="5">5 minutos</option><option value="10">10 minutos</option><option value="20">20 minutos</option><option value="30">30 minutos</option><option value="45">45 minutos</option></select></label><div className="settings-checks"><label className="check-row"><input type="checkbox" checked={shuffleQuestions} onChange={(event) => setShuffleQuestions(event.target.checked)} /> Mezclar preguntas</label><label className="check-row"><input type="checkbox" checked={allowBack} onChange={(event) => setAllowBack(event.target.checked)} /> Permitir volver atrás</label></div></div><section className="activity-selection"><div className="block-heading"><div><p className="eyebrow">BANCO DE PREGUNTAS</p><b>Elige las actividades que formarán la evaluación</b><small className="field-hint">Máximo tres tipos diferentes; puedes repetirlos hasta alcanzar la cantidad indicada.</small></div><div><button type="button" className="outline-button" onClick={reuseFeatured} disabled={!activities.length}>Reutilizar destacadas</button><span className="selection-count">{activityIds.length} seleccionadas</span></div></div>{activities.length ? <div className="activity-check-list">{activities.map((activity) => { const checked = activityIds.includes(activity.id); const typeCount = new Set([...selectedTypes, activity.type]).size; const disabled = !checked && typeCount > 3; return <label className={`activity-check ${checked ? 'selected' : ''} ${disabled ? 'disabled' : ''}`} key={activity.id}><input type="checkbox" checked={checked} disabled={disabled} onChange={() => toggleActivity(activity.id)} /><span className={`list-type type-${activity.type}`}>{types[activity.type].icon}</span><span><b>{activity.title}</b><small>{types[activity.type].label} · {activity.topic}</small></span></label> })}</div> : <div className="empty-state"><span>◈</span><h2>No hay actividades publicadas</h2><p>Crea o genera actividades desde una plantilla antes de preparar la sala.</p></div>}</section>{error && <div className="form-error">! {error}</div>}<div className="form-note">✓ Una sala iniciada ya no puede modificarse. El tiempo total, el límite, las preguntas y el puntaje quedan registrados para esta evaluación.</div><div className="modal-actions"><button type="button" className="outline-button" onClick={onCancel}>Cancelar</button><button type="button" className="primary-button" onClick={save}>Crear sala configurada</button></div></div></div>
}

function ResultsView({ attempts, rooms, onExport, onHome }: { attempts: StudentAttempt[]; rooms: Room[]; onExport: () => void; onHome: () => void }) {
  const [roomFilter, setRoomFilter] = useState('all')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const filtered = attempts.filter((attempt) => roomFilter === 'all' || attempt.roomId === roomFilter)
  const selected = filtered.find((attempt) => attempt.id === selectedId) ?? filtered[0]
  const answered = filtered.reduce((total, attempt) => total + attempt.answeredCount, 0)
  const questionTotal = filtered.reduce((total, attempt) => total + attempt.totalQuestions, 0)
  const score = filtered.reduce((total, attempt) => total + attempt.score, 0)
  const maxScore = filtered.reduce((total, attempt) => total + attempt.maxScore, 0)
  const participation = filtered.length ? Math.round((answered / Math.max(questionTotal, 1)) * 100) : 0
  const accuracy = answered ? Math.round((filtered.reduce((total, attempt) => total + attempt.correctCount, 0) / answered) * 100) : 0
  return <>
    <PageIntro eyebrow="DATOS PARA ACOMPAÑAR" title="Resultados privados" description="Revisa evidencias, respuestas, omisiones y tiempos sin exponer resultados frente al grupo." action={<div className="results-actions"><select value={roomFilter} onChange={(event) => { setRoomFilter(event.target.value); setSelectedId(null) }} aria-label="Filtrar por sala"><option value="all">Todas las salas</option>{rooms.map((room) => <option value={room.id} key={room.id}>{room.name}</option>)}</select><button className="primary-button" onClick={onExport}>↓ Exportar CSV / Excel</button></div>} onHome={onHome} />
    <div className="results-summary"><div><strong>{participation}%</strong><span>respuestas registradas</span></div><div><strong>{accuracy}%</strong><span>aciertos de respondidas</span></div><div><strong>{filtered.length}</strong><span>intentos registrados</span></div><div><strong>{maxScore ? `${score}/${maxScore}` : '—'}</strong><span>puntaje acumulado</span></div></div>
    <section className="panel results-panel"><div className="panel-heading"><div><h2>Intentos de estudiantes</h2><p>Selecciona un intento para ver el detalle por actividad.</p></div><span className="tag published">Privado</span></div>{filtered.length ? <div className="results-table-wrap"><table><thead><tr><th>Estudiante</th><th>Sala</th><th>Participación</th><th>Puntaje</th><th>Estado</th><th>Finalizó</th><th /></tr></thead><tbody>{filtered.map((attempt) => <tr key={attempt.id} className={selected?.id === attempt.id ? 'selected-result' : ''}><td><b>{attempt.studentName}</b><small>{attempt.roomCode}</small></td><td>{attempt.roomName}</td><td>{attempt.answeredCount}/{attempt.totalQuestions} respondidas<br /><small>{attempt.omittedCount} omitidas</small></td><td><b>{attempt.score}/{attempt.maxScore}</b><small>{attempt.correctCount} correctas</small></td><td><span className={`result-status ${attempt.status}`}>{attempt.status === 'timeout' ? 'Tiempo agotado' : 'Finalizada'}</span></td><td>{formatDate(attempt.finishedAt)}</td><td><button className="text-button" onClick={() => { setSelectedId(attempt.id); window.setTimeout(() => document.getElementById('result-detail')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0) }}>Ver detalle</button></td></tr>)}</tbody></table></div> : <div className="results-empty"><span>↗</span><h3>Aún no hay intentos registrados</h3><p>Cuando un estudiante termine una sala, sus respuestas aparecerán aquí. El registro se guarda localmente en esta versión demo.</p></div>}</section>
    {selected && <section id="result-detail" className="panel result-detail"><div className="panel-heading"><div><p className="eyebrow">DETALLE DEL INTENTO</p><h2>{selected.studentName} · {selected.roomName}</h2><p>{formatDate(selected.startedAt)} → {formatDate(selected.finishedAt)} · {selected.events.length} eventos registrados</p></div><div className="detail-score"><strong>{selected.score}/{selected.maxScore}</strong><small>{selected.correctCount} correctas · {selected.omittedCount} omitidas</small></div></div><div className="results-table-wrap"><table><thead><tr><th>#</th><th>Actividad</th><th>Estado</th><th>Respuesta</th><th>Resultado</th><th>Tiempo</th></tr></thead><tbody>{selected.answers.map((answer) => <tr key={`${selected.id}-${answer.index}`}><td>{answer.index + 1}</td><td><b>{answer.activityTitle}</b><small>{types[answer.activityType].label}</small></td><td>{answer.status === 'answered' ? 'Respondida' : 'Omitida'}</td><td>{answer.response || 'Sin respuesta'}</td><td>{answer.correct === null ? 'No evaluada' : answer.correct ? `Correcta · ${answer.score} pts` : 'Orientación enviada'}</td><td>{answer.timeSeconds}s</td></tr>)}</tbody></table></div><div className="event-strip">{selected.events.slice(-5).map((event, index) => <span key={`${event.at}-${index}`}><b>{event.type === 'answer_submitted' ? 'Respuesta' : event.type === 'omitted' ? 'Omisión' : event.type === 'navigated_back' ? 'Regreso' : event.type === 'timeout' ? 'Tiempo agotado' : event.type === 'finished' ? 'Cierre' : 'Ingreso'}</b>{formatDate(event.at)}</span>)}</div></section>}
    <div className="privacy-note">🔒 Privacidad activa · estos datos solo están disponibles para el docente y el administrador. El estudiante no ve su puntaje final.</div>
  </>
}


function formatDate(value: string): string { return new Intl.DateTimeFormat('es-BO', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value)) }
function auditEventLabel(type: string): string { return type === 'joined' ? 'Ingreso a la evaluación' : type === 'answer_submitted' ? 'Respuesta registrada' : type === 'omitted' ? 'Pregunta omitida' : type === 'navigated_back' ? 'Regreso a pregunta anterior' : type === 'timeout' ? 'Tiempo agotado' : type === 'finished' ? 'Intento finalizado' : type.replaceAll('_', ' ') }
function studentAttemptKey(roomId: string, name: string): string { return roomId + '::' + name.trim().toLowerCase() }
function sameAttemptIdentity(left: StudentAttempt, right: StudentAttempt): boolean {
  return left.studentName.trim().toLowerCase() === right.studentName.trim().toLowerCase() && (left.roomId === right.roomId || left.roomCode.trim().toUpperCase() === right.roomCode.trim().toUpperCase())
}
function hasStudentAttempt(roomId: string, name: string): boolean { return readStorage<string[]>('edueval-attempts', []).includes(studentAttemptKey(roomId, name)) }
function shuffleItems<T>(items: T[]): T[] { const result = [...items]; for (let index = result.length - 1; index > 0; index -= 1) { const target = Math.floor(Math.random() * (index + 1)); [result[index], result[target]] = [result[target], result[index]] } return result }

function StudentView({ room, roomCode, setRoomCode, studentName, setStudentName, onStart, onRefresh, onLeave }: { room: Room | null; roomCode: string; setRoomCode: (value: string) => void; studentName: string; setStudentName: (value: string) => void; onStart: () => void; onRefresh: () => void; onLeave: () => void }) {
  if (room?.status === 'waiting') return <div className="student-entry"><div className="student-orb">◷</div><p className="eyebrow">SALA ABIERTA</p><h1>Estás dentro.</h1><p>La sala <b>{room.name}</b> está esperando que el docente inicie la evaluación.</p><div className="entry-card waiting-card"><div className="waiting-code"><small>CÓDIGO</small><strong>{room.code}</strong></div><div className="waiting-state"><span className="waiting-pulse" /><div><b>Esperando al docente</b><small>Cuando comience, podrás responder las {room.questionCount} preguntas.</small></div></div><button className="primary-button wide" onClick={onRefresh}>Actualizar estado</button><button className="text-button wide" onClick={onLeave}>Cambiar de sala</button></div><div className="student-footer">EvaluEdu · tu participación es privada</div></div>
  return <div className="student-entry"><div className="student-orb">✦</div><p className="eyebrow">ENTRADA DE ESTUDIANTES</p><h1>Aprende haciendo.</h1><p>Entra a una sala con el código de tu docente. No necesitas crear una cuenta.</p><div className="entry-card"><label>Tu nombre<input value={studentName} onChange={(event) => setStudentName(event.target.value)} placeholder="¿Cómo te llamamos?" /></label><label>Código de sala<input value={roomCode} onChange={(event) => setRoomCode(event.target.value.toUpperCase())} placeholder="Ej. EDU-274" /></label><button className="primary-button wide" onClick={onStart}>Entrar a la sala →</button><small>Si la sala está abierta, quedarás esperando al docente. La evaluación comienza cuando él la inicia.</small></div><div className="student-footer">EvaluEdu · evaluación activa <span>•</span> Modo estudiante</div></div>
}

function StudentCompletion({ room, onLeave }: { room: Room | null; onLeave: () => void }) { return <div className="student-entry"><div className="student-orb completion-orb">✓</div><p className="eyebrow">PARTICIPACIÓN REGISTRADA</p><h1>Terminaste.</h1><p>Tu participación en <b>{room?.name ?? 'la evaluación'}</b> fue enviada al docente.</p><div className="entry-card completion-card"><div className="completion-line"><span>✓</span><div><b>Respuesta recibida</b><small>El docente podrá revisar tus evidencias y retroalimentación.</small></div></div><div className="privacy-note">🔒 El resultado final no se muestra en la vista del estudiante.</div><button className="outline-button wide" onClick={onLeave}>Salir de la sala</button></div><div className="student-footer">EvaluEdu · gracias por participar</div></div> }

function formatSeconds(seconds: number): string { return Math.floor(seconds / 60).toString().padStart(2, '0') + ':' + (seconds % 60).toString().padStart(2, '0') }

function PlayView({ activity, index, totalCount, allowBack, timeLimit, startedAt, savedResponse, submitted, onSubmit, onSkip, onPrevious, onTimeExpired, onNext }: { activity?: Activity; index: number; totalCount: number; allowBack: boolean; timeLimit: number | null; startedAt?: string; savedResponse?: ActivityResponse; submitted: boolean; onSubmit: (response: ActivityResponse) => void; onSkip: () => void; onPrevious: () => void; onTimeExpired: () => void; onNext: () => void }) {
  const item = activity
  const remainingSeconds = () => timeLimit ? Math.max(0, timeLimit * 60 - Math.floor((Date.now() - (startedAt ? Date.parse(startedAt) : Date.now())) / 1000)) : null
  const [secondsLeft, setSecondsLeft] = useState<number | null>(remainingSeconds)
  const [draftResponse, setDraftResponse] = useState<ActivityResponse>(() => item ? savedResponse ?? createInitialResponse(item) : { type: 'singleChoice', value: '' })
  useEffect(() => { if (item) setDraftResponse(savedResponse ?? createInitialResponse(item)) }, [item?.id, savedResponse])
  useEffect(() => { setSecondsLeft(remainingSeconds()) }, [timeLimit, startedAt])
  useEffect(() => { if (secondsLeft === null || submitted) return; const timer = window.setInterval(() => setSecondsLeft((current) => { if (current === null) return null; if (current <= 1) { onTimeExpired(); return 0 } return current - 1 }), 1000); return () => window.clearInterval(timer) }, [secondsLeft, submitted, onTimeExpired])
  if (!item) return <div className="empty-state"><h2>No hay actividades publicadas.</h2></div>
  const runtime = activityRuntime(item)
  const canSubmit = isResponseComplete(item, draftResponse)
  const changeSimple = (value: string) => setDraftResponse(item.type === 'trueFalse' ? { type: 'trueFalse', value } : { type: 'singleChoice', value })
  return <div className="play-wrap"><div className="play-top"><span>ACTIVIDAD {index + 1} DE {totalCount}</span><span>{secondsLeft === null ? 'Sin límite de tiempo' : 'Tiempo restante ' + formatSeconds(secondsLeft)}</span></div><div className="play-card"><div className={'activity-type type-' + item.type}><span>{types[item.type].icon}</span><small>{types[item.type].label}</small></div><h1>{item.title}</h1><p className="play-prompt">{item.type === 'trueFalse' ? runtime.trueFalse.statement : item.prompt}</p><div className={'answer-area answer-' + item.type}>{item.type === 'scenario' && draftResponse.type === 'scenario' ? <ScenarioQuestion runtime={runtime.scenario} response={draftResponse} disabled={submitted} onChange={(choices) => setDraftResponse({ type: 'scenario', choices })} /> : item.type === 'matching' && draftResponse.type === 'matching' ? <MatchingQuestion runtime={runtime.matching} response={draftResponse} disabled={submitted} onChange={(pairs) => setDraftResponse({ type: 'matching', pairs })} /> : item.type === 'sorting' && draftResponse.type === 'sorting' ? <SortingQuestion runtime={runtime.sorting} response={draftResponse} disabled={submitted} onChange={(assignments) => setDraftResponse({ type: 'sorting', assignments })} /> : item.type === 'ordering' && draftResponse.type === 'ordering' ? <OrderingQuestion steps={runtime.ordering.steps} response={draftResponse} disabled={submitted} onChange={(order) => setDraftResponse({ type: 'ordering', order })} /> : (item.type === 'trueFalse' ? ['Verdadero', 'Falso'] : runtime.singleChoice.options.map((option) => option.label)).map((option) => <button key={option} className={'answer-option ' + ((draftResponse.type === 'trueFalse' || draftResponse.type === 'singleChoice') && draftResponse.value === option ? 'chosen' : '')} onClick={() => !submitted && changeSimple(option)} disabled={submitted}><span className="option-mark">{(draftResponse.type === 'trueFalse' || draftResponse.type === 'singleChoice') && draftResponse.value === option ? '✓' : '○'}</span>{option}</button>)}</div>{submitted && <div className="feedback-box"><span>✦</span><div><b>Respuesta registrada.</b><p>{item.feedback}</p></div></div>}<div className="play-actions">{allowBack && index > 0 && <button className="outline-button" onClick={onPrevious}>← Anterior</button>}<div className="play-actions-right">{!submitted && <button className="outline-button" onClick={onSkip}>Omitir por ahora</button>}{submitted ? <button className="primary-button" onClick={onNext}>{index + 1 >= totalCount ? 'Finalizar evaluación →' : 'Siguiente actividad →'}</button> : <button className="primary-button" disabled={!canSubmit} onClick={() => onSubmit(draftResponse)}>Comprobar respuesta</button>}</div></div></div></div>
}
function ScenarioQuestion({ runtime, response, disabled, onChange }: { runtime: NonNullable<ActivityDetails['scenario']>; response: Extract<ActivityResponse, { type: 'scenario' }>; disabled: boolean; onChange: (choices: Record<string, string>) => void }) { return <div className="structured-question">{runtime.stages.map((stage) => <div className="scenario-stage" key={stage.id}><b>{stage.title}</b><p>{stage.prompt}</p><div className="answer-area">{stage.options.map((option) => <button key={option.id} className={'answer-option ' + (response.choices[stage.id] === option.text ? 'chosen' : '')} onClick={() => !disabled && onChange({ ...response.choices, [stage.id]: option.text })} disabled={disabled}><span className="option-mark">{response.choices[stage.id] === option.text ? '✓' : '○'}</span>{option.text}</button>)}</div></div>)}</div> }
function MatchingQuestion({ runtime, response, disabled, onChange }: { runtime: NonNullable<ActivityDetails['matching']>; response: Extract<ActivityResponse, { type: 'matching' }>; disabled: boolean; onChange: (pairs: Record<string, string>) => void }) { const options = runtime.pairs.map((pair) => pair.right); return <div className="structured-question">{runtime.pairs.map((pair) => <label className="structured-row" key={pair.id}><b>{pair.left}</b><select value={response.pairs[pair.left] ?? ''} disabled={disabled} onChange={(event) => onChange({ ...response.pairs, [pair.left]: event.target.value })}><option value="">Elige una relación</option>{options.map((option) => <option key={option} value={option}>{option}</option>)}</select></label>)}</div> }
function SortingQuestion({ runtime, response, disabled, onChange }: { runtime: NonNullable<ActivityDetails['sorting']>; response: Extract<ActivityResponse, { type: 'sorting' }>; disabled: boolean; onChange: (assignments: Record<string, string>) => void }) { const place = (itemId: string, category: string) => { if (!disabled) onChange({ ...response.assignments, [itemId]: category }) }; return <div className="structured-question"><p className="editor-help">Arrastra cada elemento a su categoría. También puedes usar el selector para facilitar el uso desde móvil.</p><div className="sorting-items">{runtime.items.filter((item) => !response.assignments[item.id]).map((item) => <div className="sorting-chip" key={item.id} draggable={!disabled} onDragStart={(event) => event.dataTransfer.setData('text/plain', item.id)}>{item.label}<span>⠿</span></div>)}</div><div className="sorting-categories">{runtime.categories.map((category) => <div className="sorting-drop" key={category} onDragOver={(event) => event.preventDefault()} onDrop={(event) => place(event.dataTransfer.getData('text/plain'), category)}><b>{category}</b>{runtime.items.filter((item) => response.assignments[item.id] === category).map((item) => <span key={item.id}>{item.label}</span>)}<small>Arrastra aquí</small></div>)}</div><div className="sorting-mobile-fallback">{runtime.items.map((item) => <label className="structured-row" key={`select-${item.id}`}><b>{item.label}</b><select value={response.assignments[item.id] ?? ''} disabled={disabled} onChange={(event) => place(item.id, event.target.value)}><option value="">Elige una categoría</option>{runtime.categories.map((category) => <option key={category} value={category}>{category}</option>)}</select></label>)}</div></div> }
function OrderingQuestion({ steps, response, disabled, onChange }: { steps: string[]; response: Extract<ActivityResponse, { type: 'ordering' }>; disabled: boolean; onChange: (order: string[]) => void }) { const move = (index: number, direction: -1 | 1) => { const target = index + direction; if (target < 0 || target >= response.order.length || disabled) return; const order = [...response.order]; [order[index], order[target]] = [order[target], order[index]]; onChange(order) }; return <div className="structured-question"><p className="editor-help">Ordena los pasos con las flechas.</p><div className="ordering-list">{response.order.map((item, index) => <div className="ordering-item" key={`${item}-${index}`}><div className="ordering-controls"><button type="button" onClick={() => move(index, -1)} disabled={disabled || index === 0} aria-label="Subir">↑</button><button type="button" onClick={() => move(index, 1)} disabled={disabled || index === response.order.length - 1} aria-label="Bajar">↓</button></div><b>{index + 1}</b><span>{item}</span></div>)}</div><small className="ordering-source">{steps.length} pasos en total</small></div> }

function readStorage<T>(key: string, fallback: T): T { try { const value = localStorage.getItem(key); return value ? JSON.parse(value) as T : fallback } catch { return fallback } }
function readSessionStorage(key: string): string | null { try { return sessionStorage.getItem(key) } catch { return null } }
function readSessionJson<T>(key: string): T | null { const value = readSessionStorage(key); if (!value) return null; try { return JSON.parse(value) as T } catch { return null } }

export default App
