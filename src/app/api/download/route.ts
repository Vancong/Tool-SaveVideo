import { NextRequest, NextResponse } from 'next/server';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);
const isLocal = process.env.NODE_ENV === 'development' || !process.env.NETLIFY;

// --- HELPERS ---
function detectPlatform(url: string) {
    const u = url.toLowerCase();
    if (u.includes('tiktok.com') || u.includes('douyin.com')) return 'tiktok';
    if (u.includes('youtube.com') || u.includes('youtu.be')) return 'youtube';
    if (u.includes('facebook.com') || u.includes('fb.watch') || u.includes('fb.com')) return 'facebook';
    return 'other';
}

async function tryCobalt(url: string, isAudio = false) {
    const COBALT_INSTANCES = [
        'https://api.cobalt.tools/api/json',
        'https://cobalt.api.unblockers.it/api/json',
    ];
    for (const apiUrl of COBALT_INSTANCES) {
        try {
            const res = await fetch(apiUrl, {
                method: 'POST',
                headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
                body: JSON.stringify({ url, videoQuality: '1080', isAudioOnly: isAudio })
            });
            const data = await res.json();
            if (data.status === 'stream' || data.status === 'redirect') return data.url;
            if (data.status === 'picker') return data.picker[0].url;
        } catch (e) { }
    }
    return null;
}

async function getTikTokWeb(url: string) {
    try {
        const res = await fetch(`https://www.tikwm.com/api/?url=${encodeURIComponent(url)}&hd=1`);
        const data = await res.json();
        if (data?.code === 0 && data?.data) {
            return {
                title: data.data.title || 'TikTok Video',
                platform: 'tiktok',
                thumbnail: data.data.cover || data.data.origin_cover,
                formats: [
                    { id: 'vid', label: '🎬 TẢI VIDEO', url: data.data.hdplay || data.data.play, quality: 'HD' },
                    { id: 'aud', label: '🎵 TẢI NHẠC (MP3)', url: data.data.music, quality: 'Audio' }
                ]
            };
        }
    } catch (e) { }
    return null;
}

// --- MAIN API ---
export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        let { url, action, formatId } = body;
        if (!url) return NextResponse.json({ success: false, message: 'Vui lòng nhập link' }, { status: 400 });

        // Làm sạch link YouTube
        if (url.includes('youtube.com/watch?v=')) {
            const urlObj = new URL(url);
            urlObj.searchParams.delete('list');
            urlObj.searchParams.delete('index');
            url = urlObj.toString();
        }

        const platform = detectPlatform(url);

        // 1. Chế độ Netlify (Production)
        if (!isLocal) {
            if (action === 'download' && formatId === 'audio_only') {
                const audioUrl = await tryCobalt(url, true);
                return NextResponse.json({ success: true, url: audioUrl || url });
            }

            if (platform === 'tiktok') {
                const info = await getTikTokWeb(url);
                if (info) return NextResponse.json({ success: true, data: info });
            }

            const videoUrl = await tryCobalt(url, false);
            if (videoUrl) {
                return NextResponse.json({
                    success: true,
                    data: {
                        title: 'Video đã sẵn sàng',
                        platform: platform,
                        thumbnail: '',
                        formats: [
                            { id: 'best_video', label: '🎬 TẢI VIDEO', url: videoUrl, quality: 'HD' },
                            { id: 'audio_only', label: '🎵 TẢI NHẠC (MP3)', quality: 'Audio' }
                        ]
                    }
                });
            }

            return NextResponse.json({ success: false, message: 'Server bận, thử lại sau.' }, { status: 500 });
        }

        // 2. Chế độ Local (Dùng yt-dlp)
        if (!action || action === 'info') {
            // Đối với TikTok ở Local, dùng thẳng TikWM cho ổn định giống bản cũ
            if (platform === 'tiktok') {
                const info = await getTikTokWeb(url);
                if (info) return NextResponse.json({ success: true, data: info });
            }

            const cobaltUrl = await tryCobalt(url, false);
            const { stdout } = await execFileAsync('yt-dlp', [
                '--dump-json', '--format', 'best', '--no-playlist', url
            ], { maxBuffer: 50 * 1024 * 1024 });
            const d = JSON.parse(stdout);

            return NextResponse.json({
                success: true,
                data: {
                    title: d.title,
                    thumbnail: d.thumbnail,
                    platform: platform,
                    formats: [
                        { id: 'best', label: '🎬 TẢI VIDEO', url: cobaltUrl || d.url, quality: 'HD' },
                        { id: 'audio_only', label: '🎵 TẢI NHẠC (MP3)', quality: 'Audio' }
                    ]
                }
            });
        }

        if (action === 'download') {
            const isAudio = formatId === 'audio_only';
            const { stdout } = await execFileAsync('yt-dlp', [
                '--get-url', '-f', isAudio ? 'bestaudio' : 'best', '--no-playlist', url
            ], { maxBuffer: 50 * 1024 * 1024 });
            return NextResponse.json({ success: true, url: stdout.trim().split('\n')[0] });
        }

    } catch (error: any) {
        console.error('[API Error]:', error.message);
        return NextResponse.json({ success: false, message: error.message }, { status: 500 });
    }
}
