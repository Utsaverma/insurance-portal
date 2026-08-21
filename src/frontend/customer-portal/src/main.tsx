import React from 'react'
import ReactDOM from 'react-dom/client'
import './index.css'
import App from './App'
import { ThemeProvider } from './context/ThemeContext'

// ThemeProvider uses no router hook, so it sits outermost — deliberately
// outside BrowserRouter, so it is unaffected by the window.location.href
// hard-redirect path in api/client.ts.
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeProvider>
      <App />
    </ThemeProvider>
  </React.StrictMode>
)
