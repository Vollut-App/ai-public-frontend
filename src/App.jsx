import React from 'react'
import { BrowserRouter, Routes, Route, NavLink, useLocation } from 'react-router-dom'
import { FileText, LayoutDashboard, Upload, BarChart3 } from 'lucide-react'
import UserUpload from './pages/UserUpload'
import AdminDashboard from './pages/AdminDashboard'
import ModelStats from './pages/ModelStats'
import { getAdminKey } from './utils/adminKey'

function AppShell() {
  const location = useLocation()
  const pathname = location?.pathname || '/'
  const isPublicPage = pathname === '/'
  const hasAdminKey = Boolean(getAdminKey())

  return (
    <div className="app">
      <nav className="nav">
        <div className="nav-inner">
          <NavLink to="/" className="nav-brand">
            <div className="nav-brand-icon">
              <FileText size={20} />
            </div>
            <span className="nav-brand-text">Invoice Extractor</span>
          </NavLink>

          {/* Only show navigation links when user already has an admin key stored.
              This keeps Admin/Stats “hidden” until unlocked once. */}
          {!isPublicPage && hasAdminKey && (
            <div className="nav-links">
              <NavLink
                to="/"
                className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
              >
                <Upload size={18} />
                Upload
              </NavLink>
              <NavLink
                to="/admin"
                className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
              >
                <LayoutDashboard size={18} />
                Admin
              </NavLink>
              <NavLink
                to="/stats"
                className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
              >
                <BarChart3 size={18} />
                Stats
              </NavLink>
            </div>
          )}
        </div>
      </nav>

      <main className="main">
        <div className="container">
          <Routes>
            <Route path="/" element={<UserUpload />} />
            <Route path="/admin" element={<AdminDashboard />} />
            <Route path="/stats" element={<ModelStats />} />
          </Routes>
        </div>
      </main>
    </div>
  )
}

function App() {
  return (
    <BrowserRouter>
      <AppShell />
    </BrowserRouter>
  )
}

export default App

