import { useState, useEffect } from 'react'

function App() {
  const [message, setMessage] = useState('')
  const [reply, setReply] = useState('')
  const [loading, setLoading] = useState(false)
  const [user, setUser] = useState(null)
  const [checking, setChecking] = useState(true)

useEffect(() => {
    fetch(`${import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001'}/me`, { credentials: 'include' })
      .then(res => res.json())
      .then(data => {
        if (data.loggedIn) setUser(data.user)
        setChecking(false)
      })
      .catch(() => {
        setChecking(false)
      })
  }, [])

  const sendCommand = async () => {
    if (!message.trim()) return
    setLoading(true)
    setReply('')

    try {
      const response = await fetch(`${import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001'}/command`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ message })
      })
      const data = await response.json()
      setReply(data.reply)
    } catch (error) {
      setReply('Error connecting to backend.')
    }

    setLoading(false)
  }

  if (checking) {
    return (
      <div style={{ maxWidth: '600px', margin: '60px auto', fontFamily: 'sans-serif', padding: '0 20px' }}>
        <p style={{ color: '#888' }}>Loading...</p>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: '600px', margin: '60px auto', fontFamily: 'sans-serif', padding: '0 20px' }}>
      <h1 style={{ fontSize: '28px', fontWeight: '500', marginBottom: '8px' }}>Delegate</h1>
      <p style={{ color: '#888', marginBottom: '32px' }}>Act on my behalf. Not in my place.</p>

      {!user ? (
        <div>
          <p style={{ color: '#444', marginBottom: '16px' }}>Sign in to start delegating your digital life.</p>
          <a href={`${import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001'}/login`}>
            <button style={{ padding: '12px 24px', borderRadius: '8px', background: '#534AB7', color: '#fff', border: 'none', fontSize: '14px', cursor: 'pointer' }}>
              Sign in with Auth0
            </button>
          </a>
        </div>
      ) : (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <img src={user.picture} alt="avatar" style={{ width: '32px', height: '32px', borderRadius: '50%' }} />
              <span style={{ fontSize: '14px', color: '#444' }}>Hi, {user.name.split(' ')[0]}</span>
            </div>
            <a href={`${import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001'}/logout`} style={{ fontSize: '13px', color: '#888', textDecoration: 'none' }}>Sign out</a>
          </div>

          <div style={{ display: 'flex', gap: '8px', marginBottom: '24px' }}>
            <input
              type="text"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && sendCommand()}
              placeholder="Type a command e.g. prep me for tomorrow..."
              style={{ flex: 1, padding: '10px 14px', borderRadius: '8px', border: '1px solid #ddd', fontSize: '14px' }}
            />
            <button
              onClick={sendCommand}
              disabled={loading}
              style={{ padding: '10px 20px', borderRadius: '8px', background: '#534AB7', color: '#fff', border: 'none', fontSize: '14px', cursor: 'pointer' }}
            >
              {loading ? '...' : 'Send'}
            </button>
          </div>

          {reply && (
            <div style={{ background: '#f5f5f5', borderRadius: '8px', padding: '16px', fontSize: '14px', color: '#333', lineHeight: '1.6' }}>
              {reply}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default App