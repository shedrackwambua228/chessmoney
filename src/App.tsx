import Analysis from './Analysis'
import Online from './Online'
import { useEffect, useState } from 'react'
import { ArrowRight, BookOpen, Check, ChevronRight, Clock3, Crown, Download, Gamepad2, History, Menu, Play, Settings2, ShieldCheck, Sparkles, Swords, Trophy, Users, X, Zap } from 'lucide-react'
import { Chess } from 'chess.js'
import PlayRoom from './PlayRoom'
import ChessBoard from './ChessBoard'
import Modal from './Modal'
import { Lessons, PuzzleRoom } from './Practice'
import YouTubeVideos from './YouTubeVideos'
import { controls, type Mode } from './game'
import { clearSaved, downloadPgn, gameRecords, preferences, savedGame, savedAnalysisPgn, write, type GameRecord, type SavedGame } from './storage'

const navigation = [{ label: 'Play', icon: Play }, { label: 'Online', icon: Users }, { label: 'Puzzles', icon: Gamepad2 }, { label: 'Learn', icon: BookOpen }, { label: 'Analysis', icon: Sparkles }, { label: 'My games', icon: History }, { label: 'Settings', icon: Settings2 }] as const
type Section = typeof navigation[number]['label']
const titles: Record<Section, [string, string, string]> = {
  Online: ['MEET AT THE BOARD', 'A real opponent awaits.', 'Sign in, create a game, and play together from anywhere.'],
  Play: ['A LITTLE FOCUS. A BETTER GAME.', 'Make your next move.', 'A fresh board, a worthy challenge, and room to get better. Your game starts here.'],
  Puzzles: ['TRAIN YOUR CHESS INSTINCT', 'Find the finishing move.', 'Small positions. Big ideas. Build your eye for checkmate one puzzle at a time.'],
  Learn: ['A GOOD PLACE TO BEGIN', 'Learn. Play. Repeat.', 'Simple lessons to help you see the board a little differently.'],
  'My games': ['YOUR PRACTICE JOURNAL', 'Every game teaches you.', 'Your completed games, saved on this device. Revisit the moves and keep learning.'],
  Analysis: ['UNDERSTAND YOUR NEXT MOVE', 'Look a little deeper.', 'Review a game, explore a position, and compare suggested moves.'],
  Settings: ['MAKE YOURSELF AT HOME', 'Your board. Your style.', 'Choose how you like to play. Your preferences stay on this browser.'],
}

function Review({ record, onClose, onAnalyze }: { record: GameRecord; onClose: () => void; onAnalyze: () => void }) {
  const [step, setStep] = useState(0)
  const complete = new Chess(); complete.loadPgn(record.pgn)
  const moves = complete.history(), game = new Chess()
  for (const move of moves.slice(0, step)) game.move(move)
  return <Modal title="Review your game" onClose={onClose}><p>{record.result}</p><ChessBoard game={game} label="Game review board" /><div className="review-controls"><button disabled={!step} onClick={() => setStep(0)} aria-label="First position">«</button><button disabled={!step} onClick={() => setStep(value => value - 1)} aria-label="Previous move">←</button><span aria-live="polite">{step} / {moves.length}{step ? ` · ${moves[step - 1]}` : ''}</span><button disabled={step === moves.length} onClick={() => setStep(value => value + 1)} aria-label="Next move">→</button><button disabled={step === moves.length} onClick={() => setStep(moves.length)} aria-label="Final position">»</button></div><button className="secondary-action" onClick={() => downloadPgn(record.pgn)}><Download size={15} /> Download PGN</button><button className="primary-action" onClick={onAnalyze}>Analyze this game</button><button className="secondary-action" onClick={onClose}>Close review</button></Modal>
}

