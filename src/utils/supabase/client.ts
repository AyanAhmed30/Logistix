import { createBrowserClient } from '@supabase/ssr'
import { normalizeSupabaseProjectUrl } from '@/utils/supabase/normalize-url'

export function createClient() {
  return createBrowserClient(
    normalizeSupabaseProjectUrl(process.env.NEXT_PUBLIC_SUPABASE_URL),
    String(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '').trim()
  )
}
