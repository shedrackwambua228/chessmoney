import { useEffect, useState, type FormEvent } from 'react'
import { Crown, Puzzle, Swords } from 'lucide-react'
import App from './App'
import { api, ApiError } from './api'

type User = { id: string; name: string }

export default function AccessGate() {
  const [user, setUser] = useState<User | null | undefined>(undefined)
  const [register, setRegister] = useState(false)
  const [verificationEmail, setVerificationEmail] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [registeredUsers, setRegisteredUsers] = useState<number | null>(null)
  useEffect(() => { api<{ user: User }>('/auth/me').then(result => setUser(result.user)).catch(() => setUser(null)) }, [])
  useEffect(() => { api<{ registeredUsers: number }>('/auth/stats').then(result => setRegisteredUsers(result.registeredUsers)).catch(() => setRegisteredUsers(null)) }, [])
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(''); setMessage('')
    const form = new FormData(event.currentTarget)
    try {
      if (verificationEmail) {
        const result = await api<{ user: User }>('/auth/verify-email', { method: 'POST', body: JSON.stringify({ email: verificationEmail, code: form.get('code') }) })
        setUser(result.user)
      } else if (register) {
        const email = String(form.get('email') ?? '')
        await api('/auth/register', { method: 'POST', body: JSON.stringify({ name: form.get('name'), email, password: form.get('password') }) })
        setVerificationEmail(email); setMessage('We sent a six-digit verification code to your email.')
      } else {
        const result = await api<{ user: User }>('/auth/login', { method: 'POST', body: JSON.stringify({ email: form.get('email'), password: form.get('password') }) })
        setUser(result.user)
      }
    } catch (caught) { setError(caught instanceof ApiError ? caught.message : 'Please try again.') } finally { setBusy(false) }
  }
  if (user) return <App />
  if (user === undefined) return <main className="access-gate"><p>Loading MoChess…</p></main>
  return <main className="access-gate"><div className="access-layout"><section className="access-intro"><a className="access-brand" href="#top"><span><Crown size={20} /></span>mochess.</a><p className="section-kicker">A FRIENDLIER WAY TO PLAY</p><h1>Every move is a new beginning.</h1><p className="access-lede">A free home for focused games, sharp tactics, and a little more joy in your chess.</p><div className="access-features"><article><Swords size={19} /><div><strong>Play online</strong><span>Meet players and keep your games together.</span></div></article><article><Puzzle size={19} /><div><strong>Solve &amp; improve</strong><span>Build your tactical eye with puzzles and lessons.</span></div></article><article><Crown size={19} /><div><strong>Your chess, saved</strong><span>Pick up your progress from any session.</span></div></article></div>{registeredUsers !== null && <p className="access-community">Join <strong>{registeredUsers.toLocaleString()}</strong> verified players already in the club.</p>}</section><section className="surface access-card" id="top"><span className="section-kicker">{verificationEmail ? 'ONE LAST STEP' : register ? 'JOIN THE CLUB' : 'WELCOME BACK'}</span><h2>{verificationEmail ? 'Check your inbox' : register ? 'Create your MoChess account' : 'Sign in and make your move'}</h2><p>{verificationEmail ? `Enter the six-digit code sent to ${verificationEmail}.` : register ? 'Create a free account to play, learn, and save your progress.' : 'Sign in to continue to your boards, games, and progress.'}</p>{message && <p role="status" className="access-message">{message}</p>}{error && <p role="alert" className="storage-notice">{error}</p>}<form onSubmit={submit}>{verificationEmail ? <><label>Verification code<input name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" required maxLength={6} autoFocus /></label><button className="primary-action" disabled={busy}>{busy ? 'Verifying…' : 'Verify email'}</button><button className="secondary-action" type="button" disabled={busy} onClick={() => void api('/auth/resend-verification', { method: 'POST', body: JSON.stringify({ email: verificationEmail }) }).then(() => setMessage('A new code was sent.')).catch(value => setError(value instanceof Error ? value.message : 'Could not resend code.'))}>Resend code</button></> : <>{register && <label>Player name<input name="name" required minLength={2} maxLength={32} autoComplete="nickname" autoFocus /></label>}<label>Email<input name="email" type="email" required autoComplete="email" autoFocus={!register} /></label><label>Password<input name="password" type="password" required minLength={10} autoComplete={register ? 'new-password' : 'current-password'} /></label><button className="primary-action" disabled={busy}>{busy ? 'Please wait…' : register ? 'Create free account' : 'Sign in'}</button><p className="access-switch">{register ? 'Already have an account?' : 'New to MoChess?'} <button type="button" disabled={busy} onClick={() => { setRegister(value => !value); setError('') }}>{register ? 'Sign in' : 'Create an account'}</button></p></>}</form></section></div></main>
}
