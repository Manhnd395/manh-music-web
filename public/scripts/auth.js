import { supabase } from '../supabase/client.js';

if (!supabase) {
    console.error('SUPABASE CLIENT NOT INITIALIZED! Check load order: client.js must load before auth.js');
    throw new Error('Supabase client missing');
}
console.log('Script loaded:', window.location.href);

let isLoggin = false;

document.addEventListener('DOMContentLoaded', async function() {
    const currentPath = window.location.pathname;
    console.log('Auth.js checking path:', currentPath);

    try {
        console.log('Auth.js: Restoring session via getSession...');
        const { data: { session }, error } = await supabase.auth.getSession();

        if (error) throw error;

        if (session?.user) {
            window.currentUser = session.user;
            console.log('Session restored:', session.user.email);

            window.dispatchEvent(new CustomEvent('SUPABASE_SESSION_RESTORED', { detail: { session } }));
            window.dispatchEvent(new CustomEvent('SUPABASE_AUTH_CHANGE', { detail: { event: 'INITIAL_SESSION', session } }));

            // Redirect nếu đang ở login/signup
            if (currentPath === '/' || currentPath.includes('index.html') || currentPath.includes('signup.html')) {
                window.location.href = "/player.html";
                return;
            }
        } else {
            console.warn('No session - show login form');
            if (currentPath.includes('player.html')) {
                window.location.href = '/index.html';
            }
        }
    } catch (err) {
        console.error('Session restore error:', err); // BÂY GIỜ SẼ LOG
        if (currentPath.includes('player.html')) {
            window.location.href = '/index.html';
        }
    }

    // PHẦN GẮN LISTENER SẼ CHẠY SAU KHI XỬ LÝ SESSION
    console.log('DOM fully loaded, searching for forms...');

    // Gắn listener signup
    const signupForm = document.getElementById('signupForm');
    if (signupForm) {
        console.log('FOUND signupForm');
        signupForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            console.log('SIGNUP SUBMIT');
            await signup();
        });
    }

    // Gắn listener login
    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
        console.log('FOUND loginForm');
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            console.log('LOGIN SUBMIT');
            await loginWithEmail();
        });
    }
});

function displayError(inputId, message) {
    const errorElement = document.getElementById(`${inputId}Error`);
    const inputElement = document.getElementById(inputId);

    if (errorElement && inputElement) {
        errorElement.textContent = '';
        errorElement.classList.remove('active');
        inputElement.classList.remove('error');

        if (message) {
            errorElement.textContent = message;
            errorElement.classList.add('active');
            inputElement.classList.add('error');
        }
    }
}

function isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}

function isValidPassword(password) {
    const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[\W_]).{8,}$/;
    return passwordRegex.test(password);
}

async function signup() {
    const username = document.getElementById('signupUsername').value.trim();
    const email = document.getElementById('signupEmail').value.trim();
    const password = document.getElementById('signupPassword').value;
    const confirmPassword = document.getElementById('confirmPassword').value;
    const birthday = document.getElementById('signupBirthday').value;

    // Xóa lỗi cũ
    displayError('signupUsername', null);
    displayError('signupEmail', null);
    displayError('signupPassword', null);
    displayError('confirmPassword', null);
    displayError('signupBirthday', null);

    let hasError = false;

    if (!username) { 
        displayError('signupUsername', 'Vui lòng nhập Tên người dùng.'); 
        hasError = true; 
    }
    if (!email) { 
        displayError('signupEmail', 'Vui lòng nhập Email.'); 
        hasError = true; 
    } else if (!isValidEmail(email)) { 
        displayError('signupEmail', 'Định dạng Email không hợp lệ.'); 
        hasError = true; 
    }
    
    if (!password) { 
        displayError('signupPassword', 'Vui lòng nhập Mật khẩu.'); 
        hasError = true; 
    } else if (!isValidPassword(password)) { 
        displayError('signupPassword', 'Mật khẩu phải có ít nhất 8 ký tự, bao gồm chữ hoa, chữ thường, số và ký tự đặc biệt.'); 
        hasError = true; 
    }
    
    if (!confirmPassword) { 
        displayError('confirmPassword', 'Vui lòng nhập lại Mật khẩu.'); 
        hasError = true; 
    } else if (password !== confirmPassword) {
        displayError('confirmPassword', 'Mật khẩu xác nhận không khớp.'); 
        hasError = true; 
    }
    
    if (!birthday) { 
        displayError('signupBirthday', 'Vui lòng nhập Ngày sinh.'); 
        hasError = true; 
    }
    
    if (hasError) return;

    try {
        // Kiểm tra username trùng lặp
        const { count: usernameCount, error: usernameCheckError } = await supabase
            .from('users')
            .select('username', { count: 'exact' })
            .eq('username', username);

        if (usernameCheckError) throw new Error(`Lỗi kiểm tra tên người dùng: ${usernameCheckError.message}`);

        if (usernameCount > 0) {
            displayError('signupUsername', 'Tên người dùng này đã tồn tại.');
            return;
        }

        const { data, error } = await supabase.auth.signUp({ 
            email, 
            password,
            options: {
                data: {
                    username: username,
                    birthday: birthday
                }
            }
        });

        if (error) {
            console.error('Signup error:', error);
            if (error.message.includes('already registered')) {
                displayError('signupEmail', 'Email này đã được đăng ký.');
            } else {
                displayError('signupEmail', `Đăng ký thất bại: ${error.message}`);
            }
            return;
        }

        console.log('Signup success:', data.user.email);

        const { error: upsertError } = await supabase
            .from('users')
            .upsert({
                id: data.user.id,
                email: email,
                username: username,
                birthday: birthday,
                avatar_url: null,  // Default
                updated_at: new Date().toISOString()
            });

        if (upsertError) {
            console.error('Upsert users error:', upsertError);
        } else {
            console.log('✅ Users table populated');
        }

        alert('Đăng ký thành công! Vui lòng kiểm tra email để xác nhận và đăng nhập.');
        window.location.href = '/index.html';
        return;

    } catch (error) {
        console.error('Lỗi hệ thống khi đăng ký:', error);
        console.error('Exact error:', error.message);
        displayError('signupEmail', `Lỗi hệ thống: ${error.message}`);
    }
}

