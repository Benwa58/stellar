import { useState, useEffect, useRef } from 'react';
import { useAuth, useAuthActions } from '../state/AuthContext';
import { searchUsers } from '../api/friendsClient';
import '../styles/friends.css';

function AddFriendModal({ onClose }) {
  const { friends, friendRequests } = useAuth();
  const { sendFriendRequest } = useAuthActions();

  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [sending, setSending] = useState(null);
  const [sentIds, setSentIds] = useState(new Set());
  const [error, setError] = useState('');
  const timerRef = useRef(null);
  const inputRef = useRef(null);

  const friendIds = new Set(friends.map((f) => f.id));
  const requestIds = new Set(friendRequests.map((r) => r.id));

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!query || query.length < 2) {
      setResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(async () => {
      try {
        const res = await searchUsers(query);
        const data = await res.json();
        setResults(data.users || []);
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => clearTimeout(timerRef.current);
  }, [query]);

  const handleSend = async (user) => {
    setError('');
    setSending(user.id);
    try {
      await sendFriendRequest(user.username);
      setSentIds((prev) => new Set([...prev, user.id]));
    } catch (err) {
      setError(err.message);
    } finally {
      setSending(null);
    }
  };

  return (
    <div className="auth-modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="add-friend-modal">
        <button className="auth-modal-close" onClick={onClose}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>

        <h2 className="add-friend-title">Add Friend</h2>
        <p className="add-friend-desc">Search by username to send a friend request.</p>

        <div className="add-friend-search-wrapper">
          <svg className="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            ref={inputRef}
            className="add-friend-search-input"
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ''))}
            placeholder="Search username..."
            maxLength={20}
            autoComplete="off"
          />
          {searching && (
            <div className="search-spinner">
              <svg viewBox="0 0 24 24" width="16" height="16" className="spinner-svg">
                <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray="31.4 31.4" strokeLinecap="round" />
              </svg>
            </div>
          )}
        </div>

        {error && <div className="add-friend-error">{error}</div>}

        <div className="add-friend-results">
          {results.map((user) => {
            const isFriend = friendIds.has(user.id);
            const isPending = requestIds.has(user.id);
            const isSent = sentIds.has(user.id);
            const isSending = sending === user.id;

            return (
              <div key={user.id} className="add-friend-result">
                <div className="add-friend-result-avatar">
                  {user.displayName?.charAt(0) || '?'}
                </div>
                <div className="add-friend-result-info">
                  <span className="add-friend-result-name">{user.displayName}</span>
                  <span className="add-friend-result-username">@{user.username}</span>
                </div>
                {isFriend ? (
                  <span className="add-friend-status friends">Friends</span>
                ) : isPending ? (
                  <span className="add-friend-status pending">Pending</span>
                ) : isSent ? (
                  <span className="add-friend-status sent">Sent</span>
                ) : (
                  <button
                    className="add-friend-send-btn"
                    onClick={() => handleSend(user)}
                    disabled={isSending}
                  >
                    {isSending ? '...' : 'Add'}
                  </button>
                )}
              </div>
            );
          })}

          {!searching && query.length >= 2 && results.length === 0 && (
            <div className="add-friend-empty">No users found</div>
          )}

          {!query && (
            <div className="add-friend-hint">Type a username to search</div>
          )}
        </div>
      </div>
    </div>
  );
}

export default AddFriendModal;
