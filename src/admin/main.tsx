import React from 'react'
import ReactDOM from 'react-dom/client'
import { AdminApp } from './AdminApp'

const rootEl = document.getElementById('admin-root')

if (rootEl) {
  ReactDOM.createRoot(rootEl).render(
    <React.StrictMode>
      <AdminApp />
    </React.StrictMode>
  )
}