export default function App() {
  const [section, setSection] = useState<Section>('Play')
  const [analysisPgn, setAnalysisPgn] = useState(savedAnalysisPgn)
  const [menu, setMenu] = useState(false)
  const [prefs, setPrefs] = useState(preferences)
  const [session, setSession] = useState<{ mode: Mode; saved?: SavedGame } | null>(null)
  const [saved, setSaved] = useState(savedGame)
  const [records, setRecords] = useState(gameRecords)
  const [replace, setReplace] = useState<Mode | null>(null)
  const [review, setReview] = useState<GameRecord | null>(null)
  const [storageError, setStorageError] = useState(false)
  useEffect(() => { setStorageError(!write('preferences', prefs)); document.documentElement.dataset.board = prefs.board }, [prefs])
  const navigate = (next: Section) => { if (next === 'Analysis' && !analysisPgn) setAnalysisPgn(savedAnalysisPgn()); setSection(next); setMenu(false); window.scrollTo(0, 0) }
  const start = (mode: Mode) => { if (saved) setReplace(mode); else setSession({ mode }) }
  const closeGame = () => { setSession(null); setSaved(savedGame()); setRecords(gameRecords()); window.scrollTo(0, 0) }
  const analyzeGame = (pgn: string) => { setAnalysisPgn(pgn); write('analysis-pgn', pgn); setReview(null); closeGame(); setSection('Analysis'); setMenu(false) }
  const computerGames = records.filter(record => record.mode === 'computer')
  const wins = computerGames.filter(record => record.result.startsWith('White wins')).length
  const draws = computerGames.filter(record => record.result.startsWith('Draw')).length
  if (session) return <PlayRoom initialMode={session.mode} timeControl={session.saved?.timeControl ?? prefs.timeControl} saved={session.saved} hints={prefs.hints} onClose={closeGame} onAnalyze={analyzeGame} />
  return <div className="site-shell"><a className="skip-link" href="#main-content">Skip to content</a><header className="site-topbar"><a href="#" className="brand" onClick={event => { event.preventDefault(); navigate('Play') }}><span className="brand-mark"><Crown size={18} /></span>mochess<span className="brand-period">.</span></a><div className="topbar-caption">A good day for a good game.</div><span className="practice-badge"><span /> FREE PRACTICE</span><button className="menu-toggle" aria-label={menu ? 'Close navigation' : 'Open navigation'} aria-expanded={menu} aria-controls="site-navigation" onClick={() => setMenu(value => !value)}>{menu ? <X /> : <Menu />}</button></header>
    <div className="site-frame"><aside className={`site-sidebar ${menu ? 'menu-open' : ''}`}><span className="sidebar-eyebrow">YOUR CHESS CLUB</span><nav id="site-navigation" aria-label="Main navigation">{navigation.map(({ label, icon: Icon }) => <button key={label} aria-current={section === label ? 'page' : undefined} className={section === label ? 'current' : ''} onClick={() => navigate(label)}><Icon size={18} /><span>{label}</span>{section === label && <span className="nav-dot" />}</button>)}</nav><div className="sidebar-bottom"><div className="sidebar-note"><Sparkles size={20} /><strong>Progress, one move<br />at a time.</strong><p>No sign-up needed.<br />Just you and the board.</p></div><div className="guest-profile"><span>G</span><div><strong>Guest player</strong><small>Saved on this device</small></div></div></div></aside>
    <main className="site-main" id="main-content" tabIndex={-1}><div className="page-heading"><span className="section-kicker">{titles[section][0]}</span><h1>{titles[section][1]}</h1><p>{titles[section][2]}</p></div>
      {storageError && <p className="storage-notice" role="status">Browser storage is unavailable. You can still play, but preferences and games may not be saved.</p>}
      {section === 'Play' && <><section className="home-grid"><div className="setup-card"><div className="card-heading"><span className="section-kicker">LET’S PLAY CHESS</span><span className="pill"><ShieldCheck size={12} /> Always free</span></div><h2>A fresh start.<br /><em>Endless possibilities.</em></h2><p>Challenge the computer or invite a friend to meet you online.</p><fieldset className="time-picker"><legend><Clock3 size={14} /> YOUR PACE</legend><div>{(Object.keys(controls) as Array<keyof typeof controls>).map(control => <button key={control} aria-pressed={prefs.timeControl === control} className={prefs.timeControl === control ? 'chosen-time' : ''} onClick={() => setPrefs(value => ({ ...value, timeControl: control }))}>{control === 'Blitz' ? <Zap size={17} /> : control === 'Rapid' ? <Clock3 size={17} /> : <Crown size={17} />}<strong>{control}</strong><span>{controls[control][0] / 60} + {controls[control][1]}</span></button>)}</div></fieldset><div className="start-actions"><button className="primary-action" onClick={() => start('computer')}><Swords size={18} /> Play computer <ArrowRight size={17} /></button><button className="secondary-action" onClick={() => navigate('Online')}><Users size={17} /> Play a friend online <ArrowRight size={17} /></button></div><div className="setup-foot"><Check size={14} /> Full chess rules <span>·</span> No downloads needed</div></div>
      <YouTubeVideos /></section>
      {saved && <section className="resume-card"><span className="resume-icon"><History size={23} /></span><div><strong>You have a game to finish.</strong><p>{saved.mode === 'computer' ? 'Against the computer' : 'With a friend'} · {saved.timeControl} · clocks paused while away</p></div><button onClick={() => setSession({ mode: saved.mode, saved })}>Resume game <ArrowRight size={16} /></button></section>}
      <section className="home-secondary"><div className="surface practice-summary"><div className="card-heading"><span className="section-kicker">YOUR PRACTICE</span><Trophy size={18} /></div><h2>Small steps. Real progress.</h2><div className="stat-grid"><div><strong>{computerGames.length}</strong><span>Computer games</span></div><div><strong>{wins}</strong><span>Wins</span></div><div><strong>{draws}</strong><span>Draws</span></div></div><p>{computerGames.length ? 'Keep exploring. Every position has something to teach you.' : 'Your story starts with your first finished game.'}</p><button className="inline-action" onClick={() => navigate('My games')}>View my games <ArrowRight size={15} /></button></div><button className="feature-tile puzzle-tile" onClick={() => navigate('Puzzles')}><Gamepad2 size={24} /><span className="section-kicker">A LITTLE DAILY CHALLENGE</span><h2>Calculate the winning line.</h2><p>Solve forcing combinations and queen sacrifices.</p><span className="inline-action">Solve a puzzle <ArrowRight size={16} /></span></button><button className="feature-tile learn-tile" onClick={() => navigate('Learn')}><BookOpen size={24} /><span className="section-kicker">BUILD YOUR CONFIDENCE</span><h2>Good games start here.</h2><p>Get comfortable with the rules, openings, and tactics.</p><span className="inline-action">Explore lessons <ArrowRight size={16} /></span></button></section>
      <section className="how-row"><span className="section-kicker">FROM HELLO TO CHECKMATE</span><div>{[['01', 'Choose your pace', 'Quick blitz or a little more thinking time.'], ['02', 'Make your move', 'Select a piece and a highlighted square.'], ['03', 'Keep getting better', 'Review your game or try a new puzzle.']].map(([number, title, text]) => <article key={number}><span>{number}</span><div><h3>{title}</h3><p>{text}</p></div></article>)}</div></section></>}
      {section === 'Online' && <Online onAnalyze={analyzeGame} />}
      {section === 'Analysis' && <Analysis key={analysisPgn} initialPgn={analysisPgn} onSelectGame={analyzeGame} />}
      {section === 'Puzzles' && <PuzzleRoom />}
      {section === 'Learn' && <Lessons onPractice={() => start('computer')} />}
      {section === 'My games' && <section className="surface games-list">{records.length ? <><div className="card-heading"><h2>Your automatically saved games</h2><span className="muted">Last {records.length} of up to 50</span></div>{records.map(record => <article className="game-row" key={record.id}><span className="game-result-icon">{record.result.startsWith('Draw') ? '½' : <Swords size={20} />}</span><div><strong>{record.result}</strong><p>{record.mode === 'computer' ? 'Computer practice' : 'Same-device game'} · {record.timeControl} · {new Date(record.updatedAt).toLocaleDateString()}</p></div><button aria-label={`Analyze game from ${new Date(record.updatedAt).toLocaleString()}`} onClick={() => analyzeGame(record.pgn)}>Analyze <Sparkles size={16} /></button><button aria-label={`Review game from ${new Date(record.updatedAt).toLocaleString()}`} onClick={() => setReview(record)}>Review <ChevronRight size={16} /></button></article>)}</> : <div className="empty-games"><History size={40} /><h2>Your first game is waiting.</h2><p>Finish a game to see your result and review every move here.</p><button className="primary-action" onClick={() => navigate('Play')}>Find your board <ArrowRight size={16} /></button></div>}</section>}
      {section === 'Settings' && <section className="surface settings-panel"><h2>A board that feels like yours.</h2><fieldset><legend>Board colors</legend><div className="theme-options">{(['olive', 'walnut'] as const).map(board => <button key={board} aria-pressed={prefs.board === board} className={prefs.board === board ? 'selected-theme' : ''} onClick={() => setPrefs(value => ({ ...value, board }))}><span className={`theme-swatch ${board}`} />{board === 'olive' ? 'Garden olive' : 'Warm walnut'}{prefs.board === board && <Check size={16} />}</button>)}</div></fieldset><label className="settings-row"><span><strong>Show legal moves</strong><small>Highlight available destinations when you select a piece.</small></span><input type="checkbox" checked={prefs.hints} onChange={event => setPrefs(value => ({ ...value, hints: event.target.checked }))} /></label><label className="settings-row"><span><strong>Default time control</strong><small>Used when you start a new game.</small></span><select value={prefs.timeControl} onChange={event => setPrefs(value => ({ ...value, timeControl: event.target.value as keyof typeof controls }))}>{Object.keys(controls).map(control => <option key={control}>{control}</option>)}</select></label><div className="local-data-note"><ShieldCheck size={20} /><div><strong>Your practice stays here.</strong><p>Games and preferences are stored in this browser. Clearing browser data removes them. Download PGN files to keep a copy of your games.</p></div></div></section>}
      <footer className="site-footer"><a className="brand" href="#" onClick={event => { event.preventDefault(); navigate('Play') }}>mochess.</a><span>Made for the love of the game.</span><button onClick={() => navigate('Settings')}>Local practice · no real-money play <ShieldCheck size={13} /></button></footer>
    </main></div>
    {replace && <Modal title="Start a fresh game?" onClose={() => setReplace(null)}><p>This replaces your unfinished saved game. Resume it from the home page if you want to keep playing.</p><button className="primary-action" onClick={() => { clearSaved(); setSaved(null); setSession({ mode: replace }); setReplace(null) }}>Start new game</button><button className="secondary-action" onClick={() => setReplace(null)}>Keep saved game</button></Modal>}
    {review && <Review record={review} onClose={() => setReview(null)} onAnalyze={() => analyzeGame(review.pgn)} />}
  </div>
}
