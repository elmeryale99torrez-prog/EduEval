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
import { detectContentCompatibility, OFFICIAL_IMPORT_PROMPT, type ContentImportDocument, type ContentImportDocumentV1, type ContentImportResultV2, type ContentImportResultV1, type ActivityNeedingRepair, parseContentImport } from './lib/contentImport'
import { TRUE_FALSE_LIMITS, validateTrueFalseDefinition } from './lib/activities/trueFalse'
import { SINGLE_CHOICE_LIMITS, validateSingleChoiceDefinition } from './lib/activities/singleChoice'
import { MATCHING_LIMITS, scrambleRightOptions, validateMatchingDefinition } from './lib/activities/matching'
import { SORTING_LIMITS, scrambleSortingItems, validateSortingDefinition } from './lib/activities/sorting'
import { ORDERING_LIMITS, scrambleOrderingSteps, validateOrderingDefinition } from './lib/activities/ordering'
import { SCENARIO_LIMITS, validateScenarioDefinition } from './lib/activities/scenario'
import {
  IconSun, IconMoon, IconHome, IconContent, IconProposals, IconRooms,
  IconResults, IconUsers, IconAudit, IconTeacher, IconStudent, IconAdmin,
  IconArrowRight, IconHelp, IconTrueFalse, IconSingleChoice, IconMatching,
  IconSorting, IconOrdering, IconScenario, IconSparkMascot
} from './lib/icons'

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
type AttemptAnswer = { index: number; activityId: string; activityTitle: string; activityType: ActivityType; response: string; status: 'answered' | 'omitted'; correct: boolean | null; score: number; timeSeconds: number; hint?: string; explanation?: string }
type AttemptEvent = { type: 'joined' | 'answer_submitted' | 'omitted' | 'navigated_back' | 'finished' | 'timeout'; at: string; detail?: string }
type StudentAttempt = { id: string; roomId: string; roomName: string; roomCode: string; studentName: string; startedAt: string; finishedAt: string; status: 'completed' | 'timeout'; totalQuestions: number; answeredCount: number; omittedCount: number; correctCount: number; score: number; maxScore: number; answers: AttemptAnswer[]; events: AttemptEvent[] }
type StudentSessionSnapshot = { studentName: string; roomCode: string; room: Room; participantId: string; guestToken: string; questionIds: string[]; responses: Record<number, ActivityResponse>; answerTimes: Record<number, number>; startedAt: string; events: AttemptEvent[]; finished: boolean; playIndex: number; submitted: boolean }
type InstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> }

const studentSessionStorageKey = 'edueval-student-session'

const allowedPanelViews: Record<'teacher' | 'admin', View[]> = {
  teacher: ['overview', 'content', 'proposals', 'rooms', 'results'],
  admin: ['overview', 'adminUsers', 'rooms', 'adminAudit', 'results'],
}

const types: Record<ActivityType, { label: string; icon: React.ReactNode; description: string }> = {
  trueFalse: { label: 'Falso / verdadero', icon: <IconTrueFalse size={18} />, description: 'Comprueba una afirmación en un clic.' },
  singleChoice: { label: 'Selección múltiple', icon: <IconSingleChoice size={18} />, description: 'Una sola opción es correcta.' },
  matching: { label: 'Asociación', icon: <IconMatching size={18} />, description: 'Relaciona conceptos y definiciones.' },
  sorting: { label: 'Clasificación', icon: <IconSorting size={18} />, description: 'Arrastra elementos a su categoría.' },
  ordering: { label: 'Ordenamiento', icon: <IconOrdering size={18} />, description: 'Ordena los pasos de un proceso.' },
  scenario: { label: 'Escenario de decisiones', icon: <IconScenario size={18} />, description: 'Elige una respuesta ante una situación real.' },
}

const initialActivities: Activity[] = [
  { id: 'a2', title: 'Recursos compartidos', type: 'trueFalse', topic: 'Sostenibilidad', difficulty: 'Inicial', prompt: 'Reutilizar materiales reduce la cantidad de residuos.', options: ['Verdadero', 'Falso'], answer: 'Verdadero', feedback: 'Considera qué ocurre con el ciclo de vida de un material cuando vuelve a utilizarse antes de desecharse.', details: { trueFalse: { context: 'En un laboratorio escolar se reutilizan los envases de vidrio limpios para almacenar soluciones durante todo el semestre.', statement: 'Reutilizar materiales reduce la cantidad de residuos que llegan al vertedero.', correct: true, hint: 'Considera qué ocurre con el ciclo de vida de un material cuando vuelve a utilizarse antes de desecharse.', explanation: 'La reutilización prolonga la vida útil del envase y evita generar un residuo de un solo uso en cada práctica.' } }, status: 'published' },
  { id: 'a6', title: 'Una acción sostenible', type: 'singleChoice', topic: 'Sostenibilidad', difficulty: 'Inicial', prompt: '¿Cuál acción disminuye directamente el desperdicio de agua potable en el hogar?', options: ['Cerrar el grifo mientras te cepillas', 'Dejar correr el agua', 'Usar agua potable para limpiar la acera'], answer: 'Cerrar el grifo mientras te cepillas', feedback: 'Analiza en cuál de las acciones se interrumpe el flujo de agua mientras no se está utilizando.', details: { singleChoice: { context: 'En una vivienda urbana se busca reducir el consumo diario de agua potable sin afectar la higiene personal.', hint: 'Analiza en cuál de las acciones se interrumpe el flujo de agua mientras no se está utilizando.', explanation: 'Cerrar el grifo durante el cepillado evita que varios litros de agua potable se pierdan por minuto sin uso efectivo.', options: [{ id: 'a6-opt-1', label: 'Cerrar el grifo mientras te cepillas', correct: true }, { id: 'a6-opt-2', label: 'Dejar correr el agua', correct: false }, { id: 'a6-opt-3', label: 'Usar agua potable para limpiar la acera', correct: false }] } }, status: 'published' },
  { id: 'a3', title: 'Mapa de actores', type: 'matching', topic: 'Participación', difficulty: 'Intermedio', prompt: 'Enlaza cada actor con su responsabilidad dentro del proyecto.', options: ['Estudiante → propone ideas', 'Docente → facilita el proceso', 'Comunidad → aporta contexto'], answer: ['Estudiante → propone ideas', 'Docente → facilita el proceso', 'Comunidad → aporta contexto'], feedback: 'Observa qué función desempeña directamente cada actor según su ámbito de participación.', details: { matching: { context: 'En un proyecto de convivencia escolar intervienen tres actores con responsabilidades complementarias.', hint: 'Observa qué función desempeña directamente cada actor según su ámbito de participación.', explanation: 'El estudiante aporta iniciativas desde su vivencia en el aula, el docente guía metodológicamente el proceso y la comunidad contextualiza el entorno.', pairs: [{ id: 'a3-p1', left: 'Estudiante', right: 'propone ideas' }, { id: 'a3-p2', left: 'Docente', right: 'facilita el proceso' }, { id: 'a3-p3', left: 'Comunidad', right: 'aporta contexto' }] } }, status: 'published' },
  { id: 'a4', title: '¿Dónde va cada residuo?', type: 'sorting', topic: 'Sostenibilidad', difficulty: 'Inicial', prompt: 'Clasifica cada elemento en la categoría correcta.', options: ['Botella de vidrio', 'Cáscara de fruta', 'Papel limpio', 'Pila usada'], answer: ['Reciclable', 'Orgánico', 'Reciclable', 'Peligroso'], feedback: 'Identifica si el material puede reincorporarse a un ciclo industrial, compostarse o si contiene compuestos tóxicos.', details: { sorting: { context: 'En el punto ecológico del colegio se separan los residuos según su tratamiento posterior y nivel de riesgo.', categories: ['Reciclable', 'Orgánico', 'Peligroso'], items: [{ id: 'a4-i1', label: 'Botella de vidrio', category: 'Reciclable' }, { id: 'a4-i2', label: 'Cáscara de fruta', category: 'Orgánico' }, { id: 'a4-i3', label: 'Papel limpio', category: 'Reciclable' }, { id: 'a4-i4', label: 'Pila usada', category: 'Peligroso' }], hint: 'Identifica si el material puede reincorporarse a un ciclo industrial, compostarse o si contiene compuestos tóxicos.', explanation: 'El vidrio y el papel limpio son reciclables; los restos de fruta son biodegradables (orgánicos); las pilas contienen metales pesados peligrosos.' } }, status: 'published' },
  { id: 'a5', title: 'Pasos para dialogar', type: 'ordering', topic: 'Convivencia', difficulty: 'Intermedio', prompt: 'Ordena el proceso para resolver un desacuerdo.', options: ['Reconocer el problema', 'Escuchar', 'Proponer alternativas', 'Acordar un siguiente paso'], answer: ['Reconocer el problema', 'Escuchar', 'Proponer alternativas', 'Acordar un siguiente paso'], feedback: 'Nombrar el problema y escuchar son la base previa para acordar alternativas viables.', details: { ordering: { context: 'En una asamblea escolar surge un desacuerdo respecto al uso de las áreas deportivas compartidas.', steps: ['Reconocer el problema', 'Escuchar', 'Proponer alternativas', 'Acordar un siguiente paso'], hint: 'Nombrar el problema y escuchar son la base previa para acordar alternativas viables.', explanation: 'Primero se define el conflicto y se escucha a las partes; solo después se diseñan y pactan soluciones compartidas.' } }, status: 'published' },
  { id: 'a1', title: 'Decidir con empatía', type: 'scenario', topic: 'Convivencia', difficulty: 'Inicial', prompt: 'Tu equipo no está de acuerdo. ¿Qué haces primero?', options: ['Escuchar las razones de cada persona', 'Imponer la decisión más rápida', 'Dejar que el conflicto crezca'], answer: 'Escuchar las razones de cada persona', feedback: 'Escuchar y acordar criterios comunes genera cohesión y avance real.', details: { scenario: { situation: 'En la semana previa a la feria de ciencias, dos integrantes del equipo proponen enfoques contradictorios y los plazos de entrega se acortan.', stages: [{ id: 'a1-s1', title: 'Apertura del diálogo', prompt: '¿Cuál es el primer paso para desbloquear el trabajo del grupo?', options: [{ id: 'a1-opt-1', text: 'Escuchar las razones de cada persona y acordar criterios comunes', consequence: 'El equipo encuentra puntos de coincidencia y retoma la planificación sin fricciones.', feedback: 'Excelente decisión: la escucha activa y la búsqueda de acuerdos construyen confianza.', recommended: true }, { id: 'a1-opt-2', text: 'Imponer la decisión más rápida para no perder tiempo', consequence: 'Parte del equipo pierde motivación y la calidad del trabajo se resiente.', feedback: 'La imposición apresurada suele generar desapego y fragmenta el grupo.', recommended: false }, { id: 'a1-opt-3', text: 'Dejar que el conflicto se resuelva solo con el paso de los días', consequence: 'La tensión aumenta y se incumple la fecha de entrega asignada.', feedback: 'Evadir el conflicto no lo soluciona y perjudica a todo el colectivo.', recommended: false }] }], hint: 'Elige una alternativa que promueva el diálogo constructivo y el entendimiento mutuo antes de ejecutar.', explanation: 'El liderazgo compartido se sostiene en la empatía y la clarificación de acuerdos compartidos.' } }, status: 'published' },
]

const initialRooms: Room[] = [{ id: 'r1', name: 'Diagnóstico 1 · Convivencia', instructions: 'Responde con calma y revisa tu razonamiento.', activityIds: ['a2', 'a6', 'a1'], questionCount: 3, limit: 24, time: null, scorePerQuestion: 10, shuffleQuestions: false, allowBack: true, code: 'ECO-274', activities: ['a2', 'a6', 'a1'], status: 'active', createdAt: '2026-10-20T08:00:00.000Z', startedAt: '2026-10-20T08:15:00.000Z' }]

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
const FEEDBACK_EMAIL = 'elmeryaletorrez@gmail.com'

function authRedirectUrl(role: Role, flow: 'recovery' | 'invite' = 'recovery') {
  const url = new URL(`${publicAppOrigin}/`)
  url.searchParams.set('panel', role)
  if (flow === 'invite') url.searchParams.set('type', 'invite')
  return url.toString()
}

