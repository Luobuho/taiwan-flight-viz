// components/PanelManager.js
import React, { useState, useEffect, useRef } from 'react';
import ControlPanel from './ControlPanel';
import TopRoutesPanel from './TopRoutesPanel';
import TopCountriesPanel from './TopCountriesPanel';
import StatsPanel from './StatsPanel';

function PanelManager({
  // Control Panel props
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
  // TopRoutes & TopCountries Panel props
  getPreviousYearMonth,
  airportCountryMap,
  // Stats Panel props
  totalFlights,
  totalPassengers,
  avgLoadFactor,
  // Performance settings - Fixed: Added these props to the function parameters
  performanceMode,
  setPerformanceMode,
  togglePerformanceStats
}) {
  // Panel collapse states
  const [controlsCollapsed, setControlsCollapsed] = useState(false);
  const [topRoutesCollapsed, setTopRoutesCollapsed] = useState(true);
  const [topCountriesCollapsed, setTopCountriesCollapsed] = useState(true);
  const [statsCollapsed, setStatsCollapsed] = useState(true);
  
  // Panel height references for positioning
  const controlsPanelRef = useRef(null);
  const topRoutesPanelRef = useRef(null);
  const topCountriesPanelRef = useRef(null);
  
  // Track heights for dynamic positioning
  const [controlsPanelHeight, setControlsPanelHeight] = useState(0);
  const [topRoutesPanelHeight, setTopRoutesPanelHeight] = useState(0);
  const [topCountriesPanelHeight, setTopCountriesPanelHeight] = useState(0);
  
  // 添加虛擬狀態來強制重新渲染
  const [dummyUpdate, setDummyUpdate] = useState({});
  
  // Observer to track panel height changes
  useEffect(() => {
    const resizeObserver = new ResizeObserver(entries => {
      // 延遲測量以確保 DOM 完全渲染
      setTimeout(() => {
        for (let entry of entries) {
          if (entry.target === controlsPanelRef.current) {
            setControlsPanelHeight(entry.target.offsetHeight);
          } else if (entry.target === topRoutesPanelRef.current) {
            setTopRoutesPanelHeight(entry.target.offsetHeight);
          } else if (entry.target === topCountriesPanelRef.current) {
            setTopCountriesPanelHeight(entry.target.offsetHeight);
          }
        }
      }, 10);
    });
    
    if (controlsPanelRef.current) {
      resizeObserver.observe(controlsPanelRef.current);
    }
    
    if (topRoutesPanelRef.current) {
      resizeObserver.observe(topRoutesPanelRef.current);
    }
    
    if (topCountriesPanelRef.current) {
      resizeObserver.observe(topCountriesPanelRef.current);
    }
    
    return () => resizeObserver.disconnect();
  }, []);
  
  // 當折疊狀態或高度變化時強制更新位置
  useEffect(() => {
    const forceUpdateTimer = setTimeout(() => {
      setDummyUpdate({});
    }, 50);
    
    return () => clearTimeout(forceUpdateTimer);
  }, [controlsCollapsed, topRoutesCollapsed, topCountriesCollapsed, statsCollapsed, 
     controlsPanelHeight, topRoutesPanelHeight, topCountriesPanelHeight]);
  
  // Handle toggling collapse states with coordination
  const toggleControlsCollapsed = () => {
    setControlsCollapsed(!controlsCollapsed);
    if (controlsCollapsed === true) {
      // If opening controls, close others
      setTopRoutesCollapsed(true);
      setTopCountriesCollapsed(true);
      setStatsCollapsed(true);
    }
  };
  
  const toggleTopRoutesCollapsed = () => {
    setTopRoutesCollapsed(!topRoutesCollapsed);
    
    // 如果正在打開前五航線面板，主動更新其高度
    if (topRoutesCollapsed === true) {
      // 關閉其他面板
      setControlsCollapsed(true);
      setTopCountriesCollapsed(true);
      setStatsCollapsed(true);
      
      // 立即測量操作
      setTimeout(() => {
        if (topRoutesPanelRef.current) {
          // 延遲一幀以確保展開轉場已經開始
          requestAnimationFrame(() => {
            // 再延遲一點時間確保內容已經展開
            setTimeout(() => {
              setTopRoutesPanelHeight(topRoutesPanelRef.current.offsetHeight);
            }, 50);
          });
        }
      }, 0);
    }
  };
  
  const toggleTopCountriesCollapsed = () => {
    setTopCountriesCollapsed(!topCountriesCollapsed);
    
    // 如果正在打開前五國家面板，主動更新其高度
    if (topCountriesCollapsed === true) {
      // 關閉其他面板
      setControlsCollapsed(true);
      setTopRoutesCollapsed(true);
      setStatsCollapsed(true);
      
      // 立即測量操作
      setTimeout(() => {
        if (topCountriesPanelRef.current) {
          // 延遲一幀以確保展開轉場已經開始
          requestAnimationFrame(() => {
            // 再延遲一點時間確保內容已經展開
            setTimeout(() => {
              setTopCountriesPanelHeight(topCountriesPanelRef.current.offsetHeight);
            }, 50);
          });
        }
      }, 0);
    }
  };
  
  const toggleStatsCollapsed = () => {
    setStatsCollapsed(!statsCollapsed);
    if (statsCollapsed === true) {
      // If opening stats, close others
      setControlsCollapsed(true);
      setTopRoutesCollapsed(true);
      setTopCountriesCollapsed(true);
    }
  };
  
  // 常數：面板摺疊時的高度
  const COLLAPSED_PANEL_HEIGHT = 40;
  const PANEL_MARGIN = 20;
  
  // Calculate positions for panels
  // 前五航線面板位置 - 只依賴控制面板
  const topRoutesPanelStyle = {
    position: 'absolute',
    top: controlsCollapsed 
      ? `${COLLAPSED_PANEL_HEIGHT + PANEL_MARGIN}px` 
      : `${controlsPanelHeight -20 + PANEL_MARGIN}px`,
    left: '20px',
    transition: 'top 0.3s ease'
  };
  
  // 前五國家面板位置 - 依賴控制面板和航線面板
  const topCountriesPanelStyle = {
    position: 'absolute',
    top: calculateTopCountriesPanelTop(),
    left: '20px',
    transition: 'top 0.3s ease'
  };
  
  // 統計面板位置 - 考慮上方所有面板狀態
  const statsPanelStyle = {
    position: 'absolute',
    top: calculateStatsPanelTop(),
    left: '20px',
    transition: 'top 0.3s ease'
  };
  
  // 計算前五國家面板的頂部位置
  function calculateTopCountriesPanelTop() {
    // 控制面板摺疊時高度
    const controlsHeight = controlsCollapsed 
      ? COLLAPSED_PANEL_HEIGHT 
      : controlsPanelHeight -20;
    
    // 前五航線面板摺疊時高度
    const topRoutesHeight = topRoutesCollapsed 
      ? COLLAPSED_PANEL_HEIGHT 
      : topRoutesPanelHeight -10;
    
    // 總高度計算
    return `${controlsHeight + PANEL_MARGIN + topRoutesHeight + PANEL_MARGIN}px`;
  }
  
  // 計算統計面板的頂部位置 - 修正邏輯
  function calculateStatsPanelTop() {
    // 控制面板摺疊時高度
    const controlsHeight = controlsCollapsed 
      ? COLLAPSED_PANEL_HEIGHT 
      : controlsPanelHeight -20;
    
    // 前五航線面板摺疊時高度
    const topRoutesHeight = topRoutesCollapsed 
      ? COLLAPSED_PANEL_HEIGHT 
      : topRoutesPanelHeight -10;
    
    // 前五國家面板摺疊時高度
    const topCountriesHeight = topCountriesCollapsed 
      ? COLLAPSED_PANEL_HEIGHT 
      : topCountriesPanelHeight -10;
    
    // 計算所有上方面板的總高度（包括間距）
    let totalTopHeight = controlsHeight + PANEL_MARGIN;
    
    // 加上前五航線面板的高度（無論是否摺疊）
    totalTopHeight += topRoutesHeight + PANEL_MARGIN;
    
    // 加上前五國家面板的高度（無論是否摺疊）
    totalTopHeight += topCountriesHeight + PANEL_MARGIN;
    
    return `${totalTopHeight}px`;
  }
  
  // 初始測量面板高度的輔助函數
  useEffect(() => {
    function measurePanelHeights() {
      if (controlsPanelRef.current && controlsPanelHeight === 0) {
        setControlsPanelHeight(controlsPanelRef.current.offsetHeight);
      }
      
      if (topRoutesPanelRef.current && topRoutesPanelHeight === 0) {
        setTopRoutesPanelHeight(topRoutesPanelRef.current.offsetHeight);
      }
      
      if (topCountriesPanelRef.current && topCountriesPanelHeight === 0) {
        setTopCountriesPanelHeight(topCountriesPanelRef.current.offsetHeight);
      }
    }
    
    // 初始測量
    measurePanelHeights();
    
    // 再次嘗試測量（確保 DOM 已完全渲染）
    const timer = setTimeout(measurePanelHeights, 100);
    
    return () => clearTimeout(timer);
  }, [controlsPanelHeight, topRoutesPanelHeight, topCountriesPanelHeight]);
  
  // 監聽窗口尺寸變化
  useEffect(() => {
    function handleResize() {
      setDummyUpdate({});
    }
    
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  
  return (
    <>
      <ControlPanel
        ref={controlsPanelRef}
        viewMode={viewMode}
        setViewMode={setViewMode}
        loading={loading}
        selectedYearMonth={selectedYearMonth}
        setSelectedYearMonth={setSelectedYearMonth}
        yearMonths={yearMonths}
        flightData={flightData}
        isPlaying={isPlaying}
        togglePlay={togglePlay}
        selectedAirport={selectedAirport}
        setSelectedAirport={setSelectedAirport}
        colorScaleData={colorScaleData}
        displayMode={displayMode}
        setDisplayMode={setDisplayMode}
        collapsed={controlsCollapsed}
        toggleCollapsed={toggleControlsCollapsed}
        // Fixed: Added performance-related props
        performanceMode={performanceMode}
        setPerformanceMode={setPerformanceMode}
        togglePerformanceStats={togglePerformanceStats}
      />
      
      <TopRoutesPanel
        ref={topRoutesPanelRef}
        selectedYearMonth={selectedYearMonth}
        yearMonths={yearMonths}
        flightData={flightData}
        getPreviousYearMonth={getPreviousYearMonth}
        collapsed={topRoutesCollapsed}
        toggleCollapsed={toggleTopRoutesCollapsed}
        style={topRoutesPanelStyle}
      />
      
      <TopCountriesPanel
        ref={topCountriesPanelRef}
        selectedYearMonth={selectedYearMonth}
        yearMonths={yearMonths}
        flightData={flightData}
        airportCountryMap={airportCountryMap}
        getPreviousYearMonth={getPreviousYearMonth}
        collapsed={topCountriesCollapsed}
        toggleCollapsed={toggleTopCountriesCollapsed}
        style={topCountriesPanelStyle}
      />
      
      <StatsPanel
        totalFlights={totalFlights}
        totalPassengers={totalPassengers}
        avgLoadFactor={avgLoadFactor}
        collapsed={statsCollapsed}
        toggleCollapsed={toggleStatsCollapsed}
        style={statsPanelStyle}
      />
    </>
  );
}

export default PanelManager;