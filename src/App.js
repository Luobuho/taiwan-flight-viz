// App.js - Main container component with performance optimizations
import React, { useState, useEffect, useRef} from 'react';
import FlightMap from './components/FlightMap';
import GlobeMap from './components/GlobeMap';
import RouteChart from './components/RouteChart';
import NewRoutesPanel from './components/NewRoutesPanel';
import PanelManager from './components/PanelManager';
import useFlightData from './hooks/useFlightData';
import './App.css';

function App() {
  // 視圖模式
  const [viewMode, setViewMode] = useState('map'); // 'map' or 'globe'
  
  // 性能模式設置
  const [performanceMode, setPerformanceMode] = useState('balanced'); // 'high', 'balanced', or 'low'
  
  // 效能監控
  const [fps, setFps] = useState(0);
  const [memoryUsage, setMemoryUsage] = useState(0);
  const [showPerformanceStats, setShowPerformanceStats] = useState(false);
  
  // 載入數據
  const { 
    loading, 
    flightData, 
    yearMonths, 
    enhancedFlights, 
    selectedMonthAirports,
    colorScaleData,
    selectedYearMonth,
    setSelectedYearMonth,
    selectedRouteData: hookRouteData,
    getPreviousYearMonth,
    selectedRoute,
    setSelectedRoute,
    selectedCountry,
    setSelectedCountry,
    airportCountryMap,
    setPerformanceSettings  // 新增：傳遞性能設置到數據鉤子
  } = useFlightData();
  
  // 本地管理路線數據，以支援國家選擇
  const [selectedRouteData, setSelectedRouteData] = useState([]);
  
  // 當鉤子提供的路線數據更新時同步
  useEffect(() => {
    if (hookRouteData && hookRouteData.length > 0) {
      setSelectedRouteData(hookRouteData);
    }
  }, [hookRouteData]);
  
  // 選擇的機場
  const [selectedAirport, setSelectedAirport] = useState(null);
  
  // 顯示選項
  const [displayMode, setDisplayMode] = useState('both'); // 'routes', 'flights', or 'both'

  // 動畫和時間軸狀態
  const [isPlaying, setIsPlaying] = useState(false);
  const [transitionProgress, setTransitionProgress] = useState(1);
  const [animationTime, setAnimationTime] = useState(0);
  
  // 新航線面板摺疊狀態 (保留單獨管理，因為它不在 PanelManager 中)
  const [newRoutesPanelCollapsed, setNewRoutesPanelCollapsed] = useState(false);
  
  // 自動播放參考
  const playIntervalRef = useRef(null);
  const transitionTimerRef = useRef(null);
  const currentIndexRef = useRef(-1);
  const animationFrameRef = useRef(null);
  const lastTimeRef = useRef(performance.now());

  // 性能優化相關設置
  const [maxVisibleFlights, setMaxVisibleFlights] = useState(250);
  const [arcResolution, setArcResolution] = useState(50);
  const [enableAnimations, setEnableAnimations] = useState(true);
  const [showDetailedTooltips, setShowDetailedTooltips] = useState(true);
  
  // 根據性能模式更新設置
  useEffect(() => {
    switch (performanceMode) {
      case 'high':
        setMaxVisibleFlights(500);
        setArcResolution(100);
        setEnableAnimations(true);
        setShowDetailedTooltips(true);
        break;
      case 'balanced':
        setMaxVisibleFlights(250);
        setArcResolution(50);
        setEnableAnimations(true);
        setShowDetailedTooltips(true);
        break;
      case 'low':
        setMaxVisibleFlights(100);
        setArcResolution(20);
        setEnableAnimations(false);
        setShowDetailedTooltips(false);
        break;
    }
    
    // 將性能設置傳遞給數據鉤子
    setPerformanceSettings({
      performanceMode,
      maxVisibleFlights,
      enableAnimations
    });
    
  }, [performanceMode, setPerformanceSettings]);
  
  // 監控幀率
  useEffect(() => {
    if (!showPerformanceStats) return;
    
    let frameCount = 0;
    let rafId;
    
    const updateFps = (timestamp) => {
      frameCount++;
      const now = timestamp;
      
      // 每秒更新一次 FPS
      if (now - lastTimeRef.current > 1000) {
        setFps(Math.round(frameCount * 1000 / (now - lastTimeRef.current)));
        frameCount = 0;
        lastTimeRef.current = now;
        
        // 如果支持性能API，更新內存使用情況
        if (window.performance && window.performance.memory) {
          const memUsed = Math.round(window.performance.memory.usedJSHeapSize / (1024 * 1024));
          setMemoryUsage(memUsed);
        }
      }
      
      rafId = requestAnimationFrame(updateFps);
    };
    
    rafId = requestAnimationFrame(updateFps);
    
    return () => {
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, [showPerformanceStats]);

  // 處理視圖模式變更 - 改進版本
  const handleViewModeChange = (newMode) => {
    console.log(`視圖模式切換: ${viewMode} -> ${newMode}`);
    
    if (viewMode === newMode) return; // 如果模式相同，不做任何更改
    
    if (viewMode === 'globe' && newMode === 'map') {
      console.log('從3D切換到2D');
      // 不需要特別處理，直接切換即可
      setViewMode(newMode);
    } else if (viewMode === 'map' && newMode === 'globe') {
      console.log('從2D切換到3D');
      // 從2D切換到3D時，我們需要完全重建3D地球
      
      // 如果地球已經存在，先強制移除
      if (window.globalMapInstance) {
        try {
          console.log('發現現有地圖實例，標記需要重新初始化');
          window.globeNeedsReinitialize = true;
        } catch (e) {
          console.error('標記重新初始化失敗:', e);
        }
      }
      
      // 切換視圖模式
      setViewMode(newMode);
    }
  };

  // 優化的動畫循環 - 使用效能控制
  useEffect(() => {
    let animationFrame;
    let lastTimestamp = 0;
    // 根據性能模式設置動畫幀率
    const frameDuration = performanceMode === 'low' ? 50 : // 約20fps
                         performanceMode === 'balanced' ? 33.33 : // 約30fps
                         16.67; // 'high' 約60fps
    
    const animate = (timestamp) => {
      // 控制幀率
      if (timestamp - lastTimestamp < frameDuration) {
        animationFrame = requestAnimationFrame(animate);
        return;
      }
      
      // 更新時間戳
      lastTimestamp = timestamp;
      
      // 更新動畫
      setAnimationTime(time => (time + 5) % 1000); // 0-1000循環
      
      animationFrame = requestAnimationFrame(animate);
    };
    
    // 只有在啟用動畫時才運行
    if (enableAnimations) {
      animationFrame = requestAnimationFrame(animate);
    }
    
    return () => {
      if (animationFrame) {
        cancelAnimationFrame(animationFrame);
      }
    };
  }, [enableAnimations, performanceMode]);
  
  // 自動播放時間軸 - 修正為從當前月份繼續播放，並加入效能優化
  useEffect(() => {
    if (isPlaying && yearMonths.length > 0) {
      // 找出當前選中的月份索引
      const currentIndex = yearMonths.indexOf(selectedYearMonth);
      
      // 更新當前索引參考
      if (currentIndex >= 0) {
        currentIndexRef.current = currentIndex;
      }
      
      // 如果當前月份無效，但有以前選擇過的月份，使用該索引
      // 否則使用第一個月份
      if (currentIndex === -1) {
        if (currentIndexRef.current === -1) {
          setSelectedYearMonth(yearMonths[0]);
          currentIndexRef.current = 0;
        } else {
          // 如果有之前選擇的索引，則從那裡繼續
          const validIndex = Math.min(currentIndexRef.current, yearMonths.length - 1);
          setSelectedYearMonth(yearMonths[validIndex]);
        }
        return;
      }
      
      // 調整播放間隔 - 根據性能模式
      const playInterval = performanceMode === 'low' ? 2500 : // 更慢的轉場
                         performanceMode === 'balanced' ? 2000 : // 標準
                         1500; // 'high' 更快的轉場
      
      playIntervalRef.current = setInterval(() => {
        // 使用currentIndexRef來確保連續播放
        let nextIndex;
        
        if (currentIndexRef.current >= 0) {
          nextIndex = (currentIndexRef.current + 1) % yearMonths.length;
        } else {
          nextIndex = (currentIndex + 1) % yearMonths.length;
        }
        
        // 先啟動轉場動畫
        setTransitionProgress(0);
        
        // 在轉場動畫啟動後，設置一個定時器來更新選擇的年月
        transitionTimerRef.current = setTimeout(() => {
          setSelectedYearMonth(yearMonths[nextIndex]);
          currentIndexRef.current = nextIndex;
        }, 300); // 等待300ms再切換到下一個月
        
      }, playInterval);
    } else {
      // 停止播放時清除定時器
      if (playIntervalRef.current) {
        clearInterval(playIntervalRef.current);
        playIntervalRef.current = null;
      }
      if (transitionTimerRef.current) {
        clearTimeout(transitionTimerRef.current);
        transitionTimerRef.current = null;
      }
    }
    
    return () => {
      if (playIntervalRef.current) {
        clearInterval(playIntervalRef.current);
      }
      if (transitionTimerRef.current) {
        clearTimeout(transitionTimerRef.current);
      }
    };
  }, [isPlaying, yearMonths, selectedYearMonth, setSelectedYearMonth, performanceMode]);

  // 當選定的年月更改時，更新當前索引參考
  useEffect(() => {
    if (selectedYearMonth) {
      const index = yearMonths.indexOf(selectedYearMonth);
      if (index >= 0) {
        currentIndexRef.current = index;
      }
    }
  }, [selectedYearMonth, yearMonths]);

  // 優化的轉場動畫
  useEffect(() => {
    if (transitionProgress < 1) {
      // 使用 setTimeout 代替 requestAnimationFrame 以降低消耗
      const transitionSpeed = performanceMode === 'low' ? 0.03 : // 較慢轉場
                             performanceMode === 'balanced' ? 0.05 : // 標準
                             0.08; // 'high' 更快的轉場
      
      const animationTimer = setTimeout(() => {
        setTransitionProgress(prev => Math.min(prev + transitionSpeed, 1));
      }, performanceMode === 'low' ? 50 : 16); // 調整更新頻率
      
      return () => clearTimeout(animationTimer);
    }
  }, [transitionProgress, performanceMode]);

  // 當選擇的年月改變時重置轉場進度
  useEffect(() => {
    setTransitionProgress(1);
  }, [selectedYearMonth]);

  // 計算航班統計 - 使用 useMemo 優化
  const flightStats = React.useMemo(() => {
    const totalFlights = enhancedFlights.reduce((sum, flight) => sum + flight.flights, 0);
    const totalPassengers = enhancedFlights.reduce((sum, flight) => sum + flight.passengers, 0);
    const avgLoadFactor = enhancedFlights.length > 0
      ? enhancedFlights.reduce((sum, flight) => sum + flight.loadFactor, 0) / enhancedFlights.length
      : 0;
      
    return {
      totalFlights,
      totalPassengers,
      avgLoadFactor
    };
  }, [enhancedFlights]);

  // 切換自動播放
  const togglePlay = () => {
    setIsPlaying(!isPlaying);
  };
  
  // 切換新航線面板摺疊狀態
  const toggleNewRoutesPanel = () => {
    setNewRoutesPanelCollapsed(!newRoutesPanelCollapsed);
  };
  
  // 切換性能統計顯示
  const togglePerformanceStats = () => {
    setShowPerformanceStats(!showPerformanceStats);
  };

  return (
    <div className="app-container" 
         style={{
           background: viewMode === 'globe' 
             ? 'radial-gradient(circle, #041A38 0%, #000510 100%)' 
             : 'transparent'
         }}
         onContextMenu={(e) => {
           e.preventDefault();
           e.stopPropagation();
           return false;
         }}>
      
      {/* 根據視圖模式選擇顯示地球視圖或2D地圖 */}
      {viewMode === 'globe' ? (
        <GlobeMap
          enhancedFlights={enhancedFlights}
          selectedMonthAirports={selectedMonthAirports}
          colorScaleData={colorScaleData}
          selectedAirport={selectedAirport}
          selectedRoute={selectedRoute}
          selectedCountry={selectedCountry}
          setSelectedRoute={setSelectedRoute}
          setSelectedCountry={setSelectedCountry}
          setSelectedRouteData={setSelectedRouteData}
          transitionProgress={transitionProgress}
          animationTime={animationTime}
          displayMode={displayMode}
          airportCountryMap={airportCountryMap}
          performanceMode={performanceMode}
          maxVisibleFlights={maxVisibleFlights}
          arcResolution={arcResolution}
          enableAnimations={enableAnimations}
          showDetailedTooltips={showDetailedTooltips}
        />
      ) : (
        <FlightMap
          enhancedFlights={enhancedFlights}
          selectedMonthAirports={selectedMonthAirports}
          colorScaleData={colorScaleData}
          selectedAirport={selectedAirport}
          selectedRoute={selectedRoute}
          selectedCountry={selectedCountry}
          setSelectedRoute={setSelectedRoute}
          setSelectedCountry={setSelectedCountry}
          setSelectedRouteData={setSelectedRouteData}
          transitionProgress={transitionProgress}
          animationTime={animationTime}
          displayMode={displayMode}
          airportCountryMap={airportCountryMap}
          performanceMode={performanceMode}
          maxVisibleFlights={maxVisibleFlights}
          arcResolution={arcResolution}
          enableAnimations={enableAnimations}
          showDetailedTooltips={showDetailedTooltips}
        />
      )}
      
      {/* 整合式面板管理器 - 取代原來的多個獨立面板 */}
      <PanelManager
        // Control Panel props
        viewMode={viewMode}
        setViewMode={handleViewModeChange} // 使用修改後的函數
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
        // TopRoutes & TopCountries Panel props
        getPreviousYearMonth={getPreviousYearMonth}
        airportCountryMap={airportCountryMap}
        // Stats Panel props
        totalFlights={flightStats.totalFlights}
        totalPassengers={flightStats.totalPassengers}
        avgLoadFactor={flightStats.avgLoadFactor}
        // Performance settings
        performanceMode={performanceMode}
        setPerformanceMode={setPerformanceMode}
        togglePerformanceStats={togglePerformanceStats}
      />
      
      {/* 新航線面板 - 保留在右側 */}
      <NewRoutesPanel
        selectedYearMonth={selectedYearMonth}
        yearMonths={yearMonths}
        flightData={flightData}
        getPreviousYearMonth={getPreviousYearMonth}
        collapsed={newRoutesPanelCollapsed}
        toggleCollapsed={toggleNewRoutesPanel}
      />
      
      {/* 航線圖表（選定航線或國家）*/}
      {(selectedRoute || selectedCountry) && (
        <RouteChart
          selectedRoute={selectedRoute}
          selectedCountry={selectedCountry}
          selectedRouteData={selectedRouteData}
          setSelectedRoute={setSelectedRoute}
          setSelectedCountry={setSelectedCountry}
          performanceMode={performanceMode}
        />
      )}
      
      {/* 使用提示 */}
      <div className="usage-tips">
        <div>使用滑鼠滾輪縮放視圖</div>
        <div>按住左鍵拖動平移視圖</div>
        {viewMode === 'map' && <div>按住右鍵拖動旋轉視圖</div>}
        <div>點擊航線可查看歷史資料</div>
        <div>點擊國家可查看所有到該國的航線</div>
      </div>
      
      {/* 性能統計顯示 */}
      {showPerformanceStats && (
        <div className="performance-stats">
          <div>FPS: {fps}</div>
          {memoryUsage > 0 && <div>Memory: {memoryUsage} MB</div>}
          <div>Mode: {performanceMode}</div>
        </div>
      )}
    </div>
  );
}

export default App;