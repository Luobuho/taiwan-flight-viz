// hooks/useFlightData.js - 優化數據處理和記憶體管理
import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { loadFlightData } from '../utils/LoadGeoJSON';
import { scaleLog } from 'd3-scale';
import { pointInPolygon, findNearestPolygon } from '../utils/GeoUtils';

function useFlightData() {
  // 數據狀態
  const [loading, setLoading] = useState(true);
  const [flightData, setFlightData] = useState({
    flights: [],
    airports: []
  });

  // 年月選擇
  const [yearMonths, setYearMonths] = useState([]);
  const [selectedYearMonth, setSelectedYearMonth] = useState(null);
  const [previousYearMonth, setPreviousYearMonth] = useState(null);
  
  // 選擇的航線或國家
  const [selectedRoute, setSelectedRoute] = useState(null);
  const [selectedCountry, setSelectedCountry] = useState(null);
  
  // 國家數據
  const [countriesData, setCountriesData] = useState([]);
  const [airportCountryMap, setAirportCountryMap] = useState({});
  
  // 性能設置
  const [performanceSettings, setPerformanceSettings] = useState({
    performanceMode: 'balanced',
    maxVisibleFlights: 250,
    enableAnimations: true
  });
  
  // 緩存 - 使用 useRef 避免重新渲染時重置
  const filterCache = useRef(new Map());
  const routeDataCache = useRef(new Map());
  
  // 每當選擇的年月或路由變更時清理緩存，以避免過大
  useEffect(() => {
    if (filterCache.current.size > 30) {
      filterCache.current.clear();
    }
    if (routeDataCache.current.size > 30) {
      routeDataCache.current.clear();
    }
  }, [selectedYearMonth, selectedRoute, selectedCountry]);
  
  // 加載國家數據
  useEffect(() => {
    async function fetchCountriesData() {
      try {
        // 使用記憶體中的緩存避免重複獲取
        if (window.cachedCountriesData) {
          setCountriesData(window.cachedCountriesData);
          return;
        }
        
        const response = await fetch('https://d2ad6b4ur7yvpq.cloudfront.net/naturalearth-3.3.0/ne_50m_admin_0_countries.geojson');
        const data = await response.json();
        
        // 簡化國家數據以減少記憶體使用
        const simplifiedFeatures = data.features.map(feature => ({
          type: feature.type,
          geometry: feature.geometry,
          properties: {
            NAME: feature.properties.NAME,
            name: feature.properties.name,
            ISO_A2: feature.properties.ISO_A2,
            iso_a2: feature.properties.iso_a2
          }
        }));
        
        // 全局緩存
        window.cachedCountriesData = simplifiedFeatures;
        setCountriesData(simplifiedFeatures);
      } catch (error) {
        console.error('Failed to load countries data:', error);
      }
    }
    
    fetchCountriesData();
  }, []);
  
  // 台灣機場關鍵字列表 - 使用 useMemo 避免重新創建
  const taiwanKeywords = useMemo(() => 
    ['桃園', '臺北', '高雄', '臺中', '花蓮', '澎湖', '臺南', '台北', '台中', '台南'], 
  []);
  
  // 檢查機場是否為台灣機場 - 使用 useCallback 避免不必要的重新渲染
  const isTaiwanAirport = useCallback((airportName) => {
    return taiwanKeywords.some(keyword => airportName?.includes(keyword) || false);
  }, [taiwanKeywords]);
  
  // 載入數據 - 添加緩存和增量加載機制
  useEffect(() => {
    let isMounted = true;
    
    async function fetchData() {
      if (isMounted) setLoading(true);
      
      try {
        // 使用局部緩存避免重複加載
        if (window.cachedFlightData) {
          if (isMounted) {
            setFlightData(window.cachedFlightData);
            
            // 獲取所有年月並排序
            const allYearMonths = [...new Set(window.cachedFlightData.flights.map(f => f.yearMonth))].sort();
            setYearMonths(allYearMonths);
  
            // 設置初始選擇為最後一個年月 (最新數據)
            if (allYearMonths.length > 0) {
              setSelectedYearMonth(allYearMonths[allYearMonths.length - 1]);
            }
            
            setLoading(false);
          }
          return;
        }
        
        // 如果沒有緩存，加載數據
        const data = await loadFlightData('/data/aggregated_flights.json');
        
        // 添加索引結構以加速查詢
        const airportIndex = new Map();
        const yearMonthIndex = new Map();
        
        // 處理每條航班對象
        const processedFlights = data.flights.map(flight => {
          // 確保 properties 存在且包含航空公司列表
          if (!flight.properties) {
            flight.properties = {};
          }
          
          if (!flight.properties["航空公司列表"]) {
            flight.properties["航空公司列表"] = [];
          }
          
          // 生成唯一的航線ID
          flight.routeId = `${flight.source}-${flight.target}`;
          
          // 添加到年月索引
          if (!yearMonthIndex.has(flight.yearMonth)) {
            yearMonthIndex.set(flight.yearMonth, []);
          }
          yearMonthIndex.get(flight.yearMonth).push(flight);
          
          return flight;
        });
        
        // 構建機場索引
        data.airports.forEach(airport => {
          airportIndex.set(airport.name, airport);
        });
        
        const processedData = {
          flights: processedFlights,
          airports: data.airports,
          // 添加索引結構
          airportIndex,
          yearMonthIndex
        };
        
        // 保存到全局緩存
        window.cachedFlightData = processedData;
        
        if (isMounted) {
          setFlightData(processedData);

          // 獲取所有年月並排序
          const allYearMonths = [...new Set(processedFlights.map(f => f.yearMonth))].sort();
          setYearMonths(allYearMonths);

          // 設置初始選擇為最後一個年月 (最新數據)
          if (allYearMonths.length > 0) {
            setSelectedYearMonth(allYearMonths[allYearMonths.length - 1]);
          }

          setLoading(false);
        }
      } catch (error) {
        console.error('載入數據失敗:', error);
        if (isMounted) setLoading(false);
      }
    }

    fetchData();
    
    return () => {
      isMounted = false;
    };
  }, []);

  // 將機場分配給國家 - 在國家數據和機場數據都加載後運行
  useEffect(() => {
    if (countriesData.length > 0 && flightData.airports && flightData.airports.length > 0) {
      // 如果已經有緩存的映射，使用緩存
      if (window.cachedAirportCountryMap) {
        setAirportCountryMap(window.cachedAirportCountryMap);
        return;
      }
      
      const airportToCountry = {};
      
      // 分批處理以避免阻塞UI
      let currentIndex = 0;
      const batchSize = 100;
      
      const processNextBatch = () => {
        const endIndex = Math.min(currentIndex + batchSize, flightData.airports.length);
        
        for (let i = currentIndex; i < endIndex; i++) {
          const airport = flightData.airports[i];
          
          // 跳過台灣機場
          if (isTaiwanAirport(airport.name)) {
            continue;
          }
          
          // 機場位置
          const position = [airport.longitude, airport.latitude];
          
          // 查找最近的國家
          const nearestCountry = findNearestPolygon(position, countriesData);
          
          if (nearestCountry) {
            const countryName = nearestCountry.properties.NAME || 
                              nearestCountry.properties.name || 
                              "Unknown";
            
            airportToCountry[airport.name] = {
              name: countryName,
              geometry: nearestCountry.geometry
            };
          }
        }
        
        currentIndex = endIndex;
        
        if (currentIndex < flightData.airports.length) {
          // 繼續處理下一批
          setTimeout(processNextBatch, 0);
        } else {
          // 全部處理完成
          window.cachedAirportCountryMap = airportToCountry;
          setAirportCountryMap(airportToCountry);
          console.log(`已將 ${Object.keys(airportToCountry).length} 個機場分配給國家`);
        }
      };
      
      // 開始批處理
      processNextBatch();
    }
  }, [countriesData, flightData.airports, isTaiwanAirport]);

  // 當選定年月變更時追蹤前一個年月
  useEffect(() => {
    if (selectedYearMonth !== null && selectedYearMonth !== previousYearMonth) {
      setPreviousYearMonth(selectedYearMonth);
    }
  }, [selectedYearMonth, previousYearMonth]);

  // 獲取前一個月
  const getPreviousYearMonth = useCallback((ym) => {
    if (!ym) return null;
    
    const currentIndex = yearMonths.indexOf(ym);
    if (currentIndex <= 0) return null;
    
    return yearMonths[currentIndex - 1];
  }, [yearMonths]);

  // 過濾並增強航班數據 - 優化版，只處理當前月份數據
  const enhancedFlights = useMemo(() => {
    if (!selectedYearMonth) return [];
    
    const cacheKey = `enhancedFlights-${selectedYearMonth}-${performanceSettings.maxVisibleFlights}`;
    if (filterCache.current.has(cacheKey)) {
      return filterCache.current.get(cacheKey);
    }
    
    console.log(`計算 ${selectedYearMonth} 的增強航班數據`);
    
    // 獲取此月的航班 - 使用索引優化查詢
    let filteredFlights = [];
    
    // 使用年月索引加速查詢
    if (flightData.yearMonthIndex && flightData.yearMonthIndex.has(selectedYearMonth)) {
      filteredFlights = flightData.yearMonthIndex.get(selectedYearMonth);
    } else {
      // 降級方案 - 直接過濾
      filteredFlights = flightData.flights.filter(f =>
        String(f.yearMonth) === String(selectedYearMonth)
      );
    }
    
    // 按乘客數量排序並限制數量
    const maxFlights = performanceSettings.maxVisibleFlights || 250;
    filteredFlights = filteredFlights
      .sort((a, b) => b.passengers - a.passengers)
      .slice(0, maxFlights);
    
    console.log(`Selected ${filteredFlights.length} flights for ${selectedYearMonth}`);
    
    // 創建航線離場和抵達方向的偏移 - 這是關鍵部分
    // 與deck.gl的AnimatedArcLayer一樣處理反向航線
    const routeGroups = {};
    
    const processed = filteredFlights.map(flight => {
      // 創建雙向路線ID (確保排序，所以相同的航段會被分組)
      const routePair = [flight.source, flight.target].sort();
      const biDirectionalRouteId = routePair.join('-');
      
      // 如果是該路線的第一個航班，初始化對象
      if (!routeGroups[biDirectionalRouteId]) {
        routeGroups[biDirectionalRouteId] = {
          directions: {}
        };
      }
      
      // 為每個特定方向(出發到達對)標記
      const directionKey = `${flight.source}-${flight.target}`;
      
      // 如果這個方向還沒有角度，分配一個
      if (!routeGroups[biDirectionalRouteId].directions[directionKey]) {
        // 檢查是否已經有相反方向的航班
        const reverseKey = `${flight.target}-${flight.source}`;
        const hasReverse = !!routeGroups[biDirectionalRouteId].directions[reverseKey];
        
        // 如果相反方向已存在，分配相反角度
        // 否則這是這條航線的第一個方向
        const arcAngle = hasReverse ? -30 : 30;
        
        routeGroups[biDirectionalRouteId].directions[directionKey] = { arcAngle };
      }
      
      // 獲取這個方向的角度 (確保總是一致的)
      const arcAngle = routeGroups[biDirectionalRouteId].directions[directionKey].arcAngle;
      
      // 將原始座標添加到航班數據中
      const sourceAirport = flightData.airportIndex 
        ? flightData.airportIndex.get(flight.source) 
        : flightData.airports.find(a => a.name === flight.source);
      
      const targetAirport = flightData.airportIndex
        ? flightData.airportIndex.get(flight.target)
        : flightData.airports.find(a => a.name === flight.target);
      
      const sourcePosition = sourceAirport 
        ? [sourceAirport.longitude, sourceAirport.latitude]
        : [0, 0];
      
      const targetPosition = targetAirport
        ? [targetAirport.longitude, targetAirport.latitude]
        : [0, 0];
      
      return {
        ...flight,
        arcAngle,
        sourcePosition,
        targetPosition
      };
    });
    
    // 緩存結果
    filterCache.current.set(cacheKey, processed);
    
    return processed;
  }, [selectedYearMonth, flightData, performanceSettings.maxVisibleFlights]);
  
  // 只統計當月的機場數據 - 優化篩選
  const selectedMonthAirports = useMemo(() => {
    if (!selectedYearMonth) return [];
    
    const cacheKey = `selectedMonthAirports-${selectedYearMonth}`;
    if (filterCache.current.has(cacheKey)) {
      return filterCache.current.get(cacheKey);
    }
    
    // 建立出現的機場集合
    const airportSet = new Set();
    const airportStats = {};
    
    // 使用年月索引加速查詢
    let selectedMonthFlights = [];
    if (flightData.yearMonthIndex && flightData.yearMonthIndex.has(selectedYearMonth)) {
      selectedMonthFlights = flightData.yearMonthIndex.get(selectedYearMonth);
    } else {
      selectedMonthFlights = flightData.flights.filter(f => 
        String(f.yearMonth) === String(selectedYearMonth)
      );
    }
    
    // 先收集所有出現的機場和初步統計
    selectedMonthFlights.forEach(flight => {
      // 收集機場並初始化統計
      if (flight.source) {
        airportSet.add(flight.source);
        if (!airportStats[flight.source]) {
          airportStats[flight.source] = { passengers: 0, flights: 0 };
        }
        airportStats[flight.source].passengers += flight.passengers;
        airportStats[flight.source].flights += flight.flights || 1;
      }
      
      if (flight.target) {
        airportSet.add(flight.target);
        if (!airportStats[flight.target]) {
          airportStats[flight.target] = { passengers: 0, flights: 0 };
        }
        airportStats[flight.target].passengers += flight.passengers;
        airportStats[flight.target].flights += flight.flights || 1;
      }
    });
    
    // 獲取機場詳情並應用統計
    const airportsWithStats = Array.from(airportSet).map(airportName => {
      // 使用索引找機場對象
      const airport = flightData.airportIndex 
        ? flightData.airportIndex.get(airportName)
        : flightData.airports.find(a => a.name === airportName);
      
      if (!airport) return null;
      
      return {
        ...airport,
        passengers: airportStats[airportName].passengers,
        flights: airportStats[airportName].flights
      };
    }).filter(Boolean); // 移除 null 項
    
    // 緩存結果
    filterCache.current.set(cacheKey, airportsWithStats);
    
    return airportsWithStats;
  }, [selectedYearMonth, flightData]);

  // 準備選定航線或國家的歷史數據 - 改進國家過濾邏輯和緩存
  const selectedRouteData = useMemo(() => {
    if (!selectedRoute && !selectedCountry) return [];
    
    const cacheKey = selectedRoute 
      ? `route-${selectedRoute.source}-${selectedRoute.target}`
      : `country-${typeof selectedCountry === 'object' ? selectedCountry.name : selectedCountry}`;
      
    if (routeDataCache.current.has(cacheKey)) {
      return routeDataCache.current.get(cacheKey);
    }
    
    // 對於選定的航線
    if (selectedRoute && flightData.flights.length > 0) {
      // 從所有航班中找出該航線的所有數據
      const routeFlights = flightData.flights.filter(f => 
        (f.source === selectedRoute.source && f.target === selectedRoute.target) ||
        (f.source === selectedRoute.target && f.target === selectedRoute.source)
      );
      
      // 按年月分組並匯總數據
      const dataByMonth = {};
      
      routeFlights.forEach(flight => {
        const key = flight.yearMonthStr;
        
        if (!dataByMonth[key]) {
          dataByMonth[key] = {
            yearMonth: key,
            passengers: 0,
            flights: 0
          };
        }
        
        dataByMonth[key].passengers += flight.passengers;
        dataByMonth[key].flights += flight.flights;
      });
      
      // 轉換為數組並排序
      const result = Object.values(dataByMonth).sort((a, b) => {
        // 提取年和月，並將它們轉換為數字以進行比較
        const [yearA, monthA] = a.yearMonth.split('年');
        const [yearB, monthB] = b.yearMonth.split('年');
        
        const monthToNumA = ['一月', '二月', '三月', '四月', '五月', '六月', '七月', '八月', '九月', '十月', '十一月', '十二月'].indexOf(monthA);
        const monthToNumB = ['一月', '二月', '三月', '四月', '五月', '六月', '七月', '八月', '九月', '十月', '十一月', '十二月'].indexOf(monthB);
        
        if (yearA !== yearB) return yearA - yearB;
        return monthToNumA - monthToNumB;
      });
      
      // 緩存結果
      routeDataCache.current.set(cacheKey, result);
      return result;
    }
    
    // 對於選定的國家 - 使用改進後的國家航線過濾
    if (selectedCountry && flightData.flights.length > 0) {
      // 獲取國家名稱和幾何形狀（如果有）
      const countryName = selectedCountry.name || selectedCountry;
      const countryGeometry = selectedCountry.geometry;
      
      // 查找所有到/從選定國家的航班
      const countryFlights = flightData.flights.filter(f => {
        // 檢查是否有一端是台灣機場
        const isSourceTaiwan = isTaiwanAirport(f.source);
        const isTargetTaiwan = isTaiwanAirport(f.target);
        
        // 如果兩端都是台灣或都不是台灣，跳過
        if ((isSourceTaiwan && isTargetTaiwan) || (!isSourceTaiwan && !isTargetTaiwan)) {
          return false;
        }
        
        // 確定非台灣端的航空站
        const nonTaiwanAirport = isSourceTaiwan ? f.target : f.source;
        
        // 使用預先分配的國家信息
        if (airportCountryMap[nonTaiwanAirport]) {
          return airportCountryMap[nonTaiwanAirport].name === countryName;
        }
        
        // 確定非台灣端的位置和名稱
        const nonTaiwanPosition = isSourceTaiwan 
          ? [f.targetPosition?.[0], f.targetPosition?.[1]] 
          : [f.sourcePosition?.[0], f.sourcePosition?.[1]];
        
        // 使用點在多邊形內檢查（如果有幾何形狀）
        if (countryGeometry && nonTaiwanPosition?.[0] && nonTaiwanPosition?.[1]) {
          return pointInPolygon(nonTaiwanPosition, countryGeometry);
        } else {
          // 退回到基於名稱的檢查
          return nonTaiwanAirport.includes(countryName);
        }
      });
      
      console.log(`找到 ${countryFlights.length} 條到/從 ${countryName} 的航班`);
      
      // 如果沒找到航班，返回帶有特殊標記的空數據
      if (countryFlights.length === 0) {
        const result = [{ noDirectFlights: true }];
        routeDataCache.current.set(cacheKey, result);
        return result;
      }
      
      // 按年月分組並匯總數據
      const dataByMonth = {};
      
      countryFlights.forEach(flight => {
        const key = flight.yearMonthStr;
        
        if (!dataByMonth[key]) {
          dataByMonth[key] = {
            yearMonth: key,
            passengers: 0,
            flights: 0
          };
        }
        
        dataByMonth[key].passengers += flight.passengers;
        dataByMonth[key].flights += flight.flights;
      });
      
      // 轉換為數組並排序
      const result = Object.values(dataByMonth).sort((a, b) => {
        // 提取年和月，並將它們轉換為數字以進行比較
        const [yearA, monthA] = a.yearMonth.split('年');
        const [yearB, monthB] = b.yearMonth.split('年');
        
        const monthToNumA = ['一月', '二月', '三月', '四月', '五月', '六月', '七月', '八月', '九月', '十月', '十一月', '十二月'].indexOf(monthA);
        const monthToNumB = ['一月', '二月', '三月', '四月', '五月', '六月', '七月', '八月', '九月', '十月', '十一月', '十二月'].indexOf(monthB);
        
        if (yearA !== yearB) return yearA - yearB;
        return monthToNumA - monthToNumB;
      });
      
      // 緩存結果
      routeDataCache.current.set(cacheKey, result);
      return result;
    }
    
    return [];
  }, [flightData.flights, selectedRoute, selectedCountry, isTaiwanAirport, airportCountryMap]);

  // 計算顏色比例尺 - 使用 useMemo 來避免不必要的重複計算
  const getColorScale = useMemo(() => {
    // 封裝在函數中以便在 useMemo 中返回
    const calculateColorScale = () => {
      if (enhancedFlights.length === 0) return { scale: () => [59, 130, 246], min: 0, max: 0 };

      // 使用緩存避免重複計算
      if (window.cachedColorScale && window.cachedColorScale.flightCount === enhancedFlights.length) {
        return window.cachedColorScale;
      }

      const passengerCounts = enhancedFlights.map(f => f.passengers);
      const minPassengers = Math.max(1, Math.min(...passengerCounts));
      const maxPassengers = Math.max(...passengerCounts);

      // 改進的顏色比例尺 - 更鮮明的漸變
      const logScale = scaleLog()
        .domain([minPassengers, maxPassengers])
        .range([0, 1])
        .clamp(true);

      const colorScale = {
        scale: (passengers) => {
          if (passengers <= 0) return [59, 130, 246]; // 藍色

          const normalizedValue = logScale(passengers);

          // 彩虹漸變: 藍 → 綠 → 黃 → 紅
          if (normalizedValue < 0.33) {
            // 藍到綠的過渡
            const r = Math.floor(59 * (1 - normalizedValue * 3) + 0 * (normalizedValue * 3));
            const g = Math.floor(130 * (1 - normalizedValue * 3) + 200 * (normalizedValue * 3));
            const b = Math.floor(246 * (1 - normalizedValue * 3) + 0 * (normalizedValue * 3));
            return [r, g, b];
          } else if (normalizedValue < 0.66) {
            // 綠到黃的過渡
            const adjustedValue = (normalizedValue - 0.33) * 3;
            const r = Math.floor(0 * (1 - adjustedValue) + 255 * adjustedValue);
            const g = Math.floor(200 * (1 - adjustedValue) + 255 * adjustedValue);
            const b = Math.floor(0);
            return [r, g, b];
          } else {
            // 黃到紅的過渡
            const adjustedValue = (normalizedValue - 0.66) * 3;
            const r = Math.floor(255);
            const g = Math.floor(255 * (1 - adjustedValue) + 0 * adjustedValue);
            const b = Math.floor(0);
            return [r, g, b];
          }
        },
        min: minPassengers,
        max: maxPassengers,
        flightCount: enhancedFlights.length
      };
      
      // 緩存結果
      window.cachedColorScale = colorScale;
      return colorScale;
    };
    
    return calculateColorScale();
  }, [enhancedFlights]);

  const colorScaleData = getColorScale;

  return {
    loading,
    flightData,
    yearMonths,
    enhancedFlights,
    selectedMonthAirports,
    colorScaleData,
    selectedYearMonth,
    setSelectedYearMonth,
    previousYearMonth,
    selectedRouteData,
    getPreviousYearMonth,
    selectedRoute,
    setSelectedRoute,
    selectedCountry,
    setSelectedCountry,
    airportCountryMap,
    setPerformanceSettings
  };
}

export default useFlightData;