
import React from 'react';
import axios from 'axios';



function Select({ label, value, onChange, children }) {
  return (
    <div style={{ marginBottom: 15 }}>
      <label style={{ display: 'block', marginBottom: 5, fontSize: 13, fontWeight: 500 }}>
        {label}
      </label>
      <select
        value={value}
        onChange={onChange}
        style={{
          width: '100%',
          padding: '8px',
          border: '1px solid #ccc',
          fontSize: 13,
          boxSizing: 'border-box',
          backgroundColor: '#fff',
        }}
      >
        {children}
      </select>
    </div>
  );
}

function Button({ children, onClick, disabled, small, secondary, style = {} }) {
  const baseStyle = {
    padding: small ? '6px 12px' : '10px 20px',
    fontSize: small ? 12 : 13,
    backgroundColor: disabled ? '#e0e0e0' : (secondary ? '#fff' : '#0073aa'),
    color: disabled ? '#999' : (secondary ? '#333' : '#fff'),
    border: `1px solid ${disabled ? '#ccc' : (secondary ? '#ccc' : '#0073aa')}`,
    cursor: disabled ? 'not-allowed' : 'pointer',
    fontWeight: 500,
    ...style,
  };
  return <button onClick={onClick} disabled={disabled} style={baseStyle}>{children}</button>;
}

function Input({ label, value, onChange, type = 'text' }) {
  return (
    <div style={{ marginBottom: 0 }}>
      <label style={{ display: 'block', marginBottom: 5, fontSize: 13, fontWeight: 500 }}>{label}</label>
      <input type={type} value={value} onChange={onChange} style={{ width: '100%', padding: '8px', border: '1px solid #ccc', fontSize: 13, boxSizing: 'border-box' }} />
    </div>
  );
}

function Table({ children }) {
  return (
    <div style={{ 
      backgroundColor: '#fff', 
      border: '1px solid #ccc', 
      // ✅ REMOVED: overflow: 'auto' - this was clipping the dropdown
      // Instead, only the tbody will scroll if needed
    }}>
      <table style={{ 
        width: '100%', 
        borderCollapse: 'collapse', 
        fontSize: 13,
        // ✅ Ensure table doesn't create stacking context issues
        position: 'relative'
      }}>
        {children}
      </table>
    </div>
  );
}
const tableStyles = `
  table {
    /* Ensure table doesn't clip dropdowns */
    overflow: visible !important;
  }
  
  table thead tr {
    background-color: #f5f5f5;
    border-bottom: 1px solid #ccc;
  }
  
  table th {
    padding: 12px;
    text-align: left;
    font-weight: 600;
    font-size: 12px;
    text-transform: uppercase;
    color: #555;
    position: relative; /* For proper stacking */
  }
  
  table tbody {
    /* Only tbody scrolls if content is too long */
    max-height: none;
    overflow: visible;
  }
  
  table tbody tr {
    border-bottom: 1px solid #eee;
    position: relative; /* Ensures proper stacking for dropdowns */
  }
  
  table tbody tr:hover {
    background-color: #f9f9f9;
  }
  
  table td {
    padding: 12px;
    position: relative; /* Critical for dropdown positioning */
    overflow: visible; /* Allow dropdown to overflow */
  }
  
  /* Ensure last column (Actions) doesn't clip */
  table td:last-child {
    overflow: visible !important;
  }
`;


// ============================================================================
// STYLES INJECTION
// ============================================================================

const styleSheet = document.createElement("style");
styleSheet.innerText = tableStyles;
if (!document.head.querySelector('style[data-table-styles]')) {
  styleSheet.setAttribute('data-table-styles', 'true');
  document.head.appendChild(styleSheet);
}


export { Select, Button, Input, Table };