async function loginWithEmail() {
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;
    const loginBtn = document.querySelector('#loginForm button[type="submit"]') || document.getElementById('loginBtn');

    displayError('loginEmail', null); 
    displayError('loginPassword', null);

    if (!email || !password) {
        if (!email) displayError('loginEmail', 'Vui lòng nhập Email.');
        if (!password) displayError('loginPassword', 'Vui lòng nhập Mật khẩu.');
        return;
    }

    // Disable button
    if (loginBtn) {
        loginBtn.disabled = true;
        loginBtn.textContent = 'Đang đăng nhập...';
    }

    try {
        console.log('🔄 Starting signInWithPassword for', email);
        const { data: { user }, error } = await supabase.auth.signInWithPassword({ email, password });

        if (error) {
            console.error('Login error:', error);
            const errMsg = error.message.includes('Invalid') 
                ? 'Email hoặc mật khẩu không chính xác.' 
                : `Đăng nhập thất bại: ${error.message}`;
            displayError('loginPassword', errMsg);
            if (loginBtn) {
                loginBtn.disabled = false;
                loginBtn.textContent = 'Đăng nhập';
            }
            return;
        }

        console.log('✅ signIn success, user:', user.email);

        // Await getSession
        let confirmedSession = null;
        try {
            const { data: { session } } = await supabase.auth.getSession();
            confirmedSession = session;
            if (confirmedSession?.user) {
                console.log('💾 Session confirmed:', confirmedSession.user.email);
            } else {
                console.warn('⚠️ getSession returned no session - fallback');
            }
        } catch (getErr) {
            console.warn('getSession error:', getErr.message);
        }

        // Set user & dispatch
        window.currentUser = confirmedSession?.user || user;
        console.log('🔄 Set currentUser:', window.currentUser.id);
        const sessionForDispatch = confirmedSession || { user };
        window.dispatchEvent(new CustomEvent('SUPABASE_SESSION_RESTORED', { detail: { session: sessionForDispatch } }));
        window.dispatchEvent(new CustomEvent('SUPABASE_AUTH_CHANGE', { detail: { event: 'SIGNED_IN', session: sessionForDispatch } }));

        // Clear form
        document.getElementById('loginEmail').value = '';
        document.getElementById('loginPassword').value = '';

        // Success message
        displayError('loginPassword', 'Đăng nhập thành công! Đang chuyển hướng...');

        // Check email confirmed
        if (user.app_metadata?.provider === 'email' && !user.email_confirmed_at) {
            console.log('❌ Email not confirmed');
            alert('Email chưa xác nhận! Vui lòng kiểm tra mail và click link xác nhận.');
            if (loginBtn) {
                loginBtn.disabled = false;
                loginBtn.textContent = 'Đăng nhập';
            }
            return;
        }

        console.log('✅ Email confirmed OK');

        // Upsert profile async
        let profile = null;
        try {
            const { data: selectData, error: selectError } = await supabase
                .from('users')
                .select('username, birthday, avatar_url')
                .eq('id', user.id)
                .single()
                .timeout(2000);
            profile = selectData;
            if (selectError && selectError.code !== 'PGRST116') {
                console.error('Select profile error:', selectError);
            }
        } catch (e) {
            console.warn('Select profile timeout:', e);
        }

        const username = profile?.username || user.user_metadata?.username || email.split('@')[0];
        const birthday = profile?.birthday || user.user_metadata?.birthday || null;

        supabase
            .from('users')
            .upsert({
                id: user.id,
                email: user.email,
                username,
                birthday,
                avatar_url: profile?.avatar_url || null,
                updated_at: new Date().toISOString()
            })
            .timeout(2000)
            .then(({ error: upsertError }) => {
                if (upsertError) console.error('Upsert error (async):', upsertError);
                else console.log('✅ Profile upserted (async)');
            })
            .catch(e => console.warn('Upsert timeout (async):', e));

        // Redirect delay 300ms
        setTimeout(() => {
            if (loginBtn) {
                loginBtn.disabled = false;
                loginBtn.textContent = 'Đăng nhập';
            }
            window.location.href = '/player.html';
        }, 300);

    } catch (error) {
        console.error('Lỗi hệ thống loginWithEmail:', error);
        displayError('loginPassword', `Lỗi hệ thống: ${error.message}`);
        if (loginBtn) {
            loginBtn.disabled = false;
            loginBtn.textContent = 'Đăng nhập';
        }
    }
}


