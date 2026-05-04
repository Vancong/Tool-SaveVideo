import { NextRequest, NextResponse } from 'next/server';
import { execFile } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs';

const execFileAsync = promisify(execFile);

// --- HELPERS ---
async function fetchWithTimeout(url: string, options: RequestInit = {}, ms = 15000): Promise<Response> {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), ms);
    try {
        return await fetch(url, { ...options, signal: ctrl.signal });
    } finally {
        clearTimeout(t);
    }
}

function detectPlatform(url: string): 'tiktok' | 'youtube' | 'facebook' | 'unknown' {
    if (/tiktok\.com|douyin\.com/i.test(url)) return 'tiktok';
    if (/youtu(be\.com|\.be)/i.test(url)) return 'youtube';
    if (/facebook\.com|fb\.watch|fb\.com|fb\.gg/i.test(url)) return 'facebook';
    return 'unknown';
}

// ========== STEP 1: GET VIDEO INFO (formats list) ==========

function cleanTikTokUrl(url: string): string {
    try {
        const u = new URL(url);
        return `${u.origin}${u.pathname}`;
    } catch (e) {
        return url.split('?')[0];
    }
}

function extractTikTokId(url: string): string | null {
    const matches = url.match(/\/video\/(\d+)/) || url.match(/\/v\/(\d+)/) || url.match(/item_id=(\d+)/);
    return matches ? matches[1] : null;
}

async function tryTikMate(url: string) {
    try {
        console.log('[TikTok] Trying TikMate...');
        const res = await fetchWithTimeout('https://api.tikmate.app/download', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'User-Agent': 'Mozilla/5.0'
            },
            body: `url=${encodeURIComponent(url)}`
        });
        const data = await res.json();
        if (data?.success && data?.url) {
            return {
                title: 'TikTok Video (TikMate)',
                thumbnail: '',
                author: '',
                duration: 0,
                platform: 'TikTok',
                formats: [
                    { id: 'hd', label: 'HD (Không watermark)', url: data.url, quality: 'HD' }
                ]
            };
        }
    } catch (e) {
        console.log('[TikTok] TikMate failed:', e);
    }
    return null;
}

async function trySSSTik(url: string) {
    try {
        console.log('[TikTok] Trying SSSTik...');
        // Use a different proxy/format if needed, but let's try to improve headers
        const res = await fetchWithTimeout('https://ssstik.io/abc?url=dl', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Origin': 'https://ssstik.io',
                'Referer': 'https://ssstik.io/en'
            },
            body: `id=${encodeURIComponent(url)}&locale=en&tt=0`
        });
        const html = await res.text();

        const videoMatches = html.match(/href="(https:\/\/v\d+[^"]+?\.mp4[^"]*?)"/g);
        if (videoMatches && videoMatches.length > 0) {
            const formats = videoMatches.slice(0, 3).map((m, i) => {
                const link = m.match(/href="([^"]+)"/)?.[1] || '';
                return {
                    id: `sss-${i}`,
                    label: i === 0 ? 'HD (Không watermark)' : `Server ${i + 1}`,
                    url: link,
                    quality: 'HD'
                };
            });

            return {
                title: 'TikTok Video (SSS)',
                thumbnail: '',
                author: '',
                duration: 0,
                platform: 'TikTok',
                formats
            };
        }
    } catch (e) {
        console.log('[TikTok] SSSTik failed:', e);
    }
    return null;
}

