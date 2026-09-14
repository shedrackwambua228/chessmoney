import { useEffect, useState, type FormEvent } from 'react'
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
  return <main className="access-gate"><section className="surface access-card"><span className="section-kicker">WELCOME TO MOCHESS</span><h1>Play chess. Learn together.</h1><p>MoChess is free to play, with online games, puzzles, lessons, and a community of chess lovers.</p>{registeredUsers !== null && <p className="muted">Join {registeredUsers.toLocaleString()} verified players.</p>}{message && <p role="status">{message}</p>}{error && <p role="alert" className="storage-notice">{error}</p>}<form onSubmit={submit}>{verificationEmail ? <><label>Verification code<input name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" required maxLength={6} /></label><button className="primary-action" disabled={busy}>{busy ? 'Verifying…' : 'Verify email'}</button><button className="secondary-action" type="button" disabled={busy} onClick={() => void api('/auth/resend-verification', { method: 'POST', body: JSON.stringify({ email: verificationEmail }) }).then(() => setMessage('A new code was sent.')).catch(value => setError(value instanceof Error ? value.message : 'Could not resend code.'))}>Resend code</button></> : <><h2>{register ? 'Create your account' : 'Sign in to play'}</h2>{register && <label>Player name<input name="name" required minLength={2} maxLength={32} /></label>}<label>Email<input name="email" type="email" required autoComplete="email" /></label><label>Password<input name="password" type="password" required minLength={10} autoComplete={register ? 'new-password' : 'current-password'} /></label><button className="primary-action" disabled={busy}>{busy ? 'Please wait…' : register ? 'Create account' : 'Sign in'}</button><button className="secondary-action" type="button" disabled={busy} onClick={() => { setRegister(value => !value); setError('') }}>{register ? 'Already registered? Sign in' : 'Create an account'}</button></>}</form></section></main>
}
