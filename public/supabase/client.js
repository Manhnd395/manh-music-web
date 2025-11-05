// public/supabase/client.js
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

/**
 * 1. LOCAL DEV → config.js (window.)
 * 2. DEPLOY   → Netlify / Vercel env vars (process.env)
 */
// Wait for config to be loaded
function getConfig() {
    if (!window.SUPABASE_URL || !window.SUPABASE_ANON_KEY) {
        throw new Error('Supabase configuration not found. Make sure config.js is loaded.');
    }
    return {
        url: window.SUPABASE_URL,
        key: window.SUPABASE_ANON_KEY
    };
}

const config = getConfig();
const SUPABASE_URL = config.url;
const SUPABASE_ANON_KEY = config.key;

console.log('DEBUG: SUPABASE_URL:', SUPABASE_URL);
console.log('DEBUG: ANON_KEY length:', SUPABASE_ANON_KEY?.length ?? 'undefined');

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.error(
        'Supabase config missing!\n' +
        ' • Local:  Kiểm tra <script src="/scripts/config.js">\n' +
        ' • Deploy: Kiểm tra Environment Variables trên Netlify/Vercel'
    );
    throw new Error('Supabase config missing');
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
window.supabase = supabase;          // để các file khác dùng window.supabase
export { supabase };