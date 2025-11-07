// app.js
import { supabase } from '../supabase/client.js';
import { renderPlaylists, createPlaylist } from './playlist.js';

console.log('App.js loaded');
console.log('Supabase instance:', supabase ? 'Connected' : 'Not connected');

console.log('Script loaded:', window.location.href);

let currentAudio = null;
let isPlaying = false;
let currentTrackIndex = 0;
let currentPlaylist = [];
let volume = 0.5;

let isShuffling = false; 
let repeatMode = 'off'; 
let shuffleOrder = []; 

let cachedPlaylists = null;
let cachedHistoryTracks = null;
let cachedRecommendedTracks = null;
let cachedProfile = null;
let cachedPlaylistTracks = null;
let cachedMyUploads = null;
let recommendationsLoaded = false;

let initializationInProgress = false;
let homePageLoaded = false;

let isTransitioning = false;
const FALLBACK_COVER = '/assets/default-cover.webp';
let recentlyPaused = false;
window.isPlaying = isPlaying;
window.currentUser = window.currentUser || null;

window.appFunctions = window.appFunctions || {};
// window.appFunctions.getCurrentUserId = async () => window.currentUser?.id || null;


console.log('✅ appFunctions initialized');

window.currentPlaylists = window.currentPlaylists || {};

async function onSupabaseSessionRestored(e) {
  const session = e?.detail?.session;
  console.log('SUPABASE_SESSION_RESTORED received in app.js:', !!session?.user, session?.user?.email ?? null);

  // Nếu có session => initialize app
  if (session?.user) {
    window.currentUser = session.user;
    try {
      // tránh double init
      if (!window.appInitialized && !window.initializationInProgress) {
        await initializeApp(session.user);
        window.appInitialized = true;
      } else {
        console.log('App already initialized or in progress; skipping initializeApp');
      }
    } catch (err) {
      console.error('Error initializing app after session restored:', err);
    }
  } else {
    console.warn('No session after restore - redirecting to login if on protected page');
    // Nếu đang ở player.html và không có session thì redirect
    if (window.location.pathname.includes('player.html')) {
      window.location.href = '/index.html';
    }
  }
}

// Lắng nghe event phát từ client.js
window.addEventListener('SUPABASE_SESSION_RESTORED', onSupabaseSessionRestored);

// Ngoài ra lắng nghe auth changes (ví dụ sau khi SIGNED_IN xảy ra)
window.addEventListener('SUPABASE_AUTH_CHANGE', async (e) => {
  const { event, session } = e.detail || {};
  console.log('SUPABASE_AUTH_CHANGE in app.js:', event, session?.user?.email ?? null);
  if (event === 'SIGNED_IN' && session?.user) {
    window.currentUser = session.user;
    // Khởi tạo hoặc reinit app
    await initializeApp(session.user);
    window.appInitialized = true;
  } else if (event === 'SIGNED_OUT') {
    // cleanup
    resetAllCaches?.();
  }
});

// Global fallback cho session events
window.addEventListener('load', () => {
    if (!window.currentUser && window.supabase) {
        console.log('🔄 App.js load fallback: Checking session');
        window.supabase.auth.getUser().then(({ data: { user } }) => {
            if (user && !window.currentUser) {
                window.currentUser = user;
                console.log('✅ App.js fallback user set:', user.id);
                initializeApp(user);
            }
        });
    }
});


window.addEventListener('beforeunload', () => {
    // Reset tất cả cache flags
    cachedPlaylists = null;
    cachedHistoryTracks = null;
    cachedRecommendedTracks = null;
    cachedProfile = null;
    cachedPlaylistTracks = null;
    cachedMyUploads = null;
    recommendationsLoaded = false;
    window.playlistsLoadFlag = false;
    console.log('🔄 Cache reset for new tab');
});

function initializePlayerControls() {
    document.getElementById('playPauseBtn').addEventListener('click', togglePlayPause);
    document.getElementById('prevBtn').addEventListener('click', playPreviousTrack);
    document.getElementById('nextBtn').addEventListener('click', playNextTrack);

    const volumeSlider = document.getElementById('volumeSlider');
    if (volumeSlider) {
        volumeSlider.addEventListener('input', handleVolumeChange);
    }

    if (volumeSlider) {
        volumeSlider.value = volume * 100;
    }

    document.getElementById('progressBar').addEventListener('input', handleProgressChange);
    document.getElementById('shuffleBtn').addEventListener('click', toggleShuffle);
    document.getElementById('repeatBtn').addEventListener('click', toggleRepeat);

    document.addEventListener('keydown', handleKeyboardShortcuts);

    console.log('Player controls initialized');
}
window.initializePlayerControls = initializePlayerControls;

window.closeModal = function(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.style.display = 'none';
        console.log(`Modal ${modalId} closed.`);
    } else {
        console.warn(`Attempted to close non-existent modal: ${modalId}`);
    }
};

window.addEventListener('error', function(e) {
    console.error('🛑 Global Error:', e.error);
    console.error('🛑 Error at:', e.filename, 'line:', e.lineno);
    
    if (e.error instanceof SyntaxError) {
        console.warn('🔄 Syntax error detected, attempting recovery...');
        // Clear problematic cache
        sessionStorage.clear();
    }
});

if (window.location.hostname === 'localhost') {
    const cacheBuster = '?v=' + Date.now();
    document.querySelectorAll('script[type="module"][src*="/scripts/"]').forEach(script => {
        if (!script.src.includes('?')) {
            script.src += cacheBuster;
        }
    });
}

supabase.auth.getSession().then(({ data: { session }, error }) => {
    if (!window.currentUser) {
        console.log('🔄 App.js: Force retry getSession after 500ms');
        setTimeout(() => {
            supabase.auth.getSession().then(({ data: { session }, error }) => {
                console.log('🔄 Force getSession result:', !!session?.user, session?.user?.email || 'null');
                if (session?.user && !window.currentUser) {
                    window.currentUser = session.user;
                    console.log('✅ App.js force session restored:', session.user.email);
                    // Manual trigger init nếu DOM ready
                    if (document.readyState === 'complete' && typeof initializeApp === 'function') {
                        initializeApp(session.user);
                    }
                } else if (error) {
                    console.error('Force getSession error:', error);
                    localStorage.removeItem('sb-lezswjtnlsmznkgrzgmu-auth-token');  // Clear corrupt
                }
            });
        }, 500);
    }
}).catch(err => console.error('Force getSession failed:', err));

function togglePlayPause() {
    console.log('🎵 togglePlayPause called, current state:', {
        isPlaying: isPlaying,
        hasAudio: !!currentAudio,
        isTransitioning: isTransitioning
    });
    
    if (isTransitioning) {
        console.log('⏳ Skipping - transition in progress');
        return;
    }
    
    isTransitioning = true;
    setTimeout(() => { isTransitioning = false; }, 300);

    const playPauseBtn = document.getElementById('playPauseBtn');
    
    // FIX: Kiểm tra audio element
    if (!currentAudio) {
        console.log('❌ No audio element - cannot play');
        if (currentPlaylist.length > 0) {
            console.log('🔄 Attempting to play first track from playlist');
            playTrack(currentPlaylist[currentTrackIndex]);
        }
        isTransitioning = false;
        return;
    }

    const playIcon = playPauseBtn ? playPauseBtn.querySelector('i') : null;
    
    try {
        if (isPlaying) {
            console.log('⏸️ Pausing audio');
            currentAudio.pause();
            recentlyPaused = true;
            setTimeout(() => { recentlyPaused = false; }, 500);
            if (playIcon) {
                playIcon.className = 'fas fa-play';
            }
            isPlaying = false;
        } else {
            console.log('▶️ Playing audio');
            currentAudio.play().then(() => {
                console.log('✅ Play successful');
                if (currentAudio.track) {
                    window.updatePlayerBar(currentAudio.track);
                }
                updateProgressBar();
            }).catch(playError => {
                console.error('❌ Play failed:', playError);
                if (playError.name === 'AbortError' || 
                    playError.message.includes('interrupted by a call to pause()') || 
                    recentlyPaused) {
                    console.warn('⚠️ Play interrupted - ignoring');
                    return;
                }
                // FIX: Thử load lại nếu play thất bại
                console.log('🔄 Attempting to reload audio');
                currentAudio.load();
                setTimeout(() => {
                    currentAudio.play().catch(finalError => {
                        console.error('❌ Final play attempt failed:', finalError);
                        alert('Không thể phát nhạc: ' + finalError.message);
                    });
                }, 100);
            });
            
            if (playIcon) {
                playIcon.className = 'fas fa-pause';
            }
            isPlaying = true;
        }
    } catch (error) {
        console.error('❌ Error in togglePlayPause:', error);
        isPlaying = false;
        if (playIcon) {
            playIcon.className = 'fas fa-play';
        }
    }
}
window.togglePlayPause = togglePlayPause

function handleVolumeChange(e) {
    volume = e.target.value / 100;
    if (currentAudio) {
        currentAudio.volume = volume;
    }
}

function handleProgressChange(e) {
    if (currentAudio && currentAudio.duration) {
        const seekTime = (e.target.value / 100) * currentAudio.duration;
        currentAudio.currentTime = seekTime;
    }
}

function handleKeyboardShortcuts(e) {
    if (e.target.tagName === 'INPUT') return;

    switch(e.code) {
        case 'Space':
            e.preventDefault();
            togglePlayPause();
            break;
        case 'ArrowLeft':
            e.preventDefault();
            seek(-10);
            break;
        case 'ArrowRight':
            e.preventDefault();
            seek(10);
            break;
        case 'ArrowUp':
            e.preventDefault();
            increaseVolume();
            break;
        case 'ArrowDown':
            e.preventDefault();
            decreaseVolume();
            break;
    }
}

function seek(seconds) {
    if (currentAudio) {
        currentAudio.currentTime += seconds;
    }
}

function increaseVolume() {
    volume = Math.min(1, volume + 0.1);
    if (currentAudio) {
        currentAudio.volume = volume;
    }
    const volumeSlider = document.getElementById('volumeSlider');
    if (volumeSlider) {
        volumeSlider.value = volume * 100;
    }
}

function decreaseVolume() {
    volume = Math.max(0, volume - 0.1);
    if (currentAudio) {
        currentAudio.volume = volume;
    }
    const volumeSlider = document.getElementById('volumeSlider');
    if (volumeSlider) {
        volumeSlider.value = volume * 100;
    }
}

function updateProgressBar() {
    const progressBar = document.getElementById('progressBar');
    const currentTimeEl = document.getElementById('currentTime');
    const durationEl = document.getElementById('duration');

    if (currentAudio && progressBar) {
        const progress = (currentAudio.currentTime / currentAudio.duration) * 100 || 0;
        progressBar.value = progress;

        if (currentTimeEl) currentTimeEl.textContent = formatTime(currentAudio.currentTime);
        if (durationEl && isFinite(currentAudio.duration)) durationEl.textContent = formatTime(currentAudio.duration);
    }
}

