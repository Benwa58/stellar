import { useState, useCallback, useMemo, useEffect } from 'react';
import { createUniverseShare } from '../api/authClient';
import '../styles/shareGalaxy.css';

function ShareUniverseDrawer({ onClose, canvasRef, universeLabel, universeData, overrideNodes, overrideLinks }) {
  const [mapName, setMapName] = useState(universeLabel || 'My Universe');
  const [shareUrl, setShareUrl] = useState(null);
  const [sharing, setSharing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copiedImage, setCopiedImage] = useState(false);
  const [copiedEmbed, setCopiedEmbed] = useState(false);
  const [thumbnailDataUrl, setThumbnailDataUrl] = useState(null);
  const [error, setError] = useState(null);

  const nodes = useMemo(() => overrideNodes || [], [overrideNodes]);
  const links = useMemo(() => overrideLinks || [], [overrideLinks]);

  // Capture thumbnail on mount
  useEffect(() => {
    const dataUrl = canvasRef.current?.captureImage({ watermark: true });
    if (dataUrl) setThumbnailDataUrl(dataUrl);
  }, [canvasRef]);

  // Compress canvas to a smaller JPEG thumbnail for OG images
  const compressThumbnail = useCallback(() => {
    const canvas = canvasRef.current?.captureImage ? canvasRef.current : null;
    if (!canvas) return null;
    const sourceCanvas = document.querySelector('canvas');
    if (!sourceCanvas) return null;
    try {
      const maxW = 1200;
      const maxH = 630;
      const scale = Math.min(maxW / sourceCanvas.width, maxH / sourceCanvas.height, 1);
      const offscreen = document.createElement('canvas');
      offscreen.width = Math.round(sourceCanvas.width * scale);
      offscreen.height = Math.round(sourceCanvas.height * scale);
      const ctx = offscreen.getContext('2d');
      ctx.drawImage(sourceCanvas, 0, 0, offscreen.width, offscreen.height);
      // Add watermark
      ctx.font = "600 14px 'Space Grotesk', sans-serif";
      ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
      ctx.textAlign = 'right';
      ctx.fillText('Stellar', offscreen.width - 16, offscreen.height - 12);
      return offscreen.toDataURL('image/jpeg', 0.7);
    } catch {
      return null;
    }
  }, [canvasRef]);

  // Create share link
  const handleCreateShare = useCallback(async () => {
    if (nodes.length === 0) return;
    setSharing(true);
    setError(null);
    try {
      const compressedThumb = compressThumbnail();

      const res = await createUniverseShare({
        mapName: mapName.trim() || 'My Universe',
        universeData,
        nodeCount: nodes.length,
        linkCount: links.length,
        thumbnail: compressedThumb,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Share failed');

      const fullUrl = `${window.location.origin}/universe/${data.id}`;
      setShareUrl(fullUrl);
      try {
        await navigator.clipboard.writeText(fullUrl);
      } catch {}
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    } catch (err) {
      console.warn('Share failed:', err.message);
      setError(err.message || 'Something went wrong. Please try again.');
    } finally {
      setSharing(false);
    }
  }, [nodes, links, mapName, universeData, compressThumbnail]);

  // Copy share link
  const handleCopyLink = useCallback(async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = shareUrl;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [shareUrl]);

  // Native share (mobile)
  const handleNativeShare = useCallback(async () => {
    if (!shareUrl) return;
    if (navigator.share) {
      try {
        await navigator.share({ title: mapName, url: shareUrl });
      } catch {}
    }
  }, [shareUrl, mapName]);

  // Copy image
  const handleCopyImage = useCallback(async () => {
    const dataUrl = canvasRef.current?.captureImage({ watermark: true });
    if (!dataUrl) return;
    try {
      const blob = await (await fetch(dataUrl)).blob();
      await navigator.clipboard.write([
        new ClipboardItem({ 'image/png': blob }),
      ]);
      setCopiedImage(true);
      setTimeout(() => setCopiedImage(false), 2000);
    } catch {
      // Fallback: download as file
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = `${mapName.replace(/[^a-zA-Z0-9 ]/g, '').replace(/\s+/g, '_')}_universe.png`;
      a.click();
    }
  }, [canvasRef, mapName]);

  // Copy embed code
  const handleCopyEmbed = useCallback(async () => {
    if (!shareUrl) return;
    const embedCode = `<iframe src="${shareUrl}" width="600" height="400" frameborder="0" style="border-radius:12px;border:1px solid rgba(255,255,255,0.1);" allowfullscreen></iframe>`;
    try {
      await navigator.clipboard.writeText(embedCode);
    } catch {}
    setCopiedEmbed(true);
    setTimeout(() => setCopiedEmbed(false), 2000);
  }, [shareUrl]);

  return (
    <div className="share-galaxy-drawer">
      <button className="share-galaxy-drawer-close" onClick={onClose}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>

      <div className="share-galaxy-drawer-content">
        {/* Header */}
        <div className="share-galaxy-header">
          <h3 className="share-galaxy-title">Share My Universe</h3>
          <input
            className="share-galaxy-name-input"
            type="text"
            value={mapName}
            onChange={(e) => setMapName(e.target.value)}
            maxLength={80}
            placeholder="Universe name"
          />
          <div className="share-galaxy-meta">
            {nodes.length} artist{nodes.length !== 1 ? 's' : ''} &middot; {links.length} connection{links.length !== 1 ? 's' : ''}
          </div>
        </div>

        {/* Preview thumbnail */}
        {thumbnailDataUrl && (
          <div className="share-galaxy-preview">
            <img src={thumbnailDataUrl} alt="Universe preview" />
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="share-galaxy-error">{error}</div>
        )}

        {/* Actions */}
        <div className="share-galaxy-actions">
          {/* Primary CTA */}
          {!shareUrl ? (
            <button
              className="share-galaxy-action-btn primary"
              onClick={handleCreateShare}
              disabled={sharing || nodes.length === 0}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
                <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
              </svg>
              {sharing ? 'Creating link...' : 'Create Share Link'}
            </button>
          ) : (
            <>
              {/* URL display */}
              <div className="share-galaxy-url-row">
                <input
                  className="share-galaxy-url-input"
                  type="text"
                  value={shareUrl}
                  readOnly
                  onClick={(e) => e.target.select()}
                />
                <button
                  className="share-galaxy-url-copy"
                  onClick={handleCopyLink}
                  title="Copy link"
                >
                  {copied ? (
                    <svg viewBox="0 0 24 24" fill="none" stroke="#4ade80" strokeWidth="2.5" width="14" height="14">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  ) : (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
                      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                    </svg>
                  )}
                </button>
                <a className="share-galaxy-url-open" href={shareUrl} target="_blank" rel="noopener noreferrer">
                  Open
                </a>
              </div>

              {/* Secondary actions */}
              {typeof navigator.share === 'function' && (
                <button className="share-galaxy-action-btn" onClick={handleNativeShare}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
                    <circle cx="18" cy="5" r="3" />
                    <circle cx="6" cy="12" r="3" />
                    <circle cx="18" cy="19" r="3" />
                    <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
                    <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
                  </svg>
                  Share...
                </button>
              )}

              <button className="share-galaxy-action-btn" onClick={handleCopyImage}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                  <circle cx="8.5" cy="8.5" r="1.5" />
                  <polyline points="21 15 16 10 5 21" />
                </svg>
                {copiedImage ? 'Copied!' : 'Copy Image'}
              </button>

              <button className="share-galaxy-action-btn" onClick={handleCopyEmbed}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
                  <polyline points="16 18 22 12 16 6" />
                  <polyline points="8 6 2 12 8 18" />
                </svg>
                {copiedEmbed ? 'Copied!' : 'Copy Embed'}
              </button>
            </>
          )}
        </div>
      </div>

      {copied && <div className="share-galaxy-toast">Link copied!</div>}
    </div>
  );
}

export default ShareUniverseDrawer;