async function tryPuppeteerTikTok(url: string) {
    let browser = null;
    try {
        console.log('[TikTok] Launching Puppeteer fallback...');
        const puppeteer = require('puppeteer');
        browser = await puppeteer.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
        const page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

        // Use musicaldown.com as a proxy
        await page.goto('https://musicaldown.com/en', { waitUntil: 'networkidle2' });
        await page.type('#link_url', url);
        await page.click('button[type="submit"]');

        await page.waitForSelector('a.btn.btn-success', { timeout: 15000 });

        const result = await page.evaluate(() => {
            const links = Array.from(document.querySelectorAll('a.btn.btn-success'));
            const downloadLinks = links
                .map(a => ({
                    label: a.textContent?.trim() || 'Download',
                    url: (a as HTMLAnchorElement).href
                }))
                .filter(l => l.url && l.url.includes('http'));

            const title = document.querySelector('h2.white-text')?.textContent?.trim() || 'TikTok Video';
            const thumbnail = (document.querySelector('img.responsive-img') as HTMLImageElement)?.src || '';

            return { title, thumbnail, downloadLinks };
        });

        await browser.close();

        if (result.downloadLinks.length > 0) {
            return {
                title: result.title,
                thumbnail: result.thumbnail,
                author: '',
                duration: 0,
                platform: 'TikTok',
                formats: result.downloadLinks.map((l, i) => ({
                    id: `pup-${i}`,
                    label: l.label.includes('Watermark') ? l.label : `${l.label} (Không watermark)`,
                    url: l.url,
                    quality: 'HD'
                }))
            };
        }
    } catch (e) {
        console.log('[TikTok] Puppeteer fallback failed:', e);
        if (browser) try { await (browser as any).close(); } catch (err) { }
    }
    return null;
}

// --- TikTok: Get info via TikWM ---
async function getTikTokInfo(url: string) {
    const videoId = extractTikTokId(url);
    const cleanedUrl = url.split('?')[0];
    console.log('[TikTok] Video ID:', videoId, '| Target URL:', cleanedUrl);

    // Try TikWM first
    try {
        console.log('[TikTok] Getting info via TikWM...');
        const res = await fetchWithTimeout(`https://www.tikwm.com/api/?url=${encodeURIComponent(cleanedUrl)}&hd=1`);
        const data = await res.json();

        if (data?.code === 0 && data?.data) {
            const d = data.data;
            const formats = [];

            const bestVid = d.hdplay || d.play;
            if (bestVid) {
                formats.push({
                    id: 'best_video',
                    label: '🎬 TẢI VIDEO',
                    url: bestVid,
                    quality: 'HD'
                });
            }

            if (d.music) {
                formats.push({
                    id: 'audio_only',
                    label: '🎵 TẢI NHẠC (MP3)',
                    url: d.music,
                    quality: 'Audio'
                });
            }

            if (formats.length > 0) {
                return {
                    title: d.title || 'TikTok Video',
                    thumbnail: d.cover || d.origin_cover || '',
                    author: d.author?.nickname || '',
                    duration: d.duration || 0,
                    platform: 'TikTok',
                    formats
                };
            }
        }
    } catch (e) { }

    // FALLBACK 1: Puppeteer
    const pupResult = await tryPuppeteerTikTok(cleanedUrl);
    if (pupResult) {
        const bestVid = pupResult.formats.find(f => !f.label.includes('Music') && !f.label.includes('MP3')) || pupResult.formats[0];
        const bestAud = pupResult.formats.find(f => f.label.includes('Music') || f.label.includes('MP3'));

        return {
            ...pupResult,
            formats: [
                { id: 'best_video', label: '🎬 TẢI VIDEO', url: bestVid.url, quality: 'HD' },
                ...(bestAud ? [{ id: 'audio_only', label: '🎵 TẢI NHẠC (MP3)', url: bestAud.url, quality: 'Audio' }] : [])
            ]
        };
    }

    // FINAL FALLBACK: yt-dlp via getYouTubeInfo
    const ytResult = await getYouTubeInfo(cleanedUrl);
    return ytResult;
}

