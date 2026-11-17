import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

if (!supabaseUrl || !supabasePublishableKey) {
  throw new Error('Supabase browser configuration is missing.')
}

// This client is for Supabase Auth only. Application data remains behind Django.
export const supabase = createClient(supabaseUrl, supabasePublishableKey)
