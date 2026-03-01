import { useState, useRef } from 'react';
import { useAuth, useAuthActions } from '../../state/AuthContext';
import { getAvatarUrl } from '../../api/authClient';
import '../../styles/auth.css';

function EditProfileModal({ onClose }) {
  const { user } = useAuth();
  const { updateProfile, uploadAvatar, deleteAvatar } = useAuthActions();

  const [displayName, setDisplayName] = useState(user.displayName || '');
  const [email, setEmail] = useState(user.email || '');
  const [avatarPreview, setAvatarPreview] = useState(null);
  const [avatarBase64, setAvatarBase64] = useState(null);
  const [removeAvatar, setRemoveAvatar] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const fileInputRef = useRef(null);

  const initials = user.displayName
    .split(' ')
    .map((n) => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  // Determine what to show in the avatar preview
  const currentAvatarSrc = removeAvatar
    ? null
    : avatarPreview || (user.hasAvatar ? `${getAvatarUrl(user.id)}?t=${Date.now()}` : null);

  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setError('Please select an image file.');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setError('Image must be under 5MB.');
      return;
    }

    setError('');
    setRemoveAvatar(false);

    // Resize to 256x256 on a canvas
    const img = new Image();
    const reader = new FileReader();
    reader.onload = (ev) => {
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const size = 256;
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');

        // Crop to square from center
        const minDim = Math.min(img.width, img.height);
        const sx = (img.width - minDim) / 2;
        const sy = (img.height - minDim) / 2;
        ctx.drawImage(img, sx, sy, minDim, minDim, 0, 0, size, size);

        const base64 = canvas.toDataURL('image/png');
        setAvatarPreview(base64);
        setAvatarBase64(base64);
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveAvatar = () => {
    setAvatarPreview(null);
    setAvatarBase64(null);
    setRemoveAvatar(true);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setSaving(true);

    try {
      // Update avatar if changed
      if (avatarBase64) {
        await uploadAvatar(avatarBase64);
      } else if (removeAvatar && user.hasAvatar) {
        await deleteAvatar();
      }

      // Update profile fields if changed
      const changes = {};
      if (displayName.trim() !== user.displayName) changes.displayName = displayName.trim();
      if (email.trim().toLowerCase() !== (user.email || '').toLowerCase()) changes.email = email.trim();

      if (Object.keys(changes).length > 0) {
        await updateProfile(changes);
      }

      setSuccess('Profile updated!');
      // Reset avatar change tracking
      setAvatarBase64(null);
      setRemoveAvatar(false);

      setTimeout(() => onClose(), 1200);
    } catch (err) {
      setError(err.message || 'Failed to update profile.');
    } finally {
      setSaving(false);
    }
  };

  const hasChanges =
    displayName.trim() !== user.displayName ||
    email.trim().toLowerCase() !== (user.email || '').toLowerCase() ||
    avatarBase64 !== null ||
    (removeAvatar && user.hasAvatar);

  return (
    <div className="auth-modal-overlay" onClick={onClose}>
      <div className="auth-modal edit-profile-modal" onClick={(e) => e.stopPropagation()}>
        <button className="auth-modal-close" onClick={onClose}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>

        <h2 className="auth-modal-title">Edit Profile</h2>

        <form className="auth-form" onSubmit={handleSubmit}>
          {/* Avatar section */}
          <div className="edit-profile-avatar-section">
            <button
              type="button"
              className="edit-profile-avatar-btn"
              onClick={() => fileInputRef.current?.click()}
            >
              {currentAvatarSrc ? (
                <img src={currentAvatarSrc} alt="Avatar" className="edit-profile-avatar-img" />
              ) : (
                <span className="edit-profile-avatar-initials">{initials}</span>
              )}
              <div className="edit-profile-avatar-overlay">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="20" height="20">
                  <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" />
                  <circle cx="12" cy="13" r="4" />
                </svg>
              </div>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileSelect}
              style={{ display: 'none' }}
            />
            <div className="edit-profile-avatar-actions">
              <button
                type="button"
                className="edit-profile-photo-btn"
                onClick={() => fileInputRef.current?.click()}
              >
                {currentAvatarSrc ? 'Change Photo' : 'Upload Photo'}
              </button>
              {(currentAvatarSrc || avatarBase64) && !removeAvatar && (
                <button
                  type="button"
                  className="edit-profile-remove-btn"
                  onClick={handleRemoveAvatar}
                >
                  Remove
                </button>
              )}
            </div>
          </div>

          {/* Display Name */}
          <div className="auth-field">
            <label className="auth-label">Display Name</label>
            <input
              className="auth-input"
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              maxLength={50}
            />
          </div>

          {/* Email */}
          <div className="auth-field">
            <label className="auth-label">Email</label>
            <input
              className="auth-input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          {/* Username (read-only) */}
          <div className="auth-field">
            <label className="auth-label">Username</label>
            <div className="edit-profile-username-display">@{user.username}</div>
          </div>

          {error && <div className="auth-error">{error}</div>}
          {success && <div className="edit-profile-success">{success}</div>}

          <button
            type="submit"
            className="auth-submit-btn"
            disabled={saving || !hasChanges}
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </form>
      </div>
    </div>
  );
}

export default EditProfileModal;
