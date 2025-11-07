import { supabase } from '../supabase/client.js';

/**
 * Tải file nhạc lên Supabase Storage và lưu metadata vào DB.
 */
window.uploadTrack = async function () {
    const fileInput = document.getElementById('trackFile');
    const coverFileInput = document.getElementById('coverFileInput'); // Lấy file input mới
    const titleInput = document.getElementById('trackTitleInput');
    const artistInput = document.getElementById('trackArtistInput');

    const trackFile = fileInput.files[0];
    const coverFile = coverFileInput.files[0]; // Lấy file ảnh bìa

    if (!trackFile) {
        alert('Vui lòng chọn một file nhạc.');
        return;
    }

    const { data: userData, error: authError } = await supabase.auth.getUser();
    if (authError || !userData.user) {
        alert('Lỗi xác thực: Vui lòng đăng nhập lại.');
        return;
    }
    const userId = userData.user.id;
    
    // Khởi tạo URL ảnh bìa (ban đầu là null)
    let coverUrl = null; 

    try {
        // === 1. Tải lên Ảnh bìa (Nếu có) ===
        if (coverFile) {
            console.log(`Bắt đầu tải ảnh bìa: ${coverFile.name}`);
            const coverExtension = coverFile.name.split('.').pop();
            const coverFileName = `${userId}/${Date.now()}_cover.${coverExtension}`;
            
            const { error: coverUploadError } = await supabase.storage
                .from('cover') // SỬ DỤNG BUCKET MỚI: 'cover'
                .upload(coverFileName, coverFile);

            if (coverUploadError) throw new Error(`Lỗi tải ảnh bìa: ${coverUploadError.message}`);

            const { data: publicUrlData } = supabase.storage
                .from('cover')
                .getPublicUrl(coverFileName);
                
            coverUrl = publicUrlData.publicUrl;
        }


        // === 2. Tải file nhạc lên Supabase Storage ===
        console.log(`Bắt đầu tải file nhạc: ${trackFile.name}`);
        // alert('Đang tải lên... Vui lòng chờ.');
        
        const fileExtension = trackFile.name.split('.').pop();
        const fileName = `${userId}/${Date.now()}.${fileExtension}`;
        
        const { error: trackUploadError } = await supabase.storage
            .from('music-files') 
            .upload(fileName, trackFile);

        if (trackUploadError) throw new Error(`Lỗi tải file nhạc: ${trackUploadError.message}`);

        const { data: trackPublicUrlData } = supabase.storage
            .from('music-files')
            .getPublicUrl(fileName);
            
        const fileUrl = trackPublicUrlData.publicUrl;


        // === 3. Lưu metadata vào bảng 'tracks' ===
        const trackData = {
            user_id: userId,
            title: titleInput.value || trackFile.name.replace(`.${fileExtension}`, ''),
            artist: artistInput.value || 'Unknown Artist',
            file_url: fileUrl,
            cover_url: coverUrl, // LƯU URL TỪ BƯỚC 1
            uploaded_at: new Date().toISOString()
        };

        const { error: dbError } = await supabase
            .from('tracks')
            .insert([trackData]);

        if (dbError) throw new Error(`Lỗi lưu DB: ${dbError.message}`);

        // alert(`Tải lên thành công: ${trackData.title}`);
        
        // Reset form
        fileInput.value = '';
        if (coverFileInput) coverFileInput.value = '';
        titleInput.value = '';
        artistInput.value = '';
        
        if (window.switchTab) {
            window.switchTab('uploads'); 
        }

        // FIX: Clear cache và force refresh uploads để load bài mới ngay (không cần reload trang)
        if (window.cachedMyUploads) {
            window.cachedMyUploads = null;
            console.log('Cache uploads cleared after successful upload');
        }
        if (window.loadMyUploads) {
            window.loadMyUploads(true);  // Force refresh để query fresh từ DB
            console.log('Force refreshed uploads after upload');
        }

    } catch (error) {
        console.error('Lỗi khi upload:', error);
        alert(`Lỗi khi tải lên: ${error.message}`);
    }
};

window.switchTab = function (tabName, playlistId = null) {
    const mainSections = document.querySelectorAll('#mainContentArea .main-section'); 
    
    const navLinks = document.querySelectorAll('.sidebar-left .menu-item'); 

    // 1. Ẩn tất cả sections
    let sectionFound = false;
    const targetId = tabName + '-section';

    mainSections.forEach(section => {
        if (section.id === targetId) {
            section.style.display = 'block';
            sectionFound = true;
        } else {
            section.style.display = 'none';
        }
    });

    if (!sectionFound) {
        console.warn(`Section "${targetId}" không tồn tại trong vùng chứa nội dung.`);
        return;
    }

    // Xử lý logic đặc biệt sau khi chuyển tab
    if (tabName === 'detail-playlist' && playlistId) {
        // SỬA: Gọi đúng hàm từ playlist.js
        if (window.loadDetailPlaylist) {
            window.loadDetailPlaylist(playlistId);
        } else {
            console.error('Hàm loadDetailPlaylist không tồn tại');
        }
    } else if (tabName === 'uploads' && window.loadMyUploads) {
        window.loadMyUploads(true);
    } else if (tabName === 'recommend' && window.renderRecommendations) {
        window.renderRecommendations();
    } 
    
    // Cập nhật trạng thái Active trên Sidebar
    navLinks.forEach(link => {
        const linkTarget = link.getAttribute('data-section');
        
        if (linkTarget === tabName) {
            link.classList.add('active');
        } else {
            link.classList.remove('active');
        }
    });
};