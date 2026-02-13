
import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { format } from 'date-fns';


// Configure axios base URL from environment or default to relative paths
const API_BASE_URL = process.env.REACT_APP_API_BASE_URL || '';



const EventLog = () => {
  const [events, setEvents] = useState([]);
  const [filters, setFilters] = useState({
    status: '',
    eventType: '',
    startDate: '',
    endDate: ''
  });
  const [pagination, setPagination] = useState({
    limit: 50,
    skip: 0,
    total: 0,
    hasMore: false
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedEvent, setSelectedEvent] = useState(null);

  useEffect(() => {
    fetchEvents();
  }, [pagination.skip]); // Re-fetch when pagination changes

  const fetchEvents = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const params = {
        ...filters,
        limit: pagination.limit,
        skip: pagination.skip
      };
      
      // Remove empty filter values
      Object.keys(params).forEach(key => {
        if (params[key] === '') delete params[key];
      });
      
      const response = await axios.get(`${API_BASE_URL}/api/v1/events`, { params });
      
      if (response.data.success) {
        setEvents(response.data.data);
        setPagination(prev => ({
          ...prev,
          total: response.data.pagination.total,
          hasMore: response.data.pagination.hasMore
        }));
      } else {
        throw new Error('Failed to fetch events');
      }
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Failed to load events');
      setEvents([]);
    } finally {
      setLoading(false);
    }
  };

  const handleRetry = async (eventId) => {
    if (!window.confirm('Are you sure you want to retry this event?')) return;
    
    try {
      const response = await axios.post(`${API_BASE_URL}/api/v1/events/${eventId}/retry`, {
        reason: 'Manual retry from dashboard'
      });
      
      if (response.data.success) {
        alert('Event retry initiated successfully');
        fetchEvents(); // Refresh the list
      } else {
        throw new Error('Retry failed');
      }
    } catch (err) {
      alert('Retry failed: ' + (err.response?.data?.error || err.message));
    }
  };

  const viewEventDetails = async (eventId) => {
    try {
      const response = await axios.get(`${API_BASE_URL}/api/v1/events/${eventId}`);
      if (response.data.success) {
        setSelectedEvent(response.data.data);
      } else {
        throw new Error('Failed to fetch event details');
      }
    } catch (err) {
      alert('Error loading event details: ' + (err.response?.data?.error || err.message));
    }
  };

  const handlePageChange = (direction) => {
    setPagination(prev => ({
      ...prev,
      skip: direction === 'next' 
        ? prev.skip + prev.limit 
        : Math.max(0, prev.skip - prev.limit)
    }));
  };

  const applyFilters = () => {
    // Reset pagination when applying new filters
    setPagination(prev => ({ ...prev, skip: 0 }));
    fetchEvents();
  };

  const clearFilters = () => {
    setFilters({ status: '', eventType: '', startDate: '', endDate: '' });
    setPagination(prev => ({ ...prev, skip: 0 }));
    // Fetch will be triggered by useEffect when filters change
    setTimeout(fetchEvents, 0);
  };

  return (
    <div className="event-log">
      {/* Header */}
      <div className="dashboard-header">
        <div>
          <h1 className="page-title">Event Log</h1>
          <p className="page-subtitle">
            Track and manage all events from Indigo HMS
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="filter-panel">
        <div className="filter-header">
          <h3 className="filter-title">Filters</h3>
          <button onClick={clearFilters} className="btn-text">
            Clear all
          </button>
        </div>
        
        <div className="filter-grid">
          <div className="filter-group">
            <label className="filter-label">Status</label>
            <select
              value={filters.status}
              onChange={(e) => setFilters({ ...filters, status: e.target.value })}
              className="filter-select"
            >
              <option value="">All Statuses</option>
              <option value="received">Received</option>
              <option value="validated">Validated</option>
              <option value="transformed">Transformed</option>
              <option value="synced">Synced</option>
              <option value="failed">Failed</option>
              <option value="reversed">Reversed</option>
            </select>
          </div>

          <div className="filter-group">
            <label className="filter-label">Event Type</label>
            <select
              value={filters.eventType}
              onChange={(e) => setFilters({ ...filters, eventType: e.target.value })}
              className="filter-select"
            >
              <option value="">All Types</option>
              <option value="invoice.created">Invoice Created</option>
              <option value="invoice.updated">Invoice Updated</option>
              <option value="invoice.cancelled">Invoice Cancelled</option>
              <option value="payment.created">Payment Created</option>
              <option value="payment.cancelled">Payment Cancelled</option>
              <option value="item.created">Item Created</option>
              <option value="item.updated">Item Updated</option>
              <option value="item.archived">Item Archived</option>
              <option value="stock.created">Stock Created</option>
              <option value="stock.updated">Stock Updated</option>
              <option value="stock.incremented">Stock Incremented</option>
              <option value="stock.transferred">Stock Transferred</option>
              <option value="stock.recalled">Stock Recalled</option>
              <option value="stock.archived">Stock Archived</option>
              <option value="stock.dispensed">Stock Dispensed</option>
              <option value="stock.sold">Stock Sold</option>
              <option value="stock.returned">Stock Returned</option>
            </select>
          </div>

          <div className="filter-group">
            <label className="filter-label">Start Date</label>
            <input
              type="date"
              value={filters.startDate}
              onChange={(e) => setFilters({ ...filters, startDate: e.target.value })}
              className="filter-input"
            />
          </div>

          <div className="filter-group">
            <label className="filter-label">End Date</label>
            <input
              type="date"
              value={filters.endDate}
              onChange={(e) => setFilters({ ...filters, endDate: e.target.value })}
              className="filter-input"
            />
          </div>
        </div>

        <div className="filter-actions">
          <button onClick={applyFilters} className="btn-primary">
            Apply Filters
          </button>
        </div>
      </div>

      {/* Error Display */}
      {error && (
        <div className="error-container">
          <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
            <circle cx="24" cy="24" r="22" stroke="#C1440E" strokeWidth="2"/>
            <path d="M24 14V26M24 30V34" stroke="#C1440E" strokeWidth="2" strokeLinecap="round"/>
          </svg>
          <h3>Error Loading Events</h3>
          <p>{error}</p>
          <button onClick={fetchEvents} className="btn-primary">Retry</button>
        </div>
      )}

      {/* Event Table */}
      {!error && (
        <div className="table-container">
          {loading ? (
            <div className="table-loading">
              <div className="spinner"></div>
              <p>Loading events...</p>
            </div>
          ) : events.length === 0 ? (
            <div className="empty-state">
              <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
                <rect x="8" y="8" width="32" height="32" rx="4" stroke="currentColor" strokeWidth="2"/>
                <path d="M16 20H32M16 28H24" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              </svg>
              <h3>No events found</h3>
              <p>Try adjusting your filters or check back later</p>
            </div>
          ) : (
            <>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Event ID</th>
                    <th>Type</th>
                    <th>Status</th>
                    <th>Received At</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {events.map((event) => (
                    <tr key={event.eventId}>
                      <td>
                        <code className="event-id">{event.eventId}</code>
                      </td>
                      <td>
                        <span className="event-type">{event.eventType}</span>
                      </td>
                      <td>
                        <StatusBadge status={event.status} />
                      </td>
                      <td className="text-secondary">
                        {format(new Date(event.createdAt), 'MMM d, yyyy HH:mm')}
                      </td>
                      <td>
                        <div className="table-actions">
                          <button
                            onClick={() => viewEventDetails(event.eventId)}
                            className="btn-icon"
                            title="View Details"
                          >
                            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                              <path d="M8 3C4.5 3 1.5 8 1.5 8S4.5 13 8 13C11.5 13 14.5 8 14.5 8S11.5 3 8 3Z" stroke="currentColor" strokeWidth="1.5"/>
                              <circle cx="8" cy="8" r="2" stroke="currentColor" strokeWidth="1.5"/>
                            </svg>
                          </button>
                          {event.status === 'failed' && (
                            <button
                              onClick={() => handleRetry(event.eventId)}
                              className="btn-icon retry-btn"
                              title="Retry Event"
                            >
                              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                                <path d="M13 8C13 10.7614 10.7614 13 8 13C5.23858 13 3 10.7614 3 8C3 5.23858 5.23858 3 8 3C9.84095 3 11.4398 4.02513 12.2929 5.5M12 3V5.5H9.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                              </svg>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Pagination */}
              <div className="pagination">
                <div className="pagination-info">
                  Showing {pagination.skip + 1} to {Math.min(pagination.skip + events.length, pagination.total)} of {pagination.total} events
                </div>
                <div className="pagination-controls">
                  <button
                    onClick={() => handlePageChange('prev')}
                    disabled={pagination.skip === 0}
                    className="pagination-btn"
                  >
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                      <path d="M10 4L6 8L10 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                    Previous
                  </button>
                  <button
                    onClick={() => handlePageChange('next')}
                    disabled={!pagination.hasMore}
                    className="pagination-btn"
                  >
                    Next
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                      <path d="M6 4L10 8L6 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* Event Details Modal */}
      {selectedEvent && (
        <EventDetailsModal
          event={selectedEvent}
          onClose={() => setSelectedEvent(null)}
        />
      )}
    </div>
  );
};

// Status Badge Component
const StatusBadge = ({ status }) => {
  const statusConfig = {
    received: { label: 'Received', color: 'gray' },
    validated: { label: 'Validated', color: 'blue' },
    transformed: { label: 'Transformed', color: 'purple' },
    synced: { label: 'Synced', color: 'green' },
    failed: { label: 'Failed', color: 'red' },
    reversed: { label: 'Reversed', color: 'amber' }
  };

  const config = statusConfig[status] || { label: status, color: 'gray' };

  return (
    <span className={`status-badge status-${config.color}`}>
      {config.label}
    </span>
  );
};

// Event Details Modal Component
const EventDetailsModal = ({ event, onClose }) => {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">Event Details</h2>
          <button onClick={onClose} className="modal-close">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <path d="M18 6L6 18M6 6L18 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          </button>
        </div>

        <div className="modal-body">
          {/* Basic Info */}
          <div className="detail-section">
            <h3 className="detail-heading">Basic Information</h3>
            <div className="detail-grid">
              <DetailItem label="Event ID" value={event.event.eventId} mono />
              <DetailItem label="Event Type" value={event.event.eventType} />
              <DetailItem 
                label="Status" 
                value={<StatusBadge status={event.event.status} />} 
              />
              <DetailItem 
                label="Created At" 
                value={format(new Date(event.event.createdAt), 'PPpp')} 
              />
              {event.event.retryCount > 0 && (
                <DetailItem label="Retry Count" value={event.event.retryCount} />
              )}
            </div>
          </div>

          {/* Validation */}
          {event.event.validationResult && (
            <div className="detail-section">
              <h3 className="detail-heading">Validation</h3>
              <div className="validation-result">
                <div className={`validation-status ${event.event.validationResult.isValid ? 'valid' : 'invalid'}`}>
                  {event.event.validationResult.isValid ? (
                    <>
                      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                        <circle cx="10" cy="10" r="9" fill="currentColor" opacity="0.1"/>
                        <path d="M6 10L9 13L14 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                      Validation Passed
                    </>
                  ) : (
                    <>
                      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                        <circle cx="10" cy="10" r="9" fill="currentColor" opacity="0.1"/>
                        <path d="M7 7L13 13M13 7L7 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                      </svg>
                      Validation Failed
                    </>
                  )}
                </div>
                {event.event.validationResult.errors?.length > 0 && (
                  <div className="validation-errors">
                    <h4>Errors:</h4>
                    <ul>
                      {event.event.validationResult.errors.map((error, i) => (
                        <li key={i}>{error}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Errors */}
          {event.event.errors && event.event.errors.length > 0 && (
            <div className="detail-section">
              <h3 className="detail-heading">Errors</h3>
              <div className="validation-errors">
                {event.event.errors.map((error, i) => (
                  <div key={i} className="error-item">
                    <strong>{error.type}:</strong> {error.message}
                    {error.occurredAt && (
                      <span className="error-time">
                        {' '}({format(new Date(error.occurredAt), 'PPpp')})
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Raw Payload */}
          <div className="detail-section">
            <h3 className="detail-heading">Raw Payload</h3>
            <pre className="code-block">
              {JSON.stringify(event.event.rawPayload, null, 2)}
            </pre>
          </div>

          {/* Transformed Payload */}
          {event.event.transformedPayload && (
            <div className="detail-section">
              <h3 className="detail-heading">Transformed Payload</h3>
              <pre className="code-block">
                {JSON.stringify(event.event.transformedPayload, null, 2)}
              </pre>
            </div>
          )}

          {/* Audit Trail */}
          {event.auditTrail && event.auditTrail.length > 0 && (
            <div className="detail-section">
              <h3 className="detail-heading">Audit Trail</h3>
              <div className="audit-trail">
                {event.auditTrail.map((log, i) => (
                  <div key={i} className="audit-item">
                    <div className="audit-marker"></div>
                    <div className="audit-content">
                      <div className="audit-header">
                        <span className="audit-action">{log.action}</span>
                        <span className="audit-time">
                          {format(new Date(log.timestamp), 'HH:mm:ss')}
                        </span>
                      </div>
                      <p className="audit-message">{log.result.message}</p>
                      {log.result.errorDetails && (
                        <p className="audit-error">{log.result.errorDetails}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const DetailItem = ({ label, value, mono }) => (
  <div className="detail-item">
    <span className="detail-label">{label}</span>
    <span className={`detail-value ${mono ? 'mono' : ''}`}>{value}</span>
  </div>
);



export default EventLog;