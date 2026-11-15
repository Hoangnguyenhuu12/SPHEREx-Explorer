/**
 * Supabase Auth client for the Forum (live mode only). Supabase owns passwords, sign-up, login,
 * token refresh and logout; FastAPI only verifies the access token and reads the role from its own
 * database. Nothing here decides permissions.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { config } from '../../app/config'

let client: SupabaseClient | null = null

export function supabase(): SupabaseClient {
  if (!config.forumLive) throw new Error('Supabase is only used when VITE_FORUM_API=http')
  client ??= createClient(config.supabaseUrl, config.supabaseAnonKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  })
  return client
}

/** Current access token, refreshed by the SDK when needed; null for guests. */
export async function accessToken(): Promise<string | null> {
  const { data } = await supabase().auth.getSession()
  return data.session?.access_token ?? null
}