async function loginWithGoogle() {
    console.log('Login with Google called');
    
    try {
        const { data, error } = await supabase.auth.signInWithOAuth({
            provider: 'google',
            options: {
                redirectTo: `${window.location.origin}/player.html` 
            }
        });

        if (error) throw error;
        console.log('Google OAuth initiated:', data);

        // Dispatch events sau OAuth (sẽ fire onAuthStateChange)
        supabase.auth.onAuthStateChange((event, session) => {
            if (event === 'SIGNED_IN' && session?.user) {
                window.currentUser = session.user;
                window.dispatchEvent(new CustomEvent('SUPABASE_AUTH_CHANGE', { detail: { event, session } }));
            }
        });

    } catch (error) {
        console.error('Google login error:', error);
        alert('Lỗi đăng nhập Google: ' + error.message);
    }
}

async function logout() {
    try {
        console.log('Starting logout...');

        // 1. ĐÁNH DẤU LOGOUT NGAY LẬP TỨC
        localStorage.setItem('manh-music-logout', 'true');
        localStorage.setItem('manh-music-logout-time', Date.now().toString());

        // 2. Gọi signOut
        const timeoutMs = 3000;
        let signOutError = null;

        try {
            const result = await Promise.race([
                supabase.auth.signOut({ scope: 'local' }).then(() => ({ success: true })),
                new Promise(resolve => setTimeout(() => resolve({ timeout: true }), timeoutMs))
            ]);

            if (result.timeout) {
                console.warn('signOut timed out');
            } else {
                console.log('Supabase signOut success');
            }
        } catch (err) {
            signOutError = err;
            console.error('signOut error:', err);
        }

        // 3. FORCE CLEAR ALL AUTH DATA
        const keysToRemove = Object.keys(localStorage).filter(key =>
            key.startsWith('sb-') ||
            key.includes('supabase.auth') ||
            key.includes('token')
        );

        keysToRemove.forEach(key => {
            localStorage.removeItem(key);
            console.log('Removed:', key);
        });

        // 4. Clear cache
        const cacheKeys = [
            'cachedPlaylists', 'cachedHistoryTracks', 'cachedRecommendedTracks',
            'cachedProfile', 'cachedPlaylistTracks', 'cachedRecommendationsPlaylistId'
        ];
        cacheKeys.forEach(key => window[key] = null);
        window.userSessionLoaded = false;

        console.log('Logout cleanup complete');

        // 5. REDIRECT NGAY LẬP TỨC
        window.location.replace('/index.html');

    } catch (error) {
        console.error('Lỗi logout:', error);
        localStorage.setItem('manh-music-logout', 'true');
        window.location.replace('/index.html');
    }
}

supabase.auth.onAuthStateChange((event, session) => {
    console.log('AUTH STATE CHANGED:', event, session?.user?.email || 'no user');

    if (event === 'SIGNED_IN' && session?.user) {
        window.currentUser = session.user;
        // Tự động redirect nếu đang ở index.html
        if (window.location.pathname.includes('index.html') || window.location.pathname === '/') {
            window.location.href = '/player.html';
        }
        // Dispatch để sync
        window.dispatchEvent(new CustomEvent('SUPABASE_AUTH_CHANGE', { detail: { event, session } }));
    }

    if (event === 'SIGNED_OUT') {
        window.currentUser = null;
        window.location.href = '/index.html';
    }
});

window.authFunctions = {
    signup,
    loginWithEmail, 
    loginWithGoogle,
    logout
};

// Also export for module consumers so app.js can import directly and avoid relying on globals
export { signup, loginWithEmail, loginWithGoogle, logout };