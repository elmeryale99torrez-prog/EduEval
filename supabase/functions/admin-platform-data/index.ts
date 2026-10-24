import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const roomFields = 'id, owner_id, name, code, status, question_count, student_limit, created_at'

type AnyRecord = Record<string, any>

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}

function record(value: unknown): AnyRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as AnyRecord : {}
}

function stringValue(value: unknown) {
  return typeof value === 'string' ? value : ''
}

function roles(value: unknown, primaryRole: string) {
  const available = Array.isArray(value) ? value.filter((item): item is string => item === 'admin' || item === 'teacher') : []
  return Array.from(new Set([primaryRole, ...available].filter((item) => item === 'admin' || item === 'teacher')))
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (request.method !== 'POST') return json({ error: 'Método no permitido.' }, 405)

  const authorization = request.headers.get('Authorization')
  const token = authorization?.replace(/^Bearer\s+/i, '')
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
  const publishableKey = Deno.env.get('SUPABASE_PUBLISHABLE_KEY') ?? Deno.env.get('SUPABASE_ANON_KEY') ?? ''
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  if (!token || !supabaseUrl || !publishableKey || !serviceRoleKey) return json({ error: 'Configuración de servidor incompleta.' }, 500)

  const callerClient = createClient(supabaseUrl, publishableKey, { global: { headers: { Authorization: `Bearer ${token}` } } })
  const { data: authData, error: authError } = await callerClient.auth.getUser(token)
  if (authError || !authData.user) return json({ error: 'Sesión no válida.' }, 401)

  const adminClient = createClient(supabaseUrl, serviceRoleKey)
  const { data: callerProfile, error: profileError } = await adminClient.from('profiles').select('role, roles').eq('id', authData.user.id).maybeSingle()
  if (profileError) return json({ error: profileError.message }, 500)
  if (callerProfile?.role !== 'admin' && !roles(callerProfile?.roles, callerProfile?.role ?? '').includes('admin')) return json({ error: 'Solo un administrador puede consultar estos datos.' }, 403)

  const [authUsersResult, profileResult, roomResult, roomActivityResult, activityResult, templateResult, participantResult, attemptResult, auditResult] = await Promise.all([
    adminClient.auth.admin.listUsers({ page: 1, perPage: 1000 }),
    adminClient.from('profiles').select('id, display_name, role, roles, created_at, updated_at'),
    adminClient.from('rooms').select(roomFields).order('created_at', { ascending: false }),
    adminClient.from('room_activities').select('room_id, activity_id, position').order('position', { ascending: true }),
    adminClient.from('activities').select('id, title, type'),
    adminClient.from('evaluation_templates').select('id, status'),
    adminClient.from('room_participants').select('id, room_id, display_name'),
    adminClient.from('attempts').select('id, room_id, participant_id, started_at, finished_at, status, total_questions, answered_count, omitted_count, correct_count, score, max_score, events').neq('status', 'in_progress').order('finished_at', { ascending: false }),
    adminClient.from('audit_events').select('id, actor_id, room_id, event_type, entity_type, entity_id, metadata, created_at').order('created_at', { ascending: false }).limit(200),
  ])

  const firstError = [profileResult, roomResult, roomActivityResult, activityResult, templateResult, participantResult, attemptResult, auditResult].find((result) => result.error)?.error
  if (firstError || authUsersResult.error) return json({ error: firstError?.message ?? authUsersResult.error?.message ?? 'No pudimos cargar los datos administrativos.' }, 500)

  const profiles = (profileResult.data ?? []) as AnyRecord[]
  const profileById = new Map(profiles.map((profile) => [profile.id, profile]))
  const rooms = (roomResult.data ?? []) as AnyRecord[]
  const roomById = new Map(rooms.map((room) => [room.id, room]))
  const activities = (activityResult.data ?? []) as AnyRecord[]
  const activityById = new Map(activities.map((activity) => [activity.id, activity]))
  const roomActivities = (roomActivityResult.data ?? []) as AnyRecord[]
  const activitiesByRoom = new Map<string, AnyRecord[]>()
  for (const relation of roomActivities) {
    const activity = activityById.get(relation.activity_id)
    if (!activity) continue
    activitiesByRoom.set(relation.room_id, [...(activitiesByRoom.get(relation.room_id) ?? []), { id: activity.id, title: activity.title, type: activity.type, position: relation.position }])
  }

  const participants = (participantResult.data ?? []) as AnyRecord[]
  const participantById = new Map(participants.map((participant) => [participant.id, participant]))
  const attemptRows = (attemptResult.data ?? []) as AnyRecord[]
  const answersByAttempt = new Map<string, AnyRecord[]>()
  if (attemptRows.length) {
    const { data: answers, error: answerError } = await adminClient.from('attempt_answers').select('attempt_id, activity_id, question_index, response, response_text, status, correct, score, time_seconds').in('attempt_id', attemptRows.map((attempt) => attempt.id)).order('question_index', { ascending: true })
    if (answerError) return json({ error: answerError.message }, 500)
    for (const answer of (answers ?? []) as AnyRecord[]) answersByAttempt.set(answer.attempt_id, [...(answersByAttempt.get(answer.attempt_id) ?? []), answer])
  }

  const normalizedAttempts = attemptRows.map((attempt) => {
    const participant = participantById.get(attempt.participant_id)
    const room = roomById.get(attempt.room_id)
    const answerRows = (answersByAttempt.get(attempt.id) ?? []).map((answer) => {
      const activity = answer.activity_id ? activityById.get(answer.activity_id) : null
      const response = record(answer.response)
      return {
        index: answer.question_index,
        activityId: answer.activity_id ?? '',
        activityTitle: activity?.title ?? 'Actividad',
        activityType: activity?.type ?? 'singleChoice',
        response: stringValue(response.value) || stringValue(answer.response_text),
        status: answer.status,
        correct: answer.correct,
        score: Number(answer.score ?? 0),
        timeSeconds: Number(answer.time_seconds ?? 0),
      }
    })
    return {
      id: attempt.id,
      roomId: attempt.room_id,
      roomName: room?.name ?? 'Sala',
      roomCode: room?.code ?? '',
      studentName: participant?.display_name ?? 'Estudiante',
      startedAt: attempt.started_at,
      finishedAt: attempt.finished_at,
      status: attempt.status === 'timeout' ? 'timeout' : 'completed',
      totalQuestions: Number(attempt.total_questions ?? 0),
      answeredCount: Number(attempt.answered_count ?? 0),
      omittedCount: Number(attempt.omitted_count ?? 0),
      correctCount: Number(attempt.correct_count ?? 0),
      score: Number(attempt.score ?? 0),
      maxScore: Number(attempt.max_score ?? 0),
      answers: answerRows,
      events: Array.isArray(attempt.events) ? attempt.events : [],
    }
  })

  const authUserById = new Map((authUsersResult.data.users ?? []).map((user) => [user.id, user]))
  const users = profiles.map((profile) => {
    const authUser = authUserById.get(profile.id)
    return {
      id: profile.id,
      email: authUser?.email ?? '',
      displayName: profile.display_name,
      role: profile.role,
      roles: roles(profile.roles, profile.role),
      status: authUser?.banned_until ? 'Bloqueado' : authUser?.email_confirmed_at ? 'Activo' : 'Pendiente',
      createdAt: profile.created_at,
      lastSignInAt: authUser?.last_sign_in_at ?? null,
    }
  })

  const normalizedRooms = rooms.map((room) => ({
    id: room.id,
    name: room.name,
    code: room.code,
    status: room.status,
    questionCount: room.question_count,
    limit: room.student_limit,
    ownerName: profileById.get(room.owner_id)?.display_name ?? 'Docente',
    activities: activitiesByRoom.get(room.id) ?? [],
    createdAt: room.created_at,
  }))

  const normalizedAudit = ((auditResult.data ?? []) as AnyRecord[]).map((event) => ({
    id: event.id,
    eventType: event.event_type,
    actorName: profileById.get(event.actor_id)?.display_name ?? 'Sistema',
    roomName: event.room_id ? roomById.get(event.room_id)?.name ?? 'Sala' : 'Plataforma',
    createdAt: event.created_at,
    metadata: event.metadata ?? {},
  }))

  return json({
    ok: true,
    loadedAt: new Date().toISOString(),
    users,
    rooms: normalizedRooms,
    attempts: normalizedAttempts,
    auditEvents: normalizedAudit,
    metrics: {
      users: users.length,
      rooms: rooms.length,
      publishedActivities: activities.length,
      templates: (templateResult.data ?? []).length,
      attempts: normalizedAttempts.length,
    },
  })
})
