import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const roomFields = 'id, owner_id, name, code, instructions, status, question_count, student_limit, time_minutes, score_per_question, shuffle_questions, allow_back, created_at, started_at, finished_at, archived_at'
const activityFields = 'id, template_id, type, title, topic, difficulty, prompt, options, feedback, details, status'
const privateActivityFields = `${activityFields}, answer`
const guestSessionHours = 6

type AnyRecord = Record<string, any>

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}

function record(value: unknown): AnyRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as AnyRecord : {}
}

function arrayOfStrings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}

function normalizeName(value: string) {
  return value.trim().toLocaleLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

function isUuid(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

function toBase64Url(bytes: Uint8Array) {
  let binary = ''
  bytes.forEach((byte) => { binary += String.fromCharCode(byte) })
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function createGuestToken() {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return toBase64Url(bytes)
}

async function hashToken(token: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

function runtime(activity: AnyRecord) {
  const details = record(activity.details)
  const options = arrayOfStrings(activity.options)
  const answer = activity.answer
  const scenarioOptions = options.map((text, index) => ({ id: `fallback-option-${index}`, text, consequence: activity.feedback, feedback: activity.feedback, recommended: text === answer }))
  const matchingPairs = options.map((option, index) => { const [left, right] = option.split('→').map((part) => part.trim()); return { id: `fallback-pair-${index}`, left: left || option, right: right || option } })
  const sortingAnswer = Array.isArray(answer) ? answer : []
  const sortingItems = options.map((label, index) => ({ id: `fallback-item-${index}`, label, category: sortingAnswer[index] ?? 'Sin categoría' }))
  const orderingSteps = Array.isArray(answer) ? answer : options
  const choiceOptions = options.map((label, index) => ({ id: `fallback-choice-${index}`, label, correct: label === answer }))
  return {
    scenario: details.scenario ?? { situation: activity.prompt, stages: [{ id: 'fallback-stage', title: 'Decisión', prompt: activity.prompt, options: scenarioOptions }] },
    trueFalse: details.trueFalse ?? { statement: activity.prompt, correct: answer === 'Verdadero', explanation: activity.feedback },
    matching: details.matching ?? { pairs: matchingPairs },
    sorting: details.sorting ?? { categories: Array.from(new Set(sortingAnswer)), items: sortingItems },
    ordering: details.ordering ?? { steps: orderingSteps },
    singleChoice: details.singleChoice ?? { options: choiceOptions },
  }
}

function complete(activity: AnyRecord, response: AnyRecord) {
  const current = runtime(activity)
  if (response.type === 'scenario') return current.scenario.stages.length > 0 && current.scenario.stages.every((stage: AnyRecord) => Boolean(record(response.choices)[stage.id]))
  if (response.type === 'trueFalse' || response.type === 'singleChoice') return Boolean(response.value)
  if (response.type === 'matching') return current.matching.pairs.length > 0 && current.matching.pairs.every((pair: AnyRecord) => Boolean(record(response.pairs)[pair.left]))
  if (response.type === 'sorting') return current.sorting.items.length > 0 && current.sorting.items.every((item: AnyRecord) => Boolean(record(response.assignments)[item.id]))
  return Array.isArray(response.order) && response.order.length === current.ordering.steps.length && new Set(response.order).size === current.ordering.steps.length
}

function compare(activity: AnyRecord, response: AnyRecord) {
  if (!complete(activity, response)) return false
  const current = runtime(activity)
  if (response.type === 'scenario') return current.scenario.stages.every((stage: AnyRecord) => stage.options.find((option: AnyRecord) => option.text === record(response.choices)[stage.id])?.recommended === true)
  if (response.type === 'trueFalse') return response.value === (current.trueFalse.correct ? 'Verdadero' : 'Falso')
  if (response.type === 'singleChoice') return current.singleChoice.options.find((option: AnyRecord) => option.label === response.value)?.correct === true
  if (response.type === 'matching') return current.matching.pairs.every((pair: AnyRecord) => record(response.pairs)[pair.left] === pair.right)
  if (response.type === 'sorting') return current.sorting.items.every((item: AnyRecord) => record(response.assignments)[item.id] === item.category)
  return response.order.every((step: string, index: number) => step === current.ordering.steps[index])
}

function serialize(response: AnyRecord) {
  if (response.type === 'scenario') return Object.entries(record(response.choices)).map(([stage, choice]) => `${stage}: ${choice}`).join(' | ')
  if (response.type === 'trueFalse' || response.type === 'singleChoice') return String(response.value ?? '')
  if (response.type === 'matching') return Object.entries(record(response.pairs)).map(([left, right]) => `${left} → ${right}`).join(' | ')
  if (response.type === 'sorting') return Object.entries(record(response.assignments)).map(([item, category]) => `${item} → ${category}`).join(' | ')
  return Array.isArray(response.order) ? response.order.join(' → ') : ''
}

function publicActivity(activity: AnyRecord) {
  const current = runtime(activity)
  const safeOptions = activity.type === 'matching'
    ? current.matching.pairs.map((pair: AnyRecord) => pair.right)
    : activity.type === 'sorting'
      ? current.sorting.items.map((item: AnyRecord) => item.label)
      : activity.type === 'ordering'
        ? (current.ordering.steps.length > 1 ? [...current.ordering.steps.slice(1), current.ordering.steps[0]] : current.ordering.steps)
        : arrayOfStrings(activity.options)
  const safeDetails: AnyRecord = {
    scenario: { situation: current.scenario.situation, stages: current.scenario.stages.map((stage: AnyRecord) => ({ id: stage.id, title: stage.title, prompt: stage.prompt, options: stage.options.map((option: AnyRecord) => ({ id: option.id, text: option.text, consequence: option.consequence, feedback: option.feedback })) })) },
    trueFalse: { statement: current.trueFalse.statement, explanation: current.trueFalse.explanation },
    matching: { pairs: current.matching.pairs.map((pair: AnyRecord, index: number, pairs: AnyRecord[]) => ({ id: pair.id, left: pair.left, right: pairs.length > 1 ? pairs[(index + 1) % pairs.length].right : pair.right })) },
    sorting: { categories: arrayOfStrings(current.sorting.categories), items: current.sorting.items.map((item: AnyRecord) => ({ id: item.id, label: item.label, category: '' })) },
    ordering: { steps: current.ordering.steps.length > 1 ? [...current.ordering.steps.slice(1), current.ordering.steps[0]] : current.ordering.steps },
    singleChoice: { options: current.singleChoice.options.map((option: AnyRecord) => ({ id: option.id, label: option.label, correct: false })) },
  }
  return { id: activity.id, template_id: activity.template_id, type: activity.type, title: activity.title, topic: activity.topic, difficulty: activity.difficulty, prompt: activity.prompt, options: safeOptions, feedback: activity.feedback, details: safeDetails, status: activity.status }
}

async function getRoomActivities(adminClient: ReturnType<typeof createClient>, roomId: string) {
  const { data: links, error: linksError } = await adminClient.from('room_activities').select('activity_id, position').eq('room_id', roomId).order('position', { ascending: true })
  if (linksError) throw new Error(linksError.message)
  const ids = (links ?? []).map((link) => link.activity_id)
  if (!ids.length) return { activityIds: [], activities: [], privateActivities: [] }
  const { data: activities, error: activityError } = await adminClient.from('activities').select(privateActivityFields).in('id', [...new Set(ids)])
  if (activityError) throw new Error(activityError.message)
  const byId = new Map((activities ?? []).map((activity) => [activity.id, activity]))
  return { activityIds: ids, activities: ids.map((id) => byId.get(id)).filter(Boolean).map(publicActivity), privateActivities: ids.map((id) => byId.get(id)).filter(Boolean) as AnyRecord[] }
}

async function findParticipant(adminClient: ReturnType<typeof createClient>, roomId: string, participantId: unknown, token: string) {
  if (!isUuid(roomId) || !isUuid(participantId) || !token) return null
  const tokenHash = await hashToken(token)
  const { data, error } = await adminClient.from('room_participants').select('id, room_id, display_name, name_normalized, joined_at, last_seen_at, status, guest_token_expires_at').eq('id', participantId).eq('room_id', roomId).eq('guest_token_hash', tokenHash).gt('guest_token_expires_at', new Date().toISOString()).maybeSingle()
  if (error) throw new Error(error.message)
  return data
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (request.method !== 'POST') return json({ error: 'Método no permitido.' }, 405)
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  if (!supabaseUrl || !serviceRoleKey) return json({ error: 'Configuración de servidor incompleta.' }, 500)
  const adminClient = createClient(supabaseUrl, serviceRoleKey)
  let body: AnyRecord
  try { body = await request.json() } catch { return json({ error: 'El cuerpo de la solicitud no es válido.' }, 400) }
  const action = String(body.action ?? '')
  const code = String(body.code ?? '').trim().toUpperCase()
  const { data: room, error: roomError } = await adminClient.from('rooms').select(roomFields).eq('code', code).maybeSingle()
  if (roomError) return json({ error: roomError.message }, 500)
  if (!room) return json({ error: 'No encontramos una sala con ese código.' }, 404)

  if (action === 'join') {
    const displayName = String(body.displayName ?? '').trim()
    if (displayName.length < 2) return json({ error: 'Escribe un nombre válido.' }, 400)
    if (room.status === 'ready' || room.status === 'draft') return json({ error: 'La sala todavía no fue abierta por el docente.' }, 409)
    if (room.status === 'finished' || room.status === 'archived') return json({ error: 'Esta sala ya no acepta participantes.' }, 409)
    const guestToken = String(body.guestToken ?? '').trim()
    const existing = guestToken && isUuid(body.participantId) ? await findParticipant(adminClient, room.id, body.participantId, guestToken) : null
    if (existing) {
      const { data: previousAttempt, error: attemptError } = await adminClient.from('attempts').select('id').eq('participant_id', existing.id).maybeSingle()
      if (attemptError) return json({ error: attemptError.message }, 500)
      if (previousAttempt) return json({ ok: false, alreadyAttempted: true, error: 'Ya tienes un intento registrado para esta sala.' }, 409)
      const content = await getRoomActivities(adminClient, room.id)
      return json({ ok: true, room, participant: existing, guestToken, ...content })
    }
    const nameNormalized = normalizeName(displayName)
    const { data: sameName, error: sameNameError } = await adminClient.from('room_participants').select('id').eq('room_id', room.id).eq('name_normalized', nameNormalized).neq('status', 'abandoned').maybeSingle()
    if (sameNameError) return json({ error: sameNameError.message }, 500)
    if (sameName) return json({ error: 'Ese nombre ya está participando en la sala. Usa una variante para distinguirlo.' }, 409)
    const { count, error: countError } = await adminClient.from('room_participants').select('id', { count: 'exact', head: true }).eq('room_id', room.id).neq('status', 'abandoned')
    if (countError) return json({ error: countError.message }, 500)
    if ((count ?? 0) >= room.student_limit) return json({ error: 'La sala alcanzó el límite de estudiantes.' }, 409)
    const newGuestToken = createGuestToken()
    const tokenHash = await hashToken(newGuestToken)
    const expiresAt = new Date(Date.now() + guestSessionHours * 60 * 60 * 1000).toISOString()
    const { data: participant, error: participantError } = await adminClient.from('room_participants').insert({ room_id: room.id, auth_user_id: null, display_name: displayName, name_normalized: nameNormalized, status: room.status === 'active' ? 'in_progress' : 'joined', guest_token_hash: tokenHash, guest_token_expires_at: expiresAt }).select('id, room_id, display_name, name_normalized, joined_at, last_seen_at, status, guest_token_expires_at').single()
    if (participantError || !participant) return json({ error: participantError?.message ?? 'No se pudo registrar al participante.' }, 500)
    const content = await getRoomActivities(adminClient, room.id)
    return json({ ok: true, room, participant, guestToken: newGuestToken, ...content }, 201)
  }

  const guestToken = String(body.guestToken ?? '').trim()
  const participant = await findParticipant(adminClient, room.id, body.participantId, guestToken)
  if (!participant) return json({ error: 'La sesión estudiantil expiró. Ingresa nuevamente a la sala.' }, 401)
  await adminClient.from('room_participants').update({ last_seen_at: new Date().toISOString() }).eq('id', participant.id)
  if (action === 'status') return json({ ok: true, room, participant })

  if (action === 'submit_attempt') {
    const attempt = record(body.attempt)
    const content = await getRoomActivities(adminClient, room.id)
    const privateById = new Map(content.privateActivities.map((activity: AnyRecord) => [activity.id, activity]))
    const responses = Array.isArray(body.responses) ? body.responses as AnyRecord[] : []
    const evaluated = responses.map((item) => {
      const activity = privateById.get(item.activityId)
      const response = record(item.response)
      const answered = Boolean(activity && item.response)
      const correct = answered ? compare(activity, response) : null
      return { item, activity, response, result: { response: answered ? serialize(response) : '', status: answered ? 'answered' : 'omitted', correct, score: correct ? Number(room.score_per_question) : 0 } }
    }).filter((item) => item.activity)
    const answerRows = evaluated.map(({ item, activity, response, result }) => ({ attempt_id: '', activity_id: activity.id, question_index: Number(item.index ?? 0), response, response_text: result.response, status: result.status, correct: result.correct, score: result.score, time_seconds: Number(item.timeSeconds ?? 0) }))
    const answeredCount = evaluated.filter((item) => item.result.status === 'answered').length
    const omittedCount = evaluated.filter((item) => item.result.status === 'omitted').length
    const correctCount = evaluated.filter((item) => item.result.correct === true).length
    const score = evaluated.reduce((total, item) => total + item.result.score, 0)
    const { data: savedAttempt, error: savedAttemptError } = await adminClient.from('attempts').insert({ room_id: room.id, participant_id: participant.id, started_at: typeof attempt.startedAt === 'string' ? attempt.startedAt : new Date().toISOString(), finished_at: typeof attempt.finishedAt === 'string' ? attempt.finishedAt : new Date().toISOString(), status: attempt.status === 'timeout' ? 'timeout' : 'completed', total_questions: evaluated.length, answered_count: answeredCount, omitted_count: omittedCount, correct_count: correctCount, score, max_score: evaluated.length * Number(room.score_per_question), events: Array.isArray(attempt.events) ? attempt.events : [] }).select('id').single()
    if (savedAttemptError || !savedAttempt) return json({ error: savedAttemptError?.message ?? 'No se pudo guardar el intento.' }, 500)
    const finalAnswerRows = answerRows.map((answer) => ({ ...answer, attempt_id: savedAttempt.id }))
    if (finalAnswerRows.length) {
      const { error: answerError } = await adminClient.from('attempt_answers').insert(finalAnswerRows)
      if (answerError) { await adminClient.from('attempts').delete().eq('id', savedAttempt.id); return json({ error: answerError.message }, 500) }
    }
    await adminClient.from('room_participants').update({ status: 'completed', last_seen_at: new Date().toISOString() }).eq('id', participant.id)
    return json({ ok: true, attemptId: savedAttempt.id, score, maxScore: evaluated.length * Number(room.score_per_question) }, 201)
  }
  return json({ error: 'Acción no reconocida.' }, 400)
})
