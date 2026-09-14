import { useEffect, useState, type FormEvent } from 'react'
import { ArrowUpRight, BookOpen, CircleDot, Crown, Puzzle, Swords } from 'lucide-react'
import { Chess } from 'chess.js'
import ChessBoard from './ChessBoard'
import App from './App'
import { api, ApiError } from './api'

type User = { id: string; name: string }
type Screen = 'sign-in' | 'register' | 'verify' | 'recover' | 'reset'
const landingGame = new Chess()

export default function AccessGate() {
  const [user, setUser] = useState<User | null | undefined>(undefined)
  const [screen, setScreen] = useState<Screen>('sign-in')
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [resendSeconds, setResendSeconds] = useState(0)

  useEffect(() => { api<{ user: User }>('/auth/me').then(result => setUser(result.user)).catch(() => setUser(null)) }, [])
  useEffect(() => {
    if (resendSeconds <= 0) return
    const timer = window.setInterval(() => setResendSeconds(value => Math.max(0, value - 1)), 1000)
    return () => window.clearInterval(timer)
  }, [resendSeconds])

  const title = screen === 'verify' ? 'One move left.' : screen === 'recover' ? 'Recover your account.' : screen === 'reset' ? 'Choose a new password.' : screen === 'register' ? 'Start your first game.' : 'Ready when you are.'
  const description = screen === 'verify' ? `Use the six-digit code sent to ${email}.` : screen === 'recover' ? 'Enter your verified account email and we’ll send a reset code.' : screen === 'reset' ? `Enter the code sent to ${email}, then choose a new password.` : screen === 'register' ? 'Create a free account. Your games, puzzles, and progress will be waiting.' : 'Sign in to pick up your next game, lesson, or puzzle.'

  async function requestResetCode(address: string) {
    await api('/auth/forgot-password', { method: 'POST', body: JSON.stringify({ email: address }) })
    setEmail(address); setResendSeconds(60)
    setMessage('If that account exists, a reset code is on its way.')
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(''); setMessage('')
    const form = new FormData(event.currentTarget)
    try {
      if (screen === 'verify') setUser((await api<{ user: User }>('/auth/verify-email', { method: 'POST', body: JSON.stringify({ email, code: form.get('code') }) })).user)
      else if (screen === 'register') { const nextEmail = String(form.get('email') ?? ''); await api('/auth/register', { method: 'POST', body: JSON.stringify({ name: form.get('name'), email: nextEmail, password: form.get('password') }) }); setEmail(nextEmail); setScreen('verify'); setMessage('We sent a six-digit verification code to your email.') }
      else if (screen === 'recover') { const nextEmail = String(form.get('email') ?? ''); await requestResetCode(nextEmail); setScreen('reset') }
      else if (screen === 'reset') { await api('/auth/reset-password', { method: 'POST', body: JSON.stringify({ email, code: form.get('code'), password: form.get('password') }) }); setScreen('sign-in'); setMessage('Password updated. Sign in with your new password.') }
      else setUser((await api<{ user: User }>('/auth/login', { method: 'POST', body: JSON.stringify({ email: form.get('email'), password: form.get('password') }) })).user)
    } catch (caught) { setError(caught instanceof ApiError ? caught.message : 'Please try again.') } finally { setBusy(false) }
  }

  async function resendResetCode() {
    if (busy || resendSeconds > 0 || !email) return
    setBusy(true); setError('')
    try { await requestResetCode(email) }
    catch (caught) { setError(caught instanceof ApiError ? caught.message : 'Please try again.') }
    finally { setBusy(false) }
  }

  if (user) return <App />
  if (user === undefined) return <main className="access-gate"><p>Opening the club…</p></main>
  return <main className="access-gate club-gate"><header className="club-header"><a href="#top" className="club-brand"><span><Crown size={18} /></span>mochess<span className="brand-dot">.</span></a><div className="club-header-note"><CircleDot size={13} /> THE CLUB IS OPEN</div><p>Free chess for curious minds.</p></header><div className="club-layout" id="top"><section className="club-position"><div className="position-label"><span>THE BOARD IS YOURS</span><b>White to move</b></div><div className="club-live-board"><ChessBoard game={landingGame} label="Starting chess position" /></div><div className="position-footer"><span>THE FIRST MOVE CHANGES EVERYTHING</span><button type="button">Explore the board <ArrowUpRight size={14} /></button></div></section><section className="club-story"><span className="section-kicker">MORE THAN A BOARD</span><h1>Chess is better<br />when it <em>pulls you in.</em></h1><p>MoChess is a calm place to play serious games, notice beautiful ideas, and return tomorrow a little sharper.</p><div className="club-paths"><article><Swords size={18} /><div><strong>Find a game</strong><span>Play online at your pace.</span></div></article><article><Puzzle size={18} /><div><strong>See the tactic</strong><span>Puzzles worth thinking about.</span></div></article><article><BookOpen size={18} /><div><strong>Build your game</strong><span>Short lessons that stick.</span></div></article></div></section><section className="club-account"><div className="account-mark"><Crown size={20} /></div><span className="section-kicker">{screen === 'verify' ? 'CONFIRM YOUR SEAT' : screen === 'recover' || screen === 'reset' ? 'ACCOUNT RECOVERY' : screen === 'register' ? 'A SEAT AT THE BOARD' : 'WELCOME BACK'}</span><h2>{title}</h2><p>{description}</p>{message && <p role="status" className="access-message">{message}</p>}{error && <p role="alert" className="storage-notice">{error}</p>}<form onSubmit={submit}>{screen === 'verify' || screen === 'reset' ? <><label>Verification code<input name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" required maxLength={6} autoFocus /></label>{screen === 'reset' && <label>New password<input name="password" type="password" minLength={10} required autoComplete="new-password" /></label>}<button className="primary-action" disabled={busy}>{busy ? 'Please wait…' : screen === 'reset' ? 'Reset password' : 'Verify email'}</button>{screen === 'reset' && <button className="secondary-action" type="button" disabled={busy || resendSeconds > 0} onClick={() => void resendResetCode()}>{resendSeconds > 0 ? `Resend code in ${resendSeconds}s` : 'Resend code'}</button>}</> : <>{screen === 'register' && <label>Player name<input name="name" required minLength={2} maxLength={32} autoFocus /></label>}<label>Email<input name="email" type="email" required autoComplete="email" autoFocus={screen !== 'register'} /></label>{screen !== 'recover' && <label>Password<input name="password" type="password" required minLength={10} autoComplete={screen === 'register' ? 'new-password' : 'current-password'} /></label>}<button className="primary-action" disabled={busy}>{busy ? 'Please wait…' : screen === 'recover' ? 'Send reset code' : screen === 'register' ? 'Create free account' : 'Sign in'}</button></>}<p className="access-switch">{screen === 'sign-in' ? <><button type="button" onClick={() => setScreen('recover')}>Forgot password?</button><span> · </span><button type="button" onClick={() => setScreen('register')}>Create an account</button></> : <button type="button" onClick={() => { setScreen('sign-in'); setError('') }}>Back to sign in</button>}</p></form><small>Free forever. No ads on the board.</small></section></div></main>
}
