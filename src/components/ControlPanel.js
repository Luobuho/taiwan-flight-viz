// components/ControlPanel.js
import React, { useMemo, forwardRef } from 'react';

const ControlPanel = forwardRef(({
  viewMode,
  setViewMode,
  loading,
  selectedYearMonth,
  setSelectedYearMonth,
  yearMonths,
  flightData,
  isPlaying,
  togglePlay,
  selectedAirport,
  setSelectedAirport,
  colorScaleData,
  displayMode,
  setDisplayMode,
  collapsed,
  toggleCollapsed,
  style = {}
}, ref) => {
  // 計算可選擇的機場 - 僅台灣機場
  const airportOptions = useMemo(() => {
    if (!flightData.airports) return [];
    
    // 台灣機場關鍵字過濾
    const taiwanKeywords = ['桃園', '臺北', '高雄', '臺中', '花蓮', '澎湖', '臺南'];
    
    return [
      { label: "-- 選擇機場 --", value: "" },
      ...flightData.airports
        .filter(airport => 
          airport.longitude && airport.latitude && // 確保有坐標
          taiwanKeywords.some(keyword => airport.name.includes(keyword)) // 只包含台灣機場
        )
        .sort((a, b) => a.name.localeCompare(b.name)) // 按名稱排序
        .map(airport => ({
          label: airport.name,
          value: airport.name
        }))
    ];
  }, [flightData.airports]);
  
  // 計算月份標籤
  const monthLabels = useMemo(() => {
    if (!yearMonths || yearMonths.length === 0 || !flightData.flights) return [];
    
    return yearMonths.map(ym => {
      const flight = flightData.flights.find(f => String(f.yearMonth) === String(ym));
      return flight ? flight.yearMonthStr : ym;
    });
  }, [yearMonths, flightData.flights]);
  
  // 處理月份變更
  const handleMonthChange = (e) => {
    const value = e.target.value;
    setSelectedYearMonth(value);
  };
  
  // 處理機場變更
  const handleAirportChange = (e) => {
    const value = e.target.value;
    setSelectedAirport(value || null);
  };

  // 處理顯示模式變更
  const handleDisplayModeChange = (mode) => {
    setDisplayMode(mode);
  };

  // 獲取顯示模式圖標和顏色
  const getDisplayModeIcon = (mode) => {
    switch(mode) {
      case 'routes':
        return { icon: '↔️', label: '航線', description: '只顯示靜態航線' };
      case 'flights':
        return { icon: '✈️', label: '航班', description: '只顯示動態航班' };
      case 'both':
        return { icon: '🌐', label: '全部', description: '同時顯示航線和航班' };
      default:
        return { icon: '🌐', label: '全部', description: '' };
    }
  };

  // 合併外部樣式和本地樣式
  const combinedStyle = {
    ...style
  };

  return (
    <div className="controls-panel panel" style={combinedStyle} ref={ref}>
      <div className="panel-header" onClick={toggleCollapsed}>
        <h3>台灣國際航線視覺化</h3>
        <button className={`panel-toggle ${collapsed ? 'collapsed' : ''}`}>
          {collapsed ? '▶' : '▼'}
        </button>
      </div>
      
      <div className={`panel-content ${collapsed ? 'collapsed' : ''}`}>
        {loading ? (
          <div className="loading-indicator">載入中...</div>
        ) : (
          <>
            <div className="control-group">
              <label>視圖模式</label>
              <div className="button-group">
                <button 
                  className={`control-button ${viewMode === 'map' ? 'active' : ''}`}
                  onClick={() => setViewMode('map')}
                >
                  2D地圖
                </button>
                <button 
                  className={`control-button ${viewMode === 'globe' ? 'active' : ''}`}
                  onClick={() => setViewMode('globe')}
                >
                  3D地球
                </button>
              </div>
            </div>
            
            <div className="control-group">
              <label>顯示選項</label>
              <div className="display-mode-buttons">
                {['routes', 'flights', 'both'].map(mode => {
                  const { icon, label, description } = getDisplayModeIcon(mode);
                  return (
                    <button 
                      key={mode}
                      className={`display-mode-button ${displayMode === mode ? 'active' : ''}`}
                      onClick={() => handleDisplayModeChange(mode)}
                      title={description}
                    >
                      <span className="display-mode-icon">{icon}</span>
                      <span className="display-mode-label">{label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
            
            <div className="control-group">
              <label>年月選擇</label>
              <select 
                className="select-control"
                value={selectedYearMonth || ''}
                onChange={handleMonthChange}
              >
                {yearMonths.map((ym, index) => (
                  <option key={ym} value={ym}>
                    {monthLabels[index] || ym}
                  </option>
                ))}
              </select>
              
              <div className="timeline-controls">
                <button className="play-button" onClick={togglePlay}>
                  {isPlaying ? '⏸' : '▶'}
                </button>
                <div className="timeline-slider">
                  <input 
                    type="range" 
                    min="0" 
                    max={yearMonths.length - 1} 
                    value={yearMonths.indexOf(selectedYearMonth) || 0}
                    onChange={(e) => setSelectedYearMonth(yearMonths[e.target.value])}
                    disabled={isPlaying}
                    style={{ width: '100%' }}
                  />
                </div>
              </div>
            </div>
            
            <div className="control-group">
              <label>選擇台灣機場</label>
              <select 
                className="select-control"
                value={selectedAirport || ''}
                onChange={handleAirportChange}
              >
                {airportOptions.map(option => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            
            <div className="legend">
              <h3>圖例</h3>
              <div className="legend-item">
                <div className="legend-gradient-improved"></div>
                <div className="legend-labels">
                  <span>少 ({Math.round(colorScaleData.min).toLocaleString()})</span>
                  <span>乘客數量</span>
                  <span>多 ({Math.round(colorScaleData.max).toLocaleString()})</span>
                </div>
              </div>
              
              <div className="legend-color-description">
                <span className="legend-color" style={{ backgroundColor: 'rgb(255, 255, 0)' }}></span>
                <span>選中的航線</span>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
});

export default ControlPanel;