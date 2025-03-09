import React, { useMemo, forwardRef } from 'react';

const TopRoutesPanel = forwardRef(({
  selectedYearMonth,
  yearMonths,
  flightData,
  getPreviousYearMonth,
  collapsed,
  toggleCollapsed,
  style = {},
}, ref) => {
  const topRoutesData = useMemo(() => {
    if (!selectedYearMonth || flightData.flights.length === 0) {
      return { currentTopRoutes: [], previousRanks: {} };
    }
    
    const currentMonthFlights = flightData.flights.filter(
      f => String(f.yearMonth) === String(selectedYearMonth)
    );

    const routeMap = {};
    
    currentMonthFlights.forEach(flight => {
      const routeId = `${flight.source}-${flight.target}`;
      
      if (!routeMap[routeId]) {
        routeMap[routeId] = {
          source: flight.source,
          target: flight.target,
          passengers: 0,
          flights: 0
        };
      }
      
      routeMap[routeId].passengers += flight.passengers;
      routeMap[routeId].flights += flight.flights;
    });

    const sortedRoutes = Object.values(routeMap)
      .sort((a, b) => b.passengers - a.passengers);
    
    const currentTopRoutes = sortedRoutes.slice(0, 5).map((route, index) => ({
      ...route,
      rank: index + 1
    }));

    const previousRanks = {};
    const previousYM = getPreviousYearMonth(selectedYearMonth);
    
    if (previousYM) {
      const previousMonthFlights = flightData.flights.filter(
        f => String(f.yearMonth) === String(previousYM)
      );

      const prevRouteMap = {};
      
      previousMonthFlights.forEach(flight => {
        const routeId = `${flight.source}-${flight.target}`;
        
        if (!prevRouteMap[routeId]) {
          prevRouteMap[routeId] = {
            source: flight.source,
            target: flight.target,
            passengers: 0
          };
        }
        
        prevRouteMap[routeId].passengers += flight.passengers;
      });

      const prevSortedRoutes = Object.values(prevRouteMap)
        .sort((a, b) => b.passengers - a.passengers);
      
      prevSortedRoutes.forEach((route, index) => {
        const routeId = `${route.source}-${route.target}`;
        previousRanks[routeId] = index + 1;
      });
    }
    
    return { currentTopRoutes, previousRanks };
  }, [selectedYearMonth, flightData.flights, getPreviousYearMonth]);

  if (topRoutesData.currentTopRoutes.length === 0) {
    return null;
  }

  const getCurrentMonthName = () => {
    const flight = flightData.flights.find(f => String(f.yearMonth) === String(selectedYearMonth));
    return flight ? flight.yearMonthStr : "";
  };

  const currentMonthName = getCurrentMonthName();

  const getRankChange = (route) => {
    const routeId = `${route.source}-${route.target}`;
    const previousRank = topRoutesData.previousRanks[routeId];

    if (!previousRank) {
      return { icon: '🆕', text: '新上榜', class: 'rank-new' };
    }

    const diff = previousRank - route.rank;

    if (diff > 0) {
      return { icon: '↑', text: `上升 ${diff} 名`, class: 'rank-up' };
    } else if (diff < 0) {
      return { icon: '↓', text: `下降 ${Math.abs(diff)} 名`, class: 'rank-down' };
    } else {
      return { icon: '⟷', text: '維持不變', class: 'rank-same' };
    }
  };

  return (
    <div 
      className="top-routes-panel panel"
      style={style}
      ref={ref}
    >
      <div className="panel-header" onClick={toggleCollapsed}>
        <h3>乘客數量前五航線</h3>
        <button className={`panel-toggle ${collapsed ? 'collapsed' : ''}`}>
          {collapsed ? '▶' : '▼'}
        </button>
      </div>
      
      <div className={`panel-content ${collapsed ? 'collapsed' : ''}`}>
        <div className="time-period">{currentMonthName}</div>
        
        <table className="top-routes-table">
          <thead>
            <tr>
              <th className="rank-column">排名</th>
              <th className="route-column">航線</th>
              <th className="passengers-column">乘客數</th>
              <th className="change-column">變化</th>
            </tr>
          </thead>
          <tbody>
            {topRoutesData.currentTopRoutes.map(route => {
              const rankChange = getRankChange(route);
              
              return (
                <tr key={`${route.source}-${route.target}`}>
                  <td className="rank-column">{route.rank}</td>
                  <td className="route-column">{route.source} ⟷ {route.target}</td>
                  <td className="passengers-column">{Math.round(route.passengers).toLocaleString()}</td>
                  <td className={`change-column ${rankChange.class}`}>
                    <span className="rank-icon">{rankChange.icon}</span>
                    <span className="rank-text">{rankChange.text}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
});

export default TopRoutesPanel;