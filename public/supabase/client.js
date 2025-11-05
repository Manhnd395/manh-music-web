// public/supabase/client.js
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

// DÙNG window → từ config.js
const SUPABASE_URL = window.SUPABASE_URL;
const SUPABASE_ANON_KEY = window.SUPABASE_ANON_KEY;

console.log('DEBUG: SUPABASE_URL:', SUPABASE_URL);
console.log('DEBUG: ANON_KEY length:', SUPABASE_ANON_KEY?.length);

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.error('config.js chưa load! Kiểm tra <script src="/scripts/config.js">');
    throw new Error('Supabase config missing');
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
window.supabase = supabase;
export { supabase };