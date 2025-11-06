// public/supabase/client.js
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../scripts/config.mjs';

console.log('📦 client.js loaded - initializing Supabase client');

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

window.supabase = supabase;

if (window.appFunctions?.getCurrentUserId) {
    window.appFunctions.getCurrentUserId().then(id => {
        console.log('CURRENT USER ID:', id);
    });
} else {
    console.log('appFunctions.getCurrentUserId not ready');
}

if (window.supabase) {
    console.log('có supabase')
    window.supabase.auth.getUser().then(r => {
        if (r.error) {
            console.error('❌ getUser error:', r.error.message);
        } else if (!r.data?.user) {
            console.warn('⚠️ getUser returned null user');
        } else {
            console.log('✅ GET USER:', r.data.user.id);
        }
    });
}

// ✅ Khôi phục session nếu có
supabase.auth.getSession().then(({ data: session }) => {
    if (session?.user) {
        console.log('✅ Session restored:', session.user.id);
        if (typeof window.loadHomePage === 'function') {
            window.loadHomePage();
        } else {
            console.warn('⚠️ Hàm loadHomePage chưa sẵn sàng');
        }
    } else {
        console.warn('❌ Không tìm thấy phiên đăng nhập');
    }
});

supabase.auth.onAuthStateChange(async (event, session) => {
  console.log('⚙️ Auth state changed:', event);
  if (event === 'SIGNED_IN' && session?.user) {
    window.currentUser = session.user;
    console.log('✅ User signed in:', session.user.email);
    resetAllCaches?.();
    await initializeApp(session.user);
  }
  if (event === 'SIGNED_OUT') {
    window.currentUser = null;
    resetAllCaches?.();
    window.location.href = '/index.html';
  }
});


async function testRLSPolicies() {
    console.log('%c🧪 BẮT ĐẦU TEST RLS POLICIES', 'color: #ff6b6b; font-size: 16px; font-weight: bold');
    
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        console.log('%c❌ KHÔNG CÓ USER ĐỂ TEST', 'color: red; font-size: 14px');
        return;
    }
    console.log('%c✅ USER:', user.id, 'color: cyan');

    // TEST 1: playlists (QUAN TRỌNG NHẤT)
    const { data: pl, error: ple } = await supabase
        .from('playlists')
        .select('id, name')
        .eq('user_id', user.id)
        .limit(1);
    console.log('%c📋 playlists SELECT:', 
        ple ? `%c❌ ${ple.message}` : `%c✅ OK (${pl?.length} rows)`,
        ple ? 'color: red' : 'color: lime'
    );

    // TEST 2: tracks
    const { data: tr, error: tre } = await supabase
        .from('tracks')
        .select('id')
        .limit(1);
    console.log('%c🎵 tracks SELECT:', 
        tre ? `%c❌ ${tre.message}` : '%c✅ OK',
        tre ? 'color: red' : 'color: lime'
    );

    // TEST 3: users (profile)
    const { data: us, error: use } = await supabase
        .from('users')
        .select('id')
        .eq('id', user.id)
        .single();
    console.log('%c👤 users SELECT (own):', 
        use ? `%c❌ ${use.message}` : '%c✅ OK',
        use ? 'color: red' : 'color: lime'
    );

    console.log('%c🏁 TEST RLS HOÀN TẤT', 'color: #ffd93d; font-size: 14px; font-weight: bold');
}

export { supabase };
export default supabase;