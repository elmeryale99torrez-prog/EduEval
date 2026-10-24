import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (request.method !== 'POST') return json({ error: 'Método no permitido.' }, 405)

  const authorization = request.headers.get('Authorization')
  const token = authorization?.replace(/^Bearer\s+/i, '')
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
  const publishableKey = Deno.env.get('SUPABASE_PUBLISHABLE_KEY') ?? Deno.env.get('SUPABASE_ANON_KEY') ?? ''
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

  if (!token || !supabaseUrl || !publishableKey || !serviceRoleKey) {
    return json({ error: 'Configuración de servidor incompleta.' }, 500)
  }

  const callerClient = createClient(supabaseUrl, publishableKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  })
  const { data: authData, error: authError } = await callerClient.auth.getUser(token)
  if (authError || !authData.user) return json({ error: 'Sesión no válida.' }, 401)

  const { data: callerProfile, error: profileError } = await callerClient
    .from('profiles')
    .select('role')
    .eq('id', authData.user.id)
    .maybeSingle()
  if (profileError) return json({ error: profileError.message }, 500)
  if (callerProfile?.role !== 'admin') return json({ error: 'Solo un administrador puede invitar usuarios.' }, 403)

  let body: { email?: unknown; displayName?: unknown }
  try {
    body = await request.json()
  } catch {
    return json({ error: 'El cuerpo de la solicitud no es válido.' }, 400)
  }

  const email = String(body.email ?? '').trim().toLowerCase()
  const displayName = String(body.displayName ?? '').trim()
  if (!email || !/^\S+@\S+\.\S+$/.test(email)) return json({ error: 'Escribe un correo electrónico válido.' }, 400)
  if (displayName.length < 2) return json({ error: 'Escribe el nombre visible del docente.' }, 400)

  const adminClient = createClient(supabaseUrl, serviceRoleKey)
  const { data: invitation, error: invitationError } = await adminClient.auth.admin.inviteUserByEmail(email)
  if (invitationError || !invitation.user) {
    return json({ error: invitationError?.message ?? 'No se pudo enviar la invitación.' }, 400)
  }

  const { error: insertError } = await adminClient.from('profiles').insert({
    id: invitation.user.id,
    display_name: displayName,
    role: 'teacher',
    roles: ['teacher'],
  })

  if (insertError) {
    return json({
      error: 'La invitación fue enviada, pero no se pudo crear el perfil docente.',
      detail: insertError.message,
      userId: invitation.user.id,
      profileCreated: false,
    }, 500)
  }

  return json({ ok: true, userId: invitation.user.id, email, profileCreated: true }, 201)
})
