
import React, { useState } from 'react';
import Dashboard from './components/Dashboard';
import EventLog from './components/EventLog';
import './App.css';



function App() {
  const [activeView, setActiveView] = useState('dashboard');

  return (
    <div className="app-container">
      {/* Navigation Header */}
      <nav className="app-nav">
        <div className="nav-content">
          <div className="nav-brand">
            <div className="brand-icon">
              <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
                <rect x="4" y="4" width="24" height="24" rx="4" fill="currentColor" opacity="0.2"/>
                <path d="M16 8L24 12V20L16 24L8 20V12L16 8Z" fill="currentColor"/>
                <circle cx="16" cy="16" r="3" fill="white"/>
              </svg>
            </div>
            <div className="brand-text">
              <h1 className="brand-name">VeriSage X3</h1>
              <p className="brand-subtitle">Integration Hub</p>
            </div>
          </div>

          <div className="nav-links">
            <button
              className={`nav-link ${activeView === 'dashboard' ? 'active' : ''}`}
              onClick={() => setActiveView('dashboard')}
            >
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                <path d="M3 4C3 3.44772 3.44772 3 4 3H7C7.55228 3 8 3.44772 8 4V9C8 9.55228 7.55228 10 7 10H4C3.44772 10 3 9.55228 3 9V4Z" fill="currentColor"/>
                <path d="M3 13C3 12.4477 3.44772 12 4 12H7C7.55228 12 8 12.4477 8 13V16C8 16.5523 7.55228 17 7 17H4C3.44772 17 3 16.5523 3 16V13Z" fill="currentColor"/>
                <path d="M12 4C12 3.44772 12.4477 3 13 3H16C16.5523 3 17 3.44772 17 4V7C17 7.55228 16.5523 8 16 8H13C12.4477 8 12 7.55228 12 7V4Z" fill="currentColor"/>
                <path d="M12 11C12 10.4477 12.4477 10 13 10H16C16.5523 10 17 10.4477 17 11V16C17 16.5523 16.5523 17 16 17H13C12.4477 17 12 16.5523 12 16V11Z" fill="currentColor"/>
              </svg>
              <span>Dashboard</span>
            </button>
            <button
              className={`nav-link ${activeView === 'events' ? 'active' : ''}`}
              onClick={() => setActiveView('events')}
            >
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                <path d="M3 4C3 3.44772 3.44772 3 4 3H16C16.5523 3 17 3.44772 17 4V6C17 6.55228 16.5523 7 16 7H4C3.44772 7 3 6.55228 3 6V4Z" fill="currentColor"/>
                <path d="M3 9C3 8.44772 3.44772 8 4 8H16C16.5523 8 17 8.44772 17 9V11C17 11.5523 16.5523 12 16 12H4C3.44772 12 3 11.5523 3 11V9Z" fill="currentColor"/>
                <path d="M3 14C3 13.4477 3.44772 13 4 13H16C16.5523 13 17 13.4477 17 14V16C17 16.5523 16.5523 17 16 17H4C3.44772 17 3 16.5523 3 16V14Z" fill="currentColor"/>
              </svg>
              <span>Event Log</span>
            </button>
          </div>

          <div className="nav-actions">
            <button className="nav-user">
              <div className="user-avatar">
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                  <circle cx="10" cy="7" r="3" fill="currentColor"/>
                  <path d="M4 16C4 13.7909 5.79086 12 8 12H12C14.2091 12 16 13.7909 16 16V17H4V16Z" fill="currentColor"/>
                </svg>
              </div>
            </button>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="app-main">
        <div className="content-wrapper">
          {activeView === 'dashboard' ? <Dashboard /> : <EventLog />}
        </div>
      </main>
    </div>
  );
}

export default App;