function App() {
  const initialRole = roleFromUrl()
  const [role, setRole] = useState<Role>(() => initialRole ?? 'teacher')
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const saved = readStorage<'light' | 'dark' | null>('evaluedu-theme', null)
    if (saved === 'light' || saved === 'dark') return saved
    return typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  })
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    try { localStorage.setItem('evaluedu-theme', JSON.stringify(theme)) } catch {}
  }, [theme])
  const toggleTheme = () => setTheme((current) => current === 'light' ? 'dark' : 'light')
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
  const [showHelpModal, setShowHelpModal] = useState(false)
  const [showFeedbackModal, setShowFeedbackModal] = useState(false)
  const [currentDate, setCurrentDate] = useState(() => new Date())
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [editingActivity, setEditingActivity] = useState<Activity | null>(null)
  const [preselectedRoomActivityIds, setPreselectedRoomActivityIds] = useState<string[] | null>(null)

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
    if (!authProfile) setAuthProfileChecked(false)
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
      if (editingActivity) { setEditingActivity(null); keepAppHistory(); return }
      if (selectedActivity) { setSelectedActivity(null); keepAppHistory(); return }
      if (showPasswordChange) { setShowPasswordChange(false); keepAppHistory(); return }
      if (showHelpModal) { setShowHelpModal(false); keepAppHistory(); return }
      if (showFeedbackModal) { setShowFeedbackModal(false); keepAppHistory(); return }
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

  const updateTemplate = async (template: EvaluationTemplate) => {
    setTemplates((current) => current.map((item) => (item.id === template.id ? template : item)))
    if (supabase && isCloudId(template.id)) {
      await supabase.from('evaluation_templates').update({
        title: template.title,
        subject: template.subject,
        description: template.description,
        objective: template.objective,
        competency: template.competency,
        status: template.status,
      }).eq('id', template.id)
    }
    notify(`Plantilla "${template.title}" actualizada.`)
  }

  const deleteTemplate = async (template: EvaluationTemplate) => {
    if (!window.confirm(`¿Eliminar la plantilla "${template.title || 'Sin título'}"? Esta acción borrará el tema y sus actividades asociadas para mantener tu biblioteca limpia.`)) {
      return
    }
    setTemplates((current) => current.filter((item) => item.id !== template.id))
    setActivities((current) => current.filter((item) => item.templateId !== template.id))
    if (supabase && isCloudId(template.id)) {
      await supabase.from('evaluation_templates').delete().eq('id', template.id)
    }
    notify(`Plantilla "${template.title}" y sus actividades asociadas fueron eliminadas.`)
  }

  const deleteAttempt = async (attemptId: string) => {
    const attempt = attempts.find((a) => a.id === attemptId)
    setAttempts((current) => current.filter((item) => item.id !== attemptId))
    if (attempt) {
      const key = studentAttemptKey(attempt.roomId, attempt.studentName)
      const storedKeys = readStorage<string[]>('edueval-attempts', [])
      localStorage.setItem('edueval-attempts', JSON.stringify(storedKeys.filter((k) => k !== key)))
    }
    if (supabase && isCloudId(attemptId)) {
      await supabase.from('attempts').delete().eq('id', attemptId)
    }
    notify('Intento eliminado de los resultados.')
  }

  const clearAttempts = async (roomId?: string) => {
    if (roomId && roomId !== 'all') {
      const toRemove = attempts.filter((a) => a.roomId === roomId)
      setAttempts((current) => current.filter((a) => a.roomId !== roomId))
      const removeKeys = new Set(toRemove.map((a) => studentAttemptKey(a.roomId, a.studentName)))
      const storedKeys = readStorage<string[]>('edueval-attempts', [])
      localStorage.setItem('edueval-attempts', JSON.stringify(storedKeys.filter((k) => !removeKeys.has(k))))
      if (supabase) {
        for (const a of toRemove) {
          if (isCloudId(a.id)) {
            void supabase.from('attempts').delete().eq('id', a.id)
          }
        }
      }
      notify(`Se eliminaron ${toRemove.length} intento(s) de esta sala.`)
    } else {
      setAttempts([])
      localStorage.setItem('edueval-attempts', JSON.stringify([]))
      if (supabase) {
        for (const a of attempts) {
          if (isCloudId(a.id)) {
            void supabase.from('attempts').delete().eq('id', a.id)
          }
        }
      }
      notify('Todos los resultados fueron eliminados.')
    }
  }
  const importContent = (importPayload: ImportPayload) => {
    const stamp = Date.now()
    if ('version' in importPayload && importPayload.version === 2) {
      const savedTemplate: EvaluationTemplate = {
        id: `t${stamp}`,
        title: importPayload.topic.title,
        subject: importPayload.topic.subject,
        description: importPayload.topic.summary,
        objective: importPayload.topic.objective,
        competency: importPayload.topic.competency,
        difficulty: 'Intermedio',
        concepts: [],
        situations: [],
        processSteps: [],
        categories: [],
        status: 'accepted',
        updatedAt: new Date().toISOString(),
        source: 'json',
        schemaVersion: 2,
      }
      const importedActivities: Activity[] = importPayload.validActivities.map((activity, index) => ({
        ...activity,
        id: activity.id || `a${stamp}-import-${index}`,
        templateId: savedTemplate.id,
        status: 'pending' as const,
      }))

      const repairActivities: Activity[] = (importPayload.activitiesNeedingRepair as ActivityNeedingRepair[]).map((item, index) => {
        const base = item.partialActivity || {}
        return {
          id: base.id || `a${stamp}-repair-${index}`,
          templateId: savedTemplate.id,
          title: item.title || `${savedTemplate.title} · ${types[item.type]?.label || item.type}`,
          type: item.type,
          topic: savedTemplate.subject,
          difficulty: 'Intermedio' as const,
          prompt: item.prompt || 'Consigna por revisar',
          options: base.options || [],
          answer: base.answer || '',
          feedback: base.feedback || '',
          details: base.details,
          status: 'pending' as const,
          needsRepair: true,
          repairReason: item.reason,
          rawImport: item.raw,
        }
      })

      const allActivities = [...importedActivities, ...repairActivities]
      setTemplates((current) => [savedTemplate, ...current])
      setActivities((current) => [...allActivities, ...current])
      void persistCloudTemplate(savedTemplate, allActivities)
      const repairCount = repairActivities.length
      const repairNotice = repairCount > 0 ? ` (${repairCount} con observaciones para revisar o corregir en el editor)` : ''
      notify(allActivities.length ? `JSON v2 válido: ${allActivities.length} propuesta${allActivities.length === 1 ? '' : 's'} creada${allActivities.length === 1 ? '' : 's'} para revisión${repairNotice}.` : 'JSON v2 válido, pero no contiene actividades.')
      show('proposals')
      return
    }

    const docV1 = importPayload as ContentImportDocumentV1
    const savedTemplate: EvaluationTemplate = {
      id: `t${stamp}`,
      title: docV1.content.title,
      subject: docV1.content.subject,
      description: docV1.content.description,
      objective: docV1.content.objective,
      competency: docV1.content.competency,
      difficulty: docV1.content.difficulty,
      concepts: docV1.content.concepts.map((concept, index) => ({ ...concept, id: `c-import-${stamp}-${index}`, example: concept.example ?? '' })),
      situations: docV1.content.situations.map((situation, index) => ({ ...situation, id: `s-import-${stamp}-${index}` })),
      processSteps: docV1.content.processSteps,
      categories: docV1.content.categories,
      status: 'accepted',
      updatedAt: new Date().toISOString(),
      source: 'json',
      schemaVersion: docV1.version,
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

  const reviewBatch = (ids: string[], status: 'published' | 'draft') => {
    if (!ids.length) return
    const idSet = new Set(ids)
    setActivities((current) => current.map((item) => idSet.has(item.id) ? { ...item, status } : item))
    if (supabase && authProfile) {
      const client = supabase
      ids.filter(isCloudId).forEach((id) => {
        void client.from('activities').update({ status }).eq('id', id).eq('owner_id', authProfile.id)
      })
    }
    notify(status === 'published' ? `${ids.length} propuesta${ids.length === 1 ? '' : 's'} aprobada${ids.length === 1 ? '' : 's'} y publicada${ids.length === 1 ? '' : 's'}.` : `${ids.length} propuesta${ids.length === 1 ? '' : 's'} devuelta${ids.length === 1 ? '' : 's'} a borradores.`)
  }

  const createRoomFromProposals = (activityIds: string[]) => {
    if (!activityIds.length) return
    const idSet = new Set(activityIds)
    setActivities((current) => current.map((act) => idSet.has(act.id) && act.status === 'pending' ? { ...act, status: 'published' as const } : act))
    setPreselectedRoomActivityIds(activityIds)
    show('rooms')
    notify(`Se preparó la sala con ${activityIds.length} actividad${activityIds.length === 1 ? '' : 'es'}. Configura los ajustes de la evaluación.`)
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
        if (synced) {
          setSyncQueue(removeSyncItem(item.id))
        } else {
          if (item.attempts >= 2) {
            setSyncQueue(removeSyncItem(item.id))
          } else {
            setSyncQueue(markSyncItemFailed(item.id, 'No se pudo completar la sincronización.'))
          }
        }
      }
    } finally {
      setSyncing(false)
    }
  }

  useEffect(() => {
    if (!isOnline || !authSession || !authProfile || syncQueue.length === 0 || syncing) return
    void flushSyncQueue()
  }, [isOnline, authSession, authProfile])

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
      const activityMeta = activity?.type === 'trueFalse'
        ? { hint: evaluated.status === 'answered' ? (activity.details?.trueFalse?.hint ?? activity.feedback) : '', explanation: activity.details?.trueFalse?.explanation ?? '' }
        : activity?.type === 'singleChoice'
          ? { hint: evaluated.status === 'answered' ? (activity.details?.singleChoice?.hint ?? activity.feedback) : '', explanation: activity.details?.singleChoice?.explanation ?? '' }
          : activity?.type === 'matching'
            ? { hint: evaluated.status === 'answered' ? (activity.details?.matching?.hint ?? activity.feedback) : '', explanation: activity.details?.matching?.explanation ?? '' }
            : activity?.type === 'sorting'
              ? { hint: evaluated.status === 'answered' ? (activity.details?.sorting?.hint ?? activity.feedback) : '', explanation: activity.details?.sorting?.explanation ?? '' }
              : activity?.type === 'ordering'
                ? { hint: evaluated.status === 'answered' ? (activity.details?.ordering?.hint ?? activity.feedback) : '', explanation: activity.details?.ordering?.explanation ?? '' }
                : activity?.type === 'scenario'
                  ? { hint: evaluated.status === 'answered' ? (activity.details?.scenario?.hint ?? activity.feedback) : '', explanation: activity.details?.scenario?.explanation ?? '' }
                  : {}
      return { index, activityId, activityTitle: activity?.title ?? 'Actividad eliminada', activityType: activity?.type ?? 'singleChoice', ...evaluated, ...activityMeta, timeSeconds: studentAnswerTimes[index] ?? 0 }
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
  const exportCsv = (roomIdFilter?: string) => {
    const attemptsToExport = roomIdFilter && roomIdFilter !== 'all'
      ? displayedAttempts.filter((a) => a.roomId === roomIdFilter)
      : displayedAttempts
    const rows = [['intento_id', 'estudiante', 'sala', 'codigo_sala', 'estado', 'inicio', 'finalizacion', 'preguntas', 'respondidas', 'omitidas', 'correctas', 'puntaje', 'puntaje_maximo', 'actividad', 'tipo_actividad', 'estado_respuesta', 'respuesta', 'correcta', 'puntaje_respuesta', 'pista_entregada', 'explicacion_privada', 'tiempo_segundos']]
    attemptsToExport.forEach((attempt) => attempt.answers.forEach((answer) => rows.push([attempt.id, attempt.studentName, attempt.roomName, attempt.roomCode, attempt.status === 'timeout' ? 'tiempo_agotado' : 'finalizada', attempt.startedAt, attempt.finishedAt, String(attempt.totalQuestions), String(attempt.answeredCount), String(attempt.omittedCount), String(attempt.correctCount), String(attempt.score), String(attempt.maxScore), answer.activityTitle, types[answer.activityType].label, answer.status === 'answered' ? 'respondida' : 'omitida', answer.response || 'Sin respuesta', answer.correct === null ? 'no evaluada' : answer.correct ? 'si' : 'no', String(answer.score), answer.hint ?? '', answer.explanation ?? '', String(answer.timeSeconds)])))
    if (rows.length === 1) rows.push(['', 'Sin intentos registrados', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', ''])
    const csv = rows.map((row) => row.map((cell) => `"${cell.replaceAll('"', '""')}"`).join(';')).join('\n')
    const fileName = roomIdFilter && roomIdFilter !== 'all'
      ? `evaluedu-resultados-${attemptsToExport[0]?.roomCode || 'sala'}.csv`
      : 'evaluedu-resultados.csv'
    const link = document.createElement('a'); link.href = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' })); link.download = fileName; link.click(); URL.revokeObjectURL(link.href)
    notify(`${attemptsToExport.length} intento${attemptsToExport.length === 1 ? '' : 's'} exportado${attemptsToExport.length === 1 ? '' : 's'} para abrir en Excel.`)
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
  if (isSupabaseConfigured && authSession && !authProfileChecked && !authProfile) return <AuthLoading />
  if (isSupabaseConfigured && inviteFlow && !authSession) return <InviteLinkErrorScreen onBack={() => { clearInviteUrl(); setInviteFlow(false) }} />
  if (isSupabaseConfigured && inviteFlow && authSession && authProfileError) return <ProfileVerificationErrorScreen email={authSession.user.email ?? ''} error={authProfileError} onBack={cancelInvite} />
  if (isSupabaseConfigured && inviteFlow && authSession && authProfile) return <InviteAcceptanceScreen email={authSession.user.email ?? ''} onComplete={completeInvite} onCancel={cancelInvite} />
  if (isSupabaseConfigured && inviteFlow && authSession && authProfileChecked && !authProfile) return <ProfileUnavailableScreen email={authSession.user.email ?? ''} onBack={cancelInvite} />
  if (isSupabaseConfigured && hasChosenRole && role !== 'student' && !authSession) return <AuthScreen role={role} onBack={() => setHasChosenRole(false)} />
  if (isSupabaseConfigured && hasChosenRole && role !== 'student' && authSession && authProfileError) return <ProfileVerificationErrorScreen email={authSession.user.email ?? ''} error={authProfileError} onBack={signOut} />
  if (isSupabaseConfigured && hasChosenRole && role !== 'student' && authSession && authProfile && !canAccessPanel(authProfile, role)) return <RoleMismatchScreen selectedRole={role} actualRole={authProfile.role} onUseActualRole={() => { setRole(authProfile.role); show('overview') }} onBack={signOut} />
  if (isSupabaseConfigured && hasChosenRole && role === 'teacher' && authSession && !authProfile) return <ProfileSetupScreen user={authSession.user} onBack={signOut} onCreated={setAuthProfile} />
  if (isSupabaseConfigured && hasChosenRole && role === 'admin' && authSession && !authProfile) return <ProfileUnavailableScreen email={authSession.user.email ?? ''} onBack={signOut} />
  return !hasChosenRole ? (
    <RoleLanding
      onChoose={changeRole}
      theme={theme}
      onToggleTheme={toggleTheme}
      canInstall={Boolean(installPrompt)}
      onInstall={() => void installApp()}
    />
  ) : <div className="app-shell">
    <header className="topbar">
      <button className="brand" onClick={() => show('overview')} aria-label="Ir al inicio"><span className="brand-mark mascot-mark"><IconSparkMascot size={22} /></span><span><strong>EvaluEdu</strong><small>aprendizaje activo</small></span></button>
       <div className="topbar-actions"><span className={`connection-pill ${!isOnline ? 'offline' : 'ready'}`} title={lastSyncedAt ? `Última sincronización: ${formatDate(lastSyncedAt)}` : undefined}><i />{!isOnline ? 'Sin conexión' : backendReady ? 'En línea' : 'Modo local'}</span>{installPrompt && <button className="install-button" type="button" onClick={() => void installApp()}>＋ Instalar app</button>}<button className="theme-toggle-btn" type="button" onClick={toggleTheme} aria-label={theme === 'light' ? 'Cambiar a modo noche' : 'Cambiar a modo día'} title={theme === 'light' ? 'Modo día activo (pulsa para activar modo noche)' : 'Modo noche activo (pulsa para activar modo día)'}><span className="theme-toggle-icon">{theme === 'light' ? <IconSun size={19} /> : <IconMoon size={19} />}</span></button></div>
    </header>
    {role !== 'student' && mobileNavOpen && <button className="mobile-nav-backdrop" type="button" aria-label="Cerrar navegación" onClick={() => setMobileNavOpen(false)} />}
    <div className="layout">
      {role !== 'student' && <aside className={`sidebar${mobileNavOpen ? ' mobile-open' : ''}`}><div className="role-label"><span className="role-icon">{role === 'admin' ? <IconAdmin size={18} /> : <IconTeacher size={18} />}</span><div><b>{role === 'admin' ? 'Administración' : 'Panel docente'}</b><small title={authSession?.user.email ?? undefined}>{authSession?.user.email ?? (role === 'admin' ? 'Sesión administrativa' : 'Sesión docente')}</small></div></div><nav>{role === 'admin' ? <><NavButton active={panelView === 'overview'} icon={<IconHome size={18} />} label="Resumen general" onClick={() => show('overview')} /><NavButton active={panelView === 'adminUsers'} icon={<IconUsers size={18} />} label="Usuarios" onClick={() => show('adminUsers')} /><NavButton active={panelView === 'rooms'} icon={<IconRooms size={18} />} label="Salas globales" onClick={() => show('rooms')} /><NavButton active={panelView === 'adminAudit'} icon={<IconAudit size={18} />} label="Auditoría" onClick={() => show('adminAudit')} /><NavButton active={panelView === 'results'} icon={<IconResults size={18} />} label="Resultados" onClick={() => show('results')} /></> : <><NavButton active={panelView === 'overview'} icon={<IconHome size={18} />} label="Inicio" onClick={() => show('overview')} /><NavButton active={panelView === 'content'} icon={<IconContent size={18} />} label="Contenido" onClick={() => show('content')} /><NavButton active={panelView === 'proposals'} icon={<IconProposals size={18} />} label="Propuestas" badge={pending.length} onClick={() => show('proposals')} /><NavButton active={panelView === 'rooms'} icon={<IconRooms size={18} />} label="Salas" onClick={() => show('rooms')} /><NavButton active={panelView === 'results'} icon={<IconResults size={18} />} label="Resultados" onClick={() => show('results')} /></>}</nav><div className="sidebar-footer"><button type="button" className="help-card" onClick={() => { setMobileNavOpen(false); setShowHelpModal(true) }}><span><IconHelp size={16} /></span><p><b>¿Necesitas ayuda?</b><br />Ver la guía rápida de EvaluEdu.</p></button>{role === 'teacher' && <button type="button" className="sidebar-feedback-button" onClick={() => { setMobileNavOpen(false); setShowFeedbackModal(true) }}><span>✎</span>Escribir sugerencia</button>}{authSession && <div className="sidebar-account-actions" aria-label="Opciones de cuenta">{!authSession.user.is_anonymous && <button type="button" className="sidebar-account-button" onClick={() => { setMobileNavOpen(false); setShowPasswordChange(true) }}><span>🔑</span>Cambiar contraseña</button>}<button type="button" className="sidebar-account-button danger" onClick={() => { setMobileNavOpen(false); void signOut() }}><span>↪</span>Cerrar sesión</button></div>}<small>EvaluEdu · v1.2</small></div></aside>}
      <main className="main-content">{role !== 'student' && <div className="panel-toolbar"><button className="mobile-nav-toggle" type="button" aria-label="Abrir navegación" aria-expanded={mobileNavOpen} onClick={() => setMobileNavOpen((current) => !current)}>{mobileNavOpen ? '×' : '☰'} <span>Navegación</span></button><details className="panel-window-menu"><summary>↗ Abrir panel</summary><div>{canAccessPanel(authProfile, 'teacher') && <a href={panelUrl('teacher')} target="_blank" rel="noopener noreferrer">Docente</a>}<a href={panelUrl('student')} target="_blank" rel="noopener noreferrer">Estudiante</a>{canAccessPanel(authProfile, 'admin') && <a href={panelUrl('admin')} target="_blank" rel="noopener noreferrer">Administración</a>}</div></details></div>}{role === 'student' && panelView !== 'play' ? studentFinished ? <StudentCompletion room={studentRoom} onLeave={leaveStudentSession} /> : <StudentView room={studentRoom} roomCode={roomCode} setRoomCode={setRoomCode} studentName={studentName} setStudentName={setStudentName} onStart={joinRoom} onRefresh={refreshStudentRoom} onLeave={leaveStudentSession} /> : role === 'admin' && panelView === 'overview' ? <AdminDashboard activities={activities} rooms={rooms} templates={templates} attempts={displayedAttempts} adminData={adminSnapshot} onNavigate={show} /> : role === 'admin' && panelView === 'adminUsers' ? <AdminUsersView attempts={displayedAttempts} profile={authProfile} adminData={adminSnapshot} onRefresh={() => loadAdminSnapshot(false)} onHome={() => show('overview')} /> : role === 'admin' && panelView === 'adminAudit' ? <AdminAuditView attempts={displayedAttempts} rooms={rooms} adminData={adminSnapshot} onHome={() => show('overview')} /> : role === 'admin' && panelView === 'rooms' ? <AdminRoomsView rooms={rooms} activities={activities} adminData={adminSnapshot} onHome={() => show('overview')} /> : panelView === 'overview' ? <Overview activities={published} rooms={rooms} pending={pending} templates={templates} attempts={displayedAttempts} onNavigate={show} onSelect={setSelectedActivity} firstName={firstName} todayLabel={todayLabel} /> : panelView === 'content' ? <ContentView templates={templates} activities={activities} onCreateTemplate={createTemplate} onUpdateTemplate={updateTemplate} onDeleteTemplate={deleteTemplate} onCreate={createActivity} onImport={importContent} onSelect={setSelectedActivity} onCreateRoom={(activityIds) => { setPreselectedRoomActivityIds(activityIds); show('rooms') }} onNavigateToProposals={() => show('proposals')} onHome={() => show('overview')} /> : panelView === 'proposals' ? <ProposalsView activities={pending} hasDraft={hasTemplateDraft} onReview={reviewActivity} onReviewBatch={reviewBatch} onEditActivity={(act) => setEditingActivity(act)} onCreateRoomFromProposals={createRoomFromProposals} onContinueDraft={() => show('content')} onHome={() => show('overview')} /> : panelView === 'rooms' ? <RoomsView rooms={rooms} activities={activities} templates={templates} initialActivityIds={preselectedRoomActivityIds} onClearInitialActivities={() => setPreselectedRoomActivityIds(null)} onCreate={createRoom} onTransition={transitionRoom} onDuplicate={duplicateRoom} onShare={shareRoomCode} onDelete={(room) => void deleteRoom(room)} onNavigateToContent={() => show('content')} onNavigateToProposals={() => show('proposals')} onHome={() => show('overview')} /> : panelView === 'results' ? <ResultsView attempts={displayedAttempts} rooms={resultRooms} templates={templates} activities={activities} onExport={exportCsv} onDeleteAttempt={deleteAttempt} onClearAttempts={clearAttempts} onHome={() => show('overview')} /> : studentFinished ? <StudentCompletion room={studentRoom} onLeave={leaveStudentSession} /> : <PlayView activity={playActivity} index={playIndex} totalCount={studentActivities.length || 6} allowBack={studentRoom?.allowBack ?? true} timeLimit={studentRoom?.time ?? null} startedAt={studentRoom?.startedAt} savedResponse={studentResponses[playIndex]} submitted={submitted} onSubmit={submitAnswer} onSkip={skipStudentQuestion} onPrevious={previousStudentQuestion} onTimeExpired={() => finishStudentAttempt('timeout')} onNext={nextStudentQuestion} />}</main>
    </div>{toast && <div className="toast" role="status">✓ {toast}</div>}
    {showPasswordChange && authSession && <ChangePasswordModal onClose={() => setShowPasswordChange(false)} onSaved={() => { setShowPasswordChange(false); notify('Contraseña actualizada correctamente.') }} />}
    {showHelpModal && <HelpModal onClose={() => setShowHelpModal(false)} />}
    {showFeedbackModal && <FeedbackModal defaultEmail={authSession?.user.email ?? ''} defaultName={displayName} onClose={() => setShowFeedbackModal(false)} onSent={() => { setShowFeedbackModal(false); notify('Se abrió tu correo para enviar la sugerencia.') }} />}
    {selectedActivity && role !== 'student' && <ActivityPreview activity={selectedActivity} onClose={() => setSelectedActivity(null)} onDelete={role === 'teacher' ? () => void deleteActivity(selectedActivity) : undefined} />}
    {editingActivity && (
      <ActivityForm
        initialType={editingActivity.type}
        initialActivity={editingActivity}
        onCancel={() => setEditingActivity(null)}
        onSave={(updated) => {
          setActivities((current) => current.map((item) => item.id === updated.id ? updated : item))
          setEditingActivity(null)
          notify('Actividad corregida y actualizada.')
        }}
      />
    )}
  </div>
}

function RoleLanding({
  onChoose,
  theme,
  onToggleTheme,
  canInstall,
  onInstall,
}: {
  onChoose: (role: Role) => void
  theme: 'light' | 'dark'
  onToggleTheme: () => void
  canInstall?: boolean
  onInstall?: () => void
}) {
  const [splashState, setSplashState] = useState<'splash' | 'morphing' | 'ready'>(() => {
    return readSessionStorage('edueval-splash-seen') ? 'ready' : 'splash'
  })

  useEffect(() => {
    if (splashState === 'splash') {
      const timer = window.setTimeout(() => {
        setSplashState('morphing')
      }, 1500)
      return () => window.clearTimeout(timer)
    }
    if (splashState === 'morphing') {
      const timer = window.setTimeout(() => {
        setSplashState('ready')
        try { sessionStorage.setItem('edueval-splash-seen', 'true') } catch {}
      }, 650)
      return () => window.clearTimeout(timer)
    }
  }, [splashState])

  const skipSplash = () => {
    if (splashState === 'splash') {
      setSplashState('morphing')
    } else if (splashState === 'morphing') {
      setSplashState('ready')
      try { sessionStorage.setItem('edueval-splash-seen', 'true') } catch {}
    }
  }

  return (
    <div className="role-landing">
      {splashState !== 'ready' && (
        <div
          className={`splash-overlay ${splashState === 'morphing' ? 'morphing' : ''}`}
          onClick={skipSplash}
          role="button"
          tabIndex={0}
          aria-label="Pantalla de bienvenida, pulsa para continuar"
        >
          <div className="splash-mascot-box">
            <div className="splash-halo" />
            <div className="splash-mascot-graphic">
              <IconSparkMascot size={116} />
            </div>
          </div>
          <div className="splash-title-wrap">
            <p className="eyebrow">BIENVENIDA</p>
            <h1>EvaluEdu</h1>
            <p>Evaluación activa y formativa para transformar cada clase.</p>
            <span className="splash-hint-pill">✨ Toca para continuar</span>
          </div>
        </div>
      )}

      <div className="landing-top-actions">
        {canInstall && onInstall && (
          <button className="install-button" type="button" onClick={onInstall}>
            ＋ Instalar app
          </button>
        )}
        <button
          className="theme-toggle-btn"
          type="button"
          onClick={onToggleTheme}
          aria-label={theme === 'light' ? 'Cambiar a modo noche' : 'Cambiar a modo día'}
          title={theme === 'light' ? 'Modo día activo (pulsa para activar modo noche)' : 'Modo noche activo (pulsa para activar modo día)'}
        >
          <span className="theme-toggle-icon">{theme === 'light' ? <IconSun size={19} /> : <IconMoon size={19} />}</span>
        </button>
      </div>
      <div className="landing-brand">
        <button
          type="button"
          className="landing-brand-replay"
          onClick={() => setSplashState('splash')}
          title="Ver bienvenida animada"
        >
          <span className="brand-mark mascot-mark"><IconSparkMascot size={26} /></span>
          <div><strong>EvaluEdu</strong><small>aprendizaje activo</small></div>
        </button>
      </div>
      <div className="landing-copy">
        <p className="eyebrow">EVALUACIÓN EDUCATIVA</p>
        <h1>¿Cómo quieres entrar?</h1>
        <p>Elige tu espacio para continuar. Cada rol tiene una experiencia diseñada para sus necesidades.</p>
      </div>
      <div className={`role-cards ${splashState === 'ready' ? 'staggered-in' : ''}`}>
        <RoleCard icon={<IconTeacher size={26} />} title="Docente" description="Crea contenido, prepara actividades y acompaña a tu grupo." onClick={() => onChoose('teacher')} tone="teacher" />
        <RoleCard icon={<IconStudent size={26} />} title="Estudiante" description="Ingresa a una sala con el código de tu docente." onClick={() => onChoose('student')} tone="student" />
        <RoleCard icon={<IconAdmin size={26} />} title="Administrador" description="Gestiona docentes, permisos y configuración general." onClick={() => onChoose('admin')} tone="admin" />
      </div>
      <small className="landing-note">EvaluEdu · v1.2</small>
    </div>
  )
}
function RoleCard({ icon, title, description, onClick, tone }: { icon: React.ReactNode; title: string; description: string; onClick: () => void; tone: string }) {
  return (
    <button className={`role-card ${tone}`} onClick={onClick}>
      <span className="role-card-icon">{icon}</span>
      <span className="role-card-copy"><b>{title}</b><small>{description}</small></span>
      <span className="role-card-arrow"><IconArrowRight size={18} /></span>
    </button>
  )
}

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

function HelpModal({ onClose }: { onClose: () => void }) {
  return <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="help-modal-title"><article className="modal-card help-modal"><div className="modal-head"><div><p className="eyebrow">CENTRO DE AYUDA</p><h2 id="help-modal-title">Guía rápida de EvaluEdu</h2><p className="modal-subtitle">Recorrido práctico para preparar contenido, abrir una sala y acompañar a tu grupo.</p></div><button type="button" className="icon-button" aria-label="Cerrar guía rápida" onClick={onClose}>×</button></div><div className="tutorial-player" aria-label="Espacio reservado para video tutorial"><div className="tutorial-placeholder"><span className="tutorial-play-icon" aria-hidden="true">▶</span><b>Video tutorial</b><p>Este espacio mostrará el video de uso paso a paso cuando esté grabado.</p><small>Formato recomendado: MP4 16:9 · duración breve · subtítulos opcionales.</small></div></div><ol className="tutorial-steps"><li><span>01</span><div><b>Crea tu contenido</b><small>En Contenido estructura conceptos, situaciones, pasos o categorías desde una plantilla.</small></div></li><li><span>02</span><div><b>Revisa las actividades</b><small>Valida los formatos compatibles y ajusta las consignas o el feedback orientador.</small></div></li><li><span>03</span><div><b>Prepara una sala</b><small>En Salas elige hasta tres tipos de actividad, define puntaje, tiempo opcional y comparte el código.</small></div></li><li><span>04</span><div><b>Consulta los resultados</b><small>Revisa respuestas, omisiones y tiempos en privado o expórtalos a Excel/CSV.</small></div></li></ol><div className="modal-actions"><button type="button" className="primary-button" onClick={onClose}>Entendido</button></div></article></div>
}

function FeedbackModal({ defaultEmail, defaultName, onClose, onSent }: { defaultEmail: string; defaultName: string; onClose: () => void; onSent: () => void }) {
  const [category, setCategory] = useState('Sugerencia')
  const [message, setMessage] = useState('')
  const [replyEmail, setReplyEmail] = useState(defaultEmail)
  const [error, setError] = useState('')
  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (message.trim().length < 10) return setError('Escribe al menos 10 caracteres para explicar tu sugerencia.')
    setError('')
    const subject = `[EvaluEdu · ${category}] ${defaultName}`
    const body = [`Tipo: ${category}`, `Docente: ${defaultName}`, `Correo de contacto: ${replyEmail.trim() || 'No indicado'}`, '', 'Mensaje:', message.trim()].join('\n')
    window.location.href = `mailto:${FEEDBACK_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
    onSent()
  }
  return <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="feedback-modal-title"><form className="modal-card feedback-modal auth-form" onSubmit={submit}><div className="modal-head"><div><p className="eyebrow">CONTACTO DOCENTE</p><h2 id="feedback-modal-title">Escribir sugerencia</h2><p className="modal-subtitle">Cuéntanos qué mejorarías o qué necesitas para tus clases. Tu mensaje se preparará para enviarse al equipo.</p></div><button type="button" className="icon-button" aria-label="Cerrar sugerencias" onClick={onClose}>×</button></div><label>Tipo de comentario<select value={category} onChange={(event) => setCategory(event.target.value)}><option value="Sugerencia">Sugerencia</option><option value="Problema">Problema al usar la app</option><option value="Actividad">Comentario sobre una actividad</option><option value="Otro">Otro comentario</option></select></label><label>Mensaje<textarea value={message} onChange={(event) => setMessage(event.target.value)} rows={4} placeholder="Describe tu idea, ajuste o caso de uso en el aula." required /></label><label>Correo para responder<input type="email" value={replyEmail} onChange={(event) => setReplyEmail(event.target.value)} placeholder="docente@institucion.edu" /></label>{error && <div className="auth-message error">{error}</div>}<div className="auth-message success">Se abrirá tu aplicación de correo con el destinatario <b>{FEEDBACK_EMAIL}</b>.</div><div className="modal-actions"><button type="button" className="outline-button" onClick={onClose}>Cancelar</button><button type="submit" className="primary-button">Preparar correo →</button></div></form></div>
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
  return <div className="auth-shell"><div className="auth-card"><button className="auth-back" onClick={onBack}>← Cambiar rol</button><span className="brand-mark mascot-mark"><IconSparkMascot size={24} /></span><p className="eyebrow">ACCESO VERIFICADO</p><h1>Ingresa a tu panel</h1><p>Cuenta de {roleLabel}. Ingresa tus credenciales para continuar.</p><form onSubmit={submit} className="auth-form"><label>Correo electrónico<input type="email" value={email} onChange={(event) => { setEmail(event.target.value); setRecoverySent(false) }} placeholder="tu@institucion.edu" required /></label><label>Contraseña<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Tu contraseña" minLength={6} required /></label>{error && <div className="auth-message error">{error}</div>}<button className="primary-button wide" type="submit">Ingresar con contraseña →</button></form><button className="recovery-link" type="button" onClick={() => void requestRecovery()} disabled={recoverySending}>{recoverySending ? 'Enviando enlace…' : 'No pude crear mi contraseña / Recuperar acceso'}</button>{recoverySent && <div className="auth-message success">Si el correo está registrado, recibirás un enlace para restablecer tu contraseña. Revisa también la carpeta de spam.</div>}<div className="auth-message success">¿Aún no tienes acceso? Solicita a un administrador el registro de tu cuenta institucional.</div><small className="auth-footnote">Sesión protegida en este dispositivo.</small></div></div>
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
  return <div className="auth-shell"><div className="auth-card"><button className="auth-back" onClick={onBack}>← Cerrar sesión</button><span className="brand-mark mascot-mark"><IconSparkMascot size={24} /></span><p className="eyebrow">PRIMER INGRESO</p><h1>Completa tu perfil docente</h1><p>Usaremos este nombre en tus plantillas, salas y resultados privados.</p><form onSubmit={submit} className="auth-form"><label>Nombre visible<input value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="Ej. Lucía Martínez" minLength={2} required /></label><label>Correo verificado<input value={user.email ?? ''} disabled /></label>{error && <div className="auth-message error">{error}</div>}<button className="primary-button wide" type="submit" disabled={saving}>{saving ? 'Guardando…' : 'Guardar perfil →'}</button></form><small className="auth-footnote">Perfil docente institucional.</small></div></div>
}

function ProfileUnavailableScreen({ email, onBack }: { email: string; onBack: () => void }) { return <div className="auth-shell"><div className="auth-card"><button className="auth-back" onClick={onBack}>← Cerrar sesión</button><span className="brand-mark">E</span><p className="eyebrow">ACCESO RESTRINGIDO</p><h1>Cuenta pendiente de asignación</h1><p>La cuenta <b>{email}</b> está autenticada, pero todavía no tiene un perfil administrativo autorizado.</p><div className="auth-message error">Solicita a un administrador que cree tu perfil con el rol correspondiente.</div><small className="auth-footnote">El panel administrativo no se habilita únicamente por elegir el icono Admin.</small></div></div> }

function ProfileVerificationErrorScreen({ email, error, onBack }: { email: string; error: string; onBack: () => void }) { return <div className="auth-shell"><div className="auth-card"><button className="auth-back" onClick={onBack}>← Cerrar sesión</button><span className="brand-mark">E</span><p className="eyebrow">VERIFICACIÓN DETENIDA</p><h1>No pudimos verificar tu rol</h1><p>La sesión de <b>{email}</b> está activa, pero no pudimos leer su perfil autorizado.</p><div className="auth-message error">{error}</div><p className="auth-footnote">Por seguridad no se habilita ningún panel hasta confirmar el rol en Supabase. Revisa la conexión o solicita al administrador que verifique tu perfil.</p></div></div> }

function RoleMismatchScreen({ selectedRole, actualRole, onUseActualRole, onBack }: { selectedRole: Role; actualRole: 'admin' | 'teacher'; onUseActualRole: () => void; onBack: () => void }) {
  const selectedLabel = selectedRole === 'admin' ? 'administrador' : 'docente'
  const actualLabel = actualRole === 'admin' ? 'administrador' : 'docente'
  return <div className="auth-shell"><div className="auth-card"><button className="auth-back" onClick={onBack}>← Cerrar sesión</button><span className="brand-mark">E</span><p className="eyebrow">ROL VERIFICADO</p><h1>Este panel no corresponde a tu cuenta</h1><p>Elegiste <b>{selectedLabel}</b>, pero Supabase verificó que tu cuenta tiene rol de <b>{actualLabel}</b>.</p><div className="auth-message error">El icono de entrada no concede permisos. El rol persistido es el que determina el acceso.</div><button className="primary-button wide" onClick={onUseActualRole}>Entrar como {actualLabel} →</button></div></div>
}

function NavButton({ active, icon, label, badge, onClick }: { active: boolean; icon: React.ReactNode; label: string; badge?: number; onClick: () => void }) {
  return (
    <button className={`nav-button ${active ? 'active' : ''}`} onClick={onClick}>
      <span className="nav-icon">{icon}</span>
      <span className="nav-label">{label}</span>
      {badge ? <em>{badge}</em> : null}
    </button>
  )
}

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
  return <><PageIntro eyebrow="CONTROL DE LA PLATAFORMA" title="Resumen general" description="Supervisa usuarios, contenidos y evaluaciones desde la administración de EvaluEdu." action={<span className="tag published">{adminData ? 'Supabase conectado' : 'Cargando datos globales'}</span>} /><div className="admin-notice"><span>✓</span><div><b>{adminData ? 'Datos administrativos sincronizados.' : 'Cargando datos administrativos.'}</b><p>{adminData ? 'Usuarios, salas, auditoría e intentos se consultan desde Supabase con permisos de administrador.' : 'Mientras se consulta Supabase, se conserva la copia local como respaldo temporal.'}</p></div></div><div className="metric-grid admin-metrics"><Metric icon="♙" value={adminData?.metrics.users ?? users.length} label="Usuarios registrados" trend="Docentes y administración" tone="mint" /><Metric icon="⌘" value={activeRooms} label="Salas abiertas" trend={`${adminData?.metrics.rooms ?? sourceRooms.length} salas en total`} tone="lavender" /><Metric icon="◈" value={published} label="Actividades publicadas" trend={`${adminData?.metrics.templates ?? templates.length} plantillas guardadas`} tone="peach" /><Metric icon="✓" value={`${completion}%`} label="Intentos finalizados" trend={`${adminData?.metrics.attempts ?? attempts.length} registros`} tone="mint" /></div><div className="dashboard-grid admin-grid"><section className="panel"><div className="panel-heading"><div><h2>Usuarios y permisos</h2><p>{adminData ? 'Directorio real de Supabase.' : 'Directorio temporal de esta sesión.'}</p></div><button className="text-button" onClick={() => onNavigate('adminUsers')}>Ver usuarios →</button></div>{adminData ? users.slice(0, 4).map((user) => <div className="admin-user-row" key={user.id}><span className="admin-avatar">{user.displayName.split(' ').map((part) => part[0]).slice(0, 2).join('')}</span><div><b>{user.displayName}</b><small>{user.email}</small></div><span className="admin-role">{user.roles.map((item) => item === 'admin' ? 'Administrador' : 'Docente').join(' · ')}</span><span className="admin-status">{user.status}</span></div>) : demoAdminUsers.map((user) => <div className="admin-user-row" key={user.email}><span className="admin-avatar">{user.name.split(' ').map((part) => part[0]).slice(0, 2).join('')}</span><div><b>{user.name}</b><small>{user.email}</small></div><span className="admin-role">{user.role}</span><span className="admin-status">{user.status}</span></div>)}</section><section className="panel admin-health"><div className="panel-heading"><div><h2>Estado del sistema</h2><p>Indicadores de la instalación actual.</p></div></div><div className="health-line"><span className="health-dot local" /><div><b>Persistencia local</b><small>Respaldo temporal del navegador.</small></div><strong>Activa</strong></div><div className="health-line"><span className="health-dot ready" /><div><b>Supabase Auth</b><small>Sesiones y roles verificados.</small></div><strong>Activa</strong></div><div className="health-line"><span className="health-dot ready" /><div><b>RLS y Realtime</b><small>Permisos y estados de sala conectados.</small></div><strong>Activos</strong></div></section></div><section className="panel admin-quick-actions"><div><p className="eyebrow">ACCIONES DE CONTROL</p><h2>Revisión rápida</h2><p>Consulta las áreas sincronizadas con el backend.</p></div><div className="admin-action-grid"><button className="outline-button" onClick={() => onNavigate('rooms')}>⌘ Revisar salas</button><button className="outline-button" onClick={() => onNavigate('adminAudit')}>◌ Ver auditoría</button><button className="outline-button" onClick={() => onNavigate('results')}>↗ Revisar resultados</button></div></section></>
}

function AdminUsersView({ attempts, profile, adminData, onRefresh, onHome }: { attempts: StudentAttempt[]; profile: Profile | null; adminData: AdminSnapshot | null; onRefresh: () => void; onHome: () => void }) {
  const [showInvite, setShowInvite] = useState(false)
  const [accessMode, setAccessMode] = useState<'pilot' | 'invite'>('pilot')
  const [email, setEmail] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [pilotPassword, setPilotPassword] = useState('')
  const [pilotConfirmation, setPilotConfirmation] = useState('')
  const [status, setStatus] = useState<{ kind: 'success' | 'error'; message: string } | null>(null)
  const [saving, setSaving] = useState(false)
  const [removingId, setRemovingId] = useState<string | null>(null)
  const [resendingId, setResendingId] = useState<string | null>(null)
  const canManageUsers = !isSupabaseConfigured || canAccessPanel(profile, 'admin')
  const closeInviteModal = () => {
    setShowInvite(false)
    setAccessMode('pilot')
    setEmail('')
    setDisplayName('')
    setPilotPassword('')
    setPilotConfirmation('')
  }

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
    closeInviteModal()
    onRefresh()
    setStatus({ kind: 'success', message: `Invitación enviada a ${data.email}. El docente deberá completar su acceso desde el enlace recibido.` })
  }

  const createPilotTeacher = async (event: FormEvent) => {
    event.preventDefault()
    if (!canManageUsers) {
      setStatus({ kind: 'error', message: 'Tu perfil no tiene permisos de administrador para crear accesos piloto.' })
      return
    }
    if (pilotPassword.length < 8) {
      setStatus({ kind: 'error', message: 'La contraseña temporal debe tener al menos 8 caracteres.' })
      return
    }
    if (pilotPassword !== pilotConfirmation) {
      setStatus({ kind: 'error', message: 'Las contraseñas no coinciden.' })
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
    const { data, error } = await supabase.functions.invoke('admin-create-pilot-teacher', {
      body: { email: email.trim(), displayName: displayName.trim(), password: pilotPassword },
    })
    setSaving(false)
    if (error || !data?.ok) {
      setStatus({ kind: 'error', message: await functionErrorMessage(error, data, 'No se pudo crear el acceso piloto.') })
      return
    }
    closeInviteModal()
    onRefresh()
    setStatus({ kind: 'success', message: `${data.mode === 'activated' ? 'Acceso reactivado' : 'Acceso creado'} para ${data.email}. El docente puede ingresar con esa contraseña y cambiarla desde su perfil.` })
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
    <PageIntro eyebrow="ADMINISTRACIÓN" title="Usuarios y permisos" description="Invita docentes autorizados y conserva la separación entre administración y enseñanza." action={canManageUsers ? <button className="primary-button" onClick={() => { setStatus(null); setAccessMode('pilot'); setShowInvite(true) }}>＋ Agregar usuario</button> : <span className="demo-admin-tag">Acceso de solo lectura</span>} />
    <div className="admin-notice"><span>✓</span><div><b>Alta y gestión de docentes.</b><p>Asigna una contraseña directa o envía una invitación por correo institucional.</p></div></div>
    {status && <div className={`auth-message ${status.kind}`}>{status.message}</div>}
    <section className="panel"><div className="panel-heading"><div><h2>Directorio de la plataforma</h2><p>{adminData ? `${users.length} usuarios registrados · ${attempts.length} intentos sincronizados` : 'Cargando usuarios desde Supabase…'}</p></div><span className="tag published">{adminData ? 'Supabase' : 'Respaldo local'}</span></div><div className="results-table-wrap"><table><thead><tr><th>Persona</th><th>Rol</th><th>Estado</th><th>Último acceso</th><th>Acceso previsto</th><th>Acción</th></tr></thead><tbody>{users.length ? users.map((user) => <tr key={user.id}><td><b>{user.displayName}</b><small>{user.email}</small></td><td>{user.roles.map((item) => item === 'admin' ? 'Administrador' : 'Docente').join(' · ')}</td><td><span className="result-status">{user.status}</span></td><td>{user.lastSignInAt ? formatDate(user.lastSignInAt) : 'Aún no'}</td><td>{user.roles.includes('admin') ? 'Global' : 'Su institución'}</td><td>{user.roles.includes('admin') ? <span className="muted">Protegido</span> : user.status === 'Bloqueado' ? <span className="muted">Desactivado</span> : <div className="table-actions"><button className="text-button" disabled={resendingId === user.id} onClick={() => void resendAccess(user)}>{resendingId === user.id ? 'Enviando…' : user.status === 'Pendiente' ? 'Reenviar acceso' : 'Restablecer acceso'}</button><button className="text-button danger-text-button" disabled={removingId === user.id} onClick={() => void removeUser(user)}>{removingId === user.id ? 'Desactivando…' : 'Desactivar usuario'}</button></div>}</td></tr>) : <tr><td colSpan={6}>Aún no hay perfiles administrativos para mostrar.</td></tr>}</tbody></table></div></section>
    <section className="panel admin-permission-grid"><div><p className="eyebrow">MODELO DE PERMISOS</p><h2>Separación de responsabilidades</h2></div><div className="permission-card"><b>Administrador</b><span>Usuarios, instituciones, auditoría y configuración global.</span></div><div className="permission-card"><b>Docente</b><span>Sus plantillas, salas, actividades y resultados privados.</span></div><div className="permission-card"><b>Estudiante</b><span>Solo las salas autorizadas y su participación actual.</span></div></section>
    {showInvite && <div className="modal-backdrop"><div className="modal-card admin-invite-modal"><div className="modal-head"><div><p className="eyebrow">NUEVO ACCESO</p><h2>{accessMode === 'pilot' ? 'Asignar contraseña directa' : 'Invitar docente'}</h2><p className="modal-subtitle">{accessMode === 'pilot' ? 'El docente ingresará de inmediato con la contraseña definida por administración.' : 'El docente recibirá un enlace en su correo institucional.'}</p></div><button type="button" className="icon-button" onClick={closeInviteModal}>×</button></div><div className="access-mode-toggle" role="tablist" aria-label="Tipo de acceso"><button type="button" className={accessMode === 'pilot' ? 'primary-button' : 'outline-button'} onClick={() => { setStatus(null); setAccessMode('pilot') }}>Contraseña directa</button><button type="button" className={accessMode === 'invite' ? 'primary-button' : 'outline-button'} onClick={() => { setStatus(null); setAccessMode('invite') }}>Invitar por correo</button></div><form className="auth-form" onSubmit={accessMode === 'pilot' ? createPilotTeacher : inviteTeacher}><label>Nombre visible<input value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="Ej. Lucía Martínez" minLength={2} required /></label><label>Correo del docente<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="docente@institucion.edu" required /></label>{accessMode === 'pilot' ? <><label>Contraseña temporal<input type="password" value={pilotPassword} onChange={(event) => setPilotPassword(event.target.value)} placeholder="Mínimo 8 caracteres" minLength={8} autoComplete="new-password" required /></label><label>Repetir contraseña<input type="password" value={pilotConfirmation} onChange={(event) => setPilotConfirmation(event.target.value)} placeholder="Repite la contraseña" minLength={8} autoComplete="new-password" required /></label><div className="auth-message success">Se confirma el correo y se habilita el rol docente. Comparte la contraseña de forma segura.</div></> : <div className="auth-message success">El rol se asignará como docente.</div>}<div className="modal-actions"><button type="button" className="outline-button" onClick={closeInviteModal}>Cancelar</button><button type="submit" className="primary-button" disabled={saving}>{saving ? accessMode === 'pilot' ? 'Creando…' : 'Enviando…' : accessMode === 'pilot' ? 'Asignar acceso →' : 'Enviar invitación →'}</button></div></form></div></div>}
  </>
}

function AdminAuditView({ attempts, rooms, adminData, onHome }: { attempts: StudentAttempt[]; rooms: Room[]; adminData: AdminSnapshot | null; onHome: () => void }) { const events = adminData ? adminData.auditEvents.map((event) => ({ type: event.eventType, subject: event.actorName, room: event.roomName, at: event.createdAt, detail: '' })) : attempts.flatMap((attempt) => attempt.events.map((event) => ({ ...event, subject: attempt.studentName, room: attempt.roomName }))).sort((left, right) => right.at.localeCompare(left.at)); return <><PageIntro eyebrow="ADMINISTRACIÓN" title="Auditoría de actividad" description="Registro de eventos relevantes para revisar trazabilidad y seguridad." action={<span className="tag published">{adminData ? 'Solo lectura · Servidor' : 'Cargando auditoría'}</span>} /><div className="admin-notice"><span>{adminData ? '✓' : '!'}</span><div><b>{adminData ? 'Auditoría sincronizada con Supabase.' : 'Cargando auditoría del servidor.'}</b><p>{adminData ? 'Los eventos se leen desde el registro protegido de la plataforma.' : 'Mientras carga, se conserva la trazabilidad local como respaldo temporal.'}</p></div></div><section className="panel"><div className="panel-heading"><div><h2>Eventos recientes</h2><p>{events.length} eventos registrados · {adminData?.metrics.rooms ?? rooms.length} salas visibles</p></div></div>{events.length ? <div className="audit-list">{events.slice(0, 20).map((event, index) => <div className="audit-row" key={`${event.at}-${index}`}><span className="audit-icon">{event.type === 'finished' ? '✓' : event.type === 'timeout' ? '◷' : event.type === 'omitted' ? '→' : '•'}</span><div><b>{auditEventLabel(event.type)}</b><small>{event.subject} · {event.room}{event.detail ? ` · ${event.detail}` : ''}</small></div><time>{formatDate(event.at)}</time></div>)}</div> : <div className="results-empty"><span>◌</span><h3>Aún no hay eventos</h3><p>Los eventos aparecerán cuando un estudiante ingrese y responda una evaluación.</p></div>}</section></> }

function AdminRoomsView({ rooms, activities, adminData, onHome }: { rooms: Room[]; activities: Activity[]; adminData: AdminSnapshot | null; onHome: () => void }) { const globalRooms = adminData?.rooms ?? []; return <><PageIntro eyebrow="ADMINISTRACIÓN" title="Salas globales" description="Supervisa el ciclo de las evaluaciones sin modificar la configuración del docente." action={<span className="tag published">{adminData ? 'Solo lectura · Supabase' : 'Cargando salas'}</span>} /><div className="admin-notice"><span>{adminData ? '✓' : '!'}</span><div><b>{adminData ? 'Vista global sincronizada.' : 'Cargando salas globales.'}</b><p>{adminData ? 'La administración puede supervisar las salas de todos los docentes sin modificar su configuración.' : 'La copia local se mantiene disponible mientras se consulta el servidor.'}</p></div></div><section className="panel"><div className="panel-heading"><div><h2>{adminData ? globalRooms.length : rooms.length} salas visibles</h2><p>Las salas archivadas conservan su trazabilidad y resultados.</p></div></div><div className="results-table-wrap"><table><thead><tr><th>Sala</th><th>Docente</th><th>Código</th><th>Estado</th><th>Preguntas</th><th>Estudiantes</th><th>Actividades</th></tr></thead><tbody>{adminData ? globalRooms.map((room) => <tr key={room.id}><td><b>{room.name}</b><small>{formatDate(room.createdAt)}</small></td><td>{room.ownerName}</td><td>{room.code}</td><td><span className={`result-status ${room.status === 'active' ? '' : 'timeout'}`}>{roomStatusLabel(room.status)}</span></td><td>{room.questionCount}</td><td>Máx. {room.limit}</td><td>{room.activities.map((activity) => activity.title).join(' · ') || 'Sin actividades'}</td></tr>) : rooms.map((room) => <tr key={room.id}><td><b>{room.name}</b><small>{room.instructions}</small></td><td>Docente local</td><td>{room.code}</td><td><span className={`result-status ${room.status === 'active' ? '' : 'timeout'}`}>{roomStatusLabel(room.status)}</span></td><td>{room.questionCount}</td><td>Máx. {room.limit}</td><td>{room.activities.map((id) => activities.find((activity) => activity.id === id)?.title ?? 'Actividad').join(' · ')}</td></tr>)}</tbody></table></div></section></> }

interface FormatCatalogItem {
  id: string
  icon: string
  title: string
  subtitle: string
  status: 'active' | 'upcoming'
  badge: string
  evaluates: string
  studentExperience: string
  contentRequirements: string
}

const FORMAT_CATALOG: FormatCatalogItem[] = [
  {
    id: 'trueFalse',
    icon: '✓',
    title: 'Falso o Verdadero',
    subtitle: 'Verificación y contraste conceptual',
    status: 'active',
    badge: 'Activo · v1.2',
    evaluates: 'Capacidad de discernir afirmaciones precisas de conceptos erróneos o confusiones habituales sin depender de la memoria pasiva.',
    studentExperience: 'El estudiante analiza una afirmación. Si la respuesta es incorrecta, la aplicación le envía una pista orientadora para inducir su relectura reflexiva, sin revelarle la clave.',
    contentRequirements: 'Afirmaciones claras con justificación pedagógica y pistas formativas orientadoras.',
  },
  {
    id: 'singleChoice',
    icon: '◉',
    title: 'Opción Única',
    subtitle: 'Discriminación con distractores fundamentados',
    status: 'active',
    badge: 'Activo · v1.2',
    evaluates: 'Comprensión conceptual profunda y capacidad de descartar alternativas construidas sobre errores conceptuales comunes.',
    studentExperience: 'Opciones barajadas aleatoriamente. Al responder, el alumno recibe retroalimentación explicativa orientada al aprendizaje.',
    contentRequirements: 'Pregunta clara, una única respuesta correcta inequívoca y distractores plausibles del mismo tema.',
  },
  {
    id: 'matching',
    icon: '⇄',
    title: 'Asociación de Conceptos',
    subtitle: 'Correspondencia biunívoca entre elementos',
    status: 'active',
    badge: 'Activo · v1.2',
    evaluates: 'Relación funcional y definición exacta entre términos, causas, personajes o propiedades emparejadas.',
    studentExperience: 'Términos en una columna y definiciones en otra con selector dinámico o arrastre. Pistas orientadoras en emparejamientos fallidos.',
    contentRequirements: 'Mínimo dos pares inequívocos término ↔ definición sin ambigüedades cruzadas.',
  },
  {
    id: 'sorting',
    icon: '⊞',
    title: 'Clasificación por Categorías',
    subtitle: 'Agrupación taxonómica arrastrar y soltar',
    status: 'active',
    badge: 'Activo · v1.2',
    evaluates: 'Habilidad para estructurar conceptos o casos bajo etiquetas y criterios taxonómicos rigurosos.',
    studentExperience: 'Cajas de categorías visibles y fichas interactivas para clasificar, con adaptación accesible para pantallas móviles.',
    contentRequirements: 'Categorías bien delimitadas y elementos asignados de forma exclusiva a una categoría.',
  },
  {
    id: 'ordering',
    icon: '↕',
    title: 'Ordenamiento Secuencial',
    subtitle: 'Secuenciación lógica o cronológica de procesos',
    status: 'active',
    badge: 'Activo · v1.2',
    evaluates: 'Comprensión de procesos paso a paso, cronologías históricas o algoritmos procedimentales de resolución.',
    studentExperience: 'Bloques desordenados con controles táctiles para subir o bajar de posición hasta establecer la secuencia correcta.',
    contentRequirements: 'Pasos o eventos sucesivos con un orden lógico único y justificado.',
  },
  {
    id: 'scenario',
    icon: '✦',
    title: 'Escenario de Decisiones',
    subtitle: 'Criterio situacional con consecuencias reales',
    status: 'active',
    badge: 'Activo · v1.2',
    evaluates: 'Juicio crítico y toma de decisiones frente a situaciones del mundo real o dilemas profesionales aplicados.',
    studentExperience: 'Lectura inmersiva del caso y toma de postura entre varias opciones. Cada camino despliega consecuencias formativas explicadas.',
    contentRequirements: 'Descripción del contexto situacional, opciones de acción concretas y consecuencias formativas para cada alternativa.',
  },
  // 5 FORMATOS FUTUROS (v1.3)
  {
    id: 'multiSelect',
    icon: '☑',
    title: 'Selección Múltiple',
    subtitle: 'Múltiples respuestas correctas',
    status: 'upcoming',
    badge: 'Próximamente',
    evaluates: 'Discriminación analítica integral: identificar todos los factores o características válidas de un fenómeno sin omitir elementos esenciales.',
    studentExperience: 'Casillas de verificación múltiples (ej. «selecciona 3 de 5») con evaluación de aciertos y feedback específico por criterio.',
    contentRequirements: 'Premisa multidimensional y opciones donde dos o más son correctas bajo justificación pedagógica.',
  },
  {
    id: 'fillBlanks',
    icon: '✍',
    title: 'Completar Espacios Guiado',
    subtitle: 'Texto con banco de conceptos',
    status: 'upcoming',
    badge: 'Próximamente',
    evaluates: 'Precisión terminológica y dominio de vocabulario técnico en un contexto de párrafo fluido o demostración estructurada.',
    studentExperience: 'Párrafo con huecos numerados y banco cerrado de conceptos para encajar en el lugar correcto.',
    contentRequirements: 'Texto descriptivo con términos clave delimitados y distractores léxicos plausibles.',
  },
  {
    id: 'spotError',
    icon: '⚡',
    title: 'Detección del Error',
    subtitle: 'Identificación de inconsistencias conceptuales',
    status: 'upcoming',
    badge: 'Próximamente',
    evaluates: 'Auditoría crítica y pensamiento analítico: capacidad de encontrar el fallo conceptual o la trampa en un procedimiento o argumento.',
    studentExperience: 'El estudiante revisa un conjunto de pasos o afirmaciones y señala cuál es el que rompe la regla o miente.',
    contentRequirements: 'Caso o procedimiento con un error sutil pero conceptualmente verificable y su fundamentación.',
  },
  {
    id: 'gridCheck',
    icon: '▦',
    title: 'Matriz de Doble Entrada',
    subtitle: 'Cruce de propiedades multidimensional',
    status: 'upcoming',
    badge: 'Próximamente',
    evaluates: 'Capacidad de comparar simultáneamente varios conceptos bajo múltiples criterios (ej. mitocondria vs cloroplasto vs núcleo).',
    studentExperience: 'Tabla con casillas de verificación en los cruces entre filas y columnas, con feedback granular por propiedad.',
    contentRequirements: 'Matriz de filas (elementos), columnas (características) y asignaciones booleanas esperadas.',
  },
  {
    id: 'subcategories',
    icon: '⎘',
    title: 'Categorías Anidadas',
    subtitle: 'Taxonomía con jerarquías y subgrupos',
    status: 'upcoming',
    badge: 'Próximamente',
    evaluates: 'Comprensión de relaciones de inclusión, subtipos taxonómicos o conjuntos con elementos compartidos.',
    studentExperience: 'Organización de elementos en categorías principales y sus respectivas subcategorías jerárquicas con validación estructurada.',
    contentRequirements: 'Árbol taxonómico de dos niveles con asignaciones precisas.',
  },
]

const PEDAGOGICAL_TIPS = [
  'La retroalimentación orientadora enseña más cuando guía al alumno con una pista que cuando le da la respuesta correcta servida.',
  'En preguntas de opción única, un buen distractor debe basarse en un error conceptual frecuente, no en trucos ni ambigüedades.',
  'Los escenarios de decisiones funcionan mejor cuando plantean un dilema del mundo real con consecuencias lógicas para cada camino.',
  'El tiempo por pregunta es opcional: para evaluaciones diagnósticas profundas, es preferible permitir que el estudiante reflexione sin prisa.',
  'En falso o verdadero, contrasta conceptos afines para evaluar si el estudiante distingue los matices y no solo memoriza definiciones.',
  'Las actividades de clasificación permiten verificar si el alumno domina la taxonomía y los criterios de pertenencia de un tema.',
  'El estudiante nunca ve el puntaje final de la prueba, protegiendo el carácter formativo y evitando la ansiedad de calificación.',
  'Puedes exportar los resultados a Excel desde la pantalla de Resultados para analizar qué preguntas requirieron mayor acompañamiento.',
  'Combina formatos de diferente naturaleza (ej. una decisión situacional con una ordenación) para observar distintos tipos de razonamiento.',
  'La preparación de plantillas permite reutilizar tu material pedagógico en múltiples salas y paralelos a lo largo del año.',
]

function Overview({
  activities,
  rooms,
  pending,
  templates = [],
  attempts = [],
  onNavigate,
  onSelect,
  firstName,
  todayLabel,
}: {
  activities: Activity[]
  rooms: Room[]
  pending: Activity[]
  templates?: EvaluationTemplate[]
  attempts?: StudentAttempt[]
  onNavigate: (view: View) => void
  onSelect: (activity: Activity) => void
  firstName: string
  todayLabel: string
}) {
  const [selectedFormat, setSelectedFormat] = useState<FormatCatalogItem | null>(null)
  const [tipIndex] = useState<number>(() => {
    try {
      const cached = sessionStorage.getItem('edueval-session-tip')
      if (cached !== null) {
        const parsed = parseInt(cached, 10)
        if (!isNaN(parsed) && parsed >= 0 && parsed < PEDAGOGICAL_TIPS.length) {
          return parsed
        }
      }
      const randomIndex = Math.floor(Math.random() * PEDAGOGICAL_TIPS.length)
      sessionStorage.setItem('edueval-session-tip', String(randomIndex))
      return randomIndex
    } catch {
      return 0
    }
  })

  const hour = new Date().getHours()
  const greeting = hour >= 5 && hour < 12 ? 'Buenos días' : hour >= 12 && hour < 19 ? 'Buenas tardes' : 'Buenas noches'

  const activeRooms = rooms.filter((r) => !['finished', 'archived'].includes(r.status))
  const recentRooms = rooms.slice(-3).reverse()

  const activeFormats = FORMAT_CATALOG.filter((f) => f.status === 'active')
  const upcomingFormats = FORMAT_CATALOG.filter((f) => f.status === 'upcoming')

  return (
    <>
      <PageIntro
        eyebrow={`${todayLabel.toUpperCase()} · PANEL DOCENTE`}
        title={`${greeting}, ${firstName}`}
        description="Bienvenido a tu espacio de evaluación activa y formativa."
        action={
          <button className="primary-button" onClick={() => onNavigate('content')}>
            ＋ Nuevo contenido
          </button>
        }
      />

      <section className="metric-grid">
        <Metric
          icon="◈"
          value={templates.length}
          label="Contenidos preparados"
          trend="Plantillas listas para evaluar"
          tone="mint"
        />
        <Metric
          icon="⌘"
          value={activeRooms.length}
          label="Salas activas"
          trend={activeRooms.length === 1 ? '1 sala en espera o curso' : `${activeRooms.length} en espera o curso`}
          tone="lavender"
        />
        <Metric
          icon="✓"
          value={attempts.length}
          label="Evaluaciones realizadas"
          trend="Privadas en Resultados"
          tone="peach"
        />
      </section>

      <div className="dashboard-grid">
        <section className="panel activity-panel">
          <div className="panel-heading">
            <div>
              <h2>Actividad de tus salas</h2>
              <p>Lo que está pasando en tus clases.</p>
            </div>
            <button className="text-button" onClick={() => onNavigate('rooms')}>
              Ver salas →
            </button>
          </div>

          {recentRooms.length ? (
            recentRooms.map((room) => {
              const isClosed = ['finished', 'archived'].includes(room.status)
              return (
                <div className="activity-row" key={room.id}>
                  <span className={`row-icon ${isClosed ? 'check' : 'room'}`}>
                    {isClosed ? '✓' : '⌘'}
                  </span>
                  <div>
                    <b>{room.name}</b>
                    <small>
                      {roomStatusLabel(room.status)} · código <b>{room.code}</b> · {room.questionCount} preguntas
                    </small>
                  </div>
                  {isClosed ? (
                    <button
                      type="button"
                      className="text-button btn-small"
                      onClick={() => onNavigate('results')}
                    >
                      Resultados →
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="outline-button btn-small"
                      onClick={() => onNavigate('rooms')}
                    >
                      Ir a sala →
                    </button>
                  )}
                </div>
              )
            })
          ) : (
            <div className="empty-state-mini">
              <span>⌘</span>
              <p>Aún no has abierto salas. Cuando crees una evaluación en vivo, verás su estado aquí.</p>
              <button className="text-button" onClick={() => onNavigate('rooms')}>
                Configurar una sala →
              </button>
            </div>
          )}
        </section>

        <section className="panel friendly-tip-panel">
          <div className="friendly-tip-head">
            <div className="friendly-tip-badge-wrap">
              <span className="friendly-tip-spark-anim">
                <IconSparkMascot size={28} />
              </span>
              <div>
                <p className="eyebrow friendly-eyebrow">CONSEJO DEL DÍA</p>
                <h3 className="friendly-tip-title">Pistas para tu clase</h3>
              </div>
            </div>
          </div>
          <div className="friendly-tip-bubble">
            <span className="friendly-quote-open" aria-hidden="true">“</span>
            <p className="friendly-tip-text">{PEDAGOGICAL_TIPS[tipIndex]}</p>
            <span className="friendly-quote-close" aria-hidden="true">”</span>
          </div>
        </section>
      </div>

      <section className="section-block formats-catalog-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">CATÁLOGO EDUCATIVO</p>
            <h2>Formatos de evaluación formativa</h2>
            <p className="section-subtitle">
              Conoce los tipos de razonamiento que puedes activar en tus estudiantes.
            </p>
          </div>
        </div>

        <div className="formats-catalog-grid">
          {activeFormats.map((item) => (
            <article key={item.id} className="format-catalog-card active">
              <div className="format-catalog-card-head">
                <span className="format-catalog-icon">{item.icon}</span>
                <span className="format-badge active">{item.badge}</span>
              </div>
              <h3>{item.title}</h3>
              <p>{item.subtitle}</p>
              <div className="format-catalog-card-foot">
                <button
                  type="button"
                  className="outline-button btn-small"
                  onClick={() => setSelectedFormat(item)}
                >
                  Descripción
                </button>
              </div>
            </article>
          ))}
        </div>

        <div className="upcoming-formats-heading">
          <div>
            <p className="eyebrow">HOJA DE RUTA PEDAGÓGICA</p>
            <h3>Próximos formatos formativos</h3>
            <p className="section-subtitle">
              Formatos en preparación hacia la suite de 21 actividades de evaluación activa.
            </p>
          </div>
        </div>

        <div className="formats-catalog-grid upcoming-grid">
          {upcomingFormats.map((item) => (
            <article key={item.id} className="format-catalog-card upcoming">
              <div className="format-catalog-card-head">
                <span className="format-catalog-icon">{item.icon}</span>
                <span className="format-badge upcoming">{item.badge}</span>
              </div>
              <h3>{item.title}</h3>
              <p>{item.subtitle}</p>
              <div className="format-catalog-card-foot">
                <button
                  type="button"
                  className="outline-button btn-small"
                  onClick={() => setSelectedFormat(item)}
                >
                  Descripción
                </button>
              </div>
            </article>
          ))}
        </div>
      </section>

      {selectedFormat && (
        <FormatDescriptionModal
          format={selectedFormat}
          onClose={() => setSelectedFormat(null)}
        />
      )}
    </>
  )
}

function FormatDescriptionModal({
  format,
  onClose,
}: {
  format: FormatCatalogItem
  onClose: () => void
}) {
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="format-modal-title">
      <div className="modal-card format-desc-modal">
        <div className="modal-head">
          <div>
            <div className="format-modal-eyebrow-wrap">
              <span className="modal-format-icon">{format.icon}</span>
              <span className={`format-badge ${format.status}`}>{format.badge}</span>
            </div>
            <h2 id="format-modal-title">{format.title}</h2>
            <p className="modal-subtitle">{format.subtitle}</p>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Cerrar descripción">
            ×
          </button>
        </div>

        <div className="format-desc-body">
          <section className="format-desc-block">
            <b>🎯 ¿Qué habilidad evalúa?</b>
            <p>{format.evaluates}</p>
          </section>

          <section className="format-desc-block">
            <b>📱 ¿Cómo lo vive el estudiante?</b>
            <p>{format.studentExperience}</p>
          </section>

          <section className="format-desc-block">
            <b>📝 ¿Qué requiere el contenido?</b>
            <p>{format.contentRequirements}</p>
          </section>
        </div>

        <div className="modal-actions">
          <button type="button" className="primary-button" onClick={onClose}>
            Entendido
          </button>
        </div>
      </div>
    </div>
  )
}

function Metric({ icon, value, label, trend, tone }: { icon: string; value: number | string; label: string; trend: string; tone: string }) {
  return (
    <div className={`metric-card ${tone}`}>
      <div className="metric-card-top">
        <span className="metric-icon">{icon}</span>
        <strong>{value}</strong>
      </div>
      <b>{label}</b>
      <small>{trend}</small>
    </div>
  )
}
function PageIntro({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: React.ReactNode; onHome?: () => void }) {
  return (
    <div className="page-intro">
      <div className="page-intro-copy">
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {action}
    </div>
  )
}
function ActivityCard({ activity, onOpen }: { activity: Activity; onOpen?: () => void }) { return <button type="button" className="activity-card" onClick={onOpen}><div className={`activity-type type-${activity.type}`}><span>{types[activity.type].icon}</span><small>{types[activity.type].label}</small></div><h3>{activity.title}</h3><p>{activity.topic}</p><div className="card-footer"><span className={`status-dot ${activity.status}`} />{activity.status === 'published' ? 'Publicada' : activity.status === 'pending' ? 'Por revisar' : 'Borrador'}<span className="card-arrow">↗</span></div></button> }

function ActivityPreview({ activity, onClose, onDelete }: { activity: Activity; onClose: () => void; onDelete?: () => void }) { const reusable = activity.status === 'published'; return <div className="modal-backdrop"><div className="modal-card"><div className="modal-head"><div><p className="eyebrow">VISTA DE ACTIVIDAD</p><h2>{activity.title}</h2><p className="modal-subtitle">{types[activity.type].label} · {activity.topic}</p></div><button type="button" className="icon-button" onClick={onClose}>×</button></div><div className="admin-notice"><span>{reusable ? '✓' : '!'}</span><div><b>{reusable ? 'Lista para reutilizar' : 'Pendiente de publicación'}</b><p>{reusable ? 'Esta actividad puede seleccionarse nuevamente al crear una sala.' : 'Aprueba esta actividad desde Propuestas para incluirla en una nueva sala.'}</p></div></div><p>{activity.prompt}</p>{activity.options?.length ? <div className="activity-check-list">{activity.options.map((option, index) => <div className="activity-check" key={`${activity.id}-option-${index}`}><span className="list-type">{index + 1}</span><span><b>{option}</b></span></div>)}</div> : null}<div className="modal-actions">{onDelete && <button type="button" className="outline-button danger-button" onClick={onDelete}>Eliminar actividad</button>}<button type="button" className="primary-button" onClick={onClose}>Cerrar</button></div></div></div> }

type ImportPayload =
  | ContentImportDocumentV1
  | { version: 2; topic: { title: string; subject: string; objective: string; competency: string; summary: string }; validActivities: Activity[]; activitiesNeedingRepair: ActivityNeedingRepair[] }

function ContentView({
  templates,
  activities,
  onCreateTemplate,
  onUpdateTemplate,
  onDeleteTemplate,
  onCreate,
  onImport,
  onSelect,
  onCreateRoom,
  onNavigateToProposals,
  onHome,
}: {
  templates: EvaluationTemplate[]
  activities: Activity[]
  onCreateTemplate: (template: EvaluationTemplate) => void
  onUpdateTemplate?: (template: EvaluationTemplate) => void
  onDeleteTemplate?: (template: EvaluationTemplate) => void
  onCreate: (activity: Activity) => void
  onImport: (payload: ImportPayload) => void
  onSelect: (activity: Activity) => void
  onCreateRoom?: (activityIds: string[]) => void
  onNavigateToProposals?: () => void
  onHome: () => void
}) {
  const [showTemplateForm, setShowTemplateForm] = useState(false)
  const [editingTemplate, setEditingTemplate] = useState<EvaluationTemplate | null>(null)
  const [activityForTemplate, setActivityForTemplate] = useState<EvaluationTemplate | null>(null)
  const [showJsonImport, setShowJsonImport] = useState(false)
  const hasSavedDraft = Boolean(readStorage<Partial<EvaluationTemplate> | null>('edueval-template-draft', null)?.title || readStorage<Partial<EvaluationTemplate> | null>('edueval-template-draft', null)?.subject)
  const [savedDraftActive, setSavedDraftActive] = useState(() => hasSavedDraft)

  const discardDraft = () => {
    if (window.confirm('¿Descartar el borrador de plantilla guardado automáticamente?')) {
      localStorage.removeItem('edueval-template-draft')
      setSavedDraftActive(false)
    }
  }

  return <>
    <PageIntro eyebrow="BIBLIOTECA DE CONTENIDO" title="Crea experiencias que importan" description="Estructura tus contenidos o impórtalos; EvaluEdu generará las actividades compatibles para evaluar ese contenido." action={<div className="content-actions"><button className="outline-button" onClick={() => setShowJsonImport(true)}>⇧ Importar JSON</button><button className="primary-button" onClick={() => setShowTemplateForm(true)}>＋ Nueva plantilla</button></div>} />
    <section className="template-section">
      <div className="section-heading">
        <div>
          <p className="eyebrow">MODELO PEDAGÓGICO</p>
          <h2>Plantillas de contenido</h2>
        </div>
        <span className="muted">La fuente de tus actividades</span>
      </div>
      {savedDraftActive && (
        <div className="admin-notice">
          <span>✎</span>
          <div>
            <b>Tienes un borrador pendiente.</b>
            <p>Continúa la plantilla guardada automáticamente para terminarla y aceptarla.</p>
          </div>
          <div className="draft-notice-actions">
            <button className="outline-button" onClick={() => setShowTemplateForm(true)}>Continuar borrador</button>
            <button className="text-button danger-text-button" onClick={discardDraft} title="Eliminar el borrador guardado">Descartar borrador</button>
          </div>
        </div>
      )}
      {templates.length ? (
        <div className="template-list">
          {templates.map((template) => (
            <TemplateCard
              key={template.id}
              template={template}
              activities={activities}
              onCreateRoom={onCreateRoom}
              onNavigateToProposals={onNavigateToProposals}
              onEditTemplate={() => setEditingTemplate(template)}
              onDeleteTemplate={() => onDeleteTemplate?.(template)}
              onAddActivity={() => setActivityForTemplate(template)}
            />
          ))}
        </div>
      ) : (
        <div className="template-empty">
          <span>◎</span>
          <div>
            <b>Aún no tienes una plantilla estructurada</b>
            <p>Define objetivos, conceptos, situaciones y procesos para que EvaluEdu pueda habilitar los formatos adecuados.</p>
          </div>
          <button className="outline-button" onClick={() => setShowTemplateForm(true)}>Crear la primera</button>
        </div>
      )}
    </section>
    {showTemplateForm && <TemplateBuilder onCancel={() => setShowTemplateForm(false)} onSave={(template) => { onCreateTemplate(template); setShowTemplateForm(false) }} />}
    {editingTemplate && <TemplateBuilder initialTemplate={editingTemplate} onCancel={() => setEditingTemplate(null)} onSave={(template) => { onUpdateTemplate?.(template); setEditingTemplate(null) }} />}
    {showJsonImport && <JsonImportModal onCancel={() => setShowJsonImport(false)} onImport={(payload) => { onImport(payload); setShowJsonImport(false) }} />}
    {activityForTemplate && <ActivityForm initialType="singleChoice" template={activityForTemplate} onCancel={() => setActivityForTemplate(null)} onSave={(activity) => { onCreate(activity); setActivityForTemplate(null) }} />}
  </>
}

function JsonImportModal({ onCancel, onImport }: { onCancel: () => void; onImport: (documentOrPayload: ImportPayload) => void }) {
  const [raw, setRaw] = useState('')
  const [fileName, setFileName] = useState('')
  const [copyStatus, setCopyStatus] = useState('Copiar prompt oficial')
  const [result, setResult] = useState<ReturnType<typeof parseContentImport> | null>(null)
  const validResult = result?.ok ? result : null
  const compatibleEntries = validResult ? Object.entries(validResult.compatibility).filter(([, item]) => item.available) : []
  const titleText = validResult ? (validResult.version === 2 ? validResult.topic.title : validResult.document.content.title) : ''
  const schemaVersion = validResult ? validResult.version : 2
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
  return <div className="modal-backdrop"><div className="modal-card json-import-modal"><div className="modal-head"><div><p className="eyebrow">IMPORTACIÓN CONTROLADA</p><h2>Importar contenido JSON</h2><p className="modal-subtitle">EvaluEdu no genera contenido con IA: valida el archivo, lo convierte en una plantilla interna y propone actividades para revisión docente.</p></div><button type="button" className="icon-button" onClick={onCancel}>×</button></div><div className="admin-notice"><span>i</span><div><b>Usa el prompt oficial con tu IA externa.</b><p>El prompt está bloqueado en modo solo lectura. EvaluEdu no confía en el prompt: valida siempre el JSON recibido y rechaza cualquier campo o estructura no autorizada.</p></div></div><details className="import-prompt-help"><summary>Ver prompt oficial del docente · solo lectura</summary><textarea className="import-prompt-readonly" value={OFFICIAL_IMPORT_PROMPT} readOnly rows={22} aria-label="Prompt oficial de importación, solo lectura" /><button type="button" className="outline-button" onClick={() => void copyPrompt()}>{copyStatus}</button></details><label>Seleccionar archivo JSON<input type="file" accept="application/json,.json" onChange={readFile} /></label>{fileName && <small className="field-hint">Archivo seleccionado: {fileName}</small>}<label>Pegar JSON<textarea value={raw} onChange={(event) => { setRaw(event.target.value); setResult(null) }} rows={10} placeholder={'{\n  "schema": "edueval.content",\n  "version": 2,\n  "topic": { ... },\n  "activities": [ ... ]\n}'} /></label><div className="modal-actions import-actions"><button type="button" className="outline-button" onClick={() => setResult(parseContentImport(raw))} disabled={!raw.trim()}>Validar JSON</button></div>{result && !result.ok && <div className="form-error import-errors"><b>No se puede importar todavía.</b><ul>{result.issues.map((issue, index) => <li key={`${issue.path}-${index}`}><code>{issue.path}</code> · {issue.message}</li>)}</ul></div>}{validResult && <section className="import-validation"><div className="admin-notice success"><span>✓</span><div><b>JSON válido · esquema v{schemaVersion}</b><p>{titleText} · {compatibleEntries.length} formato{compatibleEntries.length === 1 ? '' : 's'} compatible{compatibleEntries.length === 1 ? '' : 's'} detectado{compatibleEntries.length === 1 ? '' : 's'}.</p></div></div><div className="compatibility-grid">{Object.entries(validResult.compatibility).map(([key, item]) => <div className={`compatibility-item ${item.available ? '' : 'unavailable'}`} key={key}><span>{item.available ? '✓' : '×'}</span><b>{types[key as ActivityType].label}</b><small>{item.available ? 'Se propondrá para revisión' : item.reason}</small></div>)}</div>{!compatibleEntries.length && <div className="form-error">El esquema es válido, pero falta información para detectar una actividad compatible. Completa conceptos, situaciones, pasos o categorías y vuelve a validar.</div>}</section>}<div className="modal-actions"><button type="button" className="outline-button" onClick={onCancel}>Cancelar</button><button type="button" className="primary-button" disabled={!validResult || !compatibleEntries.length} onClick={() => {
    if (!validResult) return
    if (validResult.version === 2) {
      onImport({ version: 2, topic: validResult.topic, validActivities: validResult.validActivities, activitiesNeedingRepair: validResult.activitiesNeedingRepair })
    } else {
      onImport(validResult.document)
    }
  }}>Aceptar e ir a propuestas →</button></div></div></div>
}

function compatibility(template: EvaluationTemplate): Record<ActivityType, { available: boolean; reason: string }> {
  return detectContentCompatibility(template)
}

function buildActivitiesFromTemplate(template: EvaluationTemplate): Activity[] {
  const matches = compatibility(template)
  const concepts = template.concepts.filter((item) => item.name.trim() && item.definition.trim())
  const situations = template.situations.filter((item) => item.title.trim() && item.context.trim() && item.decision.trim() && item.consequence.trim())
  const steps = template.processSteps.map((s) => s.trim()).filter(Boolean)
  const categories = template.categories.map((c) => c.trim()).filter(Boolean)
  const firstSituation = situations[0]
  const activities: Activity[] = []

  // 1. FALSO / VERDADERO v1.2
  if (matches.trueFalse.available && concepts.length > 0) {
    const c = concepts[0]
    const statement = `${c.name}: ${c.definition}`
    const hint = `Revisa los principios y definiciones clave abordados en ${template.title}.`
    const explanation = `El contenido formativo establece que ${c.name} se define como: ${c.definition}`
    activities.push({
      id: `act-${Date.now()}-tf1`,
      templateId: template.id,
      title: `${template.title} · Comprueba`,
      type: 'trueFalse',
      topic: template.subject,
      difficulty: template.difficulty,
      prompt: statement,
      options: ['Verdadero', 'Falso'],
      answer: 'Verdadero',
      feedback: hint,
      details: {
        trueFalse: {
          statement,
          correct: true,
          hint,
          explanation,
        },
      },
      status: 'published',
    })

    // Si hay un segundo concepto, generamos una segunda variante de contraste con clave Falso
    if (concepts.length >= 2) {
      const c1 = concepts[0]
      const c2 = concepts[1]
      const falseStatement = `${c1.name} se caracteriza principalmente por ${c2.definition}`
      const falseHint = `Compara las características distintivas entre ${c1.name} y los demás conceptos del tema.`
      const falseExplanation = `La afirmación es falsa porque esa definición corresponde a ${c2.name}, no a ${c1.name}.`
      activities.push({
        id: `act-${Date.now()}-tf2`,
        templateId: template.id,
        title: `${template.title} · Discrimina`,
        type: 'trueFalse',
        topic: template.subject,
        difficulty: template.difficulty,
        prompt: falseStatement,
        options: ['Verdadero', 'Falso'],
        answer: 'Falso',
        feedback: falseHint,
        details: {
          trueFalse: {
            statement: falseStatement,
            correct: false,
            hint: falseHint,
            explanation: falseExplanation,
          },
        },
        status: 'published',
      })
    }
  }

  // 2. SELECCIÓN ÚNICA v1.2
  if (matches.singleChoice.available && concepts.length > 0) {
    const target = concepts[0]
    const prompt = `¿Cuál de las siguientes opciones define con mayor precisión a "${target.name}"?`
    const hint = `Relaciona el término con su propósito central explicado en el contenido.`
    const explanation = `La opción correcta corresponde a la definición estructurada de ${target.name}.`

    const options: ChoiceOption[] = [
      { id: makeEditorId('choice-'), label: target.definition, correct: true },
    ]
    if (concepts.length > 1) {
      for (let i = 1; i < Math.min(concepts.length, 4); i++) {
        options.push({ id: makeEditorId('choice-'), label: concepts[i].definition, correct: false })
      }
    }
    if (options.length < 3) {
      options.push({ id: makeEditorId('choice-'), label: 'Se enfoca exclusivamente en la gestión sin considerar los factores del entorno.', correct: false })
    }
    if (options.length < 3) {
      options.push({ id: makeEditorId('choice-'), label: 'Sustituye la evaluación sistemática por intervenciones no verificables.', correct: false })
    }
    const shuffledOptions = shuffleItems(options)

    activities.push({
      id: `act-${Date.now()}-sc`,
      templateId: template.id,
      title: `${template.title} · Elige`,
      type: 'singleChoice',
      topic: template.subject,
      difficulty: template.difficulty,
      prompt,
      options: shuffledOptions.map((o) => o.label),
      answer: target.definition,
      feedback: hint,
      details: {
        singleChoice: {
          options: shuffledOptions,
          hint,
          explanation,
        },
      },
      status: 'published',
    })
  }

  // 3. ASOCIACIÓN (MATCHING) v1.2
  if (matches.matching.available && concepts.length >= 2) {
    const prompt = 'Relaciona cada concepto con su definición correspondiente.'
    const hint = 'Distingue cada concepto de su función o definición específica en el tema.'
    const cleanPairs: MatchingPair[] = concepts.slice(0, 5).map((c) => ({
      id: makeEditorId('pair-'),
      left: c.name,
      right: c.definition,
    }))
    const options = cleanPairs.map((p) => `${p.left} → ${p.right}`)

    activities.push({
      id: `act-${Date.now()}-mat`,
      templateId: template.id,
      title: `${template.title} · Relaciona`,
      type: 'matching',
      topic: template.subject,
      difficulty: template.difficulty,
      prompt,
      options,
      answer: options,
      feedback: hint,
      details: {
        matching: {
          pairs: cleanPairs,
          hint,
          explanation: 'Correspondencias directas basadas en las definiciones de la plantilla.',
        },
      },
      status: 'published',
    })
  }

  // 4. CLASIFICACIÓN (SORTING) v1.2
  if (matches.sorting.available && categories.length >= 2 && concepts.length >= 2) {
    const prompt = 'Clasifica los siguientes elementos en la categoría que les corresponde.'
    const hint = 'Analiza a qué categoría o grupo conceptual pertenece cada elemento.'
    const cleanCategories = categories.slice(0, 4)
    const cleanItems: SortingItem[] = concepts.slice(0, 8).map((c, idx) => ({
      id: makeEditorId('sort-'),
      label: c.name,
      category: cleanCategories[idx % cleanCategories.length],
    }))

    activities.push({
      id: `act-${Date.now()}-sort`,
      templateId: template.id,
      title: `${template.title} · Clasifica`,
      type: 'sorting',
      topic: template.subject,
      difficulty: template.difficulty,
      prompt,
      options: cleanItems.map((item) => item.label),
      answer: cleanItems.map((item) => item.category),
      feedback: hint,
      details: {
        sorting: {
          categories: cleanCategories,
          items: cleanItems,
          hint,
          explanation: 'Clasificación basada en las categorías y conceptos del tema.',
        },
      },
      status: 'published',
    })
  }

  // 5. ORDENAMIENTO (ORDERING) v1.2
  if (matches.ordering.available && steps.length >= 2) {
    const prompt = 'Ordena los pasos del proceso según la secuencia pedagógica del contenido.'
    const hint = 'Recuerda cuál es el paso inicial y cómo progresa ordenadamente la secuencia.'
    const cleanSteps = steps.slice(0, 6)

    activities.push({
      id: `act-${Date.now()}-ord`,
      templateId: template.id,
      title: `${template.title} · Ordena`,
      type: 'ordering',
      topic: template.subject,
      difficulty: template.difficulty,
      prompt,
      options: cleanSteps,
      answer: cleanSteps,
      feedback: hint,
      details: {
        ordering: {
          steps: cleanSteps,
          hint,
          explanation: 'Secuencia basada en el orden de las etapas de la plantilla.',
        },
      },
      status: 'published',
    })
  }

  // 6. ESCENARIO DE DECISIONES v1.2
  if (matches.scenario.available && firstSituation) {
    const prompt = firstSituation.context
    const hint = 'Evalúa las consecuencias directas de cada decisión antes de confirmar tu respuesta.'
    const explanation = firstSituation.consequence || 'La decisión recomendada previene el riesgo y asegura la sostenibilidad del proceso.'
    const stages: ScenarioStage[] = [
      {
        id: makeEditorId('stage-'),
        title: firstSituation.title || 'Decisión principal',
        prompt: firstSituation.decision || '¿Qué acción debe tomarse primero?',
        options: [
          {
            id: makeEditorId('opt-'),
            text: firstSituation.decision,
            consequence: firstSituation.consequence || 'Se implementa la solución esperada reduciendo el impacto negativo.',
            feedback: 'Decisión fundamentada en la evidencia del contenido.',
            recommended: true,
          },
          {
            id: makeEditorId('opt-'),
            text: 'Postergar la decisión hasta obtener consenso unánime',
            consequence: 'El problema puede escalar y generar consecuencias de mayor gravedad en la comunidad.',
            feedback: 'En situaciones críticas la dilación injustificada incrementa el riesgo.',
            recommended: false,
          },
          {
            id: makeEditorId('opt-'),
            text: 'Delegar la responsabilidad sin supervisión ni protocolo',
            consequence: 'Se pierde trazabilidad y no se garantiza el cumplimiento de los estándares.',
            feedback: 'La toma de decisiones requiere seguimiento estructurado.',
            recommended: false,
          },
        ],
      },
    ]

    activities.push({
      id: `act-${Date.now()}-scen`,
      templateId: template.id,
      title: `${template.title} · Decisión`,
      type: 'scenario',
      topic: template.subject,
      difficulty: template.difficulty,
      prompt,
      options: stages[0].options.map((opt) => opt.text),
      answer: firstSituation.decision,
      feedback: hint,
      details: {
        scenario: {
          situation: firstSituation.context,
          stages,
          hint,
          explanation,
        },
      },
      status: 'published',
    })
  }

  return activities
}

function TemplateCard({
  template,
  activities,
  onCreateRoom,
  onNavigateToProposals,
  onEditTemplate,
  onDeleteTemplate,
  onAddActivity,
}: {
  template: EvaluationTemplate
  activities: Activity[]
  onCreateRoom?: (activityIds: string[]) => void
  onNavigateToProposals?: () => void
  onEditTemplate?: () => void
  onDeleteTemplate?: () => void
  onAddActivity?: () => void
}) {
  const matches = compatibility(template)
  const imported = template.source === 'json'
  const templateActivities = activities.filter((item) => item.templateId === template.id)
  const publishedActivities = templateActivities.filter((item) => item.status === 'published')
  const pendingActivities = templateActivities.filter((item) => item.status === 'pending')

  return (
    <article className="template-card">
      <div className="template-card-head">
        <div>
          <p className="eyebrow">
            {imported
              ? publishedActivities.length > 0
                ? 'CONTENIDO APROBADO · ' + publishedActivities.length + ' ACTIVIDADES LISTAS'
                : 'IMPORTADO · ' + (pendingActivities.length > 0 ? pendingActivities.length + ' PENDIENTES' : 'REVISIÓN PENDIENTE')
              : template.status === 'accepted'
                ? 'CONTENIDO ACEPTADO'
                : 'BORRADOR'}
          </p>
          <h3>{template.title || 'Sin título'}</h3>
          <p>{template.subject || 'Sin asignatura'}</p>
        </div>

        <div className="template-card-top-action">
          {publishedActivities.length > 0 ? (
            <button
              type="button"
              className="primary-button btn-small"
              onClick={() => onCreateRoom?.(publishedActivities.map((a) => a.id))}
              title="Crear una sala con las actividades aprobadas de este tema"
            >
              ＋ Crear sala
            </button>
          ) : pendingActivities.length > 0 ? (
            <button
              type="button"
              className="outline-button btn-small"
              onClick={onNavigateToProposals}
              title="Revisar propuestas pendientes"
            >
              Ver propuestas ({pendingActivities.length})
            </button>
          ) : (
            <span className={`tag ${template.status === 'accepted' ? 'published' : 'draft'}`}>
              {template.status === 'accepted' ? 'Aceptada' : 'Borrador'}
            </span>
          )}
        </div>
      </div>

      <p className="template-description">{template.description || 'Sin descripción todavía.'}</p>
      <div className="template-stats">
        <span>{publishedActivities.length} actividades listas</span>
        {pendingActivities.length > 0 && <span>{pendingActivities.length} por revisar</span>}
        {template.concepts.length > 0 && <span>{template.concepts.length} conceptos</span>}
        {template.situations.length > 0 && <span>{template.situations.length} situaciones</span>}
      </div>

      <div className="compatibility-grid">
        {Object.entries(types).map(([key, value]) => {
          const actType = key as ActivityType
          const publishedOfType = publishedActivities.filter((a) => a.type === actType)
          const pendingOfType = pendingActivities.filter((a) => a.type === actType)
          const legacyAvailable = matches[actType]?.available

          const hasPublished = publishedOfType.length > 0
          const hasPending = pendingOfType.length > 0

          let statusClass = 'unavailable'
          let icon = '×'
          let detail = matches[actType]?.reason || 'Sin contenido'

          if (hasPublished) {
            statusClass = 'available active'
            icon = '✓'
            detail = `${publishedOfType.length} lista${publishedOfType.length === 1 ? '' : 's'} para evaluar`
          } else if (hasPending) {
            statusClass = 'available pending-review'
            icon = '◌'
            detail = `${pendingOfType.length} en propuestas`
          } else if (legacyAvailable) {
            statusClass = 'available'
            icon = '✓'
            detail = 'Compatible con el contenido'
          }

          return (
            <div className={`compatibility-item ${statusClass}`} key={key}>
              <span>{icon}</span>
              <b>{value.label}</b>
              <small>{detail}</small>
            </div>
          )
        })}
      </div>

      <div className="template-card-footer">
        <div className="template-card-meta-info">
          <span className={`status-dot ${template.status === 'accepted' ? 'published' : 'draft'}`} />
          <small>{template.status === 'accepted' ? 'Contenido listo para evaluar' : 'Plantilla en borrador'}</small>
        </div>
        <div className="template-card-actions">
          <button
            type="button"
            className="outline-button btn-small"
            onClick={onAddActivity}
            title="Crear y agregar una actividad manual a este tema"
          >
            ＋ Agregar actividad
          </button>
          <button
            type="button"
            className="outline-button btn-small"
            onClick={onEditTemplate}
            title="Editar y ajustar conceptos o campos de esta plantilla"
          >
            ✎ Editar plantilla
          </button>
          <button
            type="button"
            className="outline-button btn-small danger-text-button"
            onClick={onDeleteTemplate}
            title="Eliminar esta plantilla y sus actividades asociadas"
          >
            🗑 Eliminar
          </button>
        </div>
      </div>
    </article>
  )
}


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
  return <div className="modal-backdrop"><article className="modal-card template-preview printable-template"><div className="modal-head"><div><p className="eyebrow">VISTA PREVIA DE PLANTILLA</p><h2>{template.title || 'Sin título'}</h2><p className="modal-subtitle">{template.subject || 'Sin asignatura'}</p></div><button type="button" className="icon-button no-print" onClick={onClose}>×</button></div><div className="preview-hero"><p>{template.description || 'Sin descripción breve.'}</p><div><b>Objetivo</b><span>{template.objective || 'Pendiente de completar.'}</span></div><div><b>Competencia</b><span>{template.competency || 'No especificada.'}</span></div></div><div className="preview-grid"><section><p className="eyebrow">CONCEPTOS</p>{template.concepts.filter((item) => item.name.trim() || item.definition.trim()).length ? template.concepts.filter((item) => item.name.trim() || item.definition.trim()).map((item) => <div className="preview-item" key={item.id}><b>{item.name || 'Sin nombre'}</b><span>{item.definition || 'Sin definición'}</span>{item.example && <small>Ejemplo: {item.example}</small>}</div>) : <p className="preview-empty">No hay conceptos cargados.</p>}</section><section><p className="eyebrow">SITUACIONES</p>{template.situations.filter((item) => item.title.trim() || item.context.trim()).length ? template.situations.filter((item) => item.title.trim() || item.context.trim()).map((item) => <div className="preview-item" key={item.id}><b>{item.title || 'Sin título'}</b><span>{item.context || 'Sin contexto'}</span><small>Decisión: {item.decision || 'Pendiente'} · Consecuencia: {item.consequence || 'Pendiente'}</small></div>) : <p className="preview-empty">No hay situaciones cargadas.</p>}</section></div><div className="preview-grid"><section><p className="eyebrow">PROCESO</p>{template.processSteps.length ? <ol className="preview-list">{template.processSteps.map((step, index) => <li key={'preview-step-' + index}>{step}</li>)}</ol> : <p className="preview-empty">No hay pasos cargados.</p>}</section><section><p className="eyebrow">CATEGORÍAS</p>{template.categories.length ? <div className="preview-tags">{template.categories.map((category, index) => <span key={'preview-category-' + index}>{category}</span>)}</div> : <p className="preview-empty">No hay categorías cargados.</p>}</section></div><section className="preview-compatibility"><p className="eyebrow">FORMATOS COMPATIBLES</p><div className="compatibility-grid">{Object.entries(types).map(([key, value]) => <div className={'compatibility-item ' + (matches[key as ActivityType].available ? '' : 'unavailable')} key={key}><span>{matches[key as ActivityType].available ? '✓' : '×'}</span><b>{value.label}</b><small>{matches[key as ActivityType].available ? 'Se generará al aceptar' : matches[key as ActivityType].reason}</small></div>)}</div></section><div className="modal-actions no-print"><button type="button" className="outline-button" onClick={onClose}>Volver a editar</button><button type="button" className="primary-button" onClick={onPrint}>Imprimir / guardar PDF</button></div></article></div>
}

function TemplateBuilder({ initialTemplate, onCancel, onSave }: { initialTemplate?: EvaluationTemplate; onCancel: () => void; onSave: (template: EvaluationTemplate) => void }) {
  const savedDraft = initialTemplate ?? readStorage<Partial<EvaluationTemplate>>('edueval-template-draft', {})
  const [title, setTitle] = useState(savedDraft.title ?? 'Nueva plantilla')
  const [subject, setSubject] = useState(savedDraft.subject ?? '')
  const [description, setDescription] = useState(savedDraft.description ?? '')
  const [objective, setObjective] = useState(savedDraft.objective ?? '')
  const [competency, setCompetency] = useState(savedDraft.competency ?? '')
  const difficulty: EvaluationTemplate['difficulty'] = savedDraft.difficulty ?? 'Intermedio'
  const [concepts, setConcepts] = useState<ContentConcept[]>(savedDraft.concepts?.length ? savedDraft.concepts : [{ id: 'c1', name: '', definition: '', example: '' }])
  const [situations, setSituations] = useState<ContentSituation[]>(savedDraft.situations?.length ? savedDraft.situations : [{ id: 's1', title: '', context: '', decision: '', consequence: '' }])
  const [processSteps, setProcessSteps] = useState((savedDraft.processSteps ?? []).join('\n'))
  const [categories, setCategories] = useState((savedDraft.categories ?? []).join('\n'))
  const [error, setError] = useState('')
  const [autosaveStatus, setAutosaveStatus] = useState('')
  const [showPreview, setShowPreview] = useState(false)
  const processStepList = processSteps.split('\n').map((item) => item.trim()).filter(Boolean)
  const categoryList = categories.split('\n').map((item) => item.trim()).filter(Boolean)
  const currentTemplate: EvaluationTemplate = {
    id: initialTemplate?.id || 'preview',
    title,
    subject,
    description,
    objective,
    competency,
    difficulty,
    concepts,
    situations,
    processSteps: processStepList,
    categories: categoryList,
    status: initialTemplate?.status || 'draft',
    updatedAt: new Date().toISOString(),
  }
  const matches = compatibility(currentTemplate)
  const progress = getTemplateProgress(title, subject, objective, concepts, situations, processStepList, categoryList)

  useEffect(() => {
    if (!initialTemplate) {
      localStorage.setItem('edueval-template-draft', JSON.stringify(currentTemplate))
      setAutosaveStatus('Borrador guardado automáticamente')
      const timer = window.setTimeout(() => setAutosaveStatus(''), 1800)
      return () => window.clearTimeout(timer)
    }
  }, [title, subject, description, objective, competency, difficulty, concepts, situations, processSteps, categories, initialTemplate])

  const handleSave = (status: EvaluationTemplate['status']) => {
    if (!title.trim() || !subject.trim() || !objective.trim()) return setError('Completa título, asignatura y objetivo antes de guardar.')
    if (status === 'accepted' && !Object.values(matches).some((item) => item.available)) return setError('Para aceptar la plantilla, completa al menos un bloque de contenido compatible.')
    setError('')
    if (!initialTemplate) {
      localStorage.removeItem('edueval-template-draft')
    }
    onSave({
      ...currentTemplate,
      id: initialTemplate?.id || '',
      status,
      updatedAt: new Date().toISOString(),
    })
  }
  const updateConcept = (id: string, key: keyof ContentConcept, value: string) => setConcepts((current) => current.map((item) => item.id === id ? { ...item, [key]: value } : item))
  const updateSituation = (id: string, key: keyof ContentSituation, value: string) => setSituations((current) => current.map((item) => item.id === id ? { ...item, [key]: value } : item))
  return <div className="modal-backdrop"><form className="modal-card template-modal" onSubmit={(event) => { event.preventDefault(); handleSave('draft') }}><div className="modal-head"><div><p className="eyebrow">{initialTemplate ? 'EDITAR PLANTILLA DE CONTENIDO' : 'CONSTRUCTOR DE PLANTILLA'}</p><h2>{initialTemplate ? 'Modificar contenido' : 'Estructura tu contenido'}</h2><p className="modal-subtitle">{initialTemplate ? 'Ajusta los objetivos, conceptos o situaciones de este contenido.' : 'La plantilla es la fuente; al aprobarla se generan las actividades compatibles.'}</p></div><button type="button" className="icon-button" onClick={onCancel}>×</button></div><div className="template-progress"><div className="template-progress-head"><div><b>Progreso de la plantilla</b><small>{progress.completed} de {progress.total} criterios completos</small></div><strong>{progress.percent}%</strong></div><div className="progress-track"><span style={{ width: progress.percent + '%' }} /></div><div className="progress-checks">{progress.checks.map((check) => <span className={check.done ? 'done' : ''} key={check.label}>{check.done ? '✓' : '○'} {check.label}</span>)}</div></div><div className="autosave-status">{autosaveStatus || 'Los cambios se guardan localmente mientras editas.'}</div><div className="form-grid"><label>Título de la plantilla *<input required value={title} onChange={(event) => setTitle(event.target.value)} /></label><label>Asignatura o área *<input required value={subject} onChange={(event) => setSubject(event.target.value)} placeholder="Ej. Ciencias naturales" /></label></div><label>Descripción breve<textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={2} placeholder="¿Qué aprenderá el grupo?" /></label><div className="form-grid"><label>Objetivo de aprendizaje *<textarea required value={objective} onChange={(event) => setObjective(event.target.value)} rows={3} /></label><label>Competencia o capacidad<textarea value={competency} onChange={(event) => setCompetency(event.target.value)} rows={3} /></label></div><label>Respaldo<div className="backup-actions"><button type="button" className="outline-button" onClick={() => setShowPreview(true)}>Vista previa</button><small>Desde la vista previa puedes imprimir o guardar como PDF.</small></div></label><div className="template-block"><div className="block-heading"><div><p className="eyebrow">CONCEPTOS Y DEFINICIONES</p><b>Ideas que deben comprender</b></div><button type="button" className="text-button" onClick={() => setConcepts((current) => [...current, { id: 'c' + Date.now(), name: '', definition: '', example: '' }])}>＋ Agregar concepto</button></div>{concepts.map((concept) => <div className="repeatable-card" key={concept.id}><div className="repeatable-row"><input aria-label="Nombre del concepto" placeholder="Concepto" value={concept.name} onChange={(event) => updateConcept(concept.id, 'name', event.target.value)} /><button type="button" className="remove-button" onClick={() => setConcepts((current) => current.length > 1 ? current.filter((item) => item.id !== concept.id) : current)}>×</button></div><textarea aria-label="Definición" placeholder="Definición" value={concept.definition} onChange={(event) => updateConcept(concept.id, 'definition', event.target.value)} rows={2} /><input aria-label="Ejemplo" placeholder="Ejemplo o característica" value={concept.example} onChange={(event) => updateConcept(concept.id, 'example', event.target.value)} /></div>)}</div><div className="template-block"><div className="block-heading"><div><p className="eyebrow">SITUACIONES Y CONSECUENCIAS</p><b>Casos para decidir y reflexionar</b></div><button type="button" className="text-button" onClick={() => setSituations((current) => [...current, { id: 's' + Date.now(), title: '', context: '', decision: '', consequence: '' }])}>＋ Agregar situación</button></div>{situations.map((situation) => <div className="repeatable-card" key={situation.id}><div className="repeatable-row"><input aria-label="Título de situación" placeholder="Título del caso" value={situation.title} onChange={(event) => updateSituation(situation.id, 'title', event.target.value)} /><button type="button" className="remove-button" onClick={() => setSituations((current) => current.length > 1 ? current.filter((item) => item.id !== situation.id) : current)}>×</button></div><textarea aria-label="Contexto" placeholder="Contexto de la situación" value={situation.context} onChange={(event) => updateSituation(situation.id, 'context', event.target.value)} rows={2} /><div className="form-grid"><input aria-label="Decisión esperada" placeholder="Decisión o pregunta" value={situation.decision} onChange={(event) => updateSituation(situation.id, 'decision', event.target.value)} /><input aria-label="Consecuencia" placeholder="Consecuencia o feedback" value={situation.consequence} onChange={(event) => updateSituation(situation.id, 'consequence', event.target.value)} /></div></div>)}</div><div className="form-grid"><label>Pasos de un proceso<span className="field-hint">Un paso por línea; habilita ordenamiento desde dos pasos.</span><textarea value={processSteps} onChange={(event) => setProcessSteps(event.target.value)} rows={5} placeholder={'Observar\nAnalizar\nDecidir'} /></label><label>Categorías<span className="field-hint">Una categoría por línea; habilita clasificación.</span><textarea value={categories} onChange={(event) => setCategories(event.target.value)} rows={5} placeholder={'Causa\nConsecuencia'} /></label></div><section className="compatibility-preview"><div className="block-heading"><div><p className="eyebrow">COMPATIBILIDAD EN TIEMPO REAL</p><b>Formatos que se generarán al aceptar</b></div></div><div className="compatibility-grid">{Object.entries(types).map(([key, value]) => { const item = matches[key as ActivityType]; return <div className={'compatibility-item ' + (item.available ? '' : 'unavailable')} key={key}><span>{item.available ? '✓' : '×'}</span><b>{value.label}</b><small>{item.available ? 'Se creará automáticamente' : item.reason}</small></div> })}</div></section>{error && <div className="form-error">! {error}</div>}<div className="form-note">✓ Guardar borrador conserva la estructura. Aceptar contenido aprueba la plantilla y crea automáticamente las actividades compatibles; no requiere una segunda aprobación por actividad.</div><div className="modal-actions"><button type="button" className="outline-button" onClick={onCancel}>Cancelar</button><button type="button" className="outline-button" onClick={() => setShowPreview(true)}>Vista previa</button><button type="submit" className="outline-button">Guardar borrador</button><button type="button" className="primary-button" onClick={() => handleSave('accepted')}>Aceptar contenido</button></div>{showPreview && <TemplatePreview template={currentTemplate} onClose={() => setShowPreview(false)} onPrint={() => window.print()} />}</form></div>
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
  trueFalse: { context: string; statement: string; correct: boolean | null; explanation: string; hint: string }
  singleChoice: { context: string; options: ChoiceOption[]; hint: string; explanation: string }
  matching: { context: string; pairs: MatchingPair[]; hint: string; explanation: string }
  sorting: { context: string; categories: string[]; items: SortingItem[]; hint: string; explanation: string }
  ordering: { context: string; steps: string[]; hint: string; explanation: string }
  scenario: { situation: string; stages: ScenarioStage[]; hint: string; explanation: string }
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
    // Falso/verdadero v1.2: la clave queda sin elegir y la pista/explicación vacías; el docente debe completarlas.
    trueFalse: {
      context: '',
      statement: completeConcepts[0] ? completeConcepts[0].name + ': ' + completeConcepts[0].definition : '',
      correct: null,
      explanation: '',
      hint: '',
    },
    // Selección única v1.2: ninguna opción viene marcada como correcta por defecto; el docente debe elegir la clave y redactar la pista.
    singleChoice: {
      context: '',
      options: (concepts.length >= 2 ? concepts.map((item) => item.name) : ['', '']).slice(0, 6).map((label) => ({ id: makeEditorId('choice-'), label, correct: false })),
      hint: '',
      explanation: '',
    },
    // Asociación v1.2: pares con pista orientadora obligatoria y explicación privada opcional.
    matching: {
      context: '',
      pairs: (completeConcepts.length >= 2 ? completeConcepts : [{ id: 'empty-1', name: '', definition: '', example: '' }, { id: 'empty-2', name: '', definition: '', example: '' }]).slice(0, 6).map((item) => ({ id: makeEditorId('pair-'), left: item.name, right: item.definition })),
      hint: '',
      explanation: '',
    },
    // Clasificación v1.2: categorías, elementos, pista orientadora obligatoria y explicación privada opcional.
    sorting: {
      context: '',
      categories: (categories.length >= 2 ? categories : ['Categoría A', 'Categoría B']).slice(0, 6),
      items: (concepts.length ? concepts : [{ id: 'item-1', name: '', definition: '', example: '' }, { id: 'item-2', name: '', definition: '', example: '' }]).slice(0, 12).map((item, index) => ({ id: makeEditorId('sort-'), label: item.name, category: (categories.length >= 2 ? categories : ['Categoría A', 'Categoría B'])[index % 2] })),
      hint: '',
      explanation: '',
    },
    // Ordenamiento v1.2: pasos en secuencia lógica, pista orientadora obligatoria y explicación privada opcional.
    ordering: {
      context: '',
      steps: (steps.length >= 3 ? steps : ['Paso inicial', 'Paso intermedio', 'Paso final']).slice(0, 8),
      hint: '',
      explanation: '',
    },
    // Escenario de decisiones v1.2: caso contextualizado, etapas con consecuencias pedagógicas, pista orientadora y justificación privada.
    scenario: {
      situation: firstSituation || template?.description || 'En una situación comunitaria se presentan diferentes posturas sobre cómo abordar una problemática compartida.',
      stages: [{ id: makeEditorId('stage-'), title: 'Decisión principal', prompt: situation?.decision || template?.objective || '¿Qué acción debe tomarse primero?', options: scenarioOptions }],
      hint: '',
      explanation: '',
    },
  }
}

function activityToEditorState(activity: Activity, template?: EvaluationTemplate): ActivityEditorState {
  const base = createEditorState(template)
  const d = activity.details
  if (activity.type === 'trueFalse') {
    const tf = d?.trueFalse
    const correctBool = tf?.correct !== undefined
      ? tf.correct
      : activity.answer === 'Verdadero'
        ? true
        : activity.answer === 'Falso'
          ? false
          : null
    return {
      ...base,
      trueFalse: {
        context: tf?.context || '',
        statement: tf?.statement || activity.prompt || '',
        correct: correctBool,
        explanation: tf?.explanation || '',
        hint: tf?.hint || activity.feedback || '',
      },
    }
  }
  if (activity.type === 'singleChoice') {
    const sc = d?.singleChoice
    const options: ChoiceOption[] = sc?.options && sc.options.length
      ? sc.options.map((opt) => ({ id: opt.id || makeEditorId('choice-'), label: opt.label, correct: Boolean(opt.correct) }))
      : activity.options.map((opt) => ({
          id: makeEditorId('choice-'),
          label: opt,
          correct: opt === activity.answer,
        }))
    return {
      ...base,
      singleChoice: {
        context: sc?.context || '',
        options: options.length >= 2 ? options : [{ id: makeEditorId('choice-'), label: '', correct: false }, { id: makeEditorId('choice-'), label: '', correct: false }],
        hint: sc?.hint || activity.feedback || '',
        explanation: sc?.explanation || '',
      },
    }
  }
  if (activity.type === 'matching') {
    const m = d?.matching
    let pairs: MatchingPair[] = m?.pairs && m.pairs.length ? m.pairs : []
    if (!pairs.length && activity.options.length) {
      pairs = activity.options.map((opt) => {
        const parts = opt.split('→').map((s) => s.trim())
        return { id: makeEditorId('pair-'), left: parts[0] || opt, right: parts[1] || '' }
      })
    }
    return {
      ...base,
      matching: {
        context: m?.context || '',
        pairs: pairs.length >= 2 ? pairs : [{ id: makeEditorId('pair-'), left: '', right: '' }, { id: makeEditorId('pair-'), left: '', right: '' }],
        hint: m?.hint || activity.feedback || '',
        explanation: m?.explanation || '',
      },
    }
  }
  if (activity.type === 'sorting') {
    const s = d?.sorting
    return {
      ...base,
      sorting: {
        context: s?.context || '',
        categories: s?.categories && s.categories.length ? s.categories : ['Categoría A', 'Categoría B'],
        items: s?.items && s.items.length ? s.items : [{ id: makeEditorId('sort-'), label: '', category: '' }],
        hint: s?.hint || activity.feedback || '',
        explanation: s?.explanation || '',
      },
    }
  }
  if (activity.type === 'ordering') {
    const o = d?.ordering
    const steps = o?.steps && o.steps.length ? o.steps : (activity.options.length ? activity.options : ['Paso 1', 'Paso 2'])
    return {
      ...base,
      ordering: {
        context: o?.context || '',
        steps,
        hint: o?.hint || activity.feedback || '',
        explanation: o?.explanation || '',
      },
    }
  }
  if (activity.type === 'scenario') {
    const sc = d?.scenario
    return {
      ...base,
      scenario: {
        situation: sc?.situation || activity.prompt || '',
        stages: sc?.stages && sc.stages.length ? sc.stages : base.scenario.stages,
        hint: sc?.hint || activity.feedback || '',
        explanation: sc?.explanation || '',
      },
    }
  }
  return base
}

function validateActivityEditor(type: ActivityType, title: string, prompt: string, value: ActivityEditorState): string {
  if (!title.trim()) return 'Escribe un título para la actividad.'
  if (!prompt.trim()) return 'Escribe la consigna que verá el estudiante.'
  if (type === 'trueFalse') { const issue = validateTrueFalseDefinition(trueFalseEditorToDefinition(value.trueFalse))[0]; if (issue) return trueFalseIssueMessage(issue.path, issue.message) }
  if (type === 'singleChoice') { const issue = validateSingleChoiceDefinition(singleChoiceEditorToDefinition(prompt, value.singleChoice))[0]; if (issue) return singleChoiceIssueMessage(issue.path, issue.message) }
  if (type === 'matching') { const issue = validateMatchingDefinition(matchingEditorToDefinition(prompt, value.matching))[0]; if (issue) return matchingIssueMessage(issue.path, issue.message) }
  if (type === 'sorting') { const issue = validateSortingDefinition(sortingEditorToDefinition(prompt, value.sorting))[0]; if (issue) return sortingIssueMessage(issue.path, issue.message) }
  if (type === 'ordering') { const issue = validateOrderingDefinition(orderingEditorToDefinition(prompt, value.ordering))[0]; if (issue) return orderingIssueMessage(issue.path, issue.message) }
  if (type === 'scenario') { const issue = validateScenarioDefinition(scenarioEditorToDefinition(prompt, value.scenario))[0]; if (issue) return scenarioIssueMessage(issue.path, issue.message) }
  return ''
}

function editorStateToActivity(type: ActivityType, value: ActivityEditorState, common: { templateId?: string; title: string; topic: string; difficulty: Activity['difficulty']; prompt: string; feedback: string }): Activity {
  if (type === 'trueFalse') {
    const tf = value.trueFalse
    return { id: '', templateId: common.templateId, title: common.title, type, topic: common.topic, difficulty: common.difficulty, prompt: common.prompt, options: ['Verdadero', 'Falso'], answer: tf.correct ? 'Verdadero' : 'Falso', feedback: tf.hint.trim(), details: { trueFalse: { statement: tf.statement.trim(), correct: tf.correct === true, explanation: tf.explanation.trim(), context: tf.context.trim() || undefined, hint: tf.hint.trim() } }, status: 'published' }
  }
  if (type === 'singleChoice') {
    const sc = value.singleChoice
    const cleanOptions = sc.options.map((option) => ({ id: option.id, label: option.label.trim(), correct: option.correct }))
    const options = cleanOptions.map((option) => option.label)
    const correct = cleanOptions.find((option) => option.correct)?.label ?? ''
    return { id: '', templateId: common.templateId, title: common.title, type, topic: common.topic, difficulty: common.difficulty, prompt: common.prompt, options, answer: correct, feedback: sc.hint.trim(), details: { singleChoice: { options: cleanOptions, context: sc.context.trim() || undefined, hint: sc.hint.trim(), explanation: sc.explanation.trim() || undefined } }, status: 'published' }
  }
  if (type === 'matching') {
    const m = value.matching
    const cleanPairs = m.pairs.map((pair) => ({ id: pair.id, left: pair.left.trim(), right: pair.right.trim() }))
    const options = cleanPairs.map((pair) => pair.left + ' → ' + pair.right)
    return { id: '', templateId: common.templateId, title: common.title, type, topic: common.topic, difficulty: common.difficulty, prompt: common.prompt, options, answer: options, feedback: m.hint.trim(), details: { matching: { pairs: cleanPairs, context: m.context.trim() || undefined, hint: m.hint.trim(), explanation: m.explanation.trim() || undefined } }, status: 'published' }
  }
  if (type === 'sorting') {
    const s = value.sorting
    const cleanCategories = s.categories.map((cat) => cat.trim()).filter(Boolean)
    const cleanItems = s.items.map((item) => ({ id: item.id, label: item.label.trim(), category: item.category.trim() }))
    const options = cleanItems.map((item) => item.label)
    return { id: '', templateId: common.templateId, title: common.title, type, topic: common.topic, difficulty: common.difficulty, prompt: common.prompt, options, answer: cleanItems.map((item) => item.category), feedback: s.hint.trim(), details: { sorting: { categories: cleanCategories, items: cleanItems, context: s.context.trim() || undefined, hint: s.hint.trim(), explanation: s.explanation.trim() || undefined } }, status: 'published' }
  }
  if (type === 'ordering') {
    const o = value.ordering
    const cleanSteps = o.steps.map((step) => step.trim())
    return { id: '', templateId: common.templateId, title: common.title, type, topic: common.topic, difficulty: common.difficulty, prompt: common.prompt, options: cleanSteps, answer: cleanSteps, feedback: o.hint.trim(), details: { ordering: { steps: cleanSteps, context: o.context.trim() || undefined, hint: o.hint.trim(), explanation: o.explanation.trim() || undefined } }, status: 'published' }
  }
  if (type === 'scenario') {
    const sc = value.scenario
    const cleanStages = sc.stages.map((stage) => ({
      id: stage.id,
      title: stage.title.trim(),
      prompt: stage.prompt.trim(),
      options: stage.options.map((option) => ({
        id: option.id,
        text: option.text.trim(),
        consequence: option.consequence.trim(),
        feedback: option.feedback.trim(),
        recommended: option.recommended,
      })),
    }))
    const options = cleanStages.flatMap((stage) => stage.options.map((option) => option.text))
    const recommended = cleanStages.flatMap((stage) => stage.options).find((option) => option.recommended)
    return {
      id: '',
      templateId: common.templateId,
      title: common.title,
      type,
      topic: common.topic,
      difficulty: common.difficulty,
      prompt: common.prompt,
      options,
      answer: recommended?.text ?? options[0] ?? '',
      feedback: sc.hint.trim(),
      details: {
        scenario: {
          situation: sc.situation.trim(),
          stages: cleanStages,
          hint: sc.hint.trim(),
          explanation: sc.explanation.trim() || undefined,
        },
      },
      status: 'published',
    }
  }
  throw new Error(`Tipo de actividad no soportado: ${type as string}`)
}

function ScenarioEditor({ value, onChange }: { value: ActivityEditorState['scenario']; onChange: (value: ActivityEditorState['scenario']) => void }) {
  const updateStage = (id: string, patch: Partial<ScenarioStage>) => onChange({ ...value, stages: value.stages.map((stage) => stage.id === id ? { ...stage, ...patch } : stage) })
  const updateOption = (stageId: string, optionId: string, patch: Partial<ScenarioOption>) => onChange({ ...value, stages: value.stages.map((stage) => stage.id === stageId ? { ...stage, options: stage.options.map((option) => option.id === optionId ? { ...option, ...patch } : option) } : stage) })
  const addStage = () => value.stages.length < SCENARIO_LIMITS.maxStages ? onChange({ ...value, stages: [...value.stages, { id: makeEditorId('stage-'), title: `Etapa ${value.stages.length + 1}`, prompt: '', options: [{ id: makeEditorId('option-'), text: '', consequence: '', feedback: '', recommended: true }, { id: makeEditorId('option-'), text: '', consequence: '', feedback: '', recommended: false }] }] }) : undefined
  const addOption = (stageId: string) => {
    const stage = value.stages.find((s) => s.id === stageId)
    if (!stage || stage.options.length >= SCENARIO_LIMITS.maxOptions) return
    onChange({ ...value, stages: value.stages.map((s) => s.id === stageId ? { ...s, options: [...s.options, { id: makeEditorId('option-'), text: '', consequence: '', feedback: '', recommended: false }] } : s) })
  }
  const removeStage = (id: string) => onChange({ ...value, stages: value.stages.length > SCENARIO_LIMITS.minStages ? value.stages.filter((stage) => stage.id !== id) : value.stages })
  const removeOption = (stageId: string, optionId: string) => onChange({ ...value, stages: value.stages.map((stage) => stage.id === stageId && stage.options.length > SCENARIO_LIMITS.minOptions ? { ...stage, options: stage.options.filter((option) => option.id !== optionId) } : stage) })

  return (
    <section className="editor-section">
      <div className="editor-heading">
        <div>
          <p className="eyebrow">EDITOR DE ESCENARIO</p>
          <b>Dilema, etapas y consecuencias pedagógicas</b>
        </div>
        <button type="button" className="text-button" onClick={addStage} disabled={value.stages.length >= SCENARIO_LIMITS.maxStages}>
          ＋ Agregar etapa
        </button>
      </div>
      <label>
        Situación o caso contextualizado *
        <textarea
          rows={3}
          maxLength={SCENARIO_LIMITS.situation}
          value={value.situation}
          onChange={(event) => onChange({ ...value, situation: event.target.value })}
          placeholder="Describe la situación real, caso profesional o dilema ético que deberá analizar el estudiante."
        />
      </label>
      <p className="editor-help">
        Configura entre 1 y 3 etapas. Cada opción debe incluir su consecuencia real y feedback reflexivo, marcando exactamente una como la decisión recomendada.
      </p>
      {value.stages.map((stage, stageIndex) => (
        <div className="editor-card" key={stage.id}>
          <div className="editor-card-head">
            <b>Etapa {stageIndex + 1}</b>
            <button
              type="button"
              className="remove-button"
              onClick={() => removeStage(stage.id)}
              disabled={value.stages.length <= SCENARIO_LIMITS.minStages}
            >
              ×
            </button>
          </div>
          <div className="form-grid">
            <label>
              Nombre de la etapa
              <input
                maxLength={SCENARIO_LIMITS.stageTitle}
                value={stage.title}
                onChange={(event) => updateStage(stage.id, { title: event.target.value })}
              />
            </label>
            <label>
              Consigna de decisión
              <textarea
                rows={2}
                maxLength={SCENARIO_LIMITS.stagePrompt}
                value={stage.prompt}
                onChange={(event) => updateStage(stage.id, { prompt: event.target.value })}
              />
            </label>
          </div>
          <div className="editor-options">
            {stage.options.map((option, optionIndex) => (
              <div className="editor-option" key={option.id}>
                <div className="editor-card-head">
                  <b>{'Opción ' + (optionIndex + 1)}</b>
                  <button
                    type="button"
                    className="remove-button"
                    onClick={() => removeOption(stage.id, option.id)}
                    disabled={stage.options.length <= SCENARIO_LIMITS.minOptions}
                  >
                    ×
                  </button>
                </div>
                <input
                  maxLength={SCENARIO_LIMITS.optionText}
                  placeholder="Texto de la opción (acción a tomar)"
                  value={option.text}
                  onChange={(event) => updateOption(stage.id, option.id, { text: event.target.value })}
                />
                <input
                  maxLength={SCENARIO_LIMITS.consequence}
                  placeholder="Consecuencia directa en la situación"
                  value={option.consequence}
                  onChange={(event) => updateOption(stage.id, option.id, { consequence: event.target.value })}
                />
                <textarea
                  rows={2}
                  maxLength={SCENARIO_LIMITS.feedback}
                  placeholder="Feedback formativo orientador"
                  value={option.feedback}
                  onChange={(event) => updateOption(stage.id, option.id, { feedback: event.target.value })}
                />
                <label className="radio-row">
                  <input
                    type="radio"
                    name={'recommended-' + stage.id}
                    checked={option.recommended}
                    onChange={() =>
                      onChange({
                        ...value,
                        stages: value.stages.map((item) =>
                          item.id === stage.id
                            ? {
                                ...item,
                                options: item.options.map((entry) => ({ ...entry, recommended: entry.id === option.id })),
                              }
                            : item,
                        ),
                      })
                    }
                  />{' '}
                  Opción pedagógicamente recomendada
                </label>
              </div>
            ))}
          </div>
          <button
            type="button"
            className="text-button"
            onClick={() => addOption(stage.id)}
            disabled={stage.options.length >= SCENARIO_LIMITS.maxOptions}
          >
            ＋ Agregar opción
          </button>
        </div>
      ))}
      <label>
        Pista orientadora para el estudiante *
        <textarea
          rows={2}
          maxLength={SCENARIO_LIMITS.hint}
          value={value.hint}
          onChange={(event) => onChange({ ...value, hint: event.target.value })}
          placeholder="Se muestra tras confirmar las decisiones. Orienta la reflexión global sin delatar la recomendada."
        />
      </label>
      <label>
        Explicación privada docente (opcional)
        <textarea
          rows={2}
          maxLength={SCENARIO_LIMITS.explanation}
          value={value.explanation}
          onChange={(event) => onChange({ ...value, explanation: event.target.value })}
          placeholder="Fundamentación pedagógica y teórica de las opciones recomendadas. Solo para el docente y CSV."
        />
      </label>
    </section>
  )
}

function scenarioEditorToDefinition(prompt: string, value: ActivityEditorState['scenario']) {
  return {
    type: 'scenario' as const,
    id: 'editor',
    prompt,
    situation: value.situation,
    stages: value.stages,
    hint: value.hint,
    ...(value.explanation.trim() ? { explanation: value.explanation } : {}),
  }
}

function scenarioIssueMessage(path: string, message: string): string {
  const field: Record<string, string> = {
    prompt: 'Consigna general',
    situation: 'Situación contextualizada',
    stages: 'Etapas',
    hint: 'Pista orientadora',
    explanation: 'Explicación privada',
  }
  if (path.startsWith('stages[')) return message
  return (field[path] ?? path) + ': ' + message
}

function TrueFalseEditor({ value, onChange }: { value: ActivityEditorState['trueFalse']; onChange: (value: ActivityEditorState['trueFalse']) => void }) {
  const keyValue = value.correct === null ? '' : value.correct ? 'true' : 'false'
  return <section className="editor-section"><div className="editor-heading"><div><p className="eyebrow">EDITOR FALSO / VERDADERO</p><b>Afirmación, clave y orientación</b></div></div><label>Contexto o evidencia (opcional)<textarea rows={3} maxLength={TRUE_FALSE_LIMITS.context} value={value.context} onChange={(event) => onChange({ ...value, context: event.target.value })} placeholder="Fragmento, dato o situación que el estudiante debe interpretar." /></label><label>Afirmación<textarea rows={3} maxLength={TRUE_FALSE_LIMITS.statement} value={value.statement} onChange={(event) => onChange({ ...value, statement: event.target.value })} placeholder="Escribe una afirmación verificable." /></label><label>Respuesta esperada (obligatoria)<select value={keyValue} onChange={(event) => onChange({ ...value, correct: event.target.value === '' ? null : event.target.value === 'true' })}><option value="">— Elige la clave —</option><option value="true">Verdadero</option><option value="false">Falso</option></select></label><label>Pista orientadora para el estudiante<textarea rows={2} maxLength={TRUE_FALSE_LIMITS.hint} value={value.hint} onChange={(event) => onChange({ ...value, hint: event.target.value })} placeholder="Se muestra tras confirmar, igual si acierta o falla. No debe revelar si es verdadera o falsa." /></label><label>Explicación privada (opcional)<textarea rows={2} maxLength={TRUE_FALSE_LIMITS.explanation} value={value.explanation} onChange={(event) => onChange({ ...value, explanation: event.target.value })} placeholder="Justificación de la clave. Solo la ven el docente y el CSV." /></label><p className="editor-help">El estudiante ve el contexto y la afirmación. Tras confirmar ve solo la pista, sin saber si acertó. La clave y la explicación nunca se le muestran. Revisa que la pista no delate la respuesta.</p></section>
}

function trueFalseEditorToDefinition(value: ActivityEditorState['trueFalse']) {
  return { type: 'trueFalse' as const, id: 'editor', statement: value.statement, correct: value.correct ?? undefined, hint: value.hint, ...(value.context.trim() ? { context: value.context } : {}), ...(value.explanation.trim() ? { explanation: value.explanation } : {}) }
}

function trueFalseIssueMessage(path: string, message: string): string {
  const field: Record<string, string> = { statement: 'Afirmación', correct: 'Respuesta esperada', hint: 'Pista orientadora', context: 'Contexto', explanation: 'Explicación privada' }
  if (path === 'correct') return 'Elige la respuesta esperada (Verdadero o Falso) del falso/verdadero.'
  return (field[path] ?? path) + ': ' + message
}

function MatchingEditor({ value, onChange }: { value: ActivityEditorState['matching']; onChange: (value: ActivityEditorState['matching']) => void }) {
  const updatePair = (id: string, patch: Partial<MatchingPair>) => onChange({ ...value, pairs: value.pairs.map((pair) => pair.id === id ? { ...pair, ...patch } : pair) })
  const addPair = () => value.pairs.length < MATCHING_LIMITS.maxPairs ? onChange({ ...value, pairs: [...value.pairs, { id: makeEditorId('pair-'), left: '', right: '' }] }) : undefined
  const removePair = (id: string) => onChange({ ...value, pairs: value.pairs.length > MATCHING_LIMITS.minPairs ? value.pairs.filter((pair) => pair.id !== id) : value.pairs })
  return <section className="editor-section"><div className="editor-heading"><div><p className="eyebrow">EDITOR DE ASOCIACIÓN</p><b>Pares correctos y relación conceptual</b></div><button type="button" className="text-button" onClick={addPair} disabled={value.pairs.length >= MATCHING_LIMITS.maxPairs}>＋ Agregar par</button></div><label>Contexto o marco conceptual (opcional)<textarea rows={2} maxLength={MATCHING_LIMITS.context} value={value.context} onChange={(event) => onChange({ ...value, context: event.target.value })} placeholder="Situación, texto o referencia que orienta la relación entre las dos columnas." /></label><p className="editor-help">Define entre 2 y 6 pares únicos. El estudiante verá las dos columnas separadas (la derecha desordenada) y las enlazará tocando concepto y definición.</p>{value.pairs.map((pair, index) => <div className="form-grid editor-card" key={pair.id}><label>Idea {index + 1}<input maxLength={MATCHING_LIMITS.leftText} value={pair.left} onChange={(event) => updatePair(pair.id, { left: event.target.value })} placeholder="Concepto o actor" /></label><label>Se relaciona con<input maxLength={MATCHING_LIMITS.rightText} value={pair.right} onChange={(event) => updatePair(pair.id, { right: event.target.value })} placeholder="Definición o función" /><button type="button" className="remove-inline" onClick={() => removePair(pair.id)} disabled={value.pairs.length <= MATCHING_LIMITS.minPairs}>Eliminar fila</button></label></div>)}<label>Pista orientadora para el estudiante *<textarea rows={2} maxLength={MATCHING_LIMITS.hint} value={value.hint} onChange={(event) => onChange({ ...value, hint: event.target.value })} placeholder="Se muestra tras confirmar todos los pares, igual si acierta o falla. No debe revelar los enlaces." /></label><label>Explicación privada (opcional)<textarea rows={2} maxLength={MATCHING_LIMITS.explanation} value={value.explanation} onChange={(event) => onChange({ ...value, explanation: event.target.value })} placeholder="Justificación de las relaciones correctas. Solo la ven el docente y el CSV." /></label></section>
}

function matchingEditorToDefinition(prompt: string, value: ActivityEditorState['matching']) {
  return {
    type: 'matching' as const,
    id: 'editor',
    prompt,
    pairs: value.pairs,
    hint: value.hint,
    ...(value.context.trim() ? { context: value.context } : {}),
    ...(value.explanation.trim() ? { explanation: value.explanation } : {}),
  }
}

function matchingIssueMessage(path: string, message: string): string {
  const field: Record<string, string> = {
    prompt: 'Consigna general',
    pairs: 'Pares',
    hint: 'Pista orientadora',
    context: 'Contexto',
    explanation: 'Explicación privada',
  }
  if (path.startsWith('pairs[')) return message
  return (field[path] ?? path) + ': ' + message
}

function SortingEditor({ value, onChange }: { value: ActivityEditorState['sorting']; onChange: (value: ActivityEditorState['sorting']) => void }) {
  const updateItem = (id: string, patch: Partial<SortingItem>) => onChange({ ...value, items: value.items.map((item) => item.id === id ? { ...item, ...patch } : item) })
  const addItem = () => value.items.length < SORTING_LIMITS.maxItems ? onChange({ ...value, items: [...value.items, { id: makeEditorId('sort-'), label: '', category: value.categories[0] || '' }] }) : undefined
  const addCategory = () => value.categories.length < SORTING_LIMITS.maxCategories ? onChange({ ...value, categories: [...value.categories, ''] }) : undefined
  const removeCategory = (index: number) => {
    if (value.categories.length <= SORTING_LIMITS.minCategories) return
    const removed = value.categories[index]
    const nextCategories = value.categories.filter((_, idx) => idx !== index)
    const fallback = nextCategories.find(Boolean) ?? ''
    onChange({
      ...value,
      categories: nextCategories,
      items: value.items.map((item) => item.category === removed ? { ...item, category: fallback } : item),
    })
  }
  const removeItem = (id: string) => onChange({ ...value, items: value.items.length > SORTING_LIMITS.minItems ? value.items.filter((item) => item.id !== id) : value.items })
  const updateCategory = (index: number, next: string) => onChange({ ...value, categories: value.categories.map((category, categoryIndex) => categoryIndex === index ? next : category), items: value.items.map((item) => item.category === value.categories[index] ? { ...item, category: next } : item) })
  return <section className="editor-section"><div className="editor-heading"><div><p className="eyebrow">EDITOR DE CLASIFICACIÓN</p><b>Categorías y elementos</b></div><button type="button" className="text-button" onClick={addItem} disabled={value.items.length >= SORTING_LIMITS.maxItems}>＋ Agregar elemento</button></div><label>Contexto o criterio de análisis (opcional)<textarea rows={2} maxLength={SORTING_LIMITS.context} value={value.context} onChange={(event) => onChange({ ...value, context: event.target.value })} placeholder="Marco teórico o situación que explica bajo qué criterio deben clasificarse los elementos." /></label><p className="editor-help">Define entre 2 y 6 categorías únicas y asigna elementos en al menos dos categorías distintas. El estudiante verá las tarjetas desordenadas para arrastrar o tocar.</p><div className="category-editor"><div className="block-heading"><b>Categorías destino</b><button type="button" className="text-button" onClick={addCategory} disabled={value.categories.length >= SORTING_LIMITS.maxCategories}>＋ Agregar categoría</button></div>{value.categories.map((category, index) => <div className="repeatable-row" key={'category-' + index}><input maxLength={SORTING_LIMITS.categoryName} value={category} placeholder={'Categoría ' + (index + 1)} onChange={(event) => updateCategory(index, event.target.value)} /><button type="button" className="remove-button" onClick={() => removeCategory(index)} disabled={value.categories.length <= SORTING_LIMITS.minCategories}>×</button></div>)}</div><div className="editor-options">{value.items.map((item, index) => <div className="editor-option" key={item.id}><div className="editor-card-head"><b>{'Elemento ' + (index + 1)}</b><button type="button" className="remove-button" onClick={() => removeItem(item.id)} disabled={value.items.length <= SORTING_LIMITS.minItems}>×</button></div><div className="form-grid"><label>Texto<input maxLength={SORTING_LIMITS.itemLabel} value={item.label} onChange={(event) => updateItem(item.id, { label: event.target.value })} /></label><label>Categoría correcta<select value={item.category} onChange={(event) => updateItem(item.id, { category: event.target.value })}><option value="">— Selecciona categoría —</option>{value.categories.filter(Boolean).map((category) => <option key={category} value={category}>{category}</option>)}</select></label></div></div>)}</div><label>Pista orientadora para el estudiante *<textarea rows={2} maxLength={SORTING_LIMITS.hint} value={value.hint} onChange={(event) => onChange({ ...value, hint: event.target.value })} placeholder="Se muestra tras confirmar toda la clasificación, igual si acierta o falla. No debe revelar a qué categoría va cada elemento." /></label><label>Explicación privada (opcional)<textarea rows={2} maxLength={SORTING_LIMITS.explanation} value={value.explanation} onChange={(event) => onChange({ ...value, explanation: event.target.value })} placeholder="Justificación de la clasificación correcta. Solo la ven el docente y el CSV." /></label></section>
}

function sortingEditorToDefinition(prompt: string, value: ActivityEditorState['sorting']) {
  return {
    type: 'sorting' as const,
    id: 'editor',
    prompt,
    categories: value.categories,
    items: value.items,
    hint: value.hint,
    ...(value.context.trim() ? { context: value.context } : {}),
    ...(value.explanation.trim() ? { explanation: value.explanation } : {}),
  }
}

function sortingIssueMessage(path: string, message: string): string {
  const field: Record<string, string> = {
    prompt: 'Consigna general',
    categories: 'Categorías',
    items: 'Elementos',
    hint: 'Pista orientadora',
    context: 'Contexto',
    explanation: 'Explicación privada',
  }
  if (path.startsWith('categories[') || path.startsWith('items[')) return message
  if (path === 'items') return message
  return (field[path] ?? path) + ': ' + message
}

function OrderingEditor({ value, onChange }: { value: ActivityEditorState['ordering']; onChange: (value: ActivityEditorState['ordering']) => void }) {
  const updateStep = (index: number, next: string) => onChange({ ...value, steps: value.steps.map((step, stepIndex) => stepIndex === index ? next : step) })
  const addStep = () => value.steps.length < ORDERING_LIMITS.maxSteps ? onChange({ ...value, steps: [...value.steps, ''] }) : undefined
  const removeStep = (index: number) => onChange({ ...value, steps: value.steps.length > ORDERING_LIMITS.minSteps ? value.steps.filter((_, stepIndex) => stepIndex !== index) : value.steps })
  const moveStep = (index: number, direction: -1 | 1) => {
    const target = index + direction
    if (target < 0 || target >= value.steps.length) return
    const nextSteps = [...value.steps]
    const tmp = nextSteps[index]
    nextSteps[index] = nextSteps[target]
    nextSteps[target] = tmp
    onChange({ ...value, steps: nextSteps })
  }
  return (
    <section className="editor-section">
      <div className="editor-heading">
        <div>
          <p className="eyebrow">EDITOR DE ORDENAMIENTO</p>
          <b>Secuencia correcta del proceso</b>
        </div>
        <button type="button" className="text-button" onClick={addStep} disabled={value.steps.length >= ORDERING_LIMITS.maxSteps}>
          ＋ Agregar paso
        </button>
      </div>
      <label>
        Contexto o situación del proceso (opcional)
        <textarea
          rows={2}
          maxLength={ORDERING_LIMITS.context}
          value={value.context}
          onChange={(event) => onChange({ ...value, context: event.target.value })}
          placeholder="Marco explicativo del proceso, caso práctico o experimento a secuenciar."
        />
      </label>
      <p className="editor-help">
        Escribe entre 3 y 8 pasos en el orden exacto y correcto. El estudiante los recibirá desordenados determinísticamente para ordenarlos mediante arrastre o flechas.
      </p>
      <div className="editor-options">
        {value.steps.map((step, index) => (
          <div className="repeatable-row editor-step" key={'step-' + index}>
            <span className="step-number">{index + 1}</span>
            <input
              maxLength={ORDERING_LIMITS.stepText}
              value={step}
              placeholder={`Describe el paso ${index + 1}`}
              onChange={(event) => updateStep(index, event.target.value)}
            />
            <div className="step-arrows">
              <button
                type="button"
                className="step-arrow-btn"
                disabled={index === 0}
                onClick={() => moveStep(index, -1)}
                title="Subir paso"
              >
                ↑
              </button>
              <button
                type="button"
                className="step-arrow-btn"
                disabled={index === value.steps.length - 1}
                onClick={() => moveStep(index, 1)}
                title="Bajar paso"
              >
                ↓
              </button>
            </div>
            <button
              type="button"
              className="remove-button"
              onClick={() => removeStep(index)}
              disabled={value.steps.length <= ORDERING_LIMITS.minSteps}
            >
              ×
            </button>
          </div>
        ))}
      </div>
      <label>
        Pista orientadora para el estudiante *
        <textarea
          rows={2}
          maxLength={ORDERING_LIMITS.hint}
          value={value.hint}
          onChange={(event) => onChange({ ...value, hint: event.target.value })}
          placeholder="Se muestra tras confirmar la secuencia, igual si acierta o falla. No debe revelar las posiciones correctas."
        />
      </label>
      <label>
        Explicación privada (opcional)
        <textarea
          rows={2}
          maxLength={ORDERING_LIMITS.explanation}
          value={value.explanation}
          onChange={(event) => onChange({ ...value, explanation: event.target.value })}
          placeholder="Justificación de la secuencia correcta. Solo la ven el docente y el CSV."
        />
      </label>
    </section>
  )
}

function orderingEditorToDefinition(prompt: string, value: ActivityEditorState['ordering']) {
  return {
    type: 'ordering' as const,
    id: 'editor',
    prompt,
    steps: value.steps,
    hint: value.hint,
    ...(value.context.trim() ? { context: value.context } : {}),
    ...(value.explanation.trim() ? { explanation: value.explanation } : {}),
  }
}

function orderingIssueMessage(path: string, message: string): string {
  const field: Record<string, string> = {
    prompt: 'Consigna general',
    steps: 'Pasos',
    hint: 'Pista orientadora',
    context: 'Contexto',
    explanation: 'Explicación privada',
  }
  if (path.startsWith('steps[')) return message
  return (field[path] ?? path) + ': ' + message
}

function SingleChoiceEditor({ value, onChange }: { value: ActivityEditorState['singleChoice']; onChange: (value: ActivityEditorState['singleChoice']) => void }) {
  const updateOption = (id: string, patch: Partial<ChoiceOption>) => onChange({ ...value, options: value.options.map((option) => option.id === id ? { ...option, ...patch } : option) })
  const addOption = () => value.options.length < SINGLE_CHOICE_LIMITS.maxOptions ? onChange({ ...value, options: [...value.options, { id: makeEditorId('choice-'), label: '', correct: false }] }) : undefined
  const removeOption = (id: string) => onChange({ ...value, options: value.options.length > SINGLE_CHOICE_LIMITS.minOptions ? value.options.filter((option) => option.id !== id) : value.options })
  return <section className="editor-section"><div className="editor-heading"><div><p className="eyebrow">EDITOR DE SELECCIÓN MÚLTIPLE</p><b>Opciones con una sola respuesta correcta</b></div><button type="button" className="text-button" onClick={addOption} disabled={value.options.length >= SINGLE_CHOICE_LIMITS.maxOptions}>＋ Agregar opción</button></div><label>Contexto o caso (opcional)<textarea rows={2} maxLength={SINGLE_CHOICE_LIMITS.context} value={value.context} onChange={(event) => onChange({ ...value, context: event.target.value })} placeholder="Situación, dato o fragmento previo que el estudiante debe analizar antes de elegir." /></label><p className="editor-help">Define entre 2 y 6 opciones distintas y marca explícitamente cuál es la única opción correcta.</p><div className="editor-options">{value.options.map((option, index) => <div className="editor-option choice-editor" key={option.id}><div className="editor-card-head"><b>{'Opción ' + (index + 1)}</b><button type="button" className="remove-button" onClick={() => removeOption(option.id)} disabled={value.options.length <= SINGLE_CHOICE_LIMITS.minOptions}>×</button></div><div className="choice-line"><input maxLength={SINGLE_CHOICE_LIMITS.optionLabel} value={option.label} onChange={(event) => updateOption(option.id, { label: event.target.value })} placeholder="Texto de la opción" /><label className="radio-row"><input type="radio" name="single-choice-correct" checked={option.correct} onChange={() => onChange({ ...value, options: value.options.map((item) => ({ ...item, correct: item.id === option.id })) })} /> Correcta</label></div></div>)}</div><label>Pista orientadora para el estudiante *<textarea rows={2} maxLength={SINGLE_CHOICE_LIMITS.hint} value={value.hint} onChange={(event) => onChange({ ...value, hint: event.target.value })} placeholder="Se muestra tras confirmar, igual si acierta o falla. No debe revelar cuál opción es la correcta." /></label><label>Explicación privada (opcional)<textarea rows={2} maxLength={SINGLE_CHOICE_LIMITS.explanation} value={value.explanation} onChange={(event) => onChange({ ...value, explanation: event.target.value })} placeholder="Justificación de la opción correcta. Solo la ven el docente y el CSV." /></label><p className="editor-help">El estudiante ve el contexto, la pregunta y las opciones sin saber cuál es la correcta. Tras confirmar recibe únicamente la pista orientadora.</p></section>
}

function singleChoiceEditorToDefinition(prompt: string, value: ActivityEditorState['singleChoice']) {
  return {
    type: 'singleChoice' as const,
    id: 'editor',
    prompt,
    options: value.options,
    hint: value.hint,
    ...(value.context.trim() ? { context: value.context } : {}),
    ...(value.explanation.trim() ? { explanation: value.explanation } : {}),
  }
}

function singleChoiceIssueMessage(path: string, message: string): string {
  const field: Record<string, string> = {
    prompt: 'Consigna general',
    options: 'Opciones',
    correct: 'Opción correcta',
    hint: 'Pista orientadora',
    context: 'Contexto',
    explanation: 'Explicación privada',
  }
  if (path === 'correct') return message
  if (path.startsWith('options[')) return message
  return (field[path] ?? path) + ': ' + message
}

function SpecificActivityEditor({ type, value, onChange }: { type: ActivityType; value: ActivityEditorState; onChange: (value: ActivityEditorState) => void }) {
  if (type === 'trueFalse') return <TrueFalseEditor value={value.trueFalse} onChange={(trueFalse) => onChange({ ...value, trueFalse })} />
  if (type === 'singleChoice') return <SingleChoiceEditor value={value.singleChoice} onChange={(singleChoice) => onChange({ ...value, singleChoice })} />
  if (type === 'matching') return <MatchingEditor value={value.matching} onChange={(matching) => onChange({ ...value, matching })} />
  if (type === 'sorting') return <SortingEditor value={value.sorting} onChange={(sorting) => onChange({ ...value, sorting })} />
  if (type === 'ordering') return <OrderingEditor value={value.ordering} onChange={(ordering) => onChange({ ...value, ordering })} />
  return <ScenarioEditor value={value.scenario} onChange={(scenario) => onChange({ ...value, scenario })} />
}

function ActivityForm({ initialType, template, initialActivity, onCancel, onSave }: { initialType: ActivityType; template?: EvaluationTemplate; initialActivity?: Activity; onCancel: () => void; onSave: (activity: Activity) => void }) {
  const availableTypes = template ? Object.entries(types).filter(([key]) => compatibility(template)[key as ActivityType].available).map(([key]) => key as ActivityType) : Object.keys(types) as ActivityType[]
  const [type, setType] = useState<ActivityType>(initialActivity?.type ?? initialType)
  const [title, setTitle] = useState(initialActivity?.title ?? (template ? template.title + ' · ' + types[initialType].label : 'Nueva actividad'))
  const [prompt, setPrompt] = useState(initialActivity?.prompt ?? (template?.objective ?? 'Escribe aquí la consigna de aprendizaje.'))
  const [topic, setTopic] = useState(initialActivity?.topic ?? (template?.subject ?? 'Convivencia'))
  const difficulty: Activity['difficulty'] = initialActivity?.difficulty ?? (template?.difficulty ?? 'Intermedio')
  const [feedback, setFeedback] = useState(initialActivity?.feedback ?? 'Relaciona tu respuesta con el objetivo de aprendizaje y revisa la evidencia del contenido.')
  const [editorState, setEditorState] = useState<ActivityEditorState>(() => initialActivity ? activityToEditorState(initialActivity, template) : createEditorState(template))
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
    const baseCreated = editorStateToActivity(type, editorState, {
      templateId: initialActivity?.templateId ?? template?.id,
      title: title.trim(),
      topic: topic.trim(),
      difficulty,
      prompt: prompt.trim(),
      feedback: feedback.trim(),
    })
    onSave({
      ...baseCreated,
      id: initialActivity?.id || `a${Date.now()}-${type}`,
      status: initialActivity?.status ?? 'published',
      needsRepair: false,
      repairReason: undefined,
    })
  }
  const isEditing = Boolean(initialActivity)
  const hasRepairReason = initialActivity?.needsRepair && initialActivity.repairReason

  return <div className="modal-backdrop"><form className="modal-card activity-editor-modal" onSubmit={save}><div className="modal-head"><div><p className="eyebrow">{initialActivity?.needsRepair ? 'CORREGIR ACTIVIDAD' : isEditing ? 'EDITAR ACTIVIDAD' : template ? 'ACTIVIDAD DESDE PLANTILLA' : 'ACTIVIDAD MANUAL'}</p><h2>{isEditing ? 'Ajustar actividad' : 'Crear actividad'}</h2><p className="modal-subtitle">{template ? 'Contenido fuente: ' + template.title : isEditing ? 'Revisa los campos y guarda los cambios.' : 'Actividad adicional independiente.'}</p></div><button type="button" className="icon-button" onClick={onCancel} aria-label="Cerrar">×</button></div>{hasRepairReason && <div className="admin-notice repair-banner-notice"><span>⚠️</span><div><b>Observación detectada en la importación:</b><p>{initialActivity.repairReason}</p></div></div>}<div className="form-grid"><label>Título de la actividad *<input value={title} onChange={(event) => setTitle(event.target.value)} /></label><label>Tema<input value={topic} onChange={(event) => setTopic(event.target.value)} /></label></div><label>Consigna general *<textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} rows={2} /></label><label>Feedback general<textarea value={feedback} onChange={(event) => setFeedback(event.target.value)} rows={2} /></label><label>Tipo de actividad<select value={type} onChange={(event) => changeType(event.target.value as ActivityType)} disabled={isEditing}>{availableTypes.map((key) => <option key={key} value={key}>{types[key].label}</option>)}</select><span className="field-hint">{types[type].description}</span></label><SpecificActivityEditor type={type} value={editorState} onChange={setEditorState} />{error && <div className="form-error">! {error}</div>}<div className="form-note">✓ Esta actividad guarda un esquema específico para {types[type].label.toLowerCase()}. La aprobación docente ocurre en la plantilla seleccionada.</div><div className="modal-actions"><button type="button" className="outline-button" onClick={onCancel}>Cancelar</button><button className="primary-button">{isEditing ? 'Guardar cambios y habilitar' : 'Crear actividad publicada'}</button></div></form></div>
}

function VariantDrilldownModal({
  type,
  variants,
  selectedIds,
  onToggleSelect,
  onSelectAll,
  onDeselectAll,
  onReviewSingle,
  onEditActivity,
  onClose,
}: {
  type: ActivityType
  variants: Activity[]
  selectedIds: string[]
  onToggleSelect: (id: string) => void
  onSelectAll: () => void
  onDeselectAll: () => void
  onReviewSingle: (id: string, status: 'published' | 'draft') => void
  onEditActivity: (activity: Activity) => void
  onClose: () => void
}) {
  const typeMeta = types[type]
  const validVariants = variants.filter((v) => !v.needsRepair)
  const allSelected = validVariants.length > 0 && validVariants.every((v) => selectedIds.includes(v.id))
  const selectedCount = variants.filter((v) => selectedIds.includes(v.id)).length

  return (
    <div className="modal-backdrop">
      <div className="modal-card variant-drilldown-modal">
        <div className="modal-head">
          <div className="variant-modal-title">
            <span className={`list-type type-${type}`}>{typeMeta.icon}</span>
            <div>
              <p className="eyebrow">VARIANTES DISPONIBLES</p>
              <h2>{typeMeta.label}</h2>
              <p className="modal-subtitle">{typeMeta.description}</p>
            </div>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Cerrar modal">×</button>
        </div>

        <div className="variant-modal-toolbar">
          <div className="variant-count-info">
            <b>{selectedCount} de {variants.length} seleccionada{variants.length === 1 ? '' : 's'}</b>
            <small>Marca las variantes que deseas incluir en tu evaluación</small>
          </div>
          <div className="variant-bulk-actions">
            {allSelected ? (
              <button type="button" className="outline-button" onClick={onDeselectAll}>
                Deseleccionar todas
              </button>
            ) : (
              <button type="button" className="outline-button" onClick={onSelectAll} disabled={validVariants.length === 0}>
                Seleccionar todas ({validVariants.length})
              </button>
            )}
          </div>
        </div>

        <div className="variant-cards-list">
          {variants.map((activity, index) => {
            const isSelected = selectedIds.includes(activity.id)
            const hasRepair = Boolean(activity.needsRepair)
            return (
              <article
                key={activity.id}
                className={`variant-item-card ${isSelected ? 'selected' : ''} ${hasRepair ? 'needs-repair' : ''}`}
              >
                <div className="variant-item-head">
                  <label className="variant-checkbox-label">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      disabled={hasRepair}
                      onChange={() => onToggleSelect(activity.id)}
                    />
                    <span className="variant-number-badge">Variante {index + 1}</span>
                    <strong className="variant-item-title">{activity.title}</strong>
                  </label>
                  {hasRepair && (
                    <span className="repair-chip-warning">
                      ⚠️ Requiere corrección
                    </span>
                  )}
                </div>

                <div className="variant-item-body">
                  <p className="variant-prompt">{activity.prompt}</p>

                  {activity.type === 'trueFalse' && (
                    <div className="variant-preview-details">
                      <span className="preview-label">Respuesta clave:</span>{' '}
                      <b className="preview-val">{activity.answer}</b>
                      {activity.feedback && (
                        <p className="preview-hint">💡 <em>Pista orientadora:</em> {activity.feedback}</p>
                      )}
                    </div>
                  )}

                  {activity.type === 'singleChoice' && activity.details?.singleChoice?.options && (
                    <div className="variant-preview-details">
                      <span className="preview-label">Opciones ({activity.details.singleChoice.options.length}):</span>
                      <ul className="preview-options-list">
                        {activity.details.singleChoice.options.map((opt) => (
                          <li key={opt.id} className={opt.correct ? 'opt-correct' : ''}>
                            {opt.correct && <span className="opt-check">✓</span>}
                            <span>{opt.label}</span>
                          </li>
                        ))}
                      </ul>
                      {activity.feedback && (
                        <p className="preview-hint">💡 <em>Pista orientadora:</em> {activity.feedback}</p>
                      )}
                    </div>
                  )}

                  {activity.type === 'matching' && activity.details?.matching?.pairs && (
                    <div className="variant-preview-details">
                      <span className="preview-label">Pares ({activity.details.matching.pairs.length}):</span>
                      <ul className="preview-pairs-list">
                        {activity.details.matching.pairs.map((p) => (
                          <li key={p.id}>
                            <strong>{p.left}</strong> → <em>{p.right}</em>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {activity.type === 'sorting' && activity.details?.sorting && (
                    <div className="variant-preview-details">
                      <span className="preview-label">Categorías:</span> {activity.details.sorting.categories.join(', ')}
                      <br />
                      <span className="preview-label">Elementos a clasificar ({activity.details.sorting.items.length}):</span>{' '}
                      {activity.details.sorting.items.map((it) => it.label).join(', ')}
                    </div>
                  )}

                  {activity.type === 'ordering' && activity.details?.ordering && (
                    <div className="variant-preview-details">
                      <span className="preview-label">Secuencia de {activity.details.ordering.steps.length} pasos:</span>
                      <ol className="preview-steps-list">
                        {activity.details.ordering.steps.map((st, i) => (
                          <li key={i}>{st}</li>
                        ))}
                      </ol>
                    </div>
                  )}

                  {activity.type === 'scenario' && activity.details?.scenario && (
                    <div className="variant-preview-details">
                      <p className="preview-situation"><strong>Situación:</strong> {activity.details.scenario.situation}</p>
                      <span className="preview-label">Etapas:</span> {activity.details.scenario.stages.length} etapa(s) de decisión
                    </div>
                  )}

                  {hasRepair && (
                    <div className="variant-repair-box">
                      <p>
                        <strong>Observación:</strong> {activity.repairReason || 'Se requiere revisión en su contenido o alternativas.'}
                      </p>
                      <button
                        type="button"
                        className="primary-button repair-action-btn"
                        onClick={() => onEditActivity(activity)}
                      >
                        🛠 Corregir en el editor de actividades
                      </button>
                    </div>
                  )}
                </div>

                <div className="variant-item-actions">
                  {!hasRepair && (
                    <button
                      type="button"
                      className="primary-button btn-small"
                      onClick={() => onReviewSingle(activity.id, 'published')}
                      title="Aprobar y publicar esta variante"
                    >
                      ✓ Aprobar variante
                    </button>
                  )}
                  <button
                    type="button"
                    className="outline-button btn-small"
                    onClick={() => onEditActivity(activity)}
                  >
                    ✎ {hasRepair ? 'Corregir' : 'Editar'}
                  </button>
                  <button
                    type="button"
                    className="outline-button btn-small danger-text-button"
                    onClick={() => onReviewSingle(activity.id, 'draft')}
                    title="Devolver a borradores"
                  >
                    Devolver
                  </button>
                </div>
              </article>
            )
          })}
        </div>

        <div className="modal-actions">
          <button type="button" className="primary-button" onClick={onClose}>
            ✓ Listo, volver al resumen de formatos
          </button>
        </div>
      </div>
    </div>
  )
}

function ProposalsView({
  activities,
  hasDraft,
  onReview,
  onReviewBatch,
  onEditActivity,
  onCreateRoomFromProposals,
  onContinueDraft,
  onHome,
}: {
  activities: Activity[]
  hasDraft: boolean
  onReview: (id: string, status: 'published' | 'draft') => void
  onReviewBatch: (ids: string[], status: 'published' | 'draft') => void
  onEditActivity: (activity: Activity) => void
  onCreateRoomFromProposals: (activityIds: string[]) => void
  onContinueDraft: () => void
  onHome: () => void
}) {
  const [selectedTypeModal, setSelectedTypeModal] = useState<ActivityType | null>(null)
  const [selectedIds, setSelectedIds] = useState<string[]>(() => activities.filter((a) => !a.needsRepair).map((a) => a.id))

  const typesWithActivities = (Object.keys(types) as ActivityType[]).filter(
    (type) => activities.some((act) => act.type === type)
  )

  const toggleSelect = (id: string) => {
    setSelectedIds((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id]
    )
  }

  const selectAllOfType = (type: ActivityType) => {
    const ofTypeIds = activities.filter((a) => a.type === type && !a.needsRepair).map((a) => a.id)
    setSelectedIds((current) => Array.from(new Set([...current, ...ofTypeIds])))
  }

  const deselectAllOfType = (type: ActivityType) => {
    const ofTypeIds = new Set(activities.filter((a) => a.type === type).map((a) => a.id))
    setSelectedIds((current) => current.filter((id) => !ofTypeIds.has(id)))
  }

  const repairCount = activities.filter((a) => a.needsRepair).length
  const selectedTypes = new Set(
    selectedIds.map((id) => activities.find((a) => a.id === id)?.type).filter(Boolean)
  )

  return (
    <>
      <PageIntro
        eyebrow="REVISIÓN Y BANCO DE PREGUNTAS"
        title="Propuestas y variantes"
        description="Explora las variantes generadas por tipo de actividad, selecciona las que usarás en tu evaluación y crea la sala."
      />

      {hasDraft && (
        <div className="admin-notice proposal-draft-notice">
          <span>✎</span>
          <div>
            <b>Tienes una plantilla en borrador.</b>
            <p>La estructura se guardó automáticamente. Puedes continuarla desde el último punto antes de aprobarla.</p>
          </div>
          <button className="outline-button" onClick={onContinueDraft}>Continuar borrador</button>
        </div>
      )}

      {repairCount > 0 && (
        <div className="admin-notice repair-banner-notice">
          <span>⚠️</span>
          <div>
            <b>Hay {repairCount} actividad{repairCount === 1 ? '' : 'es'} con observaciones para revisar</b>
            <p>Puedes pulsar en su formato y usar “Corregir en el editor” para ajustar cualquier detalle sin tener que volver a la IA externa.</p>
          </div>
        </div>
      )}

      <div className="review-banner">
        <span>◌</span>
        <div>
          <b>
            {activities.length
              ? `${activities.length} propuesta${activities.length === 1 ? '' : 's'} en ${typesWithActivities.length} formato${typesWithActivities.length === 1 ? '' : 's'}`
              : 'No hay propuestas pendientes'}
          </b>
          <p>Toca cada formato para ver sus variantes y seleccionar las preguntas para tu sala.</p>
        </div>
      </div>

      {activities.length ? (
        <div className="proposal-group-grid">
          {typesWithActivities.map((typeKey) => {
            const ofType = activities.filter((a) => a.type === typeKey)
            const ofTypeSelected = ofType.filter((a) => selectedIds.includes(a.id))
            const ofTypeRepairs = ofType.filter((a) => a.needsRepair)
            const meta = types[typeKey]

            return (
              <article
                key={typeKey}
                className={`proposal-group-card ${ofTypeSelected.length > 0 ? 'has-selected' : ''}`}
                onClick={() => setSelectedTypeModal(typeKey)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setSelectedTypeModal(typeKey) }}
              >
                <div className="proposal-group-header">
                  <div className={`list-type type-${typeKey}`}>
                    {meta.icon}
                  </div>
                  <div>
                    <h3>{meta.label}</h3>
                    <p className="group-variant-count">
                      <b>{ofType.length}</b> variante{ofType.length === 1 ? '' : 's'} disponible{ofType.length === 1 ? '' : 's'}
                    </p>
                  </div>
                </div>

                <p className="group-description">{meta.description}</p>

                <div className="proposal-group-status">
                  <span className={`proposal-selection-pill ${ofTypeSelected.length > 0 ? 'active' : ''}`}>
                    {ofTypeSelected.length > 0
                      ? `✓ ${ofTypeSelected.length} seleccionada${ofTypeSelected.length === 1 ? '' : 's'}`
                      : 'Ninguna seleccionada'}
                  </span>

                  {ofTypeRepairs.length > 0 && (
                    <span className="proposal-repair-badge">
                      ⚠️ {ofTypeRepairs.length} por corregir
                    </span>
                  )}
                </div>

                <div className="proposal-group-footer">
                  <button
                    type="button"
                    className="primary-button group-open-btn"
                    onClick={(e) => {
                      e.stopPropagation()
                      setSelectedTypeModal(typeKey)
                    }}
                  >
                    Ver variantes ({ofType.length}) →
                  </button>
                </div>
              </article>
            )
          })}
        </div>
      ) : (
        <div className="empty-state">
          <span>✓</span>
          <h2>Buen trabajo, no hay propuestas pendientes.</h2>
          <p>Las actividades nuevas importadas o generadas aparecerán aquí agrupadas por tipo antes de publicarse.</p>
        </div>
      )}

      {activities.length > 0 && (
        <aside className="proposal-bottom-bar" aria-label="Resumen de selección de actividades">
          <div className="proposal-bottom-info">
            <span className="bottom-count-badge">{selectedIds.length}</span>
            <div>
              <strong>
                Has seleccionado {selectedIds.length} pregunta{selectedIds.length === 1 ? '' : 's'} en {selectedTypes.size} formato{selectedTypes.size === 1 ? '' : 's'}
              </strong>
              <p className="type-limit-ok">
                {selectedIds.length > 0
                  ? 'Listo para configurar la sala con estas actividades.'
                  : 'Selecciona al menos una actividad para crear la sala.'}
              </p>
            </div>
          </div>

          <div className="proposal-bottom-actions">
            <button
              type="button"
              className="outline-button"
              onClick={() => onReviewBatch(activities.filter((a) => !a.needsRepair).map((a) => a.id), 'published')}
              title="Aprobar todas las propuestas válidas"
            >
              ✓ Aprobar todas ({activities.filter((a) => !a.needsRepair).length})
            </button>
            <button
              type="button"
              className="primary-button create-room-btn"
              disabled={selectedIds.length === 0}
              onClick={() => onCreateRoomFromProposals(selectedIds)}
            >
              ⚙ Crear sala con seleccionadas ({selectedIds.length})
            </button>
          </div>
        </aside>
      )}

      {selectedTypeModal && (
        <VariantDrilldownModal
          type={selectedTypeModal}
          variants={activities.filter((a) => a.type === selectedTypeModal)}
          selectedIds={selectedIds}
          onToggleSelect={toggleSelect}
          onSelectAll={() => selectAllOfType(selectedTypeModal)}
          onDeselectAll={() => deselectAllOfType(selectedTypeModal)}
          onReviewSingle={(id, status) => {
            onReview(id, status)
            const remaining = activities.filter((a) => a.type === selectedTypeModal && a.id !== id)
            if (!remaining.length) setSelectedTypeModal(null)
          }}
          onEditActivity={(act) => {
            setSelectedTypeModal(null)
            onEditActivity(act)
          }}
          onClose={() => setSelectedTypeModal(null)}
        />
      )}
    </>
  )
}

function roomStatusLabel(status: RoomStatus): string {
  const labels: Record<RoomStatus, string> = { draft: 'Borrador', ready: 'Lista para iniciar', waiting: 'En espera', active: 'En curso', finished: 'Finalizada', archived: 'Archivada' }
  return labels[status]
}

function RoomContentPicker({
  templates,
  activities,
  onSelectTemplate,
  onOpenDirectBuilder,
  onNavigateToContent,
  onNavigateToProposals,
  onCancel,
}: {
  templates: EvaluationTemplate[]
  activities: Activity[]
  onSelectTemplate: (template: EvaluationTemplate, templateActivities: Activity[]) => void
  onOpenDirectBuilder: () => void
  onNavigateToContent: () => void
  onNavigateToProposals: () => void
  onCancel: () => void
}) {
  const publishedActivities = activities.filter((a) => a.status === 'published')
  const pendingActivities = activities.filter((a) => a.status === 'pending')

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="room-picker-title">
      <div className="modal-card room-content-picker">
        <div className="modal-head">
          <div>
            <p className="eyebrow">CREAR NUEVA SALA</p>
            <h2 id="room-picker-title">Elige el contenido para tu evaluación</h2>
            <p className="modal-subtitle">
              Selecciona el tema que evaluarás con tu grupo. Las actividades aprobadas de ese tema formarán la evaluación.
            </p>
          </div>
          <button type="button" className="icon-button" onClick={onCancel} aria-label="Cerrar selector">×</button>
        </div>

        {templates.length > 0 ? (
          <div className="content-picker-list">
            {templates.map((template) => {
              const ofTemplate = activities.filter((a) => a.templateId === template.id)
              const ofTemplatePublished = ofTemplate.filter((a) => a.status === 'published')
              const ofTemplatePending = ofTemplate.filter((a) => a.status === 'pending')
              const distinctTypes = Array.from(new Set(ofTemplatePublished.map((a) => a.type)))

              return (
                <article key={template.id} className="content-picker-card">
                  <div className="picker-card-info">
                    <div className="picker-card-badges">
                      <span className="picker-subject-badge">{template.subject || 'Sin asignatura'}</span>
                      {ofTemplatePublished.length > 0 ? (
                        <span className="picker-ready-badge">
                          ✓ {ofTemplatePublished.length} actividad{ofTemplatePublished.length === 1 ? '' : 'es'} lista{ofTemplatePublished.length === 1 ? '' : 's'}
                        </span>
                      ) : ofTemplatePending.length > 0 ? (
                        <span className="picker-pending-badge">
                          ◌ {ofTemplatePending.length} por revisar
                        </span>
                      ) : null}
                    </div>
                    <h3>{template.title || 'Plantilla sin título'}</h3>
                    {template.description && <p className="picker-card-desc">{template.description}</p>}

                    {distinctTypes.length > 0 && (
                      <div className="picker-format-chips">
                        {distinctTypes.map((t) => (
                          <span key={t} className={`picker-format-chip type-${t}`}>
                            <i>{types[t].icon}</i> {types[t].label} ({ofTemplatePublished.filter((a) => a.type === t).length})
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="picker-card-footer">
                    <span className="picker-card-meta">
                      {ofTemplatePublished.length > 0
                        ? `${ofTemplatePublished.length} actividades preparadas en ${distinctTypes.length} formato${distinctTypes.length === 1 ? '' : 's'}`
                        : ofTemplatePending.length > 0
                        ? `${ofTemplatePending.length} actividades pendientes de aprobación`
                        : 'Sin actividades generadas'}
                    </span>
                    <div className="picker-card-action">
                      {ofTemplatePublished.length > 0 ? (
                        <button
                          type="button"
                          className="primary-button btn-small"
                          onClick={() => onSelectTemplate(template, ofTemplatePublished)}
                        >
                          Evaluar este tema ({ofTemplatePublished.length}) →
                        </button>
                      ) : ofTemplatePending.length > 0 ? (
                        <button
                          type="button"
                          className="outline-button btn-small"
                          onClick={onNavigateToProposals}
                          title="Revisar y aprobar propuestas de este tema"
                        >
                          Aprobar propuestas ({ofTemplatePending.length}) →
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="outline-button btn-small"
                          onClick={onNavigateToContent}
                        >
                          Ver en contenido →
                        </button>
                      )}
                    </div>
                  </div>
                </article>
              )
            })}
          </div>
        ) : (
          <div className="empty-state">
            <span>◎</span>
            <h2>Aún no tienes temas estructurados</h2>
            <p>
              Para crear una sala de evaluación, primero define un tema o importa un archivo JSON con actividades y apruébalas en Propuestas.
            </p>
            <div className="empty-state-actions">
              <button
                type="button"
                className="primary-button"
                onClick={onNavigateToContent}
              >
                ＋ Crear o importar plantilla
              </button>
              {pendingActivities.length > 0 && (
                <button
                  type="button"
                  className="outline-button"
                  onClick={onNavigateToProposals}
                >
                  Ver {pendingActivities.length} propuesta{pendingActivities.length === 1 ? '' : 's'} pendiente{pendingActivities.length === 1 ? '' : 's'} →
                </button>
              )}
            </div>
          </div>
        )}

        <div className="modal-actions picker-bottom-actions">
          {publishedActivities.length > 0 && (
            <button
              type="button"
              className="text-button"
              onClick={onOpenDirectBuilder}
            >
              ⚙ Abrir ajustes técnicos con todo el banco ({publishedActivities.length} actividades)
            </button>
          )}
          <button type="button" className="outline-button" onClick={onCancel}>
            Cancelar
          </button>
        </div>
      </div>
    </div>
  )
}

function RoomsView({
  rooms,
  activities,
  templates = [],
  initialActivityIds,
  onClearInitialActivities,
  onCreate,
  onTransition,
  onDuplicate,
  onShare,
  onDelete,
  onNavigateToContent,
  onNavigateToProposals,
  onHome,
}: {
  rooms: Room[]
  activities: Activity[]
  templates?: EvaluationTemplate[]
  initialActivityIds?: string[] | null
  onClearInitialActivities?: () => void
  onCreate: (settings: RoomSettings) => void
  onTransition: (id: string, status: RoomStatus) => void
  onDuplicate: (room: Room) => void
  onShare: (room: Room) => void
  onDelete: (room: Room) => void
  onNavigateToContent?: () => void
  onNavigateToProposals?: () => void
  onHome: () => void
}) {
  const [showContentPicker, setShowContentPicker] = useState(false)
  const [showBuilder, setShowBuilder] = useState(() => Boolean(initialActivityIds && initialActivityIds.length > 0))
  const [builderInitialIds, setBuilderInitialIds] = useState<string[] | undefined>(() => initialActivityIds ?? undefined)
  const [builderInitialName, setBuilderInitialName] = useState<string | undefined>()
  const publishedActivities = activities.filter((item) => item.status === 'published')

  return (
    <>
      <PageIntro
        eyebrow="EXPERIENCIAS EN VIVO"
        title="Salas para tu grupo"
        description="Configura, abre y controla cada evaluación desde un solo lugar."
        action={
          <div className="room-create-actions">
            <button
              className="outline-button"
              onClick={() => {
                setBuilderInitialIds(undefined)
                setBuilderInitialName(undefined)
                setShowBuilder(true)
              }}
              title="Configuración técnica directa"
            >
              ⚙ Ajustes del examen
            </button>
            <button
              className="primary-button"
              onClick={() => setShowContentPicker(true)}
            >
              ＋ Nueva sala
            </button>
          </div>
        }
      />
      <div className="room-rules">
        <span>01</span>
        <p>
          <b>Lista para iniciar</b>
          <br />
          <small>Revisa los ajustes antes de abrirla.</small>
        </p>
        <span>02</span>
        <p>
          <b>En espera</b>
          <br />
          <small>Comparte el código y espera al grupo.</small>
        </p>
        <span>03</span>
        <p>
          <b>En curso</b>
          <br />
          <small>Al iniciar, la sala queda bloqueada.</small>
        </p>
      </div>

      <div className="rooms-list">
        {rooms.map((room) => (
          <article className={'room-card room-' + room.status} key={room.id}>
            <div className="room-card-head">
              <div>
                <span className={'room-status ' + room.status} /> {roomStatusLabel(room.status)}
                <h2>{room.name}</h2>
                <p className="room-instructions">{room.instructions}</p>
              </div>
              <div className="room-code">
                <small>CÓDIGO DE ACCESO</small>
                <b>{room.code}</b>
                {room.status !== 'archived' && room.status !== 'finished' && (
                  <button className="text-button" onClick={() => onShare(room)}>
                    Copiar código
                  </button>
                )}
              </div>
            </div>
            <div className="room-card-meta">
              <span>⌘ {room.questionCount} preguntas</span>
              <span>♧ Máx. {room.limit} estudiantes</span>
              <span>◷ {room.time ? room.time + ' min' : 'Sin límite'}</span>
              <span>◉ {room.scorePerQuestion} pts/pregunta</span>
            </div>
            <div className="room-activities">
              {room.activities.map((id, index) => {
                const activity = activities.find((item) => item.id === id)
                return (
                  <span key={id + '-' + index}>
                    <i>{index + 1}</i>
                    {activity?.title ?? 'Actividad'}
                  </span>
                )
              })}
            </div>
            <div className="room-card-actions">
              {room.status === 'ready' && (
                <button className="primary-button" onClick={() => onTransition(room.id, 'waiting')}>
                  Abrir sala
                </button>
              )}
              {room.status === 'waiting' && (
                <button className="primary-button" onClick={() => onTransition(room.id, 'active')}>
                  ▶ Iniciar evaluación
                </button>
              )}
              {room.status === 'active' && (
                <button className="primary-button" onClick={() => onTransition(room.id, 'finished')}>
                  Finalizar evaluación
                </button>
              )}
              {room.status === 'finished' && (
                <>
                  <button className="outline-button" onClick={() => onDuplicate(room)}>
                    Duplicar sala
                  </button>
                  <button className="primary-button" onClick={() => onTransition(room.id, 'archived')}>
                    Archivar sala
                  </button>
                </>
              )}
              {room.status === 'archived' && (
                <button className="outline-button" onClick={() => onDuplicate(room)}>
                  Duplicar como nueva
                </button>
              )}
              <button className="outline-button danger-button" onClick={() => onDelete(room)}>
                Eliminar sala
              </button>
            </div>
          </article>
        ))}
      </div>

      {showContentPicker && (
        <RoomContentPicker
          templates={templates}
          activities={activities}
          onSelectTemplate={(template, templateActs) => {
            setBuilderInitialIds(templateActs.map((a) => a.id))
            setBuilderInitialName(`Evaluación · ${template.title || 'Tema'}`)
            setShowContentPicker(false)
            setShowBuilder(true)
          }}
          onOpenDirectBuilder={() => {
            setBuilderInitialIds(undefined)
            setBuilderInitialName(undefined)
            setShowContentPicker(false)
            setShowBuilder(true)
          }}
          onNavigateToContent={() => {
            setShowContentPicker(false)
            onNavigateToContent?.()
          }}
          onNavigateToProposals={() => {
            setShowContentPicker(false)
            onNavigateToProposals?.()
          }}
          onCancel={() => setShowContentPicker(false)}
        />
      )}

      {showBuilder && (
        <RoomBuilder
          activities={publishedActivities}
          initialActivityIds={builderInitialIds}
          initialName={builderInitialName}
          onCancel={() => {
            setShowBuilder(false)
            setBuilderInitialIds(undefined)
            setBuilderInitialName(undefined)
            onClearInitialActivities?.()
          }}
          onSave={(settings) => {
            onCreate(settings)
            setShowBuilder(false)
            setBuilderInitialIds(undefined)
            setBuilderInitialName(undefined)
            onClearInitialActivities?.()
          }}
        />
      )}
    </>
  )
}

function RoomBuilder({
  activities,
  initialActivityIds,
  initialName,
  onCancel,
  onSave,
}: {
  activities: Activity[]
  initialActivityIds?: string[]
  initialName?: string
  onCancel: () => void
  onSave: (settings: RoomSettings) => void
}) {
  const [name, setName] = useState(() => initialName || 'Nueva evaluación')
  const [instructions, setInstructions] = useState('Lee cada consigna y responde según el contenido trabajado.')
  const [activityIds, setActivityIds] = useState<string[]>(() =>
    initialActivityIds && initialActivityIds.length ? initialActivityIds : activities.slice(0, 1).map((item) => item.id)
  )
  const [questionCount, setQuestionCount] = useState(() =>
    initialActivityIds && initialActivityIds.length ? initialActivityIds.length : 5
  )
  const [limit, setLimit] = useState(30)
  const [time, setTime] = useState<number | null>(null)
  const [scorePerQuestion, setScorePerQuestion] = useState(10)
  const [shuffleQuestions, setShuffleQuestions] = useState(true)
  const [allowBack, setAllowBack] = useState(true)
  const [error, setError] = useState('')

  const toggleActivity = (id: string) =>
    setActivityIds((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]))
  const reuseFeatured = () =>
    setActivityIds(activities.filter((item) => item.status === 'published').slice(0, 3).map((item) => item.id))

  const save = () => {
    if (!name.trim()) return setError('Escribe un nombre para la evaluación.')
    if (!activityIds.length) return setError('Selecciona al menos una actividad.')
    setError('')
    onSave({
      name: name.trim(),
      instructions: instructions.trim(),
      activityIds,
      questionCount: Math.max(1, questionCount),
      limit: Math.max(1, limit),
      time,
      scorePerQuestion: Math.max(0, scorePerQuestion),
      shuffleQuestions,
      allowBack,
    })
  }

  return (
    <div className="modal-backdrop">
      <div className="modal-card room-builder">
        <div className="modal-head">
          <div>
            <p className="eyebrow">CONFIGURACIÓN DE EVALUACIÓN</p>
            <h2>Prepara tu sala</h2>
            <p className="modal-subtitle">Estos ajustes se definen antes de compartir el código.</p>
          </div>
          <button type="button" className="icon-button" onClick={onCancel}>
            ×
          </button>
        </div>
        <div className="form-grid">
          <label>
            Nombre de la evaluación *
            <input value={name} onChange={(event) => setName(event.target.value)} />
          </label>
          <label>
            Cantidad de estudiantes
            <input
              type="number"
              min="1"
              max="200"
              value={limit}
              onChange={(event) => setLimit(Number(event.target.value))}
            />
          </label>
        </div>
        <label>
          Instrucciones para estudiantes
          <textarea value={instructions} onChange={(event) => setInstructions(event.target.value)} rows={2} />
        </label>
        <div className="form-grid">
          <label>
            Cantidad de preguntas
            <span className="field-hint">Las actividades seleccionadas se repiten si hace falta.</span>
            <input
              type="number"
              min="1"
              max="50"
              value={questionCount}
              onChange={(event) => setQuestionCount(Number(event.target.value))}
            />
          </label>
          <label>
            Puntaje por pregunta
            <input
              type="number"
              min="0"
              max="1000"
              value={scorePerQuestion}
              onChange={(event) => setScorePerQuestion(Number(event.target.value))}
            />
          </label>
        </div>
        <div className="form-grid">
          <label>
            Tiempo total
            <select
              value={time ?? ''}
              onChange={(event) => setTime(event.target.value ? Number(event.target.value) : null)}
            >
              <option value="">Sin límite</option>
              <option value="5">5 minutos</option>
              <option value="10">10 minutos</option>
              <option value="20">20 minutos</option>
              <option value="30">30 minutos</option>
              <option value="45">45 minutos</option>
            </select>
          </label>
          <div className="settings-checks">
            <label className="check-row">
              <input
                type="checkbox"
                checked={shuffleQuestions}
                onChange={(event) => setShuffleQuestions(event.target.checked)}
              />{' '}
              Mezclar preguntas
            </label>
            <label className="check-row">
              <input
                type="checkbox"
                checked={allowBack}
                onChange={(event) => setAllowBack(event.target.checked)}
              />{' '}
              Permitir volver atrás
            </label>
          </div>
        </div>

        <section className="activity-selection">
          <div className="block-heading">
            <div>
              <p className="eyebrow">BANCO DE PREGUNTAS</p>
              <b>Elige las actividades que formarán la evaluación</b>
              <small className="field-hint">
                Combina libremente los tipos y preguntas que desees según tu planificación pedagógica.
              </small>
            </div>
            <div>
              <button
                type="button"
                className="outline-button"
                onClick={reuseFeatured}
                disabled={!activities.length}
              >
                Reutilizar destacadas
              </button>
              <span className="selection-count">{activityIds.length} seleccionadas</span>
            </div>
          </div>
          {activities.length ? (
            <div className="activity-check-list">
              {activities.map((activity) => {
                const checked = activityIds.includes(activity.id)
                return (
                  <label className={`activity-check ${checked ? 'selected' : ''}`} key={activity.id}>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleActivity(activity.id)}
                    />
                    <span className={`list-type type-${activity.type}`}>{types[activity.type].icon}</span>
                    <span>
                      <b>{activity.title}</b>
                      <small>
                        {types[activity.type].label} · {activity.topic}
                      </small>
                    </span>
                  </label>
                )
              })}
            </div>
          ) : (
            <div className="empty-state">
              <span>◈</span>
              <h2>No hay actividades publicadas</h2>
              <p>Crea o genera actividades desde una plantilla antes de preparar la sala.</p>
            </div>
          )}
        </section>

        {error && <div className="form-error">! {error}</div>}
        <div className="form-note">
          ✓ Una sala iniciada ya no puede modificarse. El tiempo total, el límite, las preguntas y el puntaje quedan
          registrados para esta evaluación.
        </div>
        <div className="modal-actions">
          <button type="button" className="outline-button" onClick={onCancel}>
            Cancelar
          </button>
          <button type="button" className="primary-button" onClick={save}>
            Crear sala configurada
          </button>
        </div>
      </div>
    </div>
  )
}

function ResultsView({
  attempts,
  rooms,
  templates = [],
  activities = [],
  onExport,
  onDeleteAttempt,
  onClearAttempts,
  onHome,
}: {
  attempts: StudentAttempt[]
  rooms: Room[]
  templates?: EvaluationTemplate[]
  activities?: Activity[]
  onExport: (roomId?: string) => void
  onDeleteAttempt?: (attemptId: string) => void
  onClearAttempts?: (roomId?: string) => void
  onHome: () => void
}) {
  const [activeRoomId, setActiveRoomId] = useState<string | null>(null)
  const [selectedRoomFilter, setSelectedRoomFilter] = useState<string>('all')
  const [studentSearch, setStudentSearch] = useState('')
  const [selectedAttemptId, setSelectedAttemptId] = useState<string | null>(null)

  // Obtiene el título del tema/plantilla asociado a una sala
  const getRoomTemplateTitle = (room: Room): string => {
    const roomActs = activities.filter((a) => room.activities.includes(a.id) || room.activityIds.includes(a.id))
    const templateId = roomActs.find((a) => Boolean(a.templateId))?.templateId
    const t = templates.find((item) => item.id === templateId)
    return t?.title || room.instructions || 'Tema general'
  }

  const roomMap = new Map<string, Room>()
  rooms.forEach((r) => roomMap.set(r.id, r))

  const roomsWithData = rooms.filter((r) => attempts.some((a) => a.roomId === r.id))
  const orphanRoomIds = Array.from(new Set(attempts.map((a) => a.roomId))).filter((id) => !roomMap.has(id))
  const allResultRooms = [
    ...roomsWithData.map((room) => ({
      id: room.id,
      name: room.name,
      code: room.code,
      templateTitle: getRoomTemplateTitle(room),
      status: room.status,
      questionCount: room.questionCount,
      attempts: attempts.filter((a) => a.roomId === room.id),
    })),
    ...orphanRoomIds.map((id) => {
      const roomAtts = attempts.filter((a) => a.roomId === id)
      return {
        id,
        name: roomAtts[0]?.roomName || 'Sala previa',
        code: roomAtts[0]?.roomCode || '---',
        templateTitle: 'Tema archivado',
        status: 'closed' as RoomStatus,
        questionCount: roomAtts[0]?.totalQuestions || 0,
        attempts: roomAtts,
      }
    }),
  ]

  const handleClearRoom = (roomId: string, roomName: string) => {
    if (window.confirm(`¿Deseas eliminar todos los resultados registrados de la sala "${roomName}"? Esta acción dejará limpia la app.`)) {
      onClearAttempts?.(roomId)
      if (activeRoomId === roomId) {
        setActiveRoomId(null)
        setSelectedAttemptId(null)
      }
    }
  }

  const handleDeleteSingleAttempt = (attemptId: string, studentName: string) => {
    if (window.confirm(`¿Eliminar el intento de "${studentName}"?`)) {
      onDeleteAttempt?.(attemptId)
      if (selectedAttemptId === attemptId) setSelectedAttemptId(null)
    }
  }

  const activeRoomData = allResultRooms.find((r) => r.id === activeRoomId)

  // VISTA NIVEL 2: DETALLE DE LA SALA SELECCIONADA
  if (activeRoomId && activeRoomData) {
    const roomAttempts = activeRoomData.attempts
    const filteredAttempts = roomAttempts.filter((a) =>
      a.studentName.toLowerCase().includes(studentSearch.trim().toLowerCase())
    )
    const selectedAttempt = filteredAttempts.find((a) => a.id === selectedAttemptId) ?? (selectedAttemptId ? null : filteredAttempts[0])

    const totalAnswered = roomAttempts.reduce((sum, a) => sum + a.answeredCount, 0)
    const totalQuestions = roomAttempts.reduce((sum, a) => sum + a.totalQuestions, 0)
    const totalScore = roomAttempts.reduce((sum, a) => sum + a.score, 0)
    const totalMaxScore = roomAttempts.reduce((sum, a) => sum + a.maxScore, 0)
    const participationPct = roomAttempts.length ? Math.round((totalAnswered / Math.max(totalQuestions, 1)) * 100) : 0
    const accuracyPct = totalAnswered ? Math.round((roomAttempts.reduce((sum, a) => sum + a.correctCount, 0) / totalAnswered) * 100) : 0

    return (
      <>
        <div className="room-results-backbar">
          <button
            type="button"
            className="outline-button btn-small"
            onClick={() => {
              setActiveRoomId(null)
              setSelectedAttemptId(null)
              setStudentSearch('')
            }}
          >
            ← Volver a salas
          </button>
          <div className="room-results-backbar-info">
            <span className="eyebrow">TEMA: {activeRoomData.templateTitle.toUpperCase()}</span>
            <h2>{activeRoomData.name} <small>({activeRoomData.code})</small></h2>
          </div>
          <div className="room-results-backbar-actions">
            <button
              type="button"
              className="outline-button"
              onClick={() => onExport(activeRoomData.id)}
              title="Descargar las respuestas de esta sala en Excel o CSV"
            >
              ↓ Exportar esta sala
            </button>
            {onClearAttempts && (
              <button
                type="button"
                className="outline-button danger-button"
                onClick={() => handleClearRoom(activeRoomData.id, activeRoomData.name)}
                title="Eliminar todos los intentos de esta sala"
              >
                🗑 Limpiar sala
              </button>
            )}
          </div>
        </div>

        <div className="results-summary">
          <div><strong>{participationPct}%</strong><span>respuestas registradas</span></div>
          <div><strong>{accuracyPct}%</strong><span>aciertos de respondidas</span></div>
          <div><strong>{roomAttempts.length}</strong><span>estudiantes evaluados</span></div>
          <div><strong>{totalMaxScore ? `${totalScore}/${totalMaxScore}` : '—'}</strong><span>puntaje acumulado</span></div>
        </div>

        <section className="panel results-panel">
          <div className="panel-heading results-table-head">
            <div>
              <h2>Resultados por estudiante</h2>
              <p>{roomAttempts.length} intento{roomAttempts.length === 1 ? '' : 's'} registrado{roomAttempts.length === 1 ? '' : 's'} en esta sala.</p>
            </div>
            <div className="student-search-box">
              <input
                type="search"
                value={studentSearch}
                onChange={(e) => setStudentSearch(e.target.value)}
                placeholder="🔍 Buscar estudiante por nombre..."
                aria-label="Buscar estudiante por nombre"
              />
            </div>
          </div>

          {filteredAttempts.length ? (
            <div className="results-table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Estudiante</th>
                    <th>Participación</th>
                    <th>Puntaje</th>
                    <th>Estado</th>
                    <th>Finalizó</th>
                    <th>Acción</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAttempts.map((attempt) => (
                    <tr key={attempt.id} className={selectedAttempt?.id === attempt.id ? 'selected-result' : ''}>
                      <td><b>{attempt.studentName}</b><small>código: {attempt.roomCode}</small></td>
                      <td>{attempt.answeredCount}/{attempt.totalQuestions} respondidas<br /><small>{attempt.omittedCount} omitidas</small></td>
                      <td><b>{attempt.score}/{attempt.maxScore}</b><small>{attempt.correctCount} correctas</small></td>
                      <td><span className={`result-status ${attempt.status}`}>{attempt.status === 'timeout' ? 'Tiempo agotado' : 'Finalizada'}</span></td>
                      <td>{formatDate(attempt.finishedAt)}</td>
                      <td>
                        <div className="table-actions">
                          <button
                            type="button"
                            className="text-button"
                            onClick={() => {
                              setSelectedAttemptId(attempt.id)
                              window.setTimeout(() => document.getElementById('result-detail')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0)
                            }}
                          >
                            Ver detalle
                          </button>
                          {onDeleteAttempt && (
                            <button
                              type="button"
                              className="text-button danger-text-button"
                              onClick={() => handleDeleteSingleAttempt(attempt.id, attempt.studentName)}
                              title="Eliminar este intento individual"
                            >
                              Eliminar
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="results-empty">
              <span>🔍</span>
              <h3>No se encontraron estudiantes</h3>
              <p>Ningún participante coincide con el término de búsqueda "{studentSearch}".</p>
            </div>
          )}
        </section>

        {selectedAttempt && (
          <section id="result-detail" className="panel result-detail">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">RESPUESTAS INDIVIDUALES</p>
                <h2>{selectedAttempt.studentName}</h2>
                <p>{formatDate(selectedAttempt.startedAt)} → {formatDate(selectedAttempt.finishedAt)} · {selectedAttempt.events.length} eventos registrados</p>
              </div>
              <div className="detail-score-wrap">
                <div className="detail-score">
                  <strong>{selectedAttempt.score}/{selectedAttempt.maxScore} pts</strong>
                  <small>{selectedAttempt.correctCount} correctas · {selectedAttempt.omittedCount} omitidas</small>
                </div>
                {onDeleteAttempt && (
                  <button
                    type="button"
                    className="outline-button danger-button btn-small"
                    onClick={() => handleDeleteSingleAttempt(selectedAttempt.id, selectedAttempt.studentName)}
                    title="Eliminar este intento"
                  >
                    🗑 Eliminar intento
                  </button>
                )}
              </div>
            </div>
            <div className="results-table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Actividad</th>
                    <th>Estado</th>
                    <th>Respuesta del estudiante</th>
                    <th>Resultado</th>
                    <th>Pista / Explicación</th>
                    <th>Tiempo</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedAttempt.answers.map((answer) => (
                    <tr key={`${selectedAttempt.id}-${answer.index}`}>
                      <td>{answer.index + 1}</td>
                      <td><b>{answer.activityTitle}</b><small>{types[answer.activityType].label}</small></td>
                      <td>{answer.status === 'answered' ? 'Respondida' : 'Omitida'}</td>
                      <td>{answer.response || 'Sin respuesta'}</td>
                      <td>{answer.correct === null ? 'No evaluada' : answer.correct ? `✓ Correcta · ${answer.score} pts` : '◌ Orientación enviada'}</td>
                      <td>{answer.explanation ? <div><b>Explicación:</b> {answer.explanation}{answer.hint ? <><br /><small>Pista: {answer.hint}</small></> : null}</div> : answer.hint || '—'}</td>
                      <td>{answer.timeSeconds}s</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="event-strip">
              {selectedAttempt.events.slice(-5).map((event, index) => (
                <span key={`${event.at}-${index}`}>
                  <b>{event.type === 'answer_submitted' ? 'Respuesta' : event.type === 'omitted' ? 'Omisión' : event.type === 'navigated_back' ? 'Regreso' : event.type === 'timeout' ? 'Tiempo agotado' : event.type === 'finished' ? 'Cierre' : 'Ingreso'}</b>
                  {formatDate(event.at)}
                </span>
              ))}
            </div>
          </section>
        )}
      </>
    )
  }

  // VISTA NIVEL 1: LISTADO DE SALAS CON RESULTADOS
  const displayedRooms = selectedRoomFilter === 'all'
    ? allResultRooms
    : allResultRooms.filter((r) => r.id === selectedRoomFilter)

  return (
    <>
      <PageIntro
        eyebrow="DATOS PARA ACOMPAÑAR"
        title="Resultados privados"
        description="Revisa evidencias, respuestas, omisiones y tiempos por sala sin exponer resultados frente al grupo."
        action={
          <div className="results-actions">
            <select
              value={selectedRoomFilter}
              onChange={(e) => setSelectedRoomFilter(e.target.value)}
              disabled={allResultRooms.length === 0}
              aria-label="Seleccionar o filtrar sala para exportar"
            >
              <option value="all">
                {allResultRooms.length ? `Todas las salas (${allResultRooms.length})` : 'Sin salas con datos'}
              </option>
              {allResultRooms.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name} ({r.code}) · {r.templateTitle}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="primary-button"
              onClick={() => {
                if (selectedRoomFilter === 'all') {
                  onExport()
                } else {
                  onExport(selectedRoomFilter)
                }
              }}
              disabled={attempts.length === 0}
              title={selectedRoomFilter === 'all' ? 'Exportar todos los resultados a CSV' : 'Exportar los resultados de la sala seleccionada a CSV'}
            >
              {selectedRoomFilter === 'all' ? '↓ Exportar selección' : '↓ Exportar sala a CSV'}
            </button>
            {selectedRoomFilter !== 'all' && (
              <button
                type="button"
                className="outline-button btn-small"
                onClick={() => setSelectedRoomFilter('all')}
                title="Mostrar todas las salas nuevamente"
              >
                ✕ Ver todas
              </button>
            )}
          </div>
        }
      />

      <section className="results-rooms-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">EVALUACIONES REALIZADAS</p>
            <h2>Resultados por sala</h2>
          </div>
          <span className="muted">
            {selectedRoomFilter === 'all'
              ? `${allResultRooms.length} sala${allResultRooms.length === 1 ? '' : 's'} con datos`
              : `Mostrando 1 sala de ${allResultRooms.length}`}
          </span>
        </div>

        {displayedRooms.length ? (
          <div className="room-results-grid">
            {displayedRooms.map((roomItem) => {
              const rAttempts = roomItem.attempts
              const ansCount = rAttempts.reduce((sum, a) => sum + a.answeredCount, 0)
              const qCount = rAttempts.reduce((sum, a) => sum + a.totalQuestions, 0)
              const partPct = rAttempts.length ? Math.round((ansCount / Math.max(qCount, 1)) * 100) : 0
              const corrCount = rAttempts.reduce((sum, a) => sum + a.correctCount, 0)
              const accPct = ansCount ? Math.round((corrCount / ansCount) * 100) : 0
              const totScore = rAttempts.reduce((sum, a) => sum + a.score, 0)
              const maxTotScore = rAttempts.reduce((sum, a) => sum + a.maxScore, 0)

              return (
                <article key={roomItem.id} className="room-result-card">
                  <div className="room-result-card-head">
                    <div className="room-result-title-wrap">
                      <div className="room-result-badges">
                        <span className="room-result-template-badge">
                          TEMA: {roomItem.templateTitle}
                        </span>
                        <span className={`result-status ${roomItem.status === 'active' ? 'active' : 'closed'}`}>
                          {roomStatusLabel(roomItem.status)}
                        </span>
                      </div>
                      <h3>{roomItem.name}</h3>
                      <div className="room-result-meta-line">
                        <span>Código: <b>{roomItem.code}</b></span>
                        <span>· {roomItem.questionCount} preguntas</span>
                        <span>· {rAttempts.length} participante{rAttempts.length === 1 ? '' : 's'}</span>
                      </div>
                    </div>
                  </div>

                  <div className="room-result-metrics">
                    <div className="room-metric-col">
                      <strong>{partPct}%</strong>
                      <small>Participación</small>
                    </div>
                    <div className="room-metric-col">
                      <strong>{accPct}%</strong>
                      <small>Precisión</small>
                    </div>
                    <div className="room-metric-col">
                      <strong>{rAttempts.length}</strong>
                      <small>Estudiantes</small>
                    </div>
                    <div className="room-metric-col">
                      <strong>{maxTotScore ? `${totScore}/${maxTotScore}` : '—'}</strong>
                      <small>Puntaje total</small>
                    </div>
                  </div>

                  <div className="room-result-footer">
                    <button
                      type="button"
                      className="primary-button btn-small"
                      onClick={() => {
                        setActiveRoomId(roomItem.id)
                        setSelectedAttemptId(null)
                        setStudentSearch('')
                      }}
                    >
                      Ver resultados por estudiante ({rAttempts.length}) →
                    </button>
                    <div className="room-result-actions-secondary">
                      <button
                        type="button"
                        className="outline-button btn-small"
                        onClick={() => onExport(roomItem.id)}
                        title="Exportar los resultados de esta sala a CSV / Excel"
                      >
                        ↓ Exportar CSV
                      </button>
                      {onClearAttempts && (
                        <button
                          type="button"
                          className="outline-button btn-small danger-text-button"
                          onClick={() => handleClearRoom(roomItem.id, roomItem.name)}
                          title="Eliminar todos los intentos registrados de esta sala"
                        >
                          🗑 Eliminar
                        </button>
                      )}
                    </div>
                  </div>
                </article>
              )
            })}
          </div>
        ) : (
          <div className="results-empty">
            <span>↗</span>
            <h3>Aún no hay intentos registrados</h3>
            <p>Cuando un estudiante complete una evaluación en una sala, aquí aparecerán los resultados organizados por sala y por tema pedagógico.</p>
          </div>
        )}
      </section>
      <div className="privacy-note">🔒 Privacidad activa · estos datos solo están disponibles para el docente y el administrador. El estudiante no ve su puntaje final.</div>
    </>
  )
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
  return <div className="student-entry"><div className="student-orb">✦</div><p className="eyebrow">ENTRADA DE ESTUDIANTES</p><h1>Aprende haciendo.</h1><p>Entra a una sala con el código de tu docente.</p><div className="entry-card"><label>Nombre completo<input value={studentName} onChange={(event) => setStudentName(event.target.value)} placeholder="Escribe tu nombre completo" /></label><label>Código de sala<input value={roomCode} onChange={(event) => setRoomCode(event.target.value.toUpperCase())} placeholder="Ej. EDU-274" /></label><button className="primary-button wide" onClick={onStart}>Entrar a la sala →</button><small>La evaluación comenzará cuando tu docente dé inicio a la sala.</small></div><div className="student-footer">EvaluEdu · evaluación activa <span>•</span> Modo estudiante</div></div>
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
  return <div className="play-wrap"><div className="play-top"><span>ACTIVIDAD {index + 1} DE {totalCount}</span><span>{secondsLeft === null ? 'Sin límite de tiempo' : 'Tiempo restante ' + formatSeconds(secondsLeft)}</span></div><div className="play-card"><div className={'activity-type type-' + item.type}><span>{types[item.type].icon}</span><small>{types[item.type].label}</small></div><h1>{item.title}</h1>{item.type === 'trueFalse' && runtime.trueFalse.context ? <p className="editor-help">{runtime.trueFalse.context}</p> : item.type === 'singleChoice' && runtime.singleChoice.context ? <p className="editor-help">{runtime.singleChoice.context}</p> : item.type === 'matching' && runtime.matching.context ? <p className="editor-help">{runtime.matching.context}</p> : item.type === 'sorting' && runtime.sorting.context ? <p className="editor-help">{runtime.sorting.context}</p> : item.type === 'ordering' && runtime.ordering.context ? <p className="editor-help">{runtime.ordering.context}</p> : null}<p className="play-prompt">{item.type === 'trueFalse' ? runtime.trueFalse.statement : item.prompt}</p><div className={'answer-area answer-' + item.type}>{item.type === 'scenario' && draftResponse.type === 'scenario' ? <ScenarioQuestion runtime={runtime.scenario} response={draftResponse} disabled={submitted} onChange={(choices) => setDraftResponse({ type: 'scenario', choices })} /> : item.type === 'matching' && draftResponse.type === 'matching' ? <MatchingQuestion runtime={runtime.matching} response={draftResponse} disabled={submitted} onChange={(pairs) => setDraftResponse({ type: 'matching', pairs })} /> : item.type === 'sorting' && draftResponse.type === 'sorting' ? <SortingQuestion runtime={runtime.sorting} response={draftResponse} disabled={submitted} onChange={(assignments) => setDraftResponse({ type: 'sorting', assignments })} /> : item.type === 'ordering' && draftResponse.type === 'ordering' ? <OrderingQuestion runtime={runtime.ordering} response={draftResponse} disabled={submitted} onChange={(order) => setDraftResponse({ type: 'ordering', order })} /> : (item.type === 'trueFalse' ? ['Verdadero', 'Falso'] : runtime.singleChoice.options.map((option) => option.label)).map((option) => <button key={option} className={'answer-option ' + ((draftResponse.type === 'trueFalse' || draftResponse.type === 'singleChoice') && draftResponse.value === option ? 'chosen' : '')} onClick={() => !submitted && changeSimple(option)} disabled={submitted}><span className="option-mark">{(draftResponse.type === 'trueFalse' || draftResponse.type === 'singleChoice') && draftResponse.value === option ? '✓' : '○'}</span>{option}</button>)}</div>{submitted && <div className="feedback-box"><span>✦</span><div><b>Respuesta registrada.</b>{item.type === 'trueFalse' ? <p>{runtime.trueFalse.hint ?? item.feedback}</p> : item.type === 'singleChoice' ? <p>{runtime.singleChoice.hint ?? item.feedback}</p> : item.type === 'matching' ? <p>{runtime.matching.hint ?? item.feedback}</p> : item.type === 'sorting' ? <p>{runtime.sorting.hint ?? item.feedback}</p> : item.type === 'ordering' ? <p>{runtime.ordering.hint ?? item.feedback}</p> : item.type === 'scenario' ? <p>{runtime.scenario.hint ?? item.feedback}</p> : <p>{item.feedback}</p>}</div></div>}<div className="play-actions">{allowBack && index > 0 && <button className="outline-button" onClick={onPrevious}>← Anterior</button>}<div className="play-actions-right">{!submitted && <button className="outline-button" onClick={onSkip}>Omitir por ahora</button>}{submitted ? <button className="primary-button" onClick={onNext}>{index + 1 >= totalCount ? 'Finalizar evaluación →' : 'Siguiente actividad →'}</button> : <button className="primary-button" disabled={!canSubmit} onClick={() => onSubmit(draftResponse)}>Comprobar respuesta</button>}</div></div></div></div>
}
function ScenarioQuestion({
  runtime,
  response,
  disabled,
  onChange,
}: {
  runtime: NonNullable<ActivityDetails['scenario']>;
  response: Extract<ActivityResponse, { type: 'scenario' }>;
  disabled: boolean;
  onChange: (choices: Record<string, string>) => void;
}) {
  const totalStages = runtime.stages.length
  const answeredStages = runtime.stages.filter((stage) => Boolean(response.choices[stage.id])).length

  return (
    <div className="structured-question scenario-board">
      {runtime.situation && (
        <div className="scenario-situation-box">
          <div className="scenario-situation-header">
            <span className="scenario-situation-icon">📋</span>
            <b>Contexto del dilema / Situación</b>
          </div>
          <p className="scenario-situation-text">{runtime.situation}</p>
        </div>
      )}

      <div className="scenario-progress-bar">
        <span>Progreso de decisiones: <b>{answeredStages} de {totalStages}</b> {totalStages === 1 ? 'etapa completada' : 'etapas completadas'}</span>
      </div>

      <div className="scenario-stages-list">
        {runtime.stages.map((stage, sIndex) => {
          const selectedText = response.choices[stage.id]
          const selectedOption = stage.options.find((opt) => opt.text === selectedText)
          return (
            <div key={stage.id} className={`scenario-stage-card ${selectedText ? 'stage-answered' : ''}`}>
              <div className="scenario-stage-header">
                <span className="scenario-stage-badge">Etapa {sIndex + 1}</span>
                <h4 className="scenario-stage-title">{stage.title}</h4>
              </div>
              <p className="scenario-stage-prompt">{stage.prompt}</p>

              <div className="scenario-options-grid">
                {stage.options.map((option) => {
                  const isSelected = selectedText === option.text
                  return (
                    <button
                      key={option.id}
                      type="button"
                      disabled={disabled}
                      className={`scenario-choice-card ${isSelected ? 'chosen' : ''}`}
                      onClick={() => {
                        if (!disabled) {
                          onChange({ ...response.choices, [stage.id]: option.text })
                        }
                      }}
                    >
                      <div className="scenario-choice-header">
                        <span className="option-mark">{isSelected ? '✓' : '○'}</span>
                        <span className="scenario-choice-text">{option.text}</span>
                      </div>
                    </button>
                  )
                })}
              </div>

              {selectedOption && selectedOption.consequence && (
                <div className="scenario-consequence-box">
                  <div className="scenario-consequence-title">
                    <span>⚡ Consecuencia de tu decisión:</span>
                  </div>
                  <p className="scenario-consequence-content">{selectedOption.consequence}</p>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
function MatchingQuestion({ runtime, response, disabled, onChange }: { runtime: NonNullable<ActivityDetails['matching']>; response: Extract<ActivityResponse, { type: 'matching' }>; disabled: boolean; onChange: (pairs: Record<string, string>) => void }) {
  const [activeLeft, setActiveLeft] = useState<string | null>(null)
  const rightOptions = scrambleRightOptions(runtime.pairs.map((pair) => pair.right))
  const selectLeft = (leftText: string) => {
    if (disabled) return
    if (activeLeft === leftText) {
      setActiveLeft(null)
      return
    }
    setActiveLeft(leftText)
  }
  const selectRight = (rightText: string) => {
    if (disabled) return
    const targetLeft = activeLeft ?? runtime.pairs.find((pair) => !response.pairs[pair.left])?.left ?? null
    if (!targetLeft) return
    const nextPairs = { ...response.pairs }
    Object.keys(nextPairs).forEach((key) => {
      if (nextPairs[key] === rightText && key !== targetLeft) delete nextPairs[key]
    })
    nextPairs[targetLeft] = rightText
    onChange(nextPairs)
    const nextUnlinked = runtime.pairs.find((pair) => pair.left !== targetLeft && !nextPairs[pair.left])?.left ?? null
    setActiveLeft(nextUnlinked)
  }
  const unlinkPair = (leftText: string) => {
    if (disabled) return
    const nextPairs = { ...response.pairs }
    delete nextPairs[leftText]
    onChange(nextPairs)
    setActiveLeft(leftText)
  }
  return (
    <div className="structured-question matching-board">
      <p className="editor-help">Toca un concepto de la columna izquierda y luego toca su relación en la columna derecha para enlazarlos con el mismo número.</p>
      <div className="matching-columns">
        <div className="matching-column">
          <span className="matching-col-title">Conceptos</span>
          {runtime.pairs.map((pair, index) => {
            const badgeNumber = index + 1
            const linkedRight = response.pairs[pair.left]
            const isSelected = activeLeft === pair.left
            return (
              <button
                key={pair.id}
                type="button"
                disabled={disabled}
                className={`matching-card left ${isSelected ? 'active' : ''} ${linkedRight ? 'linked' : ''}`}
                onClick={() => selectLeft(pair.left)}
              >
                <span className={`matching-badge pair-tone-${(index % 6) + 1}`}>{badgeNumber}</span>
                <span className="matching-card-text">
                  <b>{pair.left}</b>
                  {linkedRight && <small>Enlazado con: {linkedRight}</small>}
                </span>
                {linkedRight && !disabled && (
                  <span
                    role="button"
                    tabIndex={0}
                    className="matching-unlink"
                    title="Quitar enlace"
                    onClick={(event) => { event.stopPropagation(); unlinkPair(pair.left) }}
                    onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.stopPropagation(); unlinkPair(pair.left) } }}
                  >
                    ×
                  </span>
                )}
              </button>
            )
          })}
        </div>
        <div className="matching-column">
          <span className="matching-col-title">Relaciones</span>
          {rightOptions.map((option) => {
            const linkedIndex = runtime.pairs.findIndex((pair) => response.pairs[pair.left] === option)
            const linkedNumber = linkedIndex >= 0 ? linkedIndex + 1 : null
            return (
              <button
                key={option}
                type="button"
                disabled={disabled}
                className={`matching-card right ${linkedNumber ? 'linked' : ''} ${activeLeft ? 'ready-to-link' : ''}`}
                onClick={() => selectRight(option)}
              >
                <span className={`matching-badge ${linkedNumber ? `pair-tone-${(linkedIndex % 6) + 1}` : 'unlinked'}`}>
                  {linkedNumber ?? '○'}
                </span>
                <span className="matching-card-text">{option}</span>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
function SortingQuestion({ runtime, response, disabled, onChange }: { runtime: NonNullable<ActivityDetails['sorting']>; response: Extract<ActivityResponse, { type: 'sorting' }>; disabled: boolean; onChange: (assignments: Record<string, string>) => void }) {
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null)
  const scrambledItems = scrambleSortingItems(runtime.items)
  const place = (itemId: string, category: string) => {
    if (disabled || !itemId) return
    onChange({ ...response.assignments, [itemId]: category })
    setSelectedItemId(null)
  }
  const unplace = (itemId: string) => {
    if (disabled) return
    const next = { ...response.assignments }
    delete next[itemId]
    onChange(next)
    setSelectedItemId(itemId)
  }
  return (
    <div className="structured-question">
      <p className="editor-help">Arrastra cada elemento a su categoría o toca una tarjeta y luego toca la caja de destino.</p>
      <div className="sorting-items">
        {scrambledItems.filter((item) => !response.assignments[item.id]).map((item) => (
          <button
            key={item.id}
            type="button"
            disabled={disabled}
            className={`sorting-chip ${selectedItemId === item.id ? 'active-chip' : ''}`}
            draggable={!disabled}
            onDragStart={(event) => event.dataTransfer.setData('text/plain', item.id)}
            onClick={() => !disabled && setSelectedItemId((current) => current === item.id ? null : item.id)}
          >
            {item.label}
            <span>⠿</span>
          </button>
        ))}
      </div>
      <div className="sorting-categories">
        {runtime.categories.map((category) => (
          <div
            className={`sorting-drop ${selectedItemId ? 'ready-drop' : ''}`}
            key={category}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => place(event.dataTransfer.getData('text/plain'), category)}
            onClick={() => selectedItemId && place(selectedItemId, category)}
          >
            <b>{category}</b>
            {scrambledItems.filter((item) => response.assignments[item.id] === category).map((item) => (
              <span key={item.id} className="sorted-pill">
                {item.label}
                {!disabled && (
                  <button
                    type="button"
                    className="sorted-remove"
                    title="Devolver al banco"
                    onClick={(event) => { event.stopPropagation(); unplace(item.id) }}
                  >
                    ×
                  </button>
                )}
              </span>
            ))}
            <small>{selectedItemId ? 'Toca aquí para colocar' : 'Arrastra o toca aquí'}</small>
          </div>
        ))}
      </div>
      <div className="sorting-mobile-fallback">
        {scrambledItems.map((item) => (
          <label className="structured-row" key={`select-${item.id}`}>
            <b>{item.label}</b>
            <select value={response.assignments[item.id] ?? ''} disabled={disabled} onChange={(event) => event.target.value ? place(item.id, event.target.value) : unplace(item.id)}>
              <option value="">Elige una categoría</option>
              {runtime.categories.map((category) => <option key={category} value={category}>{category}</option>)}
            </select>
          </label>
        ))}
      </div>
    </div>
  )
}
function OrderingQuestion({ runtime, response, disabled, onChange }: { runtime: NonNullable<ActivityDetails['ordering']>; response: Extract<ActivityResponse, { type: 'ordering' }>; disabled: boolean; onChange: (order: string[]) => void }) {
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null)
  const currentOrder = response.order.length ? response.order : scrambleOrderingSteps(runtime.steps)

  useEffect(() => {
    if (!response.order.length && runtime.steps.length) {
      onChange(scrambleOrderingSteps(runtime.steps))
    }
  }, [response.order.length, runtime.steps, onChange])

  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction
    if (target < 0 || target >= currentOrder.length || disabled) return
    const order = [...currentOrder]
    const tmp = order[index]
    order[index] = order[target]
    order[target] = tmp
    onChange(order)
  }

  const handleDragStart = (index: number) => {
    if (disabled) return
    setDraggedIndex(index)
  }

  const handleDrop = (targetIndex: number) => {
    if (disabled || draggedIndex === null || draggedIndex === targetIndex) return
    const order = [...currentOrder]
    const item = order.splice(draggedIndex, 1)[0]
    order.splice(targetIndex, 0, item)
    onChange(order)
    setDraggedIndex(null)
  }

  return (
    <div className="structured-question ordering-board">
      <p className="editor-help">Ordena los pasos del proceso arrastrando las tarjetas o usando los botones ↑ y ↓.</p>
      <div className="ordering-list">
        {currentOrder.map((item, index) => (
          <div
            className={`ordering-item ${draggedIndex === index ? 'dragging' : ''}`}
            key={`${item}-${index}`}
            draggable={!disabled}
            onDragStart={() => handleDragStart(index)}
            onDragOver={(event) => event.preventDefault()}
            onDrop={() => handleDrop(index)}
          >
            <div className="ordering-drag-handle">⠿</div>
            <span className="ordering-badge">{index + 1}</span>
            <span className="ordering-text">{item}</span>
            <div className="ordering-controls">
              <button
                type="button"
                onClick={() => move(index, -1)}
                disabled={disabled || index === 0}
                aria-label="Subir paso"
                title="Subir"
              >
                ↑
              </button>
              <button
                type="button"
                onClick={() => move(index, 1)}
                disabled={disabled || index === currentOrder.length - 1}
                aria-label="Bajar paso"
                title="Bajar"
              >
                ↓
              </button>
            </div>
          </div>
        ))}
      </div>
      <small className="ordering-source">{runtime.steps.length} pasos en total</small>
    </div>
  )
}

function readStorage<T>(key: string, fallback: T): T { try { const value = localStorage.getItem(key); return value ? JSON.parse(value) as T : fallback } catch { return fallback } }
function readSessionStorage(key: string): string | null { try { return sessionStorage.getItem(key) } catch { return null } }
function readSessionJson<T>(key: string): T | null { const value = readSessionStorage(key); if (!value) return null; try { return JSON.parse(value) as T } catch { return null } }

export default App
