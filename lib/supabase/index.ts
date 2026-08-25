/**
 * Supabase infrastructure: connection and configuration.
 *
 * Data access goes through `@/lib/data`, never through this module directly from a feature or a
 * screen. Only a Supabase adapter behind those ports should reach for the client.
 */

export {
  createSupabaseClient,
  getSupabaseClient,
  isSupabaseConfigured,
  requireSupabaseConfig,
  resetSupabaseClient,
  type AppSupabaseClient,
} from '@/lib/supabase/client';
