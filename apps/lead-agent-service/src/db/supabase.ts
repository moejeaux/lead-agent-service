import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { config } from "../config";

let supabaseInstance: SupabaseClient | null = null;

/**
 * Get Supabase client singleton
 * Returns null if credentials not configured
 */
export function getSupabase(): SupabaseClient | null {
  if (!config.supabaseUrl || !config.supabaseServiceKey) {
    return null;
  }
  
  if (!supabaseInstance) {
    supabaseInstance = createClient(config.supabaseUrl, config.supabaseServiceKey, {
      auth: { persistSession: false }
    });
  }
  
  return supabaseInstance;
}

/**
 * Check if Supabase is configured and available
 */
export function isSupabaseConfigured(): boolean {
  return !!(config.supabaseUrl && config.supabaseServiceKey);
}