async function tryPuppeteerYouTube(url: string) {
    let browser = null;
    try {
        console.log('[YouTube] Launching Puppeteer fallback for high quality...');
        const puppeteer = require('puppeteer');
        browser = await puppeteer.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
        const page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

        // Use y2mate.com or similar
        await page.goto('https://www.y2mate.com/en855', { waitUntil: 'networkidle2' });
        await page.type('#txt-url', url);
        await page.click('#btn-submit');

        await page.waitForSelector('#result', { timeout: 15000 });
        await new Promise(r => setTimeout(r, 2000)); // Wait for tables to populate

        const result = await page.evaluate(() => {
            const rows = Array.from(document.querySelectorAll('#mp4 table tbody tr'));
            const formats = rows.map(row => {
                const quality = row.querySelector('td:nth-child(1)')?.textContent?.trim() || '';
                const size = row.querySelector('td:nth-child(2)')?.textContent?.trim() || '';
                const btn = row.querySelector('button');
                return { quality, size, btnId: btn?.getAttribute('data-id'), btnTitle: btn?.getAttribute('data-ftype') };
            }).filter(f => f.btnId);

            const title = document.querySelector('.caption.text-left b')?.textContent?.trim() || 'YouTube Video';
            const thumbnail = (document.querySelector('.thumbnail.text-center img') as HTMLImageElement)?.src || '';

            return { title, thumbnail, formats };
        });

        // We need to click each button to get the final download link, which is complex in headless.
        // Let's try a simpler one: savefrom.net
        if (result.formats.length === 0) {
            await page.goto('https://en.savefrom.net/1-youtube-video-downloader-524v/', { waitUntil: 'networkidle2' });
            await page.type('#sf_url', url);
            await page.click('#sf_submit');
            await page.waitForSelector('.info-box', { timeout: 15000 });

            const sfResult = await page.evaluate(() => {
                const links = Array.from(document.querySelectorAll('.link-group a'));
                return links.map(a => ({
                    label: a.textContent?.trim() || 'Download',
                    url: (a as HTMLAnchorElement).href,
                    quality: a.getAttribute('data-quality') || ''
                })).filter(l => l.url && !l.url.includes('javascript'));
            });

            await browser.close();
            return sfResult.length > 0 ? {
                title: 'YouTube Video',
                platform: 'YouTube',
                formats: sfResult.map((l, i) => ({
                    id: `sf-${i}`,
                    label: `🎬 ${l.label} (${l.quality}) - Có tiếng`,
                    url: l.url,
                    quality: l.quality
                }))
            } : null;
        }

        await browser.close();
    } catch (e) {
        console.log('[YouTube] Puppeteer fallback failed:', e);
        if (browser) try { await (browser as any).close(); } catch (err) { }
    }
    return null;
}

// --- YouTube: Get info via yt-dlp ---
async function getYouTubeInfo(url: string) {
    try {
        console.log('[YouTube] Getting info...');

        // Cố gắng lấy link chất lượng cao đã ghép sẵn bằng Puppeteer trước
        const extra = await tryPuppeteerYouTube(url);
        if (extra && extra.formats && extra.formats.length > 0) {
            const bestVid = extra.formats.find(f => !f.label.includes('Audio') && !f.label.includes('Chỉ có hình')) || extra.formats[0];
            const bestAudio = extra.formats.find(f => f.label.includes('Audio') || f.label.includes('MP3'));

            const finalFormats = [];
            finalFormats.push({
                id: 'best_video',
                label: '🎬 TẢI VIDEO',
                quality: 'Best',
                url: bestVid.url,
                ext: 'mp4'
            });

            finalFormats.push({
                id: 'audio_only',
                label: '🎵 TẢI NHẠC (MP3)',
                quality: 'Audio',
                url: bestAudio?.url || '',
                formatId: 'bestaudio',
                ext: 'mp3'
            });

            return {
                title: extra.title || 'YouTube Video',
                thumbnail: extra.thumbnail || '',
                author: '',
                duration: 0,
                platform: 'YouTube',
                formats: finalFormats
            };
        }

        // Nếu Puppeteer thất bại, dùng yt-dlp làm dự phòng
        const { stdout } = await execFileAsync('yt-dlp', [
            '--dump-json',
            '--no-warnings',
            '--no-playlist',
            '--format', 'best',
            url
        ], { timeout: 30000, maxBuffer: 10 * 1024 * 1024 });

        const info = JSON.parse(stdout);
        const formats: any[] = [];

        const bestCombined = info.formats
            ?.filter((f: any) => f.vcodec !== 'none' && f.acodec !== 'none' && f.url)
            ?.sort((a: any, b: any) => (b.height || 0) - (a.height || 0))[0];

        formats.push({
            id: 'best_video',
            label: '🎬 TẢI VIDEO ',
            quality: 'Best',
            formatId: bestCombined?.format_id || 'best',
            url: bestCombined?.url,
            ext: 'mp4'
        });

        formats.push({
            id: 'audio_only',
            label: '🎵 TẢI NHẠC (MP3)',
            quality: 'Audio',
            formatId: 'bestaudio',
            ext: 'mp3'
        });

        return {
            title: info.title || 'YouTube Video',
            thumbnail: info.thumbnail || '',
            author: info.uploader || '',
            duration: info.duration || 0,
            platform: 'YouTube',
            formats
        };
    } catch (e: any) {
        console.log('[YouTube] Error:', e.message);
    }
    return null;
}

