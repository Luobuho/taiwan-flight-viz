// components/StatsPanel.js
import React from 'react';

function StatsPanel({ 
  totalFlights, 
  totalPassengers, 
  avgLoadFactor,
  collapsed,
  toggleCollapsed,
  style = {}
}) {
  return (
    <div className="top-routes-panel panel" style={style}>
      <div className="panel-header" onClick={toggleCollapsed}>
        <h3>航班統計數據</h3>
        <button className={`panel-toggle ${collapsed ? 'collapsed' : ''}`}>
          {collapsed ? '▶' : '▼'}
        </button>
      </div>
      
      <div className={`panel-content ${collapsed ? 'collapsed' : ''}`}>
        <div className="stat-items">
          <div className="stat-item">
            <span className="stat-label">總航班數:</span>
            <span className="stat-value">{Math.round(totalFlights).toLocaleString()} 班</span>
          </div>
          <div className="stat-item">
            <span className="stat-label">總乘客數:</span>
            <span className="stat-value">{Math.round(totalPassengers).toLocaleString()} 人次</span>
          </div>
          <div className="stat-item">
            <span className="stat-label">平均載客率:</span>
            <span className="stat-value">{(avgLoadFactor * 100).toFixed(1)}%</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default StatsPanel;