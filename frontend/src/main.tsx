import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { installZeroTrustFetchInterceptor } from './security/deviceCrypto'
import App from './App.tsx'

// Instala o interceptador criptográfico Zero-Trust (ECDSA P-256) antes de montar a UI
installZeroTrustFetchInterceptor()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
