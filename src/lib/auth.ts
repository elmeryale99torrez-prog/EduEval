import type { User } from '@supabase/supabase-js'
import { supabase } from './supabase'

export type AppRole = 'admin' | 'teacher'
export type Profile = { id: string; display_name: string; role: AppRole; roles: AppRole[]; created_at: string; updated_at: string }

function isAppRole(value: unknown): value is AppRole {
  return value === 'admin' || value === 'teacher'
}

function appRoles(value: unknown, primaryRole: AppRole): AppRole[] {
  const roles = Array.isArray(value) ? value.filter(isAppRole) : []
  return roles.length ? Array.from(new Set([primaryRole, ...roles])) : [primaryRole]
}

export function canAccessPanel(profile: Profile | null, expectedRole: AppRole): boolean {
  return Boolean(profile && (profile.role === 'admin' || profile.role === expectedRole || profile.roles.includes(expectedRole)))
}

export async function getProfile(userId: string): Promise<{ profile: Profile | null; error: string | null }> {
  if (!supabase) return { profile: null, error: 'Supabase no está configurado.' }
  const { data, error } = await supabase.from('profiles').select('id, display_name, role, roles, created_at, updated_at').eq('id', userId).maybeSingle()
  if (error) return { profile: null, error: error.message }
  if (!data) return { profile: null, error: null }
  if (data.id !== userId || !isAppRole(data.role)) return { profile: null, error: 'El perfil no tiene un rol válido para EvaluEdu.' }
  return { profile: { ...data, roles: appRoles(data.roles, data.role) } as Profile, error: null }
}

export async function createTeacherProfile(user: User, displayName: string): Promise<{ profile: Profile | null; error: string | null }> {
  if (!supabase) return { profile: null, error: 'Supabase no está configurado.' }
  const cleanName = displayName.trim()
  if (cleanName.length < 2) return { profile: null, error: 'Escribe un nombre válido para continuar.' }
  const { data, error } = await supabase.from('profiles').insert({ id: user.id, display_name: cleanName, role: 'teacher', roles: ['teacher'] }).select('id, display_name, role, roles, created_at, updated_at').single()
  if (error) return { profile: null, error: error.message }
  return { profile: data as Profile, error: null }
}