// --- Facebook: Get info via yt-dlp ---
async function getFacebookInfo(url: string) {
    try {
        console.log('[Facebook] Getting info...');
        const { stdout } = await execFileAsync('yt-dlp', [
            '--dump-json',
            '--no-warnings',
            '--no-playlist',
            '--format', 'best',
            url
        ], { timeout: 30000, maxBuffer: 10 * 1024 * 1024 });

        const info = JSON.parse(stdout);
        const best = info.formats
            ?.filter((f: any) => f.vcodec !== 'none' && f.acodec !== 'none' && f.url)
            ?.sort((a: any, b: any) => (b.height || 0) - (a.height || 0))[0];

        return {
            title: info.title || 'Facebook Video',
            thumbnail: info.thumbnail || '',
            author: info.uploader || '',
            duration: info.duration || 0,
            platform: 'Facebook',
            formats: [
                {
                    id: 'best_video',
                    label: '🎬 TẢI VIDEO',
                    quality: 'Best',
                    formatId: best?.format_id || 'best',
                    url: best?.url,
                    ext: 'mp4'
                },
                {
                    id: 'audio_only',
                    label: '🎵 TẢI NHẠC (MP3)',
                    quality: 'Audio',
                    formatId: 'bestaudio',
                    ext: 'mp3'
                }
            ]
        };
    } catch (e: any) { }
    return null;
}

// ========== STEP 2: GET DOWNLOAD URL ==========

async function getDownloadUrl(platform: string, formatId: string, url: string) {
    // For TikTok, the format already has a direct URL
    if (platform === 'TikTok') {
        return null; // handled client-side
    }

    try {
        const args = ['--get-url', '--no-warnings', '--no-playlist'];

        if (formatId === 'audio_only' || formatId === 'bestaudio') {
            args.push('-f', 'bestaudio');
        } else if (formatId === 'best') {
            args.push('-f', 'best');
        } else {
            args.push('-f', formatId);
        }

        args.push(url);

        const { stdout } = await execFileAsync('yt-dlp', args, { timeout: 30000 });
        return stdout.trim().split('\n')[0];
    } catch (e: any) {
        console.log('[Download] yt-dlp get-url failed:', e.message);
    }
    return null;
}

// ========== API ENDPOINTS ==========

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { url, action, formatId } = body;

        if (!url) {
            return NextResponse.json({ success: false, message: 'Vui lòng nhập link video' }, { status: 400 });
        }

        const platform = detectPlatform(url);

        // ACTION: GET INFO (list formats)
        if (!action || action === 'info') {
            console.log(`[API] Getting info for ${platform}:`, url);

            let info = null;
            switch (platform) {
                case 'tiktok':
                    info = await getTikTokInfo(url);
                    break;
                case 'youtube':
                    info = await getYouTubeInfo(url);
                    break;
                case 'facebook':
                    info = await getFacebookInfo(url);
                    break;
                default:
                    // Try yt-dlp for unknown platforms
                    info = await getYouTubeInfo(url);
            }

            if (info && info.formats.length > 0) {
                return NextResponse.json({ success: true, data: info });
            }

            return NextResponse.json({
                success: false,
                message: 'Không thể lấy thông tin video. Vui lòng kiểm tra lại link.'
            });
        }

        // ACTION: GET DOWNLOAD URL
        if (action === 'download') {
            console.log(`[API] Getting download URL for format ${formatId}`);
            const downloadUrl = await getDownloadUrl(platform, formatId, url);
            if (downloadUrl) {
                return NextResponse.json({ success: true, downloadUrl });
            }
            return NextResponse.json({
                success: false,
                message: 'Không thể lấy link tải. Vui lòng thử chất lượng khác.'
            });
        }

        return NextResponse.json({ success: false, message: 'Action không hợp lệ' }, { status: 400 });

    } catch (error: any) {
        console.error('[API] Error:', error);
        return NextResponse.json({ success: false, message: error.message || 'Lỗi máy chủ' }, { status: 500 });
    }
}
