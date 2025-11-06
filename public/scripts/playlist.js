import { supabase } from '../supabase/client.js';

let editingPlaylistId = null;
window.isSwitchingTab = false;
window.isLoadingPlaylistDetail = false;

window.loadDetailPlaylist = async function(playlistId) {
    if (!playlistId) {
        console.error('Lỗi: Thiếu ID playlist');
        return;
    }

    // NGĂN GỌI NHIỀU LẦN
    if (window.isLoadingPlaylistDetail) {
        console.log('Đang tải playlist, bỏ qua request trùng');
        return;
    }
    window.isLoadingPlaylistDetail = true;

    window.currentPlaylistId = playlistId;

    const header = document.getElementById('playlistHeader');
    const container = document.getElementById('trackList');

    if (header) header.innerHTML = '<p>Đang tải playlist...</p>';
    if (container) container.innerHTML = '<p>Đang tải bài hát...</p>';

    try {
        // 1. Lấy thông tin playlist
        const { data: playlist, error } = await supabase
            .from('playlists')
            .select('*')
            .eq('id', playlistId)
            .single();

        if (error) throw error;
        if (!playlist) throw new Error('Playlist không tồn tại');

        window.currentEditingPlaylist = playlist;

        // 2. Render header
        if (header) {
            header.innerHTML = `
                <div class="playlist-info">
                    <h1>${escapeHtml(playlist.name)}</h1>
                    <p>${escapeHtml(playlist.description || 'Không có mô tả')}</p>
                </div>
                <div class="playlist-actions">
                    <button class="play-all-btn" data-id="${playlistId}">Phát Tất Cả</button>
                    <button class="edit-playlist-btn" onclick="window.toggleEditPlaylist('${playlistId}', '${escapeHtml(playlist.name)}', '${escapeHtml(playlist.description || '')}', '${playlist.color || ''}', '${playlist.cover_url || ''}')">
                        Chỉnh sửa
                    </button>
                    <button class="delete-playlist-btn" onclick="window.deletePlaylist('${playlistId}')" style="background:#ff4d4d;color:white;padding:8px 16px;border:none;border-radius:4px;margin-left:10px;">
                        Xóa
                    </button>
                </div>
                <form id="editPlaylistForm-${playlistId}" class="edit-form" style="display:none;">
                    <input type="text" id="editName-${playlistId}" value="${escapeHtml(playlist.name)}" required>
                    <input type="text" id="editDesc-${playlistId}" value="${escapeHtml(playlist.description || '')}">
                    <div style="display:flex;gap:10px;align-items:center;">
                        <label>Màu:</label>
                        <input type="color" id="editColor-${playlistId}" value="${playlist.color || '#1db954'}">
                    </div>
                    <div class="cover-section">
                        <label for="editCover-${playlistId}">Ảnh nền:</label>
                        <input type="file" id="editCover-${playlistId}" accept="image/*">
                        ${playlist.cover_url ? `<img src="${getPublicPlaylistCoverUrl(playlist.cover_url)}" style="width:60px;height:60px;object-fit:cover;margin-top:5px;border-radius:4px;">
                            <button type="button" onclick="window.deletePlaylistCover('${playlistId}')">Xóa ảnh</button>` : ''}
                    </div>
                    <div class="edit-actions">
                        <button type="button" class="btn-save" onclick="window.savePlaylistEdit('${playlistId}')">Lưu</button>
                        <button type="button" class="btn-cancel" onclick="window.toggleEditPlaylist('${playlistId}')">Hủy</button>
                    </div>
                </form>
            `;

            // Gắn Play All
            const playBtn = header.querySelector('.play-all-btn');
            if (playBtn) {
                playBtn.addEventListener('click', () => handlePlayAll(playlistId, playlist));
            }
        }

        // 3. Tải tracks
        const tracks = await window.loadPlaylistTracks(playlistId, false);

        // 4. Render tracks
        if (container) {
            if (tracks.length === 0) {
                container.innerHTML = '<p class="empty-message">Playlist trống</p>';
            } else {
                renderTracks(tracks, container);
            }
        }

        // 5. Badge số bài
        const badge = document.createElement('span');
        badge.textContent = `${tracks.length} bài hát`;
        badge.style.cssText = 'color:var(--text-secondary);font-size:0.9em;margin-left:10px;';
        header.querySelector('.playlist-info')?.appendChild(badge);

    } catch (error) {
        console.error('Lỗi load playlist:', error);
        if (container) container.innerHTML = `<p class="error">Lỗi: ${error.message}</p>`;
        if (header) header.innerHTML = '<h2>Lỗi tải</h2>';
    } finally {
        window.isLoadingPlaylistDetail = false;
    }
};