async function updateProfileDisplay(user, forceRefresh = false) { 
    const defaultAvatarUrl = '/assets/default-avatar.png'; 
    const headerUserElement = document.getElementById('userName'); 
    const headerAvatarElement = document.getElementById('userAvatar');
    const profileModalAvatar = document.getElementById('currentAvatarPreview');

    let profile = await loadProfile(user.id, forceRefresh);
    
    const username = profile?.username || 'User Name';
    
    if (headerUserElement) {
        headerUserElement.textContent = username;
    }

    let finalAvatarUrl = defaultAvatarUrl;

    if (profile?.avatar_url) {
        if (profile.avatar_url.includes('supabase.co') || profile.avatar_url.startsWith('http')) {
            finalAvatarUrl = profile.avatar_url;
        } else {
            const { data: avatarData } = supabase.storage
                .from('avatars')
                .getPublicUrl(profile.avatar_url);
            if (avatarData?.publicUrl) {
                finalAvatarUrl = avatarData.publicUrl;
            }
        }
    }
    
    if (headerAvatarElement) {
        headerAvatarElement.src = finalAvatarUrl;
    }
    if (profileModalAvatar) {
        profileModalAvatar.src = finalAvatarUrl;
    }
    
    const profileUsernameInput = document.getElementById('editUsername');
    if (profileUsernameInput && profile) {
        profileUsernameInput.value = profile.username || '';
    }
    
    const profileBirthdayInput = document.getElementById('editBirthday');
    if (profileBirthdayInput && profile) {
        profileBirthdayInput.value = profile.birthday || '';
    }
};

async function loadProfile(userId) {
    if (cachedProfile) return cachedProfile;

    const { data, error } = await supabase
        .from('users')
        .select('username, birthday, avatar_url')
        .eq('id', userId)
        .single();
        
    if (error) throw error;
    
    cachedProfile = data;
    return data;
}
window.loadProfile = loadProfile;

function getPublicAvatarUrl(avatarPath) {
    if (!avatarPath) return '/assets/default-avatar.png';
    if (avatarPath.includes('supabase.co') || avatarPath.startsWith('http')) return avatarPath;
    const { data } = supabase.storage.from('avatars').getPublicUrl(avatarPath);
    return data?.publicUrl || '/assets/default-avatar.png';
}

async function uploadAvatar(userId, avatarFile) {
    const BUCKET_NAME = 'avatars'; 
    
    const fileExt = avatarFile.name.split('.').pop();
    const filePath = `${userId}/${Date.now()}_avatar.${fileExt}`; 

    try {
        console.log('Starting avatar upload to path:', filePath);
        const { data: uploadData, error: uploadError } = await supabase.storage
            .from(BUCKET_NAME)
            .upload(filePath, avatarFile, {
                cacheControl: '3600',
                upsert: true, 
            });

        if (uploadError) {
            console.error('Upload error:', uploadError);
            return null;
        }

        console.log('Upload data:', uploadData);

        const { data: publicUrlData } = supabase.storage
            .from(BUCKET_NAME)
            .getPublicUrl(filePath);

        console.log('Public URL:', publicUrlData.publicUrl);

        return publicUrlData.publicUrl;

    } catch (error) {
        console.error('System error during upload:', error);
        return null;
    }
}

