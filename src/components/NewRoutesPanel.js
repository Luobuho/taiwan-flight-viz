// components/NewRoutesPanel.js
import React, { useMemo } from 'react';

function NewRoutesPanel({
  selectedYearMonth,
  yearMonths,
  flightData,
  getPreviousYearMonth,
  collapsed,
  toggleCollapsed,
  style = {}
}) {
  // 計算新增和停航的航線
  const routeChanges = useMemo(() => {
    if (!selectedYearMonth || flightData.flights.length === 0) {
      return { newRoutes: [], discontinuedRoutes: [] };
    }

    // 獲取前一個月的數據
    const previousYM = getPreviousYearMonth(selectedYearMonth);
    
    if (!previousYM) {
      // 如果是第一個月，視所有航線為新增
      const currentMonthFlights = flightData.flights.filter(
        f => String(f.yearMonth) === String(selectedYearMonth)
      );
      
      const newRoutes = currentMonthFlights.map(f => ({
        source: f.source,
        target: f.target,
        passengers: f.passengers
      }));
      
      return { 
        newRoutes,
        discontinuedRoutes: []
      };
    }
    
    // 獲取當前月和前一個月的航線
    const currentMonthFlights = flightData.flights.filter(
      f => String(f.yearMonth) === String(selectedYearMonth)
    );
    
    const previousMonthFlights = flightData.flights.filter(
      f => String(f.yearMonth) === String(previousYM)
    );
    
    // 創建航線ID集合，用於比較
    const currentRouteIds = new Set(
      currentMonthFlights.map(f => `${f.source}-${f.target}`)
    );
    
    const previousRouteIds = new Set(
      previousMonthFlights.map(f => `${f.source}-${f.target}`)
    );
    
    // 找出新增的航線
    const newRoutes = currentMonthFlights
      .filter(f => !previousRouteIds.has(`${f.source}-${f.target}`))
      .map(f => ({
        source: f.source,
        target: f.target,
        passengers: f.passengers
      }));
    
    // 找出停航的航線
    const discontinuedRoutes = previousMonthFlights
      .filter(f => !currentRouteIds.has(`${f.source}-${f.target}`))
      .map(f => ({
        source: f.source,
        target: f.target,
        passengers: f.passengers
      }));
    
    return { newRoutes, discontinuedRoutes };
  }, [selectedYearMonth, flightData.flights, getPreviousYearMonth]);

  // 如果沒有變化，不顯示面板
  if (
    routeChanges.newRoutes.length === 0 && 
    routeChanges.discontinuedRoutes.length === 0
  ) {
    return null;
  }

  // 獲取前一個月的顯示名稱
  const getPreviousMonthName = () => {
    const previousYM = getPreviousYearMonth(selectedYearMonth);
    if (!previousYM) return "";
    
    const flight = flightData.flights.find(f => String(f.yearMonth) === String(previousYM));
    return flight ? flight.yearMonthStr : "";
  };
  
  // 獲取當前月的顯示名稱
  const getCurrentMonthName = () => {
    const flight = flightData.flights.find(f => String(f.yearMonth) === String(selectedYearMonth));
    return flight ? flight.yearMonthStr : "";
  };
  
  const currentMonthName = getCurrentMonthName();
  const previousMonthName = getPreviousMonthName();

  // 合併外部樣式和本地樣式
  const combinedStyle = {
    ...style
  };

  // console.log("NewRoutesPanel 樣式:", combinedStyle);

  return (
    <div className="new-routes-panel panel" style={combinedStyle}>
      <div className="panel-header" onClick={toggleCollapsed}>
        <h3>航線變化</h3>
        <button className={`panel-toggle ${collapsed ? 'collapsed' : ''}`}>
          {collapsed ? '▶' : '▼'}
        </button>
      </div>
      
      <div className={`panel-content ${collapsed ? 'collapsed' : ''}`}>
        {previousMonthName && (
          <div className="time-period">
            {previousMonthName} → {currentMonthName}
          </div>
        )}
        
        <div className="route-change-container">
          {/* 確保兩個部分都有足夠空間顯示 - 使用固定高度 */}
          <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 250px)' }}>
            {/* 上半部分 - 新增航線 */}
            {routeChanges.newRoutes.length > 0 && (
              <div className="route-change-section" style={{ flex: '1 1 50%' }}>
                <h4>新增航線 ({routeChanges.newRoutes.length}條)</h4>
                <div className="route-list-container" style={{ height: 'calc(100% - 30px)', overflow: 'hidden' }}>
                  <ul className="route-list" style={{ height: '100%', overflowY: 'auto' }}>
                    {routeChanges.newRoutes
                      .sort((a, b) => b.passengers - a.passengers)
                      .map((route, index) => (
                        <li key={`new-${index}`} className="new-route">
                          <span className="route-icon">⬆️</span>
                          <span className="route-name">{route.source} ⟷ {route.target}</span>
                          <span className="route-passengers">
                            {Math.round(route.passengers).toLocaleString()} 人次
                          </span>
                        </li>
                      ))}
                  </ul>
                </div>
              </div>
            )}
            
            {/* 下半部分 - 停航航線 */}
            {routeChanges.discontinuedRoutes.length > 0 && (
              <div className="route-change-section" style={{ flex: '1 1 50%' }}>
                <h4>停航航線 ({routeChanges.discontinuedRoutes.length}條)</h4>
                <div className="route-list-container" style={{ height: 'calc(100% - 30px)', overflow: 'hidden' }}>
                  <ul className="route-list" style={{ height: '100%', overflowY: 'auto' }}>
                    {routeChanges.discontinuedRoutes
                      .sort((a, b) => b.passengers - a.passengers)
                      .map((route, index) => (
                        <li key={`disc-${index}`} className="discontinued-route">
                          <span className="route-icon">⬇️</span>
                          <span className="route-name">{route.source} ⟷ {route.target}</span>
                          <span className="route-passengers">
                            {Math.round(route.passengers).toLocaleString()} 人次
                          </span>
                        </li>
                      ))}
                  </ul>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default NewRoutesPanel;