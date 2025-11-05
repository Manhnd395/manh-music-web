import { supabase } from '../supabase/client.js';

console.log('📄 Script loaded:', window.location.href);

// Kiểm tra đăng nhập
document.addEventListener('DOMContentLoaded', function() {
    const currentPath = window.location.pathname;
    console.log('🔍 Auth.js checking path:', currentPath);
    
    if (currentPath === '/' || currentPath === '/index' || currentPath === '/index.html') {
        supabase.auth.getUser().then(({ data: { user } }) => {
            console.log('👤 User status:', user ? 'Logged in' : 'Not logged in');
            if (user) {
                console.log('🔄 Redirecting to player (already logged in)');
                window.location.href = "/player.html";
            } else {
                const authContainer = document.getElementById("authContainer");
                if (authContainer) {
                    authContainer.style.display = "block";
                    console.log('👁️ Showing auth form');
                }
            }
        }).catch(error => {
            console.error('❌ Auth check error:', error);
        });
    }

    // Parse OAuth callback token từ URL hash
    const urlHash = window.location.hash.substring(1);
    if (urlHash) {
        const params = new URLSearchParams(urlHash);
        const accessToken = params.get('access_token');
        const refreshToken = params.get('refresh_token');
        if (accessToken && refreshToken) {
            supabase.auth.setSession({
                access_token: accessToken,
                refresh_token: refreshToken
            }).then(({ data: { session }, error }) => {
                if (error) {
                    console.error('Set session error:', error);
                } else {
                    console.log('Session set from callback:', session.user.email);
                    window.history.replaceState({}, document.title, window.location.pathname);
                    window.location.href = '/player.html';
                }
            });
        }
    }

    // FIX: Attach listener cho signup form
    const signupForm = document.getElementById('signupForm');
    if (signupForm) {
        signupForm.addEventListener('submit', async (e) => {
            e.preventDefault();  // Ngăn reload form
            await signup();
        });
        console.log('✅ Signup form listener attached');
    }

    // FIX: Attach listener cho login form (MỚI: Ngăn reload và gọi loginWithEmail)
    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();  // Ngăn reload trang
            await loginWithEmail();  // Gọi hàm login
        });
        console.log('✅ Login form listener attached');
    }

    // FIX: Clear error on focus input (UX: Xóa lỗi khi user bắt đầu nhập lại)
    const inputs = document.querySelectorAll('.login-container input');
    inputs.forEach(input => {
        input.addEventListener('focus', () => {
            const inputId = input.id;
            const errorEl = document.getElementById(`${inputId}Error`);
            if (errorEl) {
                displayError(inputId, null);  // Clear error
            }
        });
    });
    console.log('✅ Clear error on focus attached for inputs');
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

        // Signup
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

        // FIX: Upsert vào bảng users ngay lập tức
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
            console.error('Upsert users error:', upsertError);  // Log để debug RLS
            // Không throw, vẫn coi signup success
        } else {
            console.log('✅ Users table populated');
        }

        // FIX: KHÔNG auto signIn (vì email confirmation enabled) - alert và redirect
        alert('Đăng ký thành công! Vui lòng kiểm tra email để xác nhận và đăng nhập.');
        window.location.href = '/index.html';
        return;  // Dừng, không fallback

    } catch (error) {
        console.error('Lỗi hệ thống khi đăng ký:', error);
        console.error('Exact error:', error.message);
        displayError('signupEmail', `Lỗi hệ thống: ${error.message}`);
    }
}

