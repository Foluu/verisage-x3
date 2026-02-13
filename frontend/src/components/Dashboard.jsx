import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { format } from 'date-fns';



// ============================================================================
// CONFIGURATION
// ============================================================================
const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:3000';



// ============================================================================
// DASHBOARD COMPONENT
// ============================================================================
const Dashboard = () => {
  const [status, setStatus] = useState(null);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchDashboardData();
    const interval = setInterval(fetchDashboardData, 30000); // Refresh every 30s
    return () => clearInterval(interval);
  }, []);

  const fetchDashboardData = async () => {
    try {
      console.log('🔄 Fetching dashboard data from:', API_BASE_URL);
      
      const [statusRes, statsRes] = await Promise.all([
        axios.get(`${API_BASE_URL}/api/v1/admin/status`),
        axios.get(`${API_BASE_URL}/api/v1/events/stats/summary`)
      ]);
      
      console.log('✅ Status response:', statusRes.data);
      console.log('✅ Stats response:', statsRes.data);
      
      setStatus(statusRes.data.status);
      setStats(statsRes.data.data);
      setLoading(false);
      setError(null); // Clear any previous errors
      
    } catch (err) {
      console.error('❌ Dashboard fetch error:', err);
      console.error('Error details:', {
        message: err.message,
        response: err.response?.data,
        status: err.response?.status
      });
      
      setError({
        message: err.message,
        details: err.response?.data?.error || 'Unknown error',
        url: err.config?.url
      });
      setLoading(false);
    }
  };

  // ============================================================================
  // LOADING STATE
  // ============================================================================
  if (loading) {
    return (
      <div className="loading-container">
        <div className="spinner"></div>
        <p className="loading-text">Loading dashboard...</p>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Error
  // ---------------------------------------------------------------------------
  if (error) {
    return (
      <div className="error-container">
        <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
          <circle cx="24" cy="24" r="22" stroke="#C1440E" strokeWidth="2"/>
          <path d="M24 14V26M24 30V34" stroke="#C1440E" strokeWidth="2" strokeLinecap="round"/>
        </svg>
        <h3>Error Loading Dashboard</h3>
        <p>{error}</p>
        <button onClick={fetchDashboardData} className="btn-primary">Retry</button>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Safe fallbacks
  // ---------------------------------------------------------------------------
  const overallStatus = status?.overall || 'unknown';
  const timestamp = status?.timestamp || new Date().toISOString();
  const sageX3Status = status?.components?.sageX3 || { connected: false };
  const dbStatus = status?.components?.database || { connected: false, status: 'unknown' };
  const queueStatus = status?.components?.queue || { pending: 0, failed: 0 };

  const periodStats = stats?.periodStats || [];
  const currentStatus = stats?.currentStatus || [];

  // ---------------------------------------------------------------------------
  // Helper Functions
  // ---------------------------------------------------------------------------
  const getTotalEvents = () => {
    if (!stats?.periodStats || !Array.isArray(stats.periodStats)) return 0;
    return stats.periodStats.reduce((sum, stat) => sum + (stat.count || 0), 0);
  };

  const getStatusCount = (statusName) => {
    if (!stats?.currentStatus || !Array.isArray(stats.currentStatus)) return 0;
    const item = stats.currentStatus.find(s => s._id === statusName);
    return item?.count || 0;
  };

  const hasWebhookActivity = () => {
    if (!stats?.currentStatus || !Array.isArray(stats.currentStatus)) return false;
    const total = stats.currentStatus.reduce((sum, s) => sum + (s.count || 0), 0);
    return total > 0;
  };

  const totalEvents = getTotalEvents();
  const syncedCount = getStatusCount('synced');
  const pendingCount = queueStatus.pending || 0;
  const failedCount = queueStatus.failed || 0;

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <div className="dashboard">
      {/* Header */}
      <div className="dashboard-header">
        <div>
          <h1 className="page-title">System Overview</h1>
          <p className="page-subtitle">
            Real-time monitoring of VeriSage X3 integration
          </p>
        </div>
        <div className="header-meta">
          <span className="last-updated">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5"/>
              <path d="M8 4V8L11 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
            {format(new Date(timestamp), 'PPpp')}
          </span>
        </div>
      </div>

      {/* System Status Banner */}
      <div className={`status-banner ${overallStatus === 'healthy' ? 'status-healthy' : 'status-degraded'}`}>
        <div className="status-indicator">
          <div className={`status-dot ${overallStatus === 'healthy' ? 'dot-healthy' : 'dot-degraded'}`}></div>
          <div className="status-content">
            <h2 className="status-title">
              {overallStatus === 'healthy' ? 'All Systems Operational' : 'System Degraded'}
            </h2>
            <p className="status-description">
              {overallStatus === 'healthy'
                ? 'All integration components are functioning normally'
                : 'Some components require attention'}
            </p>
          </div>
        </div>
      </div>

      {/* Connection Status Cards */}
      <div className="card-grid">
        <ConnectionCard
          title="Indigo HMS"
          status={hasWebhookActivity() ? 'connected' : 'warning'}
          description={
            hasWebhookActivity()
              ? 'Webhooks receiving'
              : 'No events received yet'
          }
          icon={
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <path d="M12 2L2 7V17L12 22L22 17V7L12 2Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"/>
              <circle cx="12" cy="12" r="3" fill="currentColor"/>
            </svg>
          }
        />

        <ConnectionCard
          title="Sage X3"
          status={sageX3Status.connected ? 'connected' : 'disconnected'}
          description={sageX3Status.connected ? 'API Connected' : 'Connection Failed'}
          icon={
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <rect x="3" y="3" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="2"/>
              <path d="M8 8H16M8 12H16M8 16H12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          }
        />

        <ConnectionCard
          title="Database"
          status={dbStatus.connected ? 'connected' : 'disconnected'}
          description={dbStatus.status}
          icon={
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <ellipse cx="12" cy="6" rx="8" ry="3" stroke="currentColor" strokeWidth="2"/>
              <path d="M4 6V18C4 19.6569 7.58172 21 12 21C16.4183 21 20 19.6569 20 18V6" stroke="currentColor" strokeWidth="2"/>
              <path d="M4 12C4 13.6569 7.58172 15 12 15C16.4183 15 20 13.6569 20 12" stroke="currentColor" strokeWidth="2"/>
            </svg>
          }
        />
      </div>

      {/* Statistics */}
      <div className="stats-grid">
        <StatCard title="Events Today" value={totalEvents} subtitle="Total received" color="blue" />
        <StatCard title="Successfully Synced" value={syncedCount} subtitle="Transactions posted" color="green" />
        <StatCard title="Pending" value={pendingCount} subtitle="In processing queue" color="amber" />
        <StatCard
          title="Failed"
          value={failedCount}
          subtitle="Require attention"
          trend={failedCount > 0 ? 'alert' : null}
          color="red"
        />
      </div>

      {/* Quick Actions */}
      <div className="section-card">
        <h3 className="section-title">Quick Actions</h3>
        <div className="action-grid">
          <ActionButton
            label="View Event Log"
            description="Browse all webhook events"
            onClick={() => window.location.href = '/events'}
          />
          <ActionButton
            label="Failed Events"
            description="Review and retry failures"
            onClick={() => window.location.href = '/events/failed'}
          />
          <ActionButton
            label="Transactions"
            description="View synced transactions"
            onClick={() => window.location.href = '/transactions'}
          />
        </div>
      </div>

      {/* Recent Activity */}
      <div className="section-card">
        <h3 className="section-title">Recent Activity</h3>
        <div className="activity-list">
          {periodStats.length > 0 ? (
            periodStats.slice(0, 5).map((stat, index) => (
              <ActivityItem
                key={index}
                eventType={stat._id?.eventType || 'Unknown'}
                status={stat._id?.status || 'unknown'}
                count={stat.count || 0}
              />
            ))
          ) : (
            <div className="empty-state">
              <p>No recent activity</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// UI Components 
// ---------------------------------------------------------------------------

const ConnectionCard = ({ title, status, description, icon }) => {
  return (
    <div className={`connection-card status-${status}`}>
      <div className="card-icon">{icon}</div>
      <div className="card-content">
        <h3 className="card-title">{title}</h3>
        <p className="card-description">{description}</p>
      </div>
      <div className={`connection-badge badge-${status}`}>
        {status === 'connected' ? 'Connected' : status === 'warning' ? 'Waiting' : 'Offline'}
      </div>
    </div>
  );
};

const StatCard = ({ title, value, subtitle, trend, color }) => {
  return (
    <div className="stat-card">
      <div className="stat-header">
        <span className="stat-label">{title}</span>
        {trend === 'alert' && <span className="stat-trend trend-alert">!</span>}
      </div>
      <div className={`stat-value color-${color}`}>{value.toLocaleString()}</div>
      <div className="stat-subtitle">{subtitle}</div>
    </div>
  );
};

const ActionButton = ({ label, description, onClick }) => {
  return (
    <button className="action-button" onClick={onClick}>
      <div className="action-content">
        <h4 className="action-label">{label}</h4>
        <p className="action-description">{description}</p>
      </div>
      <svg className="action-arrow" width="16" height="16" viewBox="0 0 16 16" fill="none">
        <path d="M6 4L10 8L6 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    </button>
  );
};

const ActivityItem = ({ eventType, status, count }) => {
  const statusConfig = {
    synced: { icon: '✓', color: 'success', label: 'Synced' },
    failed: { icon: '✕', color: 'error', label: 'Failed' },
    pending: { icon: '○', color: 'pending', label: 'Pending' },
    validated: { icon: '✓', color: 'info', label: 'Validated' },
    transformed: { icon: '↻', color: 'info', label: 'Transformed' },
    received: { icon: '○', color: 'neutral', label: 'Received' }
  };

  const config = statusConfig[status] || { icon: '○', color: 'neutral', label: status };

  return (
    <div className="activity-item">
      <div className={`activity-icon icon-${config.color}`}>
        {config.icon}
      </div>
      <div className="activity-details">
        <span className="activity-type">{eventType}</span>
        <span className="activity-status">{config.label}</span>
      </div>
      <div className="activity-count">{count}</div>
    </div>
  );
};


export default Dashboard;