import { useState } from 'react';
import { useAuth, useAuthActions } from '../state/AuthContext';
import AddFriendModal from './AddFriendModal';
import '../styles/friends.css';

function FriendsSection() {
  const { user, friends, friendRequests } = useAuth();
  const { acceptFriend, rejectFriend, removeFriend, showAuthModal } = useAuthActions();
  const [showAddModal, setShowAddModal] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(null);
  const [activeTab, setActiveTab] = useState('friends'); // 'friends' | 'requests'

  const handleRemoveFriend = () => {
    if (confirmRemove) {
      removeFriend(confirmRemove.id);
      setConfirmRemove(null);
    }
  };

  return (
    <div className="friends-section">
      <h3 className="friends-title">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="16" height="16">
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
        Friends
        {user && friends.length > 0 && (
          <span className="section-count">{friends.length}</span>
        )}
        {user && friendRequests.length > 0 && (
          <button
            className="friends-requests-badge"
            onClick={() => setActiveTab('requests')}
            title={`${friendRequests.length} pending request${friendRequests.length !== 1 ? 's' : ''}`}
          >
            {friendRequests.length}
          </button>
        )}
        {user && (
          <button
            className="friends-add-btn"
            onClick={() => setShowAddModal(true)}
            title="Add friend"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </button>
        )}
      </h3>

      {/* Signed out */}
      {!user && (
        <div className="friends-scroll">
          <button
            className="section-placeholder-card"
            onClick={() => showAuthModal('register')}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="20" height="20">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
            <span className="section-placeholder-text">Sign in to add friends</span>
          </button>
        </div>
      )}

      {/* Signed in — tab bar for friends vs requests */}
      {user && (friendRequests.length > 0 || friends.length > 0) && (
        <>
          {friendRequests.length > 0 && (
            <div className="friends-tabs">
              <button
                className={`friends-tab ${activeTab === 'friends' ? 'active' : ''}`}
                onClick={() => setActiveTab('friends')}
              >
                Friends{friends.length > 0 ? ` (${friends.length})` : ''}
              </button>
              <button
                className={`friends-tab ${activeTab === 'requests' ? 'active' : ''}`}
                onClick={() => setActiveTab('requests')}
              >
                Requests ({friendRequests.length})
              </button>
            </div>
          )}

          {/* Friend requests */}
          {activeTab === 'requests' && friendRequests.length > 0 && (
            <div className="friends-list">
              {friendRequests.map((req) => (
                <div key={req.id} className="friend-request-card">
                  <div className="friend-card-avatar">
                    {req.displayName?.charAt(0) || '?'}
                  </div>
                  <div className="friend-card-info">
                    <span className="friend-card-name">{req.displayName}</span>
                    <span className="friend-card-username">@{req.username}</span>
                  </div>
                  <div className="friend-request-actions">
                    <button
                      className="friend-accept-btn"
                      onClick={() => acceptFriend(req.id)}
                      title="Accept"
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="14" height="14">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    </button>
                    <button
                      className="friend-reject-btn"
                      onClick={() => rejectFriend(req.id)}
                      title="Decline"
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
                        <line x1="18" y1="6" x2="6" y2="18" />
                        <line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Friends list */}
          {activeTab === 'friends' && friends.length > 0 && (
            <div className="friends-scroll">
              {friends.map((friend) => (
                <div key={friend.id} className="friend-card">
                  <div className="friend-card-main">
                    <div className="friend-card-avatar">
                      {friend.displayName?.charAt(0) || '?'}
                    </div>
                    <span className="friend-card-name-small">{friend.displayName}</span>
                    {friend.username && (
                      <span className="friend-card-username-small">@{friend.username}</span>
                    )}
                  </div>
                  <button
                    className="friend-card-remove"
                    onClick={() => setConfirmRemove(friend)}
                    title="Remove friend"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Active tab is friends but none yet */}
          {activeTab === 'friends' && friends.length === 0 && (
            <div className="friends-scroll">
              <div className="section-placeholder-card empty">
                <span className="section-placeholder-text">No friends yet</span>
              </div>
            </div>
          )}
        </>
      )}

      {/* No friends and no requests */}
      {user && friends.length === 0 && friendRequests.length === 0 && (
        <div className="friends-scroll">
          <div className="section-placeholder-card empty">
            <span className="section-placeholder-text">Add friends by username</span>
          </div>
        </div>
      )}

      {showAddModal && <AddFriendModal onClose={() => setShowAddModal(false)} />}

      {confirmRemove && (
        <div className="auth-modal-overlay" onClick={(e) => e.target === e.currentTarget && setConfirmRemove(null)}>
          <div className="confirm-remove-modal">
            <p className="confirm-remove-text">
              Remove <strong>{confirmRemove.displayName}</strong> as a friend?
            </p>
            <div className="confirm-remove-actions">
              <button className="confirm-remove-cancel" onClick={() => setConfirmRemove(null)}>
                Cancel
              </button>
              <button className="confirm-remove-confirm" onClick={handleRemoveFriend}>
                Remove
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default FriendsSection;
