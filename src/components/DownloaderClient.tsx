'use client';

import React, { useState, useRef, useEffect } from 'react';
import {
    Download, Link as LinkIcon, Video, Loader2, AlertCircle,
    CheckCircle2, Play, Music, ChevronDown, Copy, ExternalLink,
    Sparkles, Zap, Shield, Clock
} from 'lucide-react';

interface VideoFormat {
    id: string;
    label: string;
    url?: string;
    quality: string;
    formatId?: string;
    ext?: string;
    videoOnly?: boolean;
}

interface VideoInfo {
    title: string;
    thumbnail: string;
    author: string;
    duration: number;
    platform: string;
    formats: VideoFormat[];
}

function formatDuration(seconds: number): string {
    if (!seconds) return '';
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
}

function getPlatformColor(platform: string): string {
    switch (platform.toLowerCase()) {
        case 'tiktok': return 'from-[#ff0050] to-[#00f2ea]';
        case 'youtube': return 'from-[#ff0000] to-[#cc0000]';
        case 'facebook': return 'from-[#1877f2] to-[#0a5dc2]';
        default: return 'from-violet-500 to-purple-600';
    }
}

function getPlatformIcon(platform: string) {
    switch (platform.toLowerCase()) {
        case 'tiktok':
            return (
                <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                    <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.88-2.89 2.89 2.89 0 0 1 2.88-2.89c.28 0 .54.04.79.1V9.01a6.27 6.27 0 0 0-.79-.05 6.34 6.34 0 0 0-6.34 6.34 6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.34-6.34V8.87a8.16 8.16 0 0 0 4.77 1.53V7a4.82 4.82 0 0 1-1.01-.31z" />
                </svg>
            );
        case 'youtube':
            return (
                <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                    <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
                </svg>
            );
        case 'facebook':
            return (
                <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                    <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
                </svg>
            );
        default: return <Video className="w-5 h-5" />;
    }
}