async function uploadPlaylistCover(userId, playlistId, coverFile) {
    const BUCKET_NAME = 'cover';
   
    const fileExt = coverFile.name.split('.').pop();
    const filePath = `playlists/${playlistId}/cover.${fileExt}`;
    try {
        console.log('Starting playlist cover upload to path:', filePath);
        const { data: uploadData, error: uploadError } = await supabase.storage
            .from(BUCKET_NAME)
            .upload(filePath, coverFile, {
                cacheControl: '3600',
                upsert: true,
            });
        if (uploadError) {
            console.error('Upload error:', uploadError);
            return null;
        }
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
window.uploadPlaylistCover = uploadPlaylistCover;

function handlePlayAll(playlistId, playlistData) {
    // Reload tracks nếu cần (cache có thể cũ)
    window.loadPlaylistTracks(playlistId, false).then(tracks => {
        if (tracks.length > 0) {
            window.currentPlaylist = tracks;  // Global scope fix
            window.currentTrackIndex = 0;
            window.playTrack(tracks[0], tracks, 0);  // Play đầu
            console.log(`Playing all from playlist: ${playlistData.name}`);
        }
    });
}

// Hàm toggle edit form
window.toggleEditPlaylist = function(playlistId, currentName, currentDesc, currentColor, currentCover = null) {
    const formId = `editPlaylistForm-${playlistId}`;
    const form = document.getElementById(formId);
    const editBtn = document.querySelector(`.edit-playlist-btn[onclick*="toggleEditPlaylist('${playlistId}'"]`);  // Selector động
    
    if (!form || !editBtn) return console.error('Không tìm thấy form/edit btn');

    if (form.classList.contains('active')) {
        // Cancel
        form.classList.remove('active');
        editBtn.textContent = 'Chỉnh sửa';
    } else {
        // Start edit
        document.getElementById(`editName-${playlistId}`).value = currentName || '';
        document.getElementById(`editDesc-${playlistId}`).value = currentDesc || '';
        document.getElementById(`editColor-${playlistId}`).value = currentColor || '#1db954';
        form.classList.add('active');
        editBtn.textContent = 'Hủy';
        
        // ← FIX: Cover input & preview (hoàn chỉnh)
        let coverSection = form.querySelector('.cover-section');
        if (!coverSection) {
            coverSection = document.createElement('div');
            coverSection.className = 'cover-section';
            coverSection.innerHTML = `
                <label for="editCover-${playlistId}">Ảnh nền (tùy chọn):</label>
                <input type="file" id="editCover-${playlistId}" accept="image/*">
                ${currentCover ? `<img src="${getPublicPlaylistCoverUrl(currentCover)}" alt="Current Cover" style="width: 60px; height: 60px; object-fit: cover; margin-top: 5px; border-radius: 4px;"><button type="button" class="btn-delete-cover" onclick="window.deletePlaylistCover('${playlistId}')">Xóa ảnh</button>` : ''}
            `;
            form.appendChild(coverSection);
        }
    }
};

// Hàm getPublicPlaylistCoverUrl (sửa bucket 'cover')
function getPublicPlaylistCoverUrl(coverPath) {
    if (!coverPath) return null;
    if (coverPath.includes('supabase.co') || coverPath.startsWith('http')) return coverPath;
    const { data } = supabase.storage.from('cover').getPublicUrl(coverPath);  // ← FIX: Bucket 'cover'
    return data.publicUrl;
}

// Hàm save edit (sửa scope 'playlist', cover handle)
window.savePlaylistEdit = async function(playlistId) {
    const formId = `editPlaylistForm-${playlistId}`;
    const form = document.getElementById(formId);
    if (!form) return console.error('Form không tồn tại');

    const name = document.getElementById(`editName-${playlistId}`).value.trim();
    const desc = document.getElementById(`editDesc-${playlistId}`).value.trim();
    const color = document.getElementById(`editColor-${playlistId}`).value;
    const coverFile = document.getElementById(`editCover-${playlistId}`)?.files[0];  // ← FIX: Cover file

    if (!name) {
        alert('Tên playlist không được để trống!');
        return;
    }

    const currentPlaylist = window.currentEditingPlaylist;  // ← FIX: Scope từ loadDetailPlaylist
    let finalCoverUrl = currentPlaylist.cover_url || null;  // ← FIX: Default current
    
    if (coverFile) {
        const { data: { user } } = await supabase.auth.getUser();
        const uploadedUrl = await window.uploadPlaylistCover(user.id, playlistId, coverFile);
        if (uploadedUrl) finalCoverUrl = uploadedUrl;
    } else if (document.querySelector(`#editCover-${playlistId} + .btn-delete-cover`)) {  // If delete clicked
        finalCoverUrl = null;
    }

    const updates = {
        name,
        description: desc,
        color,
        cover_url: finalCoverUrl  // ← FIX: Update cover_url
    };

    try {
        const { error } = await supabase
            .from('playlists')
            .update(updates)
            .eq('id', playlistId)
            .select();

        if (error) throw error;

        console.log('Playlist updated:', updates);
        alert('Cập nhật thành công!');
        
        window.toggleEditPlaylist(playlistId, name, desc, color, finalCoverUrl);  // ← FIX: Pass cover to toggle
        await window.loadDetailPlaylist(playlistId); 
        await window.appFunctions.loadUserPlaylists(true);  
    } catch (error) {
        console.error('Lỗi update playlist:', error);
        alert(`Lỗi: ${error.message}. Kiểm tra quyền RLS nếu cần.`);
    }
};



// ← THÊM HÀM XÓA COVER
window.deletePlaylistCover = async function(playlistId) {
    if (!confirm('Xóa ảnh nền playlist?')) return;
    try {
        const { error } = await supabase
            .from('playlists')
            .update({ cover_url: null })
            .eq('id', playlistId);
        if (error) throw error;
        console.log('Cover deleted');
        await window.appFunctions.loadUserPlaylists(true);
        await window.loadDetailPlaylist(playlistId);  // Refresh detail
    } catch (err) {
        console.error('Lỗi xóa cover:', err);
        alert('Lỗi: ' + err.message);
    }
};

/**
 * Render danh sách bài hát (Được dùng chung cho Playlist, Uploads, Search, Recommend)
 * @param {Array<Object>} tracks - Danh sách các đối tượng track
 * @param {HTMLElement} container - Container để chèn danh sách
 */
function renderTracks(tracks, container) {
    if(!container) return;
    container.innerHTML = '';

    tracks.forEach((track, index) => { 
        const item = document.createElement('div');
        item.className = 'track-item playable-track'; 

        const safeTitle = track.title ? track.title.trim() : 'Unknown Title';
        const safeArtist = track.artist ?track.artist.trim() : 'Unknown Artist';
        const safeCoverUrl = track.cover_url || '';
        const trackNumber = index + 1;

        item.addEventListener('click' , function(e){
            if (e.target.closest('.btn-action')) return;
            window.currentPlaylist = tracks;  // ← Fix scope: dùng window. để global
            window.playTrack(track, tracks, index); 
            e.preventDefault();  // ← Fix typo
        });

        const titleInnerHTML = safeTitle.length > 20 ? `${safeTitle}` : safeTitle;

        // ← FIX: Add trash button for playlist tracks (if in detail view)
        const isPlaylistDetail = container.id === 'trackList';  // Assume #trackList in detail
        const deleteButton = isPlaylistDetail ? `
            <div class="track-actions">
                <button class="btn-action btn-remove-track" onclick="window.removeTrackFromPlaylist('${track.id}', '${window.currentPlaylistId || ''}')" title="Xóa khỏi playlist">
                    <i class="fa-solid fa-trash"></i>
                </button>
            </div>
        ` : '';

        item.innerHTML = `
            <div class="track-info">
                <span class="track-number">${trackNumber}.</span>
                <img src="${safeCoverUrl}" alt="${safeTitle} by ${safeArtist}" class="track-cover" 
                     onerror="this.src='/assets/default-cover.webp';" />
                <div class="track-details">
                    <strong class="track-name marquee-container">
                        <span class="track-title-inner">${titleInnerHTML}</span>
                    </strong>
                    <small class="track-artist">${safeArtist}</small>
                </div>
            </div>
            ${deleteButton}
        `;
        
        const titleContainer = item.querySelector('.marquee-container');
        if (titleContainer) {
            const titleText = titleContainer.querySelector('.track-title-inner');
            if (titleText && titleText.scrollWidth > titleContainer.clientWidth) {
                titleText.classList.add('marquee');  
            }
        }
        
        container.appendChild(item);
    });
    console.log(`Rendered ${tracks.length} tracks in container`);
}

// ← THÊM HÀM XÓA TRACK KHỎI PLAYLIST
window.removeTrackFromPlaylist = async function(trackId, playlistId) {
    if (!confirm('Xóa bài hát khỏi playlist?')) return;
    try {
        const { error } = await supabase
            .from('playlist_tracks')
            .delete()
            .eq('playlist_id', playlistId)
            .eq('track_id', trackId);
        if (error) throw error;
        alert('Đã xóa bài hát khỏi playlist!');
        await window.loadDetailPlaylist(playlistId);  // Refresh detail
    } catch (err) {
        console.error('Lỗi xóa track:', err);
        alert('Lỗi: ' + err.message);
    }
};

// Hàm hiển thị playlist grid với màu sắc (THÊM MỚI)
export function renderPlaylists(playlists, container) {
    if (!playlists || playlists.length === 0) {
        container.innerHTML = '<p class="empty-message">Chưa có playlist nào.</p>';
        return;
    }

    container.innerHTML = '';

    playlists.forEach(playlist => {
        const card = document.createElement('div');
        card.className = 'playlist-card gradient-bg';
        card.dataset.playlistId = playlist.id;

        // ÁP DỤNG MÀU TỪ DATABASE
        const color = playlist.color || '#1DB954';
        card.style.setProperty('--card-primary-color', color);
        card.style.setProperty('--card-secondary-color', '#282828');

        card.innerHTML = `
            <div class="playlist-info">
                <h3>${escapeHtml(playlist.name)}</h3>
                <p>${playlist.track_count || 0} bài hát</p>
            </div>
        `;

        card.addEventListener('click', () => {
            window.switchTab('detail-playlist', playlist.id);
        });

        container.appendChild(card);
    });
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Hàm tạo playlist mới với màu sắc
export async function createPlaylist(playlistData) {
    try {
        const { data, error } = await supabase
            .from('playlists')
            .insert([{
                name: playlistData.name,
                color: playlistData.color,
                user_id: await getCurrentUserId(),
                cover_url: playlistData.cover_url || null
            }])
            .select()
            .single();

        if (error) throw error;
        return data;
    } catch (error) {
        console.error('Lỗi tạo playlist:', error);
        throw error;
    }
}

async function getCurrentUserId() {
    const { data: { user } } = await supabase.auth.getUser();
    return user?.id;
}

// ← THÊM HÀM XÓA PLAYLIST (từ loadDetailPlaylist onclick)
window.deletePlaylist = async function(playlistId) {
    if (!confirm('Xóa playlist này? Tất cả bài hát sẽ bị xóa!')) return;
    try {
        // Xóa tracks liên quan
        const { error: unlinkError } = await supabase
            .from('playlist_tracks')
            .delete()
            .eq('playlist_id', playlistId);
        if (unlinkError) throw unlinkError;
        
        // Xóa playlist
        const { error: deleteError } = await supabase
            .from('playlists')
            .delete()
            .eq('id', playlistId);
        if (deleteError) throw deleteError;
        
        alert('Playlist đã xóa!');
        window.switchTab('home');  // Back to home
        window.cachedPlaylists = null;
        await window.appFunctions.loadUserPlaylists(true);  // Refresh grid
    } catch (err) {
        console.error('Lỗi xóa playlist:', err);
        alert('Lỗi: ' + err.message);
    }
};


window.renderTracks = renderTracks;
window.addTrackToPlaylist = window.addTrackToPlaylist;
window.loadDetailPlaylist = window.loadDetailPlaylist;
window.renderPlaylists = renderPlaylists;