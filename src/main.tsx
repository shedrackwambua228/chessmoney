import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import AccessGate from './AccessGate'
import ErrorBoundary from './ErrorBoundary'
import './styles.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode><ErrorBoundary><AccessGate /></ErrorBoundary></StrictMode>,
)
