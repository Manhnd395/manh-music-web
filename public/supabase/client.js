// public/supabase/client.js
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

// Read config from window object (created at build time as /scripts/config.js)
const SUPABASE_URL = typeof window !== 'undefined' ? window.SUPABASE_URL ?? null : null;
const SUPABASE_ANON_KEY = typeof window !== 'undefined' ? window.SUPABASE_ANON_KEY ?? null : null;

let supabase = null;
if (SUPABASE_URL && SUPABASE_ANON_KEY) {
    try {
        supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        console.log('Supabase initialized (client.js)');
    } catch (err) {
        console.error('Failed to initialize Supabase client:', err);
        supabase = null;
    }
} else {
    // Do not throw here — keep page usable and allow graceful degradation
    console.warn('Supabase config not found. Ensure /scripts/config.js is created and loaded before modules.');
}

// Make available for non-module scripts
try { window.supabase = supabase; } catch (e) { /* ignore if window not writable */ }

// Export both named and default exports
export { supabase };
export default supabase;