function formatTime(seconds) {
    if (!seconds || isNaN(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

window.playTrack = async function (track, playlist = currentPlaylist, index = -1) {
    console.log('🎵 Attempting to play track:', track);
    
    if (!track || !track.file_url) {
        console.error('❌ Lỗi: Thông tin track không hợp lệ hoặc thiếu file_url.');
        console.log('Track data:', track);
        alert('Không thể phát bài hát: File không tồn tại');
        return;
    }

    // DEBUG: Log thông tin track
    console.log('📋 Track details:', {
        title: track.title,
        artist: track.artist,
        file_url: track.file_url,
        has_file_url: !!track.file_url
    });

    // FIX: Pause & clear old audio
    if (currentAudio) {
        console.log('⏸️ Stopping previous audio');
        currentAudio.pause();
        currentAudio = null;
    }

    // Set playlist & index
    if (playlist && playlist.length > 0) {
        currentPlaylist = playlist;
        currentTrackIndex = (index !== -1) ? index : currentPlaylist.findIndex(t => t.id === track.id) || 0;
        
        if (isShuffling) {
            generateShuffleOrder();
        }
    }

    // FIX: Validate và sửa URL nếu cần
    let audioUrl = track.file_url;
    console.log('🔗 Original audio URL:', audioUrl);

    // FIX: Sửa URL Supabase nếu cần
    if (audioUrl && audioUrl.includes('supabase.co')) {
        // Đảm bảo URL hợp lệ
        if (!audioUrl.includes('?')) {
            audioUrl += '?';
        }
        // Thêm cache busting
        audioUrl += `&t=${Date.now()}`;
        console.log('🔧 Fixed Supabase URL:', audioUrl);
    }

    // FIX: Validate URL resource type before creating audio element
    try {
        // HEAD request to verify content-type (detect accidental HTML pages)
        try {
            const headResp = await fetch(audioUrl, { method: 'HEAD' });
            const ct = headResp.headers.get('content-type') || '';
            console.log('🔎 HEAD content-type for audioUrl:', ct);
            if (ct.includes('text/html')) {
                console.error('❌ Audio URL points to HTML (likely a page), aborting play:', audioUrl);
                alert('Không thể phát bài hát: file trả về HTML thay vì file âm thanh. Kiểm tra file_url.');
                return;
            }
        } catch (headErr) {
            // HEAD may be blocked by some servers (CORS) — fallback to GET small range
            console.warn('⚠️ HEAD request failed, attempting range GET to probe content-type', headErr);
            try {
                const rangeResp = await fetch(audioUrl, { method: 'GET', headers: { Range: 'bytes=0-1023' } });
                const ct2 = rangeResp.headers.get('content-type') || '';
                console.log('🔎 Range GET content-type for audioUrl:', ct2);
                if (ct2.includes('text/html')) {
                    console.error('❌ Audio URL points to HTML (via range GET), aborting play:', audioUrl);
                    alert('Không thể phát bài hát: file trả về HTML thay vì file âm thanh. Kiểm tra file_url.');
                    return;
                }
            } catch (rangeErr) {
                console.warn('⚠️ Probe request failed, continuing to create Audio (last resort)', rangeErr);
            }
        }

        // Tạo audio element với error handling
        currentAudio = new Audio(audioUrl);
        currentAudio.track = track;
        currentAudio.volume = volume;
        currentAudio.preload = 'metadata'; // FIX: Dùng metadata thay vì auto
        
        console.log('🎵 Audio element created');

        // FIX: Event listeners với proper error handling
        currentAudio.addEventListener('loadeddata', function() {
            console.log('✅ Audio loaded successfully:', track.title);
            updateProgressBar();
        });

        currentAudio.addEventListener('canplay', function() {
            console.log('🎶 Audio ready to play');
            // FIX: Không auto-play ngay, đợi user interaction
        });

        currentAudio.addEventListener('error', function(e) {
            console.error('❌ Audio load error:', e);
            console.error('Error details:', {
                error: currentAudio.error,
                networkState: currentAudio.networkState,
                readyState: currentAudio.readyState
            });
            
            // FIX: Hiển thị lỗi cụ thể
            let errorMessage = 'Lỗi tải file nhạc: ';
            switch(currentAudio.error.code) {
                case MediaError.MEDIA_ERR_ABORTED:
                    errorMessage += 'Tải bị hủy';
                    break;
                case MediaError.MEDIA_ERR_NETWORK:
                    errorMessage += 'Lỗi mạng';
                    break;
                case MediaError.MEDIA_ERR_DECODE:
                    errorMessage += 'Lỗi định dạng file';
                    break;
                case MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED:
                    errorMessage += 'Định dạng không được hỗ trợ';
                    break;
                default:
                    errorMessage += 'Lỗi không xác định';
            }
            
            alert(errorMessage);
            currentAudio = null;
            isPlaying = false;
        });

        currentAudio.addEventListener('timeupdate', updateProgressBar);
        
        currentAudio.addEventListener('ended', function() {
            console.log('⏹️ Track ended:', track.title);
            isPlaying = false;
            const playPauseBtn = document.getElementById('playPauseBtn');
            const playIcon = playPauseBtn ? playPauseBtn.querySelector('i') : null;
            if (playIcon) {
                playIcon.className = 'fas fa-play';
            }
            
            // FIX: Chuyển bài tiếp theo
            if (currentPlaylist.length > 0) {
                setTimeout(window.playNextTrack, 500);
            }
        });

        // FIX: Thử load audio trước
        currentAudio.load();
        
        // FIX: Đợi một chút rồi mới play
        setTimeout(() => {
            playAudioWithRetry(currentAudio, track);
        }, 100);

    } catch (error) {
        console.error('❌ Lỗi tạo audio element:', error);
        alert('Lỗi khởi tạo trình phát nhạc: ' + error.message);
        currentAudio = null;
        isPlaying = false;
    }
};
window.playTrack = playTrack;

async function playAudioWithRetry(audioElement, track, retryCount = 0) {
    const maxRetries = 2;
    
    try {
        console.log(`🎵 Attempting to play (retry ${retryCount})...`);
        await audioElement.play();
        
        // Success
        isPlaying = true;
        window.updatePlayerBar(track);
        
        const playPauseBtn = document.getElementById('playPauseBtn');
        const playIcon = playPauseBtn ? playPauseBtn.querySelector('i') : null;
        if (playIcon) {
            playIcon.className = 'fas fa-pause';
        }

        console.log('🎶 Now playing:', track.title, 'by', track.artist);
        updatePlayHistory(track.id);

        if (typeof window.fetchLyrics === 'function') {
            window.fetchLyrics(track);
        }
        
    } catch (error) {
        console.error(`❌ Play failed (attempt ${retryCount + 1}):`, error);
        
        if (retryCount < maxRetries) {
            console.log(`🔄 Retrying play... (${retryCount + 1}/${maxRetries})`);
            setTimeout(() => playAudioWithRetry(audioElement, track, retryCount + 1), 500);
        } else {
            console.error('❌ Max play retries exceeded');
            alert('Không thể phát bài hát. Có thể file bị lỗi hoặc định dạng không hỗ trợ.');
            isPlaying = false;
            currentAudio = null;
        }
    }
}

window.playNextTrack = async function () { 
    if (repeatMode === 'one') {
        window.appFunctions.playTrack(currentPlaylist[currentTrackIndex]);
        return;
    }

    // FIX: Nếu currentPlaylist empty, load recs random
    if (currentPlaylist.length === 0) {
        console.log('No current playlist - loading recommendations for random next');
        const user = window.currentUser;
    if (!user) return;

        if (!cachedRecommendedTracks || cachedRecommendedTracks.length === 0) {
            try {
                const { data: tracks, error } = await supabase
                    .rpc('get_unique_recommendations', { limit_count: 20 });
                if (error) throw error;
                cachedRecommendedTracks = tracks || [];
            } catch (error) {
                console.error('Lỗi load recommendations for random:', error);
                isPlaying = false;
                return;
            }
        }

        const recs = cachedRecommendedTracks;
        if (recs.length === 0) {
            console.log('No recommendations available - stopping playback');
            isPlaying = false;
            return;
        }

        // FIX: Enable shuffle temporarily for true random nexts
        if (!isShuffling) {
            isShuffling = true;
            generateShuffleOrder(); // Shuffle the order
            console.log('Auto-enabled shuffle for recs fallback');
        }

        const randomIndex = Math.floor(Math.random() * recs.length);
        currentPlaylist = recs;
        currentTrackIndex = randomIndex;
        const randomTrack = recs[randomIndex];
        
        console.log(`Auto-playing random recommendation: ${randomTrack.title} (shuffled mode)`);
        window.appFunctions.playTrack(randomTrack);
        return;
    }

    let nextIndex;
    if (isShuffling) {
        let currentShuffleIndex = shuffleOrder.indexOf(currentTrackIndex);
        currentShuffleIndex = (currentShuffleIndex + 1) % currentPlaylist.length;
        nextIndex = shuffleOrder[currentShuffleIndex];
    } else {
        nextIndex = (currentTrackIndex + 1) % currentPlaylist.length;
        // FIX: Reset shuffle if not shuffling
        shuffleOrder = [];
    }

    currentTrackIndex = nextIndex;
    const track = currentPlaylist[nextIndex];
    window.appFunctions.playTrack(track);
    
    // FIX: Explicit icon update sau play (nếu onEnded không fire kịp)
    setTimeout(() => {
        const playPauseBtn = document.getElementById('playPauseBtn');
        const playIcon = playPauseBtn ? playPauseBtn.querySelector('i') : null;
        if (isPlaying && playIcon) {
            playIcon.className = 'fas fa-pause';  
        }
    }, 100);
};

async function getRecommendationsPlaylistId(userId) {
    if (window.cachedRecommendationsPlaylistId) return window.cachedRecommendationsPlaylistId;
    
    const { data: playlist, error } = await supabase
        .from('playlists')
        .select('id')
        .eq('user_id', userId)
        .eq('name', 'Recommendations')
        .single();
    
    if (error && error.code !== 'PGRST116') throw error;
    
    if (!playlist) {
        const { data: newPlaylist } = await supabase
            .from('playlists')
            .insert([{ user_id: userId, name: 'Recommendations', color: '#ff6b6b' }])
            .select('id')
            .single();
        window.cachedRecommendationsPlaylistId = newPlaylist.id;
        return newPlaylist.id;
    }
    
    window.cachedRecommendationsPlaylistId = playlist.id;
    return playlist.id;
}

window.playPreviousTrack = function () {
    if (currentPlaylist.length === 0) return;
    
    currentTrackIndex = (currentTrackIndex - 1 + currentPlaylist.length) % currentPlaylist.length;
    const track = currentPlaylist[currentTrackIndex];
    window.appFunctions.playTrack(track);
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

async function updatePlayHistory(trackId) {
    const user = window.currentUser;
    if (!user || !trackId) return;

    const userId = user.id;
    const now = new Date().toISOString();

    try {
        // Lấy play_count hiện tại
        const { data: existing, error: selectError } = await supabase
            .from('history')
            .select('play_count')
            .eq('user_id', userId)
            .eq('track_id', trackId)
            .maybeSingle(); // ← Không lỗi nếu chưa có

        if (selectError) {
            console.error('Lỗi select history:', selectError);
            return;
        }

        const currentCount = (existing?.play_count || 0) + 1;

        // Upsert: tăng play_count + cập nhật played_at
        const { error: upsertError } = await supabase
            .from('history')
            .upsert({
                user_id: userId,
                track_id: trackId,
                play_count: currentCount,
                played_at: now
            }, {
                onConflict: 'user_id,track_id'
            });

        if (upsertError) {
            console.error('Lỗi upsert history:', upsertError);
            return;
        }

        console.log(`History updated: ${currentCount} lần phát cho track ${trackId}`);

        // Tự động cập nhật UI nếu đang ở trang chủ
        if (document.getElementById('home-section')?.style.display !== 'none') {
            setTimeout(() => {
                window.renderPlayHistory?.();
            }, 500);
        }

    } catch (error) {
        console.error('Lỗi hệ thống update history:', error);
    }
}

window.renderPlayHistory = async function() {
    await loadRecentHistory();
    // await loadHistoryTracks(true); 
};

async function loadUserPlaylists(forceRefresh = false) {
    console.log('1. loadUserPlaylists STARTED', { forceRefresh });

    if (!forceRefresh && window.playlistsLoadFlag) {
        console.log('2. SKIP: already loaded');
        return;
    }
    window.playlistsLoadFlag = true;

    const user = window.currentUser;
    console.log('3. Using window.currentUser:', user ? user.id : 'NULL');

    if (!user) {
        console.error('5. NO USER → STOPPING loadUserPlaylists');
        window.playlistsLoadFlag = false;
        return;
    }

    const playlistGrid = document.getElementById('playlistGrid');
    if (!playlistGrid) {
        console.error('7. playlistGrid NOT FOUND');
        window.playlistsLoadFlag = false;
        return;
    }

    try {
        console.log('8. QUERYING playlists table...');
        const { data: playlists, error } = await supabaseQueryWithRetry(() =>
            supabase
                .from('playlists')
                .select('id, name, icon, color, cover_url')
                .eq('user_id', user.id)
                .order('created_at', { ascending: false })
        );

        if (error) throw error;

        cachedPlaylists = playlists || [];
        renderPlaylists(playlists, playlistGrid);
        console.log('11. renderPlaylists DONE');
    } catch (error) {
        console.error('12. FINAL ERROR:', error);
        playlistGrid.innerHTML = '<p class="error-message">Lỗi tải playlist.</p>';
    } finally {
        window.playlistsLoadFlag = false;
        console.log('13. loadUserPlaylists FINISHED');
    }
}
window.appFunctions.loadUserPlaylists = window.loadUserPlaylists;

window.renderRecentHistory = async function() {
    const container = document.getElementById('historyTrackList');
    if (!container) return;

    const user = window.currentUser;
    if (!user) {
        container.innerHTML = '<p class="empty-message">Vui lòng đăng nhập.</p>';
        return;
    }

    try {
        const { data: history, error } = await supabase
            .from('history')
            .select(`
                track_id,
                played_at,
                tracks (
                    id, title, artist, cover_url, file_url
                )
            `)
            .eq('user_id', user.id)
            .order('played_at', { ascending: false })
            .limit(5);

        if (error) throw error;

        if (!history || history.length === 0) {
            container.innerHTML = '<p class="empty-message">Chưa có bài hát nào được phát gần đây.</p>';
            return;
        }

        container.innerHTML = history.map((item, i) => `
            <div class="track-item playable-track" onclick='event.stopPropagation(); window.playTrack(${JSON.stringify(item.tracks)}, [], -1)'>
                <div class="track-info">
                    <span class="track-index">${i + 1}</span>
                    <img src="${item.tracks.cover_url || '/assets/default-cover.webp'}" 
                         class="track-cover" onerror="this.src='/assets/default-cover.webp'">
                    <div class="track-details">
                        <div class="track-name">${escapeHtml(item.tracks.title)}</div>
                        <div class="track-artist">${escapeHtml(item.tracks.artist)}</div>
                    </div>
                </div>
                <div class="track-actions">
                    <button class="btn-action" onclick="event.stopPropagation(); window.appFunctions.togglePlaylistDropdown(this, '${item.tracks.id}')">
                        <i class="fas fa-plus"></i>
                    </button>
                </div>
            </div>
        `).join('');

    } catch (error) {
        console.error('Lỗi tải lịch sử gần đây:', error);
        container.innerHTML = '<p class="error-message">Lỗi tải lịch sử.</p>';
    }
};

window.loadTopTracks = async function(limit = 10) {
    try {
        const { data, error } = await supabase
            .from('history')
            .select(`
                track_id,
                play_count,
                tracks (
                    id,
                    title,
                    artist,
                    cover_url,
                    file_url
                )
            `)
            .order('play_count', { ascending: false })
            .limit(limit);

        if (error) throw error;

        // Sắp xếp lại theo play_count (đảm bảo)
        const sorted = data
            .sort((a, b) => (b.play_count || 0) - (a.play_count || 0))
            .slice(0, limit);

        return sorted.map(item => ({
            ...item.tracks,
            play_count: item.play_count || 0
        }));
    } catch (error) {
        console.error('Lỗi tải top tracks:', error);
        return [];
    }
};

/**
 * Hiển thị 10 bài hát được phát nhiều nhất vào #recommendList
 */
window.renderRecommendations = async function() {
    const container = document.getElementById('recommendList');
    if (!container) return;

    container.innerHTML = '<p>Đang tải gợi ý...</p>';
    const topTracks = await window.loadTopTracks(10);

    if (topTracks.length === 0) {
        container.innerHTML = '<p class="empty-message">Chưa có gợi ý.</p>';
        return;
    }

    container.innerHTML = topTracks.map((t, i) => `
        <div class="track-item playable-track" onclick='event.stopPropagation(); window.playTrack(${JSON.stringify(t)}, [], -1)'>
            <div class="track-info">
                <span class="track-index">${i + 1}</span>
                <img src="${t.cover_url || '/assets/default-cover.webp'}" class="track-cover" onerror="this.src='/assets/default-cover.webp'">
                <div class="track-details">
                    <div class="track-name">${escapeHtml(t.title)}</div>
                    <div class="track-artist">${escapeHtml(t.artist)}</div>
                </div>
            </div>
            <div class="track-actions">
                <button class="btn-action" onclick="event.stopPropagation(); window.togglePlaylistDropdown(this, '${t.id}')">
                    <i class="fas fa-plus"></i>
                </button>
            </div>
        </div>
    `).join('');
};

function openPlaylistDetail(playlistId) {
    if (window.switchTab) {
        window.switchTab('detail-playlist', playlistId);
    } else {
        console.error('Không tìm thấy hàm switchTab.');
    }
}
window.appFunctions.openPlaylistDetail = openPlaylistDetail;

async function handleCreatePlaylistSubmit(event) {
    event.preventDefault();
   
    const form = event.target;
    const playlistNameElement = form.querySelector('#playlistName');
    const playlistColorElement = form.querySelector('#playlistColor');
    const playlistName = playlistNameElement ? playlistNameElement.value.trim() : null;
    const playlistColor = playlistColorElement ? playlistColorElement.value : '#1db954';
    const playlistCoverFile = form.querySelector('#playlistCoverFile')?.files[0];
   
    if (!playlistName) {
        alert('Tên danh sách phát không được để trống.');
        return;
    }
   
    const user = window.currentUser;
    if (!user) {
        console.error('Lỗi: Người dùng chưa đăng nhập hoặc lỗi xác thực!');
        alert('Vui lòng đăng nhập để tạo danh sách phát!');
        return;
    }

    try {
        // SỬA: Dùng createPlaylist từ playlist.js
        const playlistData = {
            name: playlistName,
            color: playlistColor,
            cover_url: null
        };
        
        // Upload cover nếu có
        if (playlistCoverFile) {
            const uploadedUrl = await uploadPlaylistCover(user.id, null, playlistCoverFile);
            if (uploadedUrl) {
                playlistData.cover_url = uploadedUrl;
            }
        }
        
        const newPlaylist = await createPlaylist(playlistData);
        console.log('✅ Tạo playlist thành công:', newPlaylist);
        
        closeModal('createPlaylistModal');
        window.cachedPlaylists = null;
        await window.appFunctions.loadUserPlaylists(true);
        
        // Xử lý pending track
        const pendingTrackId = localStorage.getItem('pendingTrackId');
        if (pendingTrackId && newPlaylist) {
            await window.appFunctions.addTrackToPlaylist(pendingTrackId, newPlaylist.id);
            localStorage.removeItem('pendingTrackId');
            console.log('Auto-added pending track to new playlist');
        }
        
    } catch (error) {
        console.error('❌ LỖI tạo playlist:', error);
        alert('Đã xảy ra lỗi: ' + error.message);
    }
}
window.handleCreatePlaylistSubmit = handleCreatePlaylistSubmit;

function toggleShuffle() {
    isShuffling = !isShuffling;
    const shuffleBtn = document.getElementById('shuffleBtn');
    if(shuffleBtn) {
        shuffleBtn.classList.toggle('active', isShuffling);
    }

    updateShuffleButtonUI();
    console.log('Shuffle mode:', isShuffling ? 'ON' : 'OFF');
    
    if (isShuffling && currentPlaylist.length > 1) {
        generateShuffleOrder();
    }
}

function updateShuffleButtonUI() {
    const shuffleBtn = document.getElementById('shuffleBtn');
    if (shuffleBtn) {
        shuffleBtn.setAttribute('data-state', isShuffling ? 'on' : 'off');
        shuffleBtn.style.color = isShuffling ? 'var(--primary-color)' : 'inherit';
    }
}

function generateShuffleOrder() {
    const array = Array.from({ length: currentPlaylist.length }, (_, i) => i);
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    shuffleOrder = array;
}

function toggleRepeat() {
    if (repeatMode === 'off') {
        repeatMode = 'all';
    } else if (repeatMode === 'all') {
        repeatMode = 'one';
    } else {
        repeatMode = 'off';
    }

    const repeatBtn = document.getElementById('repeatBtn');
    if (repeatBtn) {
        repeatBtn.classList.toggle('active', repeatMode !== 'off');  
    }
    updateRepeatButtonUI();
    updateRepeatButtonUI();
    console.log('Repeat mode:', repeatMode);
}

function updateRepeatButtonUI() {
    const repeatBtn = document.getElementById('repeatBtn');
    if (repeatBtn) {
        repeatBtn.setAttribute('data-mode', repeatMode);
        repeatBtn.style.color = repeatMode !== 'off' ? 'var(--primary-color)' : 'inherit';
    }
}

window.deleteTrack = async function(trackId) {
    if (!confirm('Xóa bài hát này? Không thể khôi phục!')) return;

    try {
        // XÓA TẤT CẢ playlist_tracks TRƯỚC
        const { error: unlinkError } = await supabase
            .from('playlist_tracks')
            .delete()
            .eq('track_id', trackId);

        if (unlinkError) throw unlinkError;

        // XÓA TRACK
        const { error: deleteError } = await supabase
            .from('tracks')
            .delete()
            .eq('id', trackId);

        if (deleteError) throw deleteError;

        alert('Đã xóa bài hát!');
        window.loadMyUploads(true); // refresh

    } catch (err) {
        console.error('Lỗi xóa:', err);
        alert('Lỗi: ' + err.message);
    }
};
window.appFunctions.deleteTrack = window.deleteTrack;

// ==================== RETRY LOGIC ====================
async function supabaseQueryWithRetry(queryFn, maxRetries = 3, baseDelay = 1000) {
    let lastError;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            console.log(`Attempt ${attempt}/${maxRetries}`);
            const result = await queryFn();

            // FIX: Kiểm tra cả data và error
            if (result.error) {
                // Log full error object for debugging
                console.error('Query returned error object:', result.error);
                // Chỉ ném nếu không phải "không tìm thấy"
                if (result.error.code !== 'PGRST116') {
                    throw result.error;
                } else {
                    // PGRST116 = không có bản ghi → trả về data: null
                    console.log('No rows found (PGRST116) - returning empty');
                    return { data: null, error: null };
                }
            }

            // Thành công
            console.log(`Query succeeded on attempt ${attempt}`);
            return result;

        } catch (error) {
            lastError = error;
            // Log full error for better diagnosis (not just message)
            console.warn(`Attempt ${attempt} failed:`, error);
            if (error?.response) console.warn('Response object:', error.response);

            if (attempt < maxRetries) {
                const delay = baseDelay * Math.pow(2, attempt - 1);
                console.log(`Retrying in ${delay}ms...`);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
    }

    console.error('All retry attempts failed:', lastError);
    throw lastError;
}

async function testSupabaseConnection() {
    console.log('🧪 Testing Supabase connection...');
    
    const tests = [
        { 
            name: 'Authentication', 
            test: async () => {
                if (!window.currentUser) throw new Error('No user logged in');
                return window.currentUser;
            }
        },
        { 
            name: 'Database Read', 
            test: async () => {
                const result = await supabase.from('tracks').select('id').limit(1);
                if (result.error && result.error.code !== 'PGRST116') throw result.error;
                return result;
            }
        },
        { 
            name: 'Storage Access', 
            test: async () => {
                const result = await supabase.storage.from('music-files').list('', { limit: 1 });
                if (result.error) throw result.error;
                return result;
            }
        }
    ];
    
    const results = [];
    
    for (const test of tests) {
        try {
            const start = performance.now();
            const res = await test.test();
            // Log raw result object for debugging
            console.log(`${test.name} raw result:`, res);
            const end = performance.now();
            const time = (end - start).toFixed(0);
            results.push({ name: test.name, status: '✅', time: `${time}ms` });
            console.log(`✅ ${test.name}: ${time}ms`);
        } catch (error) {
            results.push({ name: test.name, status: '❌', error: error.message });
            console.error(`❌ ${test.name} failed:`, error.message);
        }
    }
    
    // Hiển thị kết quả test
    console.table(results);
    
    const failedTests = results.filter(r => r.status === '❌');
    return failedTests.length === 0;
}

// Hiển thị thông báo lỗi
function showConnectionWarning() {
    const warningEl = document.createElement('div');
    warningEl.id = 'connectionWarning';
    warningEl.innerHTML = `
        <div style="position: fixed; top: 10px; right: 10px; background: #ff6b6b; color: white; padding: 10px; border-radius: 5px; z-index: 10000; max-width: 300px;">
            <strong>⚠️ Kết nối không ổn định</strong>
            <p style="margin: 5px 0; font-size: 12px;">Một số tính năng có thể không hoạt động bình thường.</p>
            <button onclick="this.parentElement.remove()" style="background: white; border: none; padding: 2px 8px; border-radius: 3px; cursor: pointer;">Đóng</button>
        </div>
    `;
    document.body.appendChild(warningEl);
    
    // Tự động ẩn sau 10s
    setTimeout(() => {
        if (warningEl.parentElement) {
            warningEl.remove();
        }
    }, 10000);
}


window.appFunctions = {
    ...window.appFunctions,
    loadAndOpenProfileModal,
    initializePlayerControls,
    navigateTo,
    initProfileModal,
    handleProfileSubmit,
    handleLogout: window.handleLogout,
    togglePlayPause,
    playTrack: window.playTrack,
    loadUserPlaylists,
    loadHistoryTracks,
    playNextTrack: window.playNextTrack,
    playPreviousTrack: window.playPreviousTrack,
    searchTracks: window.searchTracks,
    loadMyUploads: window.loadMyUploads,
    loadPlaylistTracks: window.loadPlaylistTracks,
    openPlaylistDetail,
    togglePlaylistDropdown: window.togglePlaylistDropdown,
    deleteTrack: window.deleteTrack,
    addTrackToPlaylist: window.appFunctions.addTrackToPlaylist,
    createNewPlaylist: window.appFunctions.createNewPlaylist,
    closeModal: window.closeModal,
    getCurrentUserId 
};

window.loadPlaylistTracks = async function(playlistId, shouldPlay = false) {
    const user = window.currentUser;
    if (!user) {
        console.error('User không đăng nhập, không tải tracks.');
        return [];
    }
    if (cachedPlaylistTracks && cachedPlaylistTracks[playlistId]) {
        return cachedPlaylistTracks[playlistId];
    }
    try {
        // BƯỚC 1: Fetch track_ids và added_at từ playlist_tracks (không nested)
        const { data: playlistItems, error: fetchItemsError } = await supabase
            .from('playlist_tracks')
            .select('track_id, added_at')
            .eq('playlist_id', playlistId)
            .order('added_at', { ascending: true });

        if (fetchItemsError) {
            console.error('Lỗi fetch playlist_items:', fetchItemsError);
            throw fetchItemsError;
        }

        if (playlistItems.length === 0) {
            console.log(`Playlist ${playlistId} trống - no items.`);
            const emptyTracks = [];
            if (!cachedPlaylistTracks) cachedPlaylistTracks = {};
            cachedPlaylistTracks[playlistId] = emptyTracks;
            window.currentPlaylistSource = 'Playlist ID ' + playlistId;
            return emptyTracks;
        }

        // BƯỚC 2: Extract track_ids array
        const trackIds = playlistItems.map(item => item.track_id);

        // BƯỚC 3: Fetch tracks details bằng IN clause (an toàn, không ambiguous)
        const { data: tracks, error: fetchTracksError } = await supabase
            .from('tracks')
            .select('id, title, artist, file_url, cover_url, user_id')
            .in('id', trackIds);

        if (fetchTracksError) {
            console.error('Lỗi fetch tracks by IDs:', fetchTracksError);
            throw fetchTracksError;
        }

        // BƯỚC 4: Merge added_at và sort theo order gốc (preserve added_at order)
        const tracksWithAddedAt = tracks.map(track => {
            const matchingItem = playlistItems.find(item => item.track_id === track.id);
            return {
                ...track,
                added_at: matchingItem ? matchingItem.added_at : null
            };
        }).sort((a, b) => {
            // Sort theo added_at (nếu có), fallback index gốc
            const timeA = new Date(a.added_at || 0).getTime();
            const timeB = new Date(b.added_at || 0).getTime();
            return timeA - timeB;
        });

        if (!cachedPlaylistTracks) cachedPlaylistTracks = {};
        cachedPlaylistTracks[playlistId] = tracksWithAddedAt;
        window.currentPlaylistSource = 'Playlist ID ' + playlistId;
        console.log(`Tải ${tracksWithAddedAt.length} tracks từ playlist ${playlistId}:`, tracksWithAddedAt.map(t => t.title));

        if (shouldPlay && tracksWithAddedAt.length > 0) {
            window.playTrack(tracksWithAddedAt[0], tracksWithAddedAt, 0);
        }

        return tracksWithAddedAt;
    } catch (error) {
        // THÊM: Log details để debug nếu cần (remove sau khi fix)
        console.error('Lỗi tải tracks playlist:', error);
        if (error.details) console.log('Relationship details:', error.details);  // ← MỚI: Log để xem exact names
        return [];
    }
};
window.appFunctions.loadPlaylistTracks = window.loadPlaylistTracks;

async function testRLSPolicies() {
    const user = window.currentUser;
    if (!user) {
        console.warn('⏳ Bỏ qua testRLS – chưa có user');
        return;
    }

    console.log('🧪 Testing RLS Policies for user:', user.id);

    try {
        // Test SELECT từ tracks
        const { error: tracksError } = await supabase
            .from('tracks')
            .select('*')
            .limit(1);
        console.log('Tracks SELECT:', tracksError ? + tracksError.message : '✅ OK');

        // Test SELECT từ users
        const { error: usersError } = await supabase
            .from('users')
            .select('*')
            .eq('id', user.id)
            .single();
        console.log('Users SELECT:', usersError ? + usersError.message : '✅ OK');
    } catch (err) {
        console.error('Lỗi testRLS:', err);
    }
}

async function getCurrentUserId() {
    const user = window.currentUser;
    return user?.id;
}
window.appFunctions.getCurrentUserId = getCurrentUserId;

window.displayTracks = function(tracks, container) {
    if (!container) return;
    container.innerHTML = '';
  
    const containerId = container.id;
    tracks.forEach((track, index) => {
        const trackElement = document.createElement('div');
        trackElement.className = 'track-item playable-track'; // Class cho CSS
        trackElement.trackData = track;
      
        // Click để play track (với stop nếu click action)
        trackElement.addEventListener('click', function(e) {
            if (e.target.closest('.btn-action')) return;
            if (trackElement.trackData && window.appFunctions.playTrack) {
                window.currentPlaylist = tracks;
                window.currentTrackIndex = index;
                window.appFunctions.playTrack(trackElement.trackData, tracks, index);
            }
            e.preventDefault();
        });
      
        // Debug data
        const title = (track.title || '').trim() || 'Bài hát không tên';
        const artist = (track.artist || '').trim() || 'Nghệ sĩ không rõ';
        const titleInnerHTML = title.length > 15 ? `${title} ${title}` : title;
        const artistInnerHTML = artist.length > 15 ? `${artist} ${artist}` : artist; // Marquee nếu dài
      
        console.log(`Display track ${index} (${containerId}):`, { id: track.id, title: track.title, artist: track.artist });
      
        trackElement.innerHTML = `
            <div class="track-index">${index + 1}.</div>
            <img src="${track.cover_url || '/assets/default-cover.webp'}" alt="${title} by ${artist}" class="track-cover" />
            <div class="track-info">
                <div class="track-details">
                    <strong class="track-name marquee-container">
                        <span class="track-title-inner">${titleInnerHTML}</span>
                    </strong>
                    <small class="track-artist marquee-container">
                        <span class="track-artist-text">${artistInnerHTML}</span>
                    </small>
                </div>
            </div>
          
            <div class="track-actions">
                <div class="playlist-add-container">
                    <button
                        class="btn-action btn-add-playlist"
                        data-track-id="${track.id}"
                        title="Thêm vào playlist">
                        <i class="fa-solid fa-plus"></i>
                    </button>
                    <div class="playlist-dropdown" data-track-id="${track.id}">
                    </div>
                </div>
                ${containerId === 'myUploadsList' ? `
                    <button class="btn-action btn-delete-track"
                            onclick="event.stopPropagation(); window.appFunctions.deleteTrack('${track.id}')">
                        <i class="fa-solid fa-trash"></i>
                    </button>
                ` : ''}
            </div>
        `;
      
        // Marquee logic
        const titleContainer = trackElement.querySelector('.track-name.marquee-container');
        if (titleContainer) {
            const titleText = titleContainer.querySelector('.track-title-inner');
            if (titleText && titleText.scrollWidth > titleContainer.clientWidth) {
                titleText.classList.add('marquee');
            }
        }
      
        const artistContainer = trackElement.querySelector('.track-artist.marquee-container');
        if (artistContainer) {
            const artistText = artistContainer.querySelector('.track-artist-text');
            if (artistText && artistText.scrollWidth > artistContainer.clientWidth) {
                artistText.classList.add('marquee');
            }
        }
      
        container.appendChild(trackElement);
    });
  
    // Event Delegation (FIX: stopImmediate to prevent double fire)
    if (!container.dataset.delegationAttached) {
        container.addEventListener('click', function(e) {
            const btn = e.target.closest('.btn-add-playlist');
            if (btn) {
                e.stopPropagation();
                e.stopImmediatePropagation(); // FIX: Stop all events to prevent double toggle
                const trackId = btn.dataset.trackId;
                if (trackId) {
                    // Debounce
                    if (!window.dropdownDebounce) window.dropdownDebounce = {};
                    const key = `toggle_${trackId}`;
                    if (window.dropdownDebounce[key]) return;
                    window.dropdownDebounce[key] = true;
                    setTimeout(() => { delete window.dropdownDebounce[key]; }, 200);
                    
                    console.log('Toggle dropdown cho track (delegated):', trackId);
                    window.appFunctions.togglePlaylistDropdown(btn, trackId);
                }
            }
        });
        container.dataset.delegationAttached = 'true';
        console.log(`Event delegation attached for container ${containerId}`);
    }
  
    console.log(`Displayed ${tracks.length} tracks in ${containerId} - Check console for data`);
};

async function searchTracks(query) {
    const searchList = document.getElementById('searchList');
    if (!searchList) return;
    
    if (!query || query.length < 3) {
        searchList.innerHTML = '<p class="empty-message">Nhập từ khóa để bắt đầu tìm kiếm.</p>';
        return;
    }
    
    let dbQuery = supabase
        .from('tracks')
        .select(`
            id, 
            title, 
            artist, 
            file_url,
            cover_url,
            users!user_id (username)
        `); 

    dbQuery = dbQuery.or(`title.ilike.%${query}%,artist.ilike.%${query}%`);
    
    const { data: tracks, error } = await dbQuery.limit(10);

    if (error) {
        console.error('Lỗi tìm kiếm:', error);
        searchList.innerHTML = `<p class="error-message">Lỗi khi tìm kiếm: ${error.message}</p>`;
        return;
    }
    
    window.displayTracks(tracks, searchList); 
}
window.searchTracks = searchTracks;
window.appFunctions.searchTracks = searchTracks;

async function initProfileModal() {
    const user = window.currentUser;
    if (!user) {
        console.log('No user logged in');
        return;
    }

    console.log('Fetching profile for user ID:', user.id);

    let { data: profile, error: selectError } = await supabase
        .from('users')
        .select('username, birthday, avatar_url')
        .eq('id', user.id)
        .single();

    if (selectError) {
        console.error('Select error:', selectError);
        alert('Lỗi select profile: ' + selectError.message + ' (Check RLS for SELECT policy)');
        if (selectError.code === 'PGRST116') {
            console.log('No profile - inserting default');
            const defaultUsername = user.email ? user.email.split('@')[0] : 'New User';

            const { data: newProfile, error: insertError } = await supabase
                .from('users')
                .insert([{ 
                    id: user.id, 
                    email: user.email || 'noemail@example.com',
                    username: defaultUsername,
                    birthday: null,
                    avatar_url: null,
                    updated_at: new Date().toISOString()   // ✅ thêm updated_at
                }])
                .select('username, birthday, avatar_url')
                .single();

            if (insertError) {
                console.error('Insert error:', insertError);
                alert('Lỗi insert profile: ' + insertError.message + ' (Check RLS for INSERT policy)');
                return;
            }
            profile = newProfile;
        } else {
            return;
        }
    }

    console.log('Profile data:', profile);

    document.getElementById('editEmail').value = user.email || 'Chưa có email';

    const DEFAULT_AVATAR = '/assets/default-avatar.png';
    let finalAvatarUrl = profile.avatar_url ? getPublicAvatarUrl(profile.avatar_url) : DEFAULT_AVATAR;
    let usernameValue = profile.username || (user.email ? user.email.split('@')[0] : 'User Name');
    let birthdayValue = profile.birthday || '';

    document.getElementById('editUsername').value = usernameValue;
    document.getElementById('editBirthday').value = birthdayValue;

    const currentAvatarPreview = document.getElementById('currentAvatarPreview');
    if (currentAvatarPreview) currentAvatarPreview.src = finalAvatarUrl;

    window.cachedProfile = profile;
    updateProfileDisplay(user);
}
window.initProfileModal = initProfileModal;

async function createDefaultPlaylistsIfNeeded(userId) {
    const defaultPlaylists = [
        { name: 'My Uploads', color: '#1db954' },
        { name: 'Recommendations', color: '#ff6b6b' }
    ];

    for (const pl of defaultPlaylists) {
        try {
            const { data: existing, error } = await supabase
                .from('playlists')
                .select('id')
                .eq('user_id', userId)
                .eq('name', pl.name)
                .single();
            if (!existing || (error && error.code === 'PGRST116')) {
                const { error: insertError } = await supabase
                    .from('playlists')
                    .insert([{ user_id: userId, name: pl.name, color: pl.color, icon: null }]);

                if (insertError) {
                    console.error(`Lỗi insert ${pl.name}:`, insertError);
                } else {
                    console.log(`Tạo playlist mặc định: ${pl.name}`);
                }
            } else if (existing) {
                console.log(`${pl.name} đã tồn tại.`);
            }
        } catch (error) {
            console.error(`Lỗi tạo ${pl.name}:`, error);
        }
    }
    cachedPlaylists = null;
    await loadUserPlaylists(true);
}

async function handleProfileSubmit(event) {
    event.preventDefault();
    console.log('Form submit triggered');

    const saveBtn = document.getElementById('saveProfileBtn');
    const user = window.currentUser;
    if (!user) return;

    const newUsername = document.getElementById('editUsername').value.trim();
    const newBirthday = document.getElementById('editBirthday').value || null;
    const avatarFile = document.getElementById('avatarFile').files[0];

    if (!newUsername) {
        alert('Tên người dùng bắt buộc!');
        return;
    }
    if (newBirthday && isNaN(Date.parse(newBirthday))) {
        alert('Ngày sinh format sai!');
        return;
    }
    const currentProfile = await loadProfile(user.id);
    let finalAvatarUrl = currentProfile?.avatar_url || null;

    saveBtn.textContent = 'Đang lưu...';
    saveBtn.disabled = true;

    if (avatarFile) {
        const uploadedUrl = await uploadAvatar(user.id, avatarFile);
        if (!uploadedUrl) {
            alert('Lỗi upload avatar - check console');
            saveBtn.textContent = 'Lưu Thay Đổi';
            saveBtn.disabled = false;
            return;
        }
        finalAvatarUrl = uploadedUrl;
    }

    const updates = {
        email: user.email || 'noemail@example.com',
        username: newUsername,
        birthday: newBirthday,
        avatar_url: finalAvatarUrl || null
    };

    console.log('Preparing save with:', updates);

    const { count, error: countError } = await supabase
        .from('users')
        .select('count', { count: 'exact' })
        .eq('id', user.id);

    if (countError) {
        console.error('Count error:', countError);
        alert('Lỗi check profile: ' + countError.message + ' (Check RLS for SELECT)');
        saveBtn.textContent = 'Lưu Thay Đổi';
        saveBtn.disabled = false;
        return;
    }

    let data, error;
    if (count > 0) {
        console.log('Row exists - updating');
        ({ data, error } = await supabase
            .from('users')
            .update(updates)
            .eq('id', user.id)
            .select());
    } else {
        console.log('No row - inserting');
        ({ data, error } = await supabase
            .from('users')
            .insert([{ id: user.id, ...updates }])
            .select());
    }

    if (error) {
        console.error('Save error:', error);
        alert('Lỗi save: ' + error.message + ' (Check RLS for UPDATE/INSERT)');
        saveBtn.textContent = 'Lưu Thay Đổi';
        saveBtn.disabled = false;
        return;
    }

    if (data.length > 0) {
        console.log('Save success, returned data:', data);
        alert('Lưu thành công!');
    } else {
        console.log('Save no row affected');
        alert('Không có thay đổi (RLS may block or values same)');
    }

    window.cachedProfile = null;
    updateProfileDisplay(user, true);
    saveBtn.textContent = 'Lưu Thay Đổi';
    saveBtn.disabled = false;
    
    closeModal('profileModal');
}

async function loadAndOpenProfileModal() {
    const modal = document.getElementById('profileModal');
    const container = document.getElementById('modalContentContainer'); 
    
    window.cachedProfile = null; 

    if (!container || !modal) {
        console.error('Không tìm thấy Modal hoặc Container.');
        return;
    }

    const loadingState = '<div style="padding: 20px; text-align: center;">Đang tải thông tin cá nhân...</div>';
    container.innerHTML = loadingState;
    modal.style.display = 'flex'; 

    if (container.innerHTML === loadingState) {
        try {
            const response = await fetch('/profile.html');
            if (!response.ok) throw new Error('Không thể tải profile.html');
            
            container.innerHTML = await response.text();
            
            const profileForm = document.getElementById('profileEditForm');
            if (profileForm && typeof handleProfileSubmit === 'function') { 
                 profileForm.removeEventListener('submit', handleProfileSubmit); 
                profileForm.addEventListener('submit', handleProfileSubmit); 
                console.log('Submit listener attached successfully to profileEditForm'); 
            } else {
                 console.error('Lỗi: Không tìm thấy form ID="profileEditForm" hoặc hàm handleProfileSubmit.');
            }
            
            const avatarFile = document.getElementById('avatarFile');
            if (avatarFile) {
                avatarFile.addEventListener('change', (e) => {
                    const file = e.target.files[0];
                    if (file) {
                        const previewUrl = URL.createObjectURL(file);
                        document.getElementById('currentAvatarPreview').src = previewUrl; 
                        console.log('Avatar local preview set');
                    }
                });
            }
            
        } catch (error) {
            console.error('Lỗi tải Profile Modal HTML:', error);
            container.innerHTML = '<p style="padding: 20px;">Lỗi tải giao diện. Vui lòng thử lại.</p>';
            return;
        }
    }

    if (typeof window.initProfileModal === 'function') {
         await window.initProfileModal();
    } else {
        console.warn("Hàm initProfileModal chưa được định nghĩa.");
    }
    
    const user = window.currentUser;
    if (!user) {
         container.innerHTML = '<p style="padding: 20px;">Vui lòng đăng nhập lại để xem thông tin cá nhân.</p>';
    }
}

async function loadHistoryTracks(forceRefresh = false) {
    const user = window.currentUser;
    const historyTrackList = document.getElementById('historyTrackList');
    if (!user || !historyTrackList) return;

    if (cachedHistoryTracks && !forceRefresh) {
        const tracks = cachedHistoryTracks.map(item => item.tracks);
        if (window.displayTracks) window.displayTracks(tracks, historyTrackList);
        return;
    }

    historyTrackList.innerHTML = '<p>Đang tải lịch sử...</p>';

    try {
        const { data: historyItems, error } = await supabase
            .from('history')
            .select(`
                track_id, 
                played_at, 
                tracks (id, title, artist, file_url, cover_url) 
            `)
            .eq('user_id', user.id)
            .order('played_at', { ascending: false })
            .limit(20);

        if (error) throw error;

        cachedHistoryTracks = historyItems;
        historyTrackList.innerHTML = '';

        if (historyItems.length === 0) {
            historyTrackList.innerHTML = '<p class="empty-message">Bạn chưa phát bài hát nào gần đây.</p>';
        } else {
            const trackList = historyItems.map(item => item.tracks);
            if (window.displayTracks) {
                window.displayTracks(trackList, historyTrackList);
            }
        }
    } catch (error) {
        console.error('Lỗi tải lịch sử:', error);
        historyTrackList.innerHTML = '<p class="error-message">Lỗi tải lịch sử phát nhạc.</p>';
    }
}

window.openCreatePlaylistModal = function() {
    
    console.log('--- Bắt đầu mở modal tạo playlist ---'); 
    
    const modal = document.getElementById('createPlaylistModal');
    if (modal) {
        modal.style.display = 'flex';
        const form = document.getElementById('createPlaylistForm');
        if (form) {
            const handler = window.handleCreatePlaylistSubmit || handleCreatePlaylistSubmit;
            
            if(typeof handler !== 'function') {
                 console.error('Lỗi: handleCreatePlaylistSubmit chưa được định nghĩa hoặc chưa được gắn vào window.');
                 return;
            }

            form.removeEventListener('submit', handler); 
            form.addEventListener('submit', handler); 
            console.log('Form submit listener attached.');
        } else {
             console.error('Lỗi: Không tìm thấy form ID="createPlaylistForm".');
        }
    } else {
        console.error('Lỗi: Không tìm thấy modal ID="createPlaylistModal".');
    }
};

function renderTrackListItem(track) {
    const item = document.createElement('div');
    item.className = 'track-item';
    item.innerHTML = `<div class="track-info">${track.title} - ${track.artist}</div>`;
    return item;
}

window.renderTrackItem = function(track, index, containerId) {
    const item = document.createElement('div');
    item.className = 'track-item playable-track';
    item.dataset.trackId = track.id;

    const safeTitle = (track.title || 'Unknown Title').trim();
    const safeArtist = (track.artist || 'Unknown Artist').trim();
    const safeCover = track.cover_url || '/assets/default-cover.webp';

    // HTML cho track item
    item.innerHTML = `
        <div class="track-info">
            <span class="track-index">${index + 1}</span>
            <img src="${safeCover}" alt="${safeTitle}" class="track-cover" 
                 onerror="this.src='/assets/default-cover.webp'">
            <div class="track-details">
                <div class="track-name marquee-container">
                    <span class="track-title-inner">${safeTitle}</span>
                </div>
                <div class="track-artist">${safeArtist}</div>
            </div>
        </div>
        <div class="track-actions">
            <div class="playlist-add-container">
                <button class="btn-action" 
                        onclick="appFunctions.togglePlaylistDropdown(this, '${track.id}')"
                        title="Thêm vào playlist">
                    <i class="fas fa-plus"></i>
                </button>
                <div class="playlist-dropdown"></div>
            </div>

            <!-- NÚT XÓA - CHỈ HIỆN Ở UPLOADS -->
            ${containerId === 'myUploadsList' ? `
            <button class="btn-action text-danger" 
                    onclick="event.stopPropagation(); deleteTrack('${track.id}')" 
                    title="Xóa bài hát">
                <i class="fas fa-trash"></i>
            </button>` : ''}
        </div>
    `;

    // Click để phát nhạc (tránh click vào nút)
    item.addEventListener('click', (e) => {
        if (e.target.closest('.btn-action')) return;
        const playlist = window.currentPlaylists?.[containerId] || [];
        window.playTrack(track, playlist, index);
    });

    // Marquee effect
    setTimeout(() => {
        const titleEl = item.querySelector('.track-title-inner');
        const containerEl = item.querySelector('.marquee-container');
        if (titleEl && containerEl && titleEl.scrollWidth > containerEl.clientWidth) {
            titleEl.classList.add('marquee');
        }
    }, 100);

    return item;
};

window.renderTrackList = function(tracks, containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    container.innerHTML = '';
    window.currentPlaylists = window.currentPlaylists || {};
    window.currentPlaylists[containerId] = tracks;

    if (tracks.length === 0) {
        container.innerHTML = '<p class="empty-message">Không có bài hát</p>';
        return;
    }

    tracks.forEach((track, index) => {
        const item = window.renderTrackItem(track, index, containerId);
        container.appendChild(item);
    });

    console.log(`Displayed ${tracks.length} tracks in ${containerId}`);
};

window.loadMyUploads = async function(forceRefresh = false) {
    const container = document.getElementById('myUploadsList');
    if (!container) return;
    
    if (forceRefresh || !cachedMyUploads || cachedMyUploads.length === 0) {
        cachedMyUploads = null;
        console.log('Cache invalidated for uploads');
    }
    
    if (cachedMyUploads && !forceRefresh) {
        window.displayTracks(cachedMyUploads, container);
        return;
    }
    
    container.innerHTML = '<p>Đang tải danh sách bài hát...</p>';
   
    const user = window.currentUser;
    if (!user) {
        console.error('No user session for uploads');
        container.innerHTML = '<p class="error-message">Vui lòng đăng nhập.</p>';
        return;
    }
   
    try {
        console.log('🔄 Loading uploads for user:', user.id);
        
        // SỬ DỤNG RETRY LOGIC
        const { data: tracks, error } = await supabaseQueryWithRetry(() =>
            supabase
                .from('tracks')
                .select('*, users!user_id (username)')
                .eq('user_id', user.id)
                .order('uploaded_at', { ascending: false })
        );
        
        if (error) throw error;
        
        cachedMyUploads = tracks || [];
        console.log(`✅ Loaded ${tracks.length} uploads`);
        
        if (tracks.length === 0) {
            container.innerHTML = '<p class="empty-message">Bạn chưa tải lên bài hát nào.</p>';
            return;
        }
        
        window.displayTracks(tracks, container);
        
    } catch (error) {
        console.error('❌ Lỗi tải uploads sau tất cả retry:', error);
        container.innerHTML = `<p class="error-message">Lỗi khi tải: ${error.message}</p>`;
    }
};


window.loadHomePage = async function() {
    console.log('CALL loadHomePage, currentUser:', window.currentUser, 'at', performance.now());
    if (homePageLoaded) {
        console.log('Home page already loaded, skipping');
        return;
    }
    
    const mainContentArea = document.getElementById('mainContentArea');
    if (!mainContentArea) {
        console.error('No mainContentArea for home page');
        return;
    }
   
    try {
        console.log('Starting loadHomePage...');
        homePageLoaded = true;
        
        // 1. Load HTML structure TRƯỚC
        const response = await fetch('/home-content.html');
        if (!response.ok) throw new Error('Không thể tải home-content.html');
        const htmlContent = await response.text();
        mainContentArea.innerHTML = htmlContent;
        console.log('Home content loaded');

        // Đợi các container sẵn sàng
        await new Promise(resolve => {
            let checks = 0;
            const interval = setInterval(() => {
                const playlist = document.getElementById('playlistGrid');
                const history = document.getElementById('historyTrackList');
                const recs = document.getElementById('recommendList');
                if (history && recs) {
                    clearInterval(interval);
                    console.log('All home containers ready - proceeding sequential loads');
                    resolve();
                } else if (checks++ > 10) {
                    console.warn('Some containers timeout - partial load proceeding');
                    clearInterval(interval);
                    resolve();
                }
            }, 300);
        });

        // 2. Load data theo THỨ TỰ TUẦN TỰ
        console.log('Loading home page data sequentially...');
        
        // BƯỚC 1: Danh sách phát
        console.log('Step 1: Loading playlists...');
        if (window.appFunctions?.loadUserPlaylists) {
            await window.appFunctions.loadUserPlaylists();
            console.log('Playlists loaded');
        }

        // BƯỚC 2: Lịch sử gần đây (5 bài)
        console.log('Step 2: Loading recent history...');
        if (window.renderRecentHistory) {
            await window.renderRecentHistory();
            console.log('Recent history loaded (5 tracks)');
        }

        // BƯỚC 3: Gợi ý (10 bài top)
        console.log('Step 3: Loading recommendations...');
        if (window.renderRecommendations) {
            await window.renderRecommendations();
            console.log('Recommendations loaded (10 tracks)');
        }

        console.log('All home components ready');

    } catch (error) {
        console.error("Lỗi tải giao diện Trang Chủ:", error);
        homePageLoaded = false;
        mainContentArea.innerHTML = `
            <div class="error-message">
                <h3>Lỗi tải trang chủ</h3>
                <p>${error.message}</p>
                <button onclick="window.loadHomePage()" class="btn-retry">Thử lại</button>
            </div>
        `;
    }
};


window.handleLogout = async function() {

    console.log('Đăng xuất');

    try {
        await window.authFunctions.logout();
    } catch (error) {
        console.error('Lỗi khi đăng xuất:', error);
    }
    alert ('Bạn muốn đăng xuất?');
    window.currentUser = null;
    resetAllCaches();
    // window.location.href = '/index.html';
};
window.appFunctions.handleLogout = window.handleLogout;

// LẤY BÀI HÁT GẦN ĐÂY NHẤT
async function getRecentTrack() {
    try {
        const user = window.currentUser;
        if (!user) return null;

        const { data, error } = await supabase
            .from('history')
            .select('track_id, played_at, tracks(id, title, artist, cover_url, file_url)')
            .eq('user_id', user.id)
            .order('played_at', { ascending: false })
            .limit(1); 

        if (error) {
            console.warn('Lỗi query history:', error.message);
            return null;
        }

        if (!data || data.length === 0) {
            console.log('Không có lịch sử phát');
            return null;
        }

        return {
            track: data[0].tracks,
            played_at: data[0].played_at
        };
    } catch (error) {
        console.error('Lỗi getRecentTrack:', error);
        return null;
    }
}


async function resumeRecentTrack() {
    const recent = await getRecentTrack();
    if (!recent?.track) {
        console.log('Không có bài hát gần đây để resume');
        return;
    }

    // Chờ player bar sẵn sàng
    let attempts = 0;
    const maxAttempts = 15;

    const tryPlay = async () => {
        if (window.updatePlayerBar && document.getElementById('playerBar')) {
            const playlist = await window.getRecommendationsAsPlaylist?.() || [];
            const index = playlist.findIndex(t => t.id === recent.track.id);
            window.playTrack(recent.track, playlist, index >= 0 ? index : 0);
            console.log(`Đã resume: "${recent.track.title}"`);
            return;
        }

        if (attempts < maxAttempts) {
            attempts++;
            setTimeout(tryPlay, 300);
        } else {
            console.warn('Player bar không sẵn sàng sau 4.5s');
        }
    };

    tryPlay();
}


window.togglePlaylistDropdown = async function(button, trackId) {
    console.log('Toggle dropdown cho track:', trackId);
    const container = button.closest('.playlist-add-container');
    if (!container) return console.error('Không tìm thấy .playlist-add-container');
    const dropdown = container.querySelector('.playlist-dropdown');
    if (!dropdown) return console.error('Không tìm thấy .playlist-dropdown');

    // Đóng tất cả dropdown khác
    document.querySelectorAll('.playlist-dropdown.active').forEach(d => {
        if (d !== dropdown) {
            d.classList.remove('active');
            document.body.classList.remove('dropdown-open');
            console.log('Closed other dropdown');
        }
    });

    const wasActive = dropdown.classList.contains('active');
    if (wasActive) {
        dropdown.classList.remove('active');
        document.body.classList.remove('dropdown-open');
        document.removeEventListener('click', window.outsideClickHandler);
        dropdown.removeEventListener('mouseleave', window.mouseLeaveHandler);
        console.log(`Dropdown state: on → off for ${trackId}`);
    } else {
        // VỊ TRÍ DƯỚI + BÊN PHẢI, FULL FLIP OFF-SCREEN
        const rect = button.getBoundingClientRect();
        const gap = 0;  // ← FIX: Sát button, tránh lệch
        const dropdownWidth = 220;
        let leftPos = rect.right + window.scrollX + gap;  // Bay phải
        let align = 'right';

        // FULL FLIP: Nếu quá phải (margin safe 20px)
        const viewportRight = window.innerWidth + window.scrollX - 20;
        if (leftPos + dropdownWidth > viewportRight) {
            leftPos = rect.left + window.scrollX - gap - dropdownWidth;  // ← FIX: Căn phải viewport, bay trái từ button
            align = 'left-flip';
            console.log('Off-screen detected: Flipped to left align (left=' + leftPos + ')');
        }

        // SET STYLE EARLY
        dropdown.style.top = `${rect.bottom + window.scrollY + gap}px`;
        dropdown.style.left = `${leftPos}px`;
        dropdown.style.width = `${dropdownWidth}px`;
        dropdown.style.right = 'auto';
        dropdown.style.height = 'auto';  // Reset height early

        dropdown.classList.add('active');
        document.body.classList.add('dropdown-open');

        // DEBUG LOGS
        console.log(`Dropdown after active: display=${getComputedStyle(dropdown).display}, opacity=${getComputedStyle(dropdown).opacity}, position=${getComputedStyle(dropdown).position}, bg=${getComputedStyle(dropdown).backgroundColor}, z=${getComputedStyle(dropdown).zIndex}`);
        console.log(`Rect after: top=${dropdown.getBoundingClientRect().top}, left=${dropdown.getBoundingClientRect().left}, width=${dropdown.getBoundingClientRect().width}, height=${dropdown.offsetHeight}px, visible=${dropdown.offsetHeight > 0}, align=${align}`);

        // CLEAR & LOAD
        dropdown.innerHTML = '';
        try {
            const user = window.currentUser;
            if (!user) {
                dropdown.innerHTML = '<div class="empty-message">Đăng nhập để thêm playlist</div>';
            } else {
                let playlists = window.cachedPlaylists || [];
                if (playlists.length === 0) {
                    const { data: fetched, error } = await supabase
                        .from('playlists')
                        .select('id, name, color')
                        .eq('user_id', user.id)
                        .order('created_at', { ascending: false });
                    if (error) throw error;
                    playlists = fetched || [];
                    window.cachedPlaylists = playlists;
                    console.log(`Fetched & cached ${playlists.length} playlists`);
                } else {
                    console.log(`Using cached ${playlists.length} playlists`);
                }
                
                let html = '';
                if (playlists.length === 0) {
                    html = `<div class="playlist-option create-new" onclick="appFunctions.createNewPlaylist('${trackId}'); event.stopPropagation(); event.preventDefault(); closeDropdown('${trackId}');"> + Tạo playlist mới </div>`;
                } else {
                    playlists.forEach(pl => {
                        html += `<div class="playlist-option" style="border-left: 3px solid ${pl.color || '#1DB954'};" onclick="appFunctions.addTrackToPlaylist('${trackId}', '${pl.id}'); event.stopPropagation(); event.preventDefault(); closeDropdown('${trackId}');"> ${pl.name} </div>`;
                    });
                    html += `<div class="playlist-option create-new" onclick="appFunctions.createNewPlaylist('${trackId}'); event.stopPropagation(); event.preventDefault(); closeDropdown('${trackId}');"> + Tạo playlist mới </div>`;
                }
                dropdown.innerHTML = html;
                console.log(`HTML set: ${html.substring(0, 100)}...`);

                // ← FIX: FORCE REFLOW HEIGHT SAU HTML SET
                dropdown.style.height = 'auto';
                dropdown.offsetHeight;  // Trigger recalc
                console.log(`Reflow triggered: new height=${dropdown.offsetHeight}px`);
            }
            dropdown.dataset.loaded = 'true';
        } catch (err) {
            console.error('Lỗi load playlist dropdown:', err);
            dropdown.innerHTML = '<div class="error-message">Lỗi tải playlist</div>';
            // Reflow for error too
            dropdown.offsetHeight;
        }

        // MOUSE LEAVE & OUTSIDE CLICK
        window.mouseLeaveHandler = () => {
            setTimeout(() => {
                dropdown.classList.remove('active');
                document.body.classList.remove('dropdown-open');
                document.removeEventListener('click', window.outsideClickHandler);
                dropdown.removeEventListener('mouseleave', window.mouseLeaveHandler);
                console.log(`Closed on mouse leave for ${trackId}`);
            }, 200);
        };
        dropdown.addEventListener('mouseleave', window.mouseLeaveHandler);

        window.outsideClickHandler = (e) => {
            if (!dropdown.contains(e.target) && !button.contains(e.target)) {
                dropdown.classList.remove('active');
                document.body.classList.remove('dropdown-open');
                document.removeEventListener('click', window.outsideClickHandler);
                dropdown.removeEventListener('mouseleave', window.mouseLeaveHandler);
                console.log(`Closed on outside click for ${trackId}`);
            }
        };
        document.addEventListener('click', window.outsideClickHandler);

        console.log(`Dropdown state: off → on (under-right fixed, align=${align}) for ${trackId}`);
    }
};
window.appFunctions.togglePlaylistDropdown = window.togglePlaylistDropdown;

window.closeDropdown = function(trackId) {
    const container = document.querySelector(`.playlist-add-container [data-track-id="${trackId}"]`).closest('.playlist-add-container');
    if (container) {
        const dropdown = container.querySelector('.playlist-dropdown');
        if (dropdown) {
            dropdown.classList.remove('active');
            document.body.classList.remove('dropdown-open');
            console.log(`Closed dropdown for ${trackId}`);
        }
    }
};

window.appFunctions.addTrackToPlaylist = async function(trackId, playlistId) {
    try {
        const { data: existing } = await supabase
            .from('playlist_tracks')
            .select('id')
            .eq('playlist_id', playlistId)
            .eq('track_id', trackId)
            .limit(1);

        if (existing?.length > 0) {
            alert('Bài hát đã có trong playlist!');
            return;
        }

        const { error } = await supabase
            .from('playlist_tracks')
            .insert({ playlist_id: playlistId, track_id: trackId });

        if (error) throw error;

        alert('Đã thêm vào playlist!');
        if (window.loadDetailPlaylist) {
            const detail = document.getElementById('playlistDetail');
            if (detail && detail.dataset.playlistId === playlistId) {
                window.loadDetailPlaylist(playlistId);
            }
        }
    } catch (err) {
        console.error('Lỗi thêm:', err);
        alert('Lỗi: ' + err.message);
    }
};


window.appFunctions.createNewPlaylist = function(trackId) {
    localStorage.setItem('pendingTrackId', trackId);
    const modal = document.getElementById('createPlaylistModal');
    if (modal) modal.style.display = 'flex';
};

async function loadRecentHistory() {
    const container = document.getElementById('historyTrackList');
    if (!container) return;

    try {
        const user = window.currentUser;
        if (!user) return;

        const { data: history, error } = await supabase
            .from('history')
            .select(`
                track_id,
                played_at,
                tracks (
                    id, title, artist, cover_url, file_url
                )
            `)
            .eq('user_id', user.id)
            .order('played_at', { ascending: false })
            .limit(5);

        if (error) throw error;

        if (!history || history.length === 0) {
            container.innerHTML = '<p class="empty-message">Chưa có bài hát nào được phát gần đây.</p>';
            return;
        }

        container.innerHTML = history.map((item, index) => `
            <div class="track-item playable-track" onclick='event.stopPropagation(); window.playTrack(${JSON.stringify(item.tracks)}, [], -1)'>
                <div class="track-info">
                    <span class="track-index">${index + 1}</span>
                    <img src="${item.tracks.cover_url || '/assets/default-cover.webp'}" 
                         alt="Cover" class="track-cover" 
                         onerror="this.src='/assets/default-cover.webp'">
                    <div class="track-details">
                        <div class="track-name">${escapeHtml(item.tracks.title)}</div>
                        <div class="track-artist">${escapeHtml(item.tracks.artist)}</div>
                    </div>
                </div>
                <div class="track-actions">
                    <button class="btn-action" onclick="event.stopPropagation(); window.appFunctions.togglePlaylistDropdown(this, '${item.tracks.id}')">
                        <i class="fas fa-plus"></i>
                    </button>
                </div>
            </div>
        `).join('');

        console.log(`Loaded ${history.length} recent tracks`);
    } catch (error) {
        console.error('Lỗi tải lịch sử:', error);
        container.innerHTML = '<p class="error-message">Lỗi tải lịch sử.</p>';
    }
}

window.testAllTrackUrls = async function() {
    const { data: tracks, error } = await supabase
        .from('tracks')
        .select('id, title, file_url');
        
    if (error) {
        console.error('❌ Error fetching tracks:', error);
        return;
    }
    
    console.log('🔍 Testing URLs for', tracks.length, 'tracks');
    
    for (const track of tracks) {
        const isAccessible = await window.testAudioUrl(track.id);
        console.log(`${isAccessible ? '✅' : '❌'} ${track.title}: ${track.file_url}`);
        
        // Đợi giữa các request
        await new Promise(resolve => setTimeout(resolve, 100));
    }
};

window.switchTab = function(tabName, param = null) {
    console.log('switchTab called:', tabName, param);
    
    // Ẩn tất cả section
    document.querySelectorAll('.page-section').forEach(sec => {
        sec.style.display = 'none';
    });

    // Hiện section tương ứng
    let targetId;
    if (tabName === 'home') targetId = 'home-section';
    else if (tabName === 'detail-playlist') targetId = 'playlistDetail';
    else if (tabName === 'search') targetId = 'search-section';
    else if (tabName === 'uploads') targetId = 'myUploadsSection';
    else if (tabName === 'profile') targetId = 'profile-section';
    else if (tabName === 'recommend') targetId = 'recommend-section';

    const target = document.getElementById(targetId);
    if (target) {
        target.style.display = 'block';
        console.log(`Switched to: ${targetId}`);
    } else {
        console.warn(`Section not found: ${targetId}`);
    }

    // Xử lý param (nếu có)
    if (tabName === 'detail-playlist' && param) {
        setTimeout(() => {
            if (window.loadDetailPlaylist) {
                window.loadDetailPlaylist(param);
            }
        }, 100);
    }

    // Cập nhật active tab
    document.querySelectorAll('.sidebar-link').forEach(link => {
        link.classList.remove('active');
        if (link.dataset.tab === tabName) {
            link.classList.add('active');
        }
    });
};

async function initializeApp(user) {
    if (window.appInitialized || window.initializationInProgress) {
        console.log('⏳ App already initialized or in progress, skipping');
        return;
    }

    if (!user) {
        console.error('❌ initializeApp called without user');
        return;
    }

    window.initializationInProgress = true;
    window.currentUser = user;

    console.log(' Initializing app for user:', user.email || user.id);

    console.log('🧪 Testing connection...');
    const connectionOk = await testSupabaseConnection();
    await testRLSPolicies();  // Luôn chạy để log SELECT status
    if (!connectionOk) {
        console.error('🚨 Connection tests failed - showing warning');
        showConnectionWarning();
    } else {
        console.log('✅ All connection tests passed');
    }

    try {
        await updateProfileDisplay(user);
        await window.loadHomePage();
        await window.switchTab('home');
        await loadUserPlaylists(true);
        if (!window.userSessionLoaded) {
            window.userSessionLoaded = true;
            await resumeRecentTrack(user);
        }
        window.appInitialized = true;
        console.log('✅ App fully initialized');
    } catch (error) {
        console.error('❌ App initialization failed:', error);
        showConnectionWarning?.();
    } finally {
        window.initializationInProgress = false;
    }
}


function resetAllCaches() {
    console.log('🔄 Resetting all caches for fresh start');
    cachedPlaylists = null;
    cachedHistoryTracks = null;
    cachedRecommendedTracks = null;
    cachedProfile = null;
    cachedPlaylistTracks = null;
    cachedMyUploads = null;
    recommendationsLoaded = false;
    window.playlistsLoadFlag = false;
}

document.addEventListener('DOMContentLoaded', async () => {
    console.log('📦 DOM Content Loaded');
    const { data: { session } } = await supabase.auth.getSession();
    
    console.log('SESSION AT DOMContentLoaded:', session, 'at', performance.now());
    if (session?.user) {
        window.currentUser = session.user;
        if (!window.appInitialized) {   
            await initializeApp(session.user);
            window.appInitialized = true;
        } else {
            console.log('⏳ App đã init trước đó, bỏ qua DOMContentLoaded');
        }
    } else {
        console.warn('⚠️ No active session - but NOT redirecting (debug mode); force getUser');
        // Force getUser thay vì redirect
        supabase.auth.getUser().then(({ data: { user }, error }) => {
            if (user) {
                window.currentUser = user;
                console.log('✅ DOMLoaded force getUser success:', user.id);
                initializeApp(user);
            } else {
                console.error('getUser also failed:', error);
                window.location.href = '/index.html';  // Chỉ redirect nếu fail hoàn toàn
            }
        });
    }

    // Ngăn khởi tạo lặp lại
    if (window.appInitialized) {
        console.log('🔄 App already initialized, skipping DOMContentLoaded');
        return;
    }

    // Nếu có user sớm từ OAuth (set ở app.js)
    if (window._oauthEarlyUser) {
        console.log('🔁 Found early OAuth user on DOMContentLoaded:', window._oauthEarlyUser.id);
        try {
            await initializeApp(window._oauthEarlyUser);
            window._oauthEarlyUser = null;
            window.appInitialized = true;
            return;
        } catch (e) {
            console.error('❌ Error initializing app with early OAuth user:', e);
            window.appInitialized = false;
        }
    }

    // Kiểm tra hash OAuth callback
    const urlHash = window.location.hash.substring(1);
    if (urlHash) {
        const params = new URLSearchParams(urlHash);
        const accessToken = params.get('access_token');
        const refreshToken = params.get('refresh_token');

        if (accessToken && refreshToken) {
            try {
                console.log('🔑 Found OAuth tokens in URL — setting Supabase session...');
                const { data: { session }, error } = await supabase.auth.setSession({
                    access_token: accessToken,
                    refresh_token: refreshToken
                });

                if (error) {
                    console.error('❌ Set session error:', error);
                    window.location.href = '/index.html';
                    return;
                }

                if (!session?.user) {
                    console.warn('⚠️ setSession returned session without user');
                    window.location.href = '/index.html';
                    return;
                }

                console.log('✅ Session established from OAuth for:', session.user.email);
                history.replaceState({}, document.title, window.location.pathname); // Xóa hash

                await initializeApp(session.user);
                window.appInitialized = true;
                return;

            } catch (err) {
                console.error('❌ OAuth processing error:', err);
                window.location.href = '/index.html';
                return;
            }
        }
    }

    // Fallback: kiểm tra session từ localStorage
    try {
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) console.error('❌ Session retrieval error:', sessionError);

        if (session?.user) {
            console.log('✅ Existing session found:', session.user.email);
            await initializeApp(session.user);
            window.appInitialized = true;
            return;
        } else {
            console.warn('⚠️ No active session found — redirecting to login');
            window.location.href = '/index.html';
            return;
        }
    } catch (err) {
        console.error('❌ Error checking existing session:', err);
        window.location.href = '/index.html';
        return;
    }
});

// Đăng ký listener cho mọi sự kiện auth (nên đặt ngay sau khi Supabase khởi tạo)
supabase.auth.onAuthStateChange(async (event, session) => {
    console.log('⚙️ Auth state changed:', event, session?.user?.email || 'no user');
    console.log('SIGNED_IN event, user:', session?.user, 'at', performance.now());
    if (event === 'SIGNED_IN' && session?.user) {
        console.log('✅ User signed in:', session.user.email);
        window.appInitialized = false;
        resetAllCaches?.();
        await initializeApp(session.user);
        window.appInitialized = true;
        setTimeout(testRLSPolicies, 1000);
    }

    if (event === 'SIGNED_OUT') {
        console.log(' User signed out — resetting app');
        window.appInitialized = false;
        updateProfileDisplay?.(null);
        resetAllCaches?.();

        if (window.currentAudio) {
            window.currentAudio.pause();
            window.currentAudio = null;
        }
        window.isPlaying = false;

        if (!window.location.pathname.includes('index.html')) {
            window.location.href = '/index.html';
        }
    }
});

function navigateTo(target) {
    if (target === 'home') {
        window.location.href = '/player.html';
    } 
}

window.currentPlaylist = currentPlaylist;
window.currentTrackIndex = currentTrackIndex;
window.isShuffling = isShuffling;
window.shuffleOrder = shuffleOrder;
window.repeatMode = repeatMode;