async function loginWithEmail() {
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;

    // Xóa lỗi cũ
    displayError('loginEmail', null); 
    displayError('loginPassword', null);

    if (!email || !password) {
        if (!email) displayError('loginEmail', 'Vui lòng nhập Email.');
        if (!password) displayError('loginPassword', 'Vui lòng nhập Mật khẩu.');
        return;
    }

    try {
        console.log('🔄 Starting signInWithPassword for', email);  // FIX: Log start
        const { data: { user }, error } = await supabase.auth.signInWithPassword({ email, password });

        if (error) {
            console.error('Login error:', error);
            if (error.message.includes('Invalid login credentials')) {
                displayError('loginPassword', 'Email hoặc mật khẩu không chính xác.');
            } else {
                displayError('loginPassword', `Đăng nhập thất bại: ${error.message}`);
            }
            return;
        }

        console.log('✅ signIn success, user:', user.email);  // FIX: Log sau signIn

        // FIX: Check email confirmed
        console.log('🔍 Checking email confirmed...');  // Log before check
        if (user && user.app_metadata?.provider === 'email' && !user.email_confirmed_at) {
            console.log('❌ Email not confirmed');  // Log fail
            alert('Email chưa xác nhận! Vui lòng kiểm tra mail và click link xác nhận.');
            return;
        }
        console.log('✅ Email confirmed OK');  // Log success

        console.log('Login success – checking users table');  // Log gốc

        // FIX: Upsert users sau login (với timeout 5s để tránh hang)
        console.log('🔍 Starting select profile...');  // Log before select
        let profile = null;
        try {
            const selectPromise = supabase
                .from('users')
                .select('username, birthday, avatar_url')
                .eq('id', user.id)
                .single()
                .timeout(5000);  // FIX: Timeout 5s

            const { data: selectData, error: selectError } = await selectPromise;
            profile = selectData;
            if (selectError && selectError.code !== 'PGRST116') {
                console.error('Select profile error:', selectError);
            }
            console.log('✅ Select profile done, data:', profile ? 'exists' : 'null');  // Log after
        } catch (selectTimeout) {
            console.warn('Select profile timeout:', selectTimeout);
            profile = null;  // Fallback
        }

        let username = profile?.username || user.user_metadata?.username || email.split('@')[0];
        let birthday = profile?.birthday || user.user_metadata?.birthday || null;

        console.log('🔍 Starting upsert users...');  // Log before upsert
        try {
            const upsertPromise = supabase
                .from('users')
                .upsert({
                    id: user.id,
                    email: user.email,
                    username: username,
                    birthday: birthday,
                    avatar_url: profile?.avatar_url || null,
                    updated_at: new Date().toISOString()
                })
                .timeout(5000);  // FIX: Timeout 5s

            const { error: upsertError } = await upsertPromise;
            if (upsertError) {
                console.error('Upsert after login error:', upsertError);
            } else {
                console.log('✅ Users table synced after login');
            }
            console.log('✅ Upsert done');  // Log after
        } catch (upsertTimeout) {
            console.warn('Upsert timeout:', upsertTimeout);
        }

        // FIX: Fallback redirect ngay cả nếu upsert fail/timeout
        console.log('Login success – redirecting to player.html');
        window.location.href = '/player.html'; 

    } catch (error) {
        console.error('Lỗi hệ thống:', error);
        displayError('loginPassword', `Lỗi hệ thống: ${error.message}`);
    }
}

async function loginWithGoogle() {
    console.log('Login with Google called');
    
    try {
        const { data, error } = await supabase.auth.signInWithOAuth({
            provider: 'google',
            options: {
                redirectTo: `${window.location.origin}/player.html`  // Redirect sau OAuth
            }
        });

        if (error) throw error;
        console.log('Google OAuth initiated:', data);

        // FIX: Note - Upsert users sẽ xử lý ở app.js sau setSession, sử dụng user_metadata từ Google
        // (e.g., username = user.user_metadata.full_name, birthday = null)

    } catch (error) {
        console.error('Google login error:', error);
        alert('Lỗi đăng nhập Google: ' + error.message);
    }
}

async function logout() {
    try {
        console.log('Starting logout...');

        // 1. Sign out từ Supabase
        const { error: signOutError } = await supabase.auth.signOut();
        if (signOutError) {
            console.error('SignOut error:', signOutError);
        } else {
            console.log('Supabase signOut success');
        }

        // 2. XÓA TOÀN BỘ LOCAL STORAGE CỦA SUPABASE
        // Supabase lưu session ở key động: supabase.auth.token + user_id
        Object.keys(localStorage).forEach(key => {
            if (key.startsWith('supabase.auth.')) {
                localStorage.removeItem(key);
            }
        });
        console.log('All supabase.auth.* keys cleared from localStorage');

        // 3. Clear window cache (như cũ)
        window.cachedPlaylists = null;
        window.cachedHistoryTracks = null;
        window.cachedRecommendedTracks = null;
        window.cachedProfile = null;
        window.cachedPlaylistTracks = null;
        window.cachedRecommendationsPlaylistId = null;
        window.userSessionLoaded = false;

        console.log('All caches cleared');

        // 4. Redirect
        window.location.href = '/index.html';

    } catch (error) {
        console.error('Lỗi hệ thống logout:', error);
        // Fallback: vẫn xóa và redirect
        Object.keys(localStorage).forEach(key => {
            if (key.startsWith('supabase.auth.')) localStorage.removeItem(key);
        });
        window.location.href = '/index.html';
    }
}

window.authFunctions = {
    signup,
    loginWithEmail, 
    loginWithGoogle,
    logout
};