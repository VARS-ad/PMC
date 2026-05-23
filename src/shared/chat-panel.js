// ==================== CHAT PANEL ====================
const ChatPanel = ({ currentUser, onClose, isMinimized, setIsMinimized }) => {
  const { data, setData, showToast } = useApp();
  const [selectedRoomId, setSelectedRoomId] = useState(null);
  const [messageText, setMessageText] = useState('');
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [data.chatMessages, selectedRoomId]);

  const currentRoom = data.chatRooms?.find(r => r.id === selectedRoomId);
  const currentRoomMessages = data.chatMessages?.filter(m => m.roomId === selectedRoomId) || [];

  const handleSendMessage = () => {
    if (!messageText.trim() || !selectedRoomId) return;

    const newMessage = {
      id: Date.now(),
      roomId: selectedRoomId,
      senderId: currentUser.id || 'user-' + currentUser.name,
      senderName: currentUser.name,
      senderRole: currentUser.role,
      text: messageText,
      timestamp: new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Dubai' }),
      read: false
    };

    setData(prev => ({
      ...prev,
      chatMessages: [...prev.chatMessages, newMessage],
      chatRooms: prev.chatRooms.map(room =>
        room.id === selectedRoomId
          ? { ...room, lastMessage: messageText, lastMessageTime: newMessage.timestamp, unreadCount: 0 }
          : room
      )
    }));

    setMessageText('');
  };

  const unreadCount = data.chatRooms?.reduce((sum, room) => sum + (room.unreadCount || 0), 0) || 0;

  if (isMinimized) {
    return (
      <div style={{position:'fixed',bottom:20,right:20,zIndex:500,background:'var(--bg-warm)',borderRadius:'50%',width:56,height:56,display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',boxShadow:'0 4px 12px rgba(0,0,0,0.15)'}}>
        <button onClick={() => setIsMinimized(false)} style={{background:'none',border:'none',cursor:'pointer',fontSize:24,color:'#fff'}}>
          💬
        </button>
        {unreadCount > 0 && (
          <div style={{position:'absolute',top:0,right:0,background:'#8b4a42',color:'#fff',borderRadius:'50%',width:24,height:24,display:'flex',alignItems:'center',justifyContent:'center',fontSize:11,fontWeight:'700'}}>{unreadCount > 9 ? '9+' : unreadCount}</div>
        )}
      </div>
    );
  }

  return (
    <div style={{position:'fixed',bottom:0,right:0,width:360,height:600,background:'var(--bg-surface)',borderRadius:'14px 14px 0 0',boxShadow:'0 -4px 24px rgba(0,0,0,0.15)',display:'flex',flexDirection:'column',zIndex:500}}>
      {/* Header */}
      <div style={{padding:'16px',borderBottom:'1px solid var(--border-light)',display:'flex',justifyContent:'space-between',alignItems:'center',background:'var(--bg-card)'}}>
        <div style={{fontSize:14,fontWeight:600,color:'var(--text-dark)'}}>{t('sec.messages')}</div>
        <div style={{display:'flex',gap:8}}>
          <button onClick={() => setIsMinimized(true)} style={{background:'none',border:'none',cursor:'pointer',fontSize:16,color:'var(--text-muted)',padding:0}}>−</button>
          <button onClick={onClose} style={{background:'none',border:'none',cursor:'pointer',fontSize:16,color:'var(--text-muted)',padding:0}}>×</button>
        </div>
      </div>

      {/* Room list / Chat view */}
      {!selectedRoomId ? (
        <div style={{flex:1,overflowY:'auto'}}>
          {(data.chatRooms || []).length === 0 ? (
            <div style={{padding:24,textAlign:'center',color:'var(--text-muted)',fontSize:13}}>
              No conversations yet. Start chatting!
            </div>
          ) : (
            (data.chatRooms || []).map(room => (
              <div key={room.id} onClick={() => setSelectedRoomId(room.id)} style={{padding:'12px 16px',borderBottom:'1px solid var(--border-light)',cursor:'pointer',background:'#fff',transition:'background 0.2s'}}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:6}}>
                  <div style={{fontSize:13,fontWeight:500,color:'var(--text-dark)'}}>
                    {room.participants.filter(p => p.name !== currentUser.name).map(p => p.name).join(', ')}
                  </div>
                  <div style={{fontSize:11,color:'var(--text-muted)'}}>{room.lastMessageTime}</div>
                </div>
                <div style={{fontSize:12,color:'var(--text-secondary)',marginBottom:6,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{room.lastMessage}</div>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                  <div style={{fontSize:10,color:'var(--text-muted)'}}>
                    {room.participants.filter(p => p.name !== currentUser.name).map(p => p.role).join(', ')}
                  </div>
                  {room.unreadCount > 0 && (
                    <div style={{background:'var(--bg-warm-dark)',color:'#fff',borderRadius:'50%',width:18,height:18,display:'flex',alignItems:'center',justifyContent:'center',fontSize:10,fontWeight:'600'}}>{room.unreadCount}</div>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      ) : (
        <>
          {/* Chat messages */}
          <div style={{flex:1,overflowY:'auto',padding:'16px',background:'#fafafa',display:'flex',flexDirection:'column'}}>
            <div style={{fontSize:12,fontWeight:500,color:'var(--text-muted)',textAlign:'center',marginBottom:16}}>
              {currentRoom?.participants.filter(p => p.name !== currentUser.name).map(p => `${p.name} (${p.role})`).join(', ')}
            </div>
            {currentRoomMessages.length === 0 ? (
              <div style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center',color:'var(--text-muted)',fontSize:13}}>
                No messages yet. Start the conversation!
              </div>
            ) : (
              currentRoomMessages.map(msg => (
                <div key={msg.id} style={{marginBottom:12,display:'flex',justifyContent:msg.senderId === (currentUser.id || 'user-' + currentUser.name) ? 'flex-end' : 'flex-start'}}>
                  <div style={{maxWidth:'80%',padding:'10px 12px',borderRadius:'12px',background:msg.senderId === (currentUser.id || 'user-' + currentUser.name) ? 'var(--bg-warm-light)' : '#fff',border:msg.senderId === (currentUser.id || 'user-' + currentUser.name) ? 'none' : '1px solid var(--border-light)',boxShadow:'0 1px 3px rgba(0,0,0,0.08)'}}>
                    <div style={{fontSize:11,fontWeight:500,color:'var(--text-secondary)',marginBottom:4}}>{msg.senderName}</div>
                    <div style={{fontSize:13,color:'var(--text-dark)',marginBottom:4,wordWrap:'break-word'}}>{msg.text}</div>
                    <div style={{fontSize:10,color:'var(--text-muted)',textAlign:'right'}}>
                      {msg.timestamp} {msg.read && '✓'}
                    </div>
                  </div>
                </div>
              ))
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div style={{padding:'12px 16px',borderTop:'1px solid var(--border-light)',background:'var(--bg-card)',display:'flex',gap:8}}>
            <input
              type="text"
              value={messageText}
              onChange={e => setMessageText(e.target.value)}
              onKeyPress={e => e.key === 'Enter' && handleSendMessage()}
              placeholder="Type a message..."
              style={{flex:1,padding:'10px 12px',border:'1px solid var(--border-light)',borderRadius:'20px',fontSize:12,fontFamily:'inherit',outline:'none',background:'#fff'}}
            />
            <button onClick={handleSendMessage} style={{background:'var(--bg-warm-dark)',color:'#fff',border:'none',borderRadius:'50%',width:36,height:36,display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',fontSize:14}}>
              →
            </button>
          </div>
        </>
      )}

      {/* Back button when viewing chat */}
      {selectedRoomId && (
        <div style={{position:'absolute',top:16,left:16}}>
          <button onClick={() => setSelectedRoomId(null)} style={{background:'none',border:'none',cursor:'pointer',fontSize:20,color:'var(--text-dark)'}}>
            ‹
          </button>
        </div>
      )}
    </div>
  );
};


