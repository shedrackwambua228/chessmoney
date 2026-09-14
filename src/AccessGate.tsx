import { FormEvent, useEffect, useState } from 'react'
import { ArrowUpRight, BookOpen, Crown, Puzzle, Swords } from 'lucide-react'
import { Chess } from 'chess.js'
import App from './App'
import ChessBoard from './ChessBoard'
import { api, ApiError } from './api'

type Account = {
  id: string
  email: string
  username: string
  role: 'user' | 'admin' | 'support'
}

type Screen = 'sign-in' | 'register' | 'verify' | 'recover' | 'reset'

const landingGame = new Chess()

function messageFrom(error: unknown) {
  return error instanceof ApiError ? error.message : 'Something went wrong. Please try again.'
}

export default function AccessGate() {
  const [user, setUser] = useState<Account | null>(null)
  const [screen, setScreen] = useState<Screen>('sign-in')
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [resendSeconds, setResendSeconds] = useState(0)

  useEffect(() => {
    void api<Account>('/auth/me').then(setUser).catch(() => undefined)
  }, [])

  useEffect(() => {
    if (resendSeconds <= 0) return
    const timer = window.setInterval(() => {
      setResendSeconds((seconds) => Math.max(0, seconds - 1))
    }, 1000)
    return () => window.clearInterval(timer)
  }, [resendSeconds])

  async function requestResetCode(address: string) {
    await api('/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email: address }),
    })
    setEmail(address)
    setResendSeconds(60)
    setMessage('If that account exists, a reset code is on its way.')
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const formEmail = String(form.get('email') ?? '').trim()
    const password = String(form.get('password') ?? '')

    setBusy(true)
    setError('')
    setMessage('')
    try {
      if (screen === 'register') {
        await api('/auth/register', {
          method: 'POST',
          body: JSON.stringify({
            email: formEmail,
            password,
            username: String(form.get('username') ?? '').trim(),
          }),
        })
        setEmail(formEmail)
        setScreen('verify')
        setMessage('Check your email for the six-digit verification code.')
      } else if (screen === 'verify') {
        const account = await api<Account>('/auth/verify-email', {
          method: 'POST',
          body: JSON.stringify({ email: formEmail, code: String(form.get('code') ?? '').trim() }),
        })
        setUser(account)
      } else if (screen === 'recover') {
        await requestResetCode(formEmail)
        setScreen('reset')
      } else if (screen === 'reset') {
        await api('/auth/reset-password', {
          method: 'POST',
          body: JSON.stringify({
            email: formEmail,
            code: String(form.get('code') ?? '').trim(),
            password,
          }),
        })
        setScreen('sign-in')
        setMessage('Your password has been reset. Sign in with your new password.')
      } else {
        const account = await api<Account>('/auth/login', {
          method: 'POST',
          body: JSON.stringify({ email: formEmail, password }),
        })
        setUser(account)
      }
    } catch (caught) {
      setError(messageFrom(caught))
    } finally {
      setBusy(false)
    }
  }

  async function resendResetCode() {
    if (resendSeconds > 0 || !email) return
    setBusy(true)
    setError('')
    try {
      await requestResetCode(email)
    } catch (caught) {
      setError(messageFrom(caught))
    } finally {
      setBusy(false)
    }
  }

  if (user) return <App />

  const isCodeScreen = screen === 'verify' || screen === 'reset'

  return (
    <main className="access-gate club-gate">
      <header className="club-header">
        <a className="club-brand" href="/" aria-label="MoChess home"><Crown size={22} /> mochess.</a>
        <span>Free chess. No pressure.</span>
      </header>

      <div className="club-layout">
        <section className="club-position" aria-label="A chess position">
          <div className="club-position-title"><span>POSITION OF THE MOMENT</span><strong>White to move</strong></div>
          <div className="club-live-board"><ChessBoard game={landingGame} label="Starting chess position" /></div>
          <div className="club-position-caption">THE QUIET BEFORE THE COMBINATION <a href="#account">Explore the position <ArrowUpRight size={15} /></a></div>
        </section>

        <section className="club-story">
          <p className="eyebrow">MORE THAN A BOARD</p>
          <h1>Chess is better<br />when it <em>pulls<br />you in.</em></h1>
          <p className="club-intro">MoChess is a calm place to play serious games, notice beautiful ideas, and return tomorrow a little sharper.</p>
          <div className="club-features">
            <div><Swords /><span><b>Find a game</b><small>Play online at your pace.</small></span></div>
            <div><Puzzle /><span><b>See the tactic</b><small>Puzzles worth thinking about.</small></span></div>
            <div><BookOpen /><span><b>Build your game</b><small>Short lessons that stick.</small></span></div>
          </div>
        </section>

        <section className="club-account" id="account">
          <Crown className="club-crown" />
          <p className="eyebrow">{screen === 'register' ? 'JOIN THE CLUB' : screen === 'recover' || screen === 'reset' ? 'ACCOUNT RECOVERY' : screen === 'verify' ? 'ONE LAST STEP' : 'WELCOME BACK'}</p>
          <h2>{screen === 'register' ? 'Your next game starts here.' : screen === 'recover' ? 'Get back to your board.' : screen === 'reset' ? 'Choose a new password.' : screen === 'verify' ? 'Verify your email.' : 'Ready when you are.'}</h2>
          <p className="account-copy">{screen === 'recover' ? 'Enter your account email and we will send a six-digit reset code.' : screen === 'reset' ? 'Enter the code from your email, then set a new password.' : screen === 'verify' ? 'Use the six-digit code we sent to your email.' : 'Sign in to pick up your next game, lesson, or puzzle.'}</p>

          <form onSubmit={submit}>
            {(screen === 'sign-in' || screen === 'register' || screen === 'recover' || isCodeScreen) && (
              <label>Email<input name="email" type="email" required defaultValue={email} autoComplete="email" /></label>
            )}
            {screen === 'register' && <label>Username<input name="username" required minLength={3} autoComplete="username" /></label>}
            {isCodeScreen && <label>Verification code<input name="code" required inputMode="numeric" pattern="[0-9]{6}" maxLength={6} autoComplete="one-time-code" /></label>}
            {screen !== 'recover' && screen !== 'verify' && <label>{screen === 'reset' ? 'New password' : 'Password'}<input name="password" type="password" required minLength={8} autoComplete={screen === 'reset' ? 'new-password' : screen === 'register' ? 'new-password' : 'current-password'} /></label>}
            {message && <p className="form-message">{message}</p>}
            {error && <p className="form-error">{error}</p>}
            <button className="primary-action" disabled={busy} type="submit">
              {busy ? 'Please wait…' : screen === 'register' ? 'Create account' : screen === 'verify' ? 'Verify email' : screen === 'recover' ? 'Send reset code' : screen === 'reset' ? 'Reset password' : 'Sign in'}
            </button>
          </form>

          {screen === 'reset' && (
            <button className="secondary-action" type="button" disabled={busy || resendSeconds > 0} onClick={() => void resendResetCode()}>
              {resendSeconds > 0 ? `Resend code in ${resendSeconds}s` : 'Resend code'}
            </button>
          )}

          <div className="account-switch">
            {screen === 'sign-in' ? <><button type="button" onClick={() => { setError(''); setMessage(''); setScreen('recover') }}>Forgot password?</button><span> · </span><button type="button" onClick={() => { setError(''); setMessage(''); setScreen('register') }}>Create an account</button></> : <button type="button" onClick={() => { setError(''); setMessage(''); setScreen('sign-in') }}>Back to sign in</button>}
          </div>
          <p className="account-footnote">Free forever. No ads on the board.</p>
        </section>
      </div>
    </main>
  )
}
