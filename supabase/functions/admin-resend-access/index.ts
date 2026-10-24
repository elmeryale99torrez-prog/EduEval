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

function validateRedirectTo(value: unknown): string | undefined | null {
  if (typeof value !== 'string' || !value.trim()) return undefined
  try {
    const target = new URL(value.trim())
    if (!['http:', 'https:'].includes(target.protocol)) return null
    const configuredAppUrl = Deno.env.get('APP_URL')?.trim()
    if (configuredAppUrl) {
      const configured = new URL(configuredAppUrl)
      return target.origin === configured.origin ? target.toString() : null
    }
    const productionOrigin = 'https://evaluedu.elmer-yale99-torrez.chatgpt.site'
    if (target.origin === productionOrigin) return target.toString()
    const isLocalHost = ['localhost', '127.0.0.1'].includes(target.hostname)
    const isPrivateLan = target.hostname.startsWith('192.168.') || target.hostname.startsWith('10.') || target.hostname.startsWith('172.16.') || target.hostname.startsWith('172.17.') || target.hostname.startsWith('172.18.') || target.hostname.startsWith('172.19.') || target.hostname.startsWith('172.2') || target.hostname.startsWith('172.30.') || target.hostname.startsWith('172.31.')
    return (isLocalHost || isPrivateLan) ? target.toString() : null
  } catch {
    return null
  }
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
  const { data: callerProfile, error: profileError } = await callerClient.from('profiles').select('role').eq('id', authData.user.id).maybeSingle()
  if (profileError) return json({ error: profileError.message }, 500)
  if (callerProfile?.role !== 'admin') return json({ error: 'Solo un administrador puede reenviar accesos.' }, 403)

  let body: { email?: unknown; redirectTo?: unknown }
  try {
    body = await request.json()
  } catch {
    return json({ error: 'El cuerpo de la solicitud no es válido.' }, 400)
  }
  const email = String(body.email ?? '').trim().toLowerCase()
  const redirectTo = validateRedirectTo(body.redirectTo)
  if (!email || !/^\S+@\S+\.\S+$/.test(email)) return json({ error: 'Escribe un correo electrónico válido.' }, 400)
  if (redirectTo === null) return json({ error: 'La dirección de recuperación no está permitida.' }, 400)

  const adminClient = createClient(supabaseUrl, serviceRoleKey)
  const { data: authUsers, error: usersError } = await adminClient.auth.admin.listUsers({ page: 1, perPage: 1000 })
  if (usersError) return json({ error: 'No pudimos localizar la cuenta.' }, 500)
  const targetUser = authUsers.users.find((user) => user.email?.toLowerCase() === email)
  if (!targetUser) return json({ error: 'No existe una cuenta con ese correo.' }, 404)

  const { data: targetProfile, error: targetProfileError } = await adminClient.from('profiles').select('role').eq('id', targetUser.id).maybeSingle()
  if (targetProfileError) return json({ error: targetProfileError.message }, 500)
  if (targetProfile?.role !== 'teacher') return json({ error: 'Solo se pueden reenviar accesos docentes desde esta pantalla.' }, 403)

  const recoveryClient = createClient(supabaseUrl, publishableKey)
  const { error: recoveryError } = await recoveryClient.auth.resetPasswordForEmail(email, redirectTo ? { redirectTo } : undefined)
  if (recoveryError) return json({ error: recoveryError.message }, 400)
  return json({ ok: true, email })
})