export default function DownloaderClient() {
    const [videoUrl, setVideoUrl] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [isDownloading, setIsDownloading] = useState(false);
    const [videoInfo, setVideoInfo] = useState<VideoInfo | null>(null);
    const [selectedFormat, setSelectedFormat] = useState<VideoFormat | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);
    const [showFormats, setShowFormats] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    // Close dropdown on outside click
    useEffect(() => {
        function handleClickOutside(e: MouseEvent) {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
                setShowFormats(false);
            }
        }
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleGetInfo = async () => {
        if (!videoUrl.trim()) {
            setError('Vui lòng dán link video vào ô bên trên');
            return;
        }

        setIsLoading(true);
        setError(null);
        setVideoInfo(null);
        setSelectedFormat(null);

        try {
            const response = await fetch('/api/download', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url: videoUrl.trim(), action: 'info' })
            });

            const data = await response.json();
            if (data.success && data.data) {
                setVideoInfo(data.data);
                if (data.data.formats.length > 0) {
                    setSelectedFormat(data.data.formats[0]);
                }
            } else {
                setError(data.message || 'Không thể lấy thông tin video');
            }
        } catch (err) {
            setError('Lỗi kết nối máy chủ. Vui lòng thử lại.');
        } finally {
            setIsLoading(false);
        }
    };

    const handleDownload = async () => {
        if (!selectedFormat || !videoInfo) return;

        // TikTok formats have direct URL
        if (selectedFormat.url) {
            window.open(selectedFormat.url, '_blank');
            return;
        }

        // YouTube/Facebook need to get download URL
        setIsDownloading(true);
        try {
            const response = await fetch('/api/download', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    url: videoUrl.trim(),
                    action: 'download',
                    formatId: selectedFormat.formatId || selectedFormat.id
                })
            });

            const data = await response.json();
            if (data.success && data.downloadUrl) {
                window.open(data.downloadUrl, '_blank');
            } else {
                setError(data.message || 'Không thể tải video');
            }
        } catch (err) {
            setError('Lỗi kết nối máy chủ');
        } finally {
            setIsDownloading(false);
        }
    };

    const handleCopyLink = async () => {
        if (!selectedFormat?.url) return;
        await navigator.clipboard.writeText(selectedFormat.url);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const handleReset = () => {
        setVideoUrl('');
        setVideoInfo(null);
        setSelectedFormat(null);
        setError(null);
        inputRef.current?.focus();
    };

    const platformBadgeGradient = videoInfo ? getPlatformColor(videoInfo.platform) : '';

    return (
        <div className="downloader-root">
            {/* Animated background orbs */}
            <div className="bg-orbs">
                <div className="orb orb-1"></div>
                <div className="orb orb-2"></div>
                <div className="orb orb-3"></div>
            </div>

            <div className="container">
                {/* Header */}
                <header className="header">
                    <div className="logo-icon">
                        <Download size={32} strokeWidth={2.5} />
                    </div>
                    <h1 className="title">
                        SaveVid<span className="title-accent">.Pro</span>
                    </h1>
                    <p className="subtitle">
                        Tải video TikTok không watermark, YouTube, Facebook — chọn chất lượng tùy thích
                    </p>

                    {/* Platform badges */}
                    <div className="platform-badges">
                        <div className="platform-badge tiktok-badge">
                            {getPlatformIcon('tiktok')}
                            <span>TikTok</span>
                        </div>
                        <div className="platform-badge youtube-badge">
                            {getPlatformIcon('youtube')}
                            <span>YouTube</span>
                        </div>
                        <div className="platform-badge facebook-badge">
                            {getPlatformIcon('facebook')}
                            <span>Facebook</span>
                        </div>
                    </div>
                </header>

                {/* Search Box */}
                <div className="search-card">
                    <div className="search-inner">
                        <div className="input-wrapper">
                            <LinkIcon className="input-icon" size={20} />
                            <input
                                ref={inputRef}
                                type="text"
                                placeholder="Dán link video TikTok, YouTube hoặc Facebook..."
                                className="search-input"
                                value={videoUrl}
                                onChange={(e) => {
                                    setVideoUrl(e.target.value);
                                    setError(null);
                                }}
                                onKeyDown={(e) => e.key === 'Enter' && handleGetInfo()}
                                disabled={isLoading}
                            />
                            {videoUrl && (
                                <button className="clear-btn" onClick={handleReset} title="Xóa">
                                    ✕
                                </button>
                            )}
                        </div>
                        <button
                            onClick={handleGetInfo}
                            disabled={isLoading || !videoUrl.trim()}
                            className="search-btn"
                        >
                            {isLoading ? (
                                <Loader2 className="spin" size={22} />
                            ) : (
                                <>
                                    <Zap size={20} />
                                    <span>Lấy Video</span>
                                </>
                            )}
                        </button>
                    </div>

                    {error && (
                        <div className="error-box">
                            <AlertCircle className="error-icon" size={18} />
                            <p>{error}</p>
                        </div>
                    )}
                </div>

                {/* Loading Skeleton */}
                {isLoading && (
                    <div className="skeleton-card">
                        <div className="skeleton-thumb pulse"></div>
                        <div className="skeleton-info">
                            <div className="skeleton-line w70 pulse"></div>
                            <div className="skeleton-line w40 pulse"></div>
                            <div className="skeleton-line w90 pulse"></div>
                        </div>
                    </div>
                )}

                {/* Result Card */}
                {videoInfo && !isLoading && (
                    <div className="result-card fade-in-up">
                        <div className="result-layout">
                            {/* Thumbnail */}
                            <div className="thumb-wrapper">
                                {videoInfo.thumbnail ? (
                                    <img
                                        src={videoInfo.thumbnail}
                                        alt={videoInfo.title}
                                        className="thumb-img"
                                    />
                                ) : (
                                    <div className="thumb-placeholder">
                                        <Video size={48} />
                                    </div>
                                )}
                                <div className="thumb-overlay">
                                    <div className="play-btn-overlay">
                                        <Play size={28} fill="white" />
                                    </div>
                                </div>
                                {videoInfo.duration > 0 && (
                                    <span className="duration-badge">
                                        <Clock size={12} />
                                        {formatDuration(videoInfo.duration)}
                                    </span>
                                )}
                                <span className={`platform-tag bg-gradient-to-r ${platformBadgeGradient}`}>
                                    {getPlatformIcon(videoInfo.platform)}
                                    {videoInfo.platform}
                                </span>
                            </div>

                            {/* Info + Actions */}
                            <div className="info-section">
                                <div className="info-top">
                                    <div className="status-row">
                                        <CheckCircle2 size={16} className="status-icon" />
                                        <span>Sẵn sàng tải xuống</span>
                                    </div>
                                    <h2 className="video-title">
                                        {videoInfo.title || 'Video không có tiêu đề'}
                                    </h2>
                                    {videoInfo.author && (
                                        <p className="video-author">👤 {videoInfo.author}</p>
                                    )}
                                </div>

                                {/* Quality Selector */}
                                <div className="quality-section">
                                    <label className="quality-label">
                                        <Sparkles size={14} />
                                        Chọn chất lượng:
                                    </label>
                                    <div className="dropdown" ref={dropdownRef}>
                                        <button
                                            className="dropdown-trigger"
                                            onClick={() => setShowFormats(!showFormats)}
                                        >
                                            <span className="dropdown-value">
                                                {selectedFormat?.label || 'Chọn chất lượng...'}
                                            </span>
                                            <ChevronDown
                                                size={18}
                                                className={`dropdown-arrow ${showFormats ? 'rotated' : ''}`}
                                            />
                                        </button>
                                        {showFormats && (
                                            <div className="dropdown-menu">
                                                {videoInfo.formats.map((fmt) => (
                                                    <button
                                                        key={fmt.id}
                                                        className={`dropdown-item ${selectedFormat?.id === fmt.id ? 'active' : ''}`}
                                                        onClick={() => {
                                                            setSelectedFormat(fmt);
                                                            setShowFormats(false);
                                                        }}
                                                    >
                                                        {fmt.quality === 'Audio' ? (
                                                            <Music size={14} className="fmt-icon audio" />
                                                        ) : (
                                                            <Video size={14} className="fmt-icon" />
                                                        )}
                                                        <span>{fmt.label}</span>
                                                        {selectedFormat?.id === fmt.id && (
                                                            <CheckCircle2 size={14} className="check-icon" />
                                                        )}
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Action Buttons */}
                                <div className="action-buttons">
                                    <button
                                        onClick={handleDownload}
                                        disabled={!selectedFormat || isDownloading}
                                        className="download-btn"
                                    >
                                        {isDownloading ? (
                                            <Loader2 className="spin" size={20} />
                                        ) : (
                                            <Download size={20} />
                                        )}
                                        <span>{isDownloading ? 'Đang xử lý...' : 'TẢI XUỐNG'}</span>
                                    </button>
                                    {selectedFormat?.url && (
                                        <button onClick={handleCopyLink} className="copy-btn">
                                            {copied ? (
                                                <>
                                                    <CheckCircle2 size={18} />
                                                    <span>Đã sao chép!</span>
                                                </>
                                            ) : (
                                                <>
                                                    <Copy size={18} />
                                                    <span>Sao chép link</span>
                                                </>
                                            )}
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Features */}
                {!videoInfo && !isLoading && (
                    <div className="features-grid">
                        {[
                            {
                                icon: <Shield size={24} />,
                                title: 'Không Watermark',
                                desc: 'TikTok video sạch bóng logo, giữ nguyên chất lượng gốc HD.',
                                color: 'feature-tiktok'
                            },
                            {
                                icon: <Sparkles size={24} />,
                                title: 'Chọn Chất Lượng',
                                desc: 'Tự do chọn 360p, 720p, 1080p, 4K hoặc chỉ tải audio.',
                                color: 'feature-quality'
                            },
                            {
                                icon: <Zap size={24} />,
                                title: 'Siêu Nhanh',
                                desc: 'Xử lý link cực nhanh, tải xuống ngay không cần chờ đợi.',
                                color: 'feature-speed'
                            }
                        ].map((feature, i) => (
                            <div key={i} className={`feature-card ${feature.color}`}>
                                <div className="feature-icon-wrap">
                                    {feature.icon}
                                </div>
                                <h3>{feature.title}</h3>
                                <p>{feature.desc}</p>
                            </div>
                        ))}
                    </div>
                )}

                {/* Footer */}
                <footer className="footer">
                    <p>SaveVid.Pro — Tải video miễn phí từ mọi nền tảng 🚀</p>
                </footer>
            </div>
        </div>
    );
}
