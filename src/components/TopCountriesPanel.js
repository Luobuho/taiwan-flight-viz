// components/TopCountriesPanel.js
import React, { useMemo, forwardRef } from 'react';

const TopCountriesPanel = forwardRef(({
  selectedYearMonth,
  yearMonths,
  flightData,
  airportCountryMap,
  getPreviousYearMonth,
  collapsed,
  toggleCollapsed,
  style = {},
}, ref) => {
  // 從機場名稱獲取國家
  const getCountryFromAirport = (airportName) => {
    if (!airportCountryMap || !airportCountryMap[airportName]) {
      return "未知";
    }
    return airportCountryMap[airportName].name;
  };

  // 檢查是否為台灣機場
  const isTaiwanAirport = (airportName) => {
    const taiwanKeywords = ['桃園', '臺北', '高雄', '臺中', '花蓮', '澎湖', '臺南', '台北', '台中', '台南'];
    return taiwanKeywords.some(keyword => airportName?.includes(keyword) || false);
  };

  // 計算前五目的地國家和出發國家
  const topCountriesData = useMemo(() => {
    if (!selectedYearMonth || !flightData.flights || flightData.flights.length === 0 || !airportCountryMap) {
      return { 
        topDestinationCountries: [], 
        topDepartureCountries: [], 
        previousDestRanks: {}, 
        previousDeptRanks: {} 
      };
    }
    
    // 獲取當前月份的航班
    const currentMonthFlights = flightData.flights.filter(
      f => String(f.yearMonth) === String(selectedYearMonth)
    );

    // 目的地國家計數
    const destinationCountries = {};
    // 出發地國家計數
    const departureCountries = {};
    
    // 遍歷所有航班，統計各個國家的數據
    currentMonthFlights.forEach(flight => {
      const isSourceTaiwan = isTaiwanAirport(flight.source);
      const isTargetTaiwan = isTaiwanAirport(flight.target);
      
      // 如果來源是台灣，則目標是目的地國家
      if (isSourceTaiwan && !isTargetTaiwan) {
        const country = getCountryFromAirport(flight.target);
        if (country) {
          if (!destinationCountries[country]) {
            destinationCountries[country] = {
              name: country,
              passengers: 0,
              flights: 0
            };
          }
          destinationCountries[country].passengers += flight.passengers;
          destinationCountries[country].flights += flight.flights || 1;
        }
      }
      
      // 如果目標是台灣，則來源是出發地國家
      if (!isSourceTaiwan && isTargetTaiwan) {
        const country = getCountryFromAirport(flight.source);
        if (country) {
          if (!departureCountries[country]) {
            departureCountries[country] = {
              name: country,
              passengers: 0,
              flights: 0
            };
          }
          departureCountries[country].passengers += flight.passengers;
          departureCountries[country].flights += flight.flights || 1;
        }
      }
    });

    // 轉換為數組並排序
    const sortedDestinations = Object.values(destinationCountries)
      .sort((a, b) => b.passengers - a.passengers)
      .slice(0, 5)
      .map((country, index) => ({
        ...country,
        rank: index + 1
      }));
      
    const sortedDepartures = Object.values(departureCountries)
      .sort((a, b) => b.passengers - a.passengers)
      .slice(0, 5)
      .map((country, index) => ({
        ...country,
        rank: index + 1
      }));
    
    // 獲取前一個月的數據，用於比較排名變化
    const previousYM = getPreviousYearMonth(selectedYearMonth);
    const previousDestRanks = {};
    const previousDeptRanks = {};
    
    if (previousYM) {
      const previousMonthFlights = flightData.flights.filter(
        f => String(f.yearMonth) === String(previousYM)
      );

      // 計算前一個月的目的地國家排名
      const prevDestCountries = {};
      const prevDeptCountries = {};
      
      previousMonthFlights.forEach(flight => {
        const isSourceTaiwan = isTaiwanAirport(flight.source);
        const isTargetTaiwan = isTaiwanAirport(flight.target);
        
        // 目的地國家統計
        if (isSourceTaiwan && !isTargetTaiwan) {
          const country = getCountryFromAirport(flight.target);
          if (country) {
            if (!prevDestCountries[country]) {
              prevDestCountries[country] = {
                name: country,
                passengers: 0
              };
            }
            prevDestCountries[country].passengers += flight.passengers;
          }
        }
        
        // 出發地國家統計
        if (!isSourceTaiwan && isTargetTaiwan) {
          const country = getCountryFromAirport(flight.source);
          if (country) {
            if (!prevDeptCountries[country]) {
              prevDeptCountries[country] = {
                name: country,
                passengers: 0
              };
            }
            prevDeptCountries[country].passengers += flight.passengers;
          }
        }
      });

      // 排序並獲取排名
      const sortedPrevDest = Object.values(prevDestCountries)
        .sort((a, b) => b.passengers - a.passengers);
        
      const sortedPrevDept = Object.values(prevDeptCountries)
        .sort((a, b) => b.passengers - a.passengers);
      
      // 建立排名映射
      sortedPrevDest.forEach((country, index) => {
        previousDestRanks[country.name] = index + 1;
      });
      
      sortedPrevDept.forEach((country, index) => {
        previousDeptRanks[country.name] = index + 1;
      });
    }
    
    return { 
      topDestinationCountries: sortedDestinations, 
      topDepartureCountries: sortedDepartures,
      previousDestRanks,
      previousDeptRanks
    };
  }, [selectedYearMonth, flightData.flights, airportCountryMap, getPreviousYearMonth]);

  // 如果沒有國家數據，不顯示面板
  if (
    topCountriesData.topDestinationCountries.length === 0 && 
    topCountriesData.topDepartureCountries.length === 0
  ) {
    return null;
  }

  // 獲取當前月份名稱
  const getCurrentMonthName = () => {
    const flight = flightData.flights.find(f => String(f.yearMonth) === String(selectedYearMonth));
    return flight ? flight.yearMonthStr : "";
  };

  const currentMonthName = getCurrentMonthName();

  // 獲取排名變化信息（上升、下降、不變、新上榜）
  const getRankChange = (country, isDestination) => {
    const previousRanks = isDestination ? 
      topCountriesData.previousDestRanks : 
      topCountriesData.previousDeptRanks;
    
    const previousRank = previousRanks[country.name];

    if (!previousRank) {
      return { icon: '🆕', text: '新上榜', class: 'rank-new' };
    }

    const diff = previousRank - country.rank;

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
        <h3>乘客數量前五國家</h3>
        <button className={`panel-toggle ${collapsed ? 'collapsed' : ''}`}>
          {collapsed ? '▶' : '▼'}
        </button>
      </div>
      
      <div className={`panel-content ${collapsed ? 'collapsed' : ''}`}>
        <div className="time-period">{currentMonthName}</div>
        
        {/* 目的地國家排名 */}
        <h4 style={{ marginTop: '10px', marginBottom: '8px' }}>最熱門目的地國家</h4>
        <table className="top-routes-table">
          <thead>
            <tr>
              <th className="rank-column">排名</th>
              <th className="route-column">國家</th>
              <th className="passengers-column">乘客數</th>
              <th className="change-column">變化</th>
            </tr>
          </thead>
          <tbody>
            {topCountriesData.topDestinationCountries.map(country => {
              const rankChange = getRankChange(country, true);
              
              return (
                <tr key={`dest-${country.name}`}>
                  <td className="rank-column">{country.rank}</td>
                  <td className="route-column">{country.name}</td>
                  <td className="passengers-column">{Math.round(country.passengers).toLocaleString()}</td>
                  <td className={`change-column ${rankChange.class}`}>
                    <span className="rank-icon">{rankChange.icon}</span>
                    <span className="rank-text">{rankChange.text}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        
        {/* 出發地國家排名 */}
        <h4 style={{ marginTop: '16px', marginBottom: '8px' }}>最多來台旅客國家</h4>
        <table className="top-routes-table">
          <thead>
            <tr>
              <th className="rank-column">排名</th>
              <th className="route-column">國家</th>
              <th className="passengers-column">乘客數</th>
              <th className="change-column">變化</th>
            </tr>
          </thead>
          <tbody>
            {topCountriesData.topDepartureCountries.map(country => {
              const rankChange = getRankChange(country, false);
              
              return (
                <tr key={`dept-${country.name}`}>
                  <td className="rank-column">{country.rank}</td>
                  <td className="route-column">{country.name}</td>
                  <td className="passengers-column">{Math.round(country.passengers).toLocaleString()}</td>
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

export default TopCountriesPanel;