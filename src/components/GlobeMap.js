// GlobeMap.js
import React, { useRef, useEffect, useState, useCallback } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { pointInPolygon } from '../utils/GeoUtils';

// 全局變量，防止重複初始化
let globalMapInstance = null;

// Mapbox API Key
const MAPBOX_TOKEN = process.env.REACT_APP_MAPBOX_TOKEN || '';
mapboxgl.accessToken = MAPBOX_TOKEN;

// 自定義彈出框樣式
const customPopupStyle = `
.mapboxgl-popup-content {
  background-color: rgba(20, 27, 45, 0.85);
  color: #ffffff;
  padding: 12px;
  border-radius: 6px;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.3);
  max-width: 300px;
  font-family: 'Arial', sans-serif;
}
.mapboxgl-popup-tip {
  border-top-color: rgba(20, 27, 45, 0.85);
  border-bottom-color: rgba(20, 27, 45, 0.85);
  border-left-color: rgba(20, 27, 45, 0.85);
  border-right-color: rgba(20, 27, 45, 0.85);
}
.mapboxgl-popup-close-button {
  color: #ffffff;
  font-size: 16px;
  right: 8px;
  top: 8px;
}
.popup-title {
  font-weight: bold;
  margin-bottom: 8px;
  font-size: 14px;
  color: #9fefff;
}
.popup-content {
  font-size: 12px;
  line-height: 1.4;
}
.popup-hint {
  font-style: italic;
  margin-top: 8px;
  font-size: 11px;
  color: #aaaaaa;
}
`;

function GlobeMap({
  enhancedFlights,
  selectedMonthAirports,
  colorScaleData,
  selectedAirport,
  selectedRoute,
  selectedCountry,
  setSelectedRoute,
  setSelectedCountry,
  setSelectedRouteData,
  transitionProgress,
  animationTime,
  displayMode,
  airportCountryMap
}) {
  const mapContainer = useRef(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [animationFrame, setAnimationFrame] = useState(0);
  const animationFrameRef = useRef(null);
  const styleInjectedRef = useRef(false);
  const popupRef = useRef(null);
  const layersInitializedRef = useRef(false);
  
  // 使用 useRef 來存儲 map 實例，確保其跨渲染週期持續存在
  const mapInstanceRef = useRef(null);
  
  // 取得地圖實例的輔助函數
  const getMapInstance = () => {
    return mapInstanceRef.current;
  };
  
  // 注入自定義樣式
  const injectCustomStyles = useCallback(() => {
    if (styleInjectedRef.current) return;
    
    const styleElement = document.createElement('style');
    styleElement.innerHTML = customPopupStyle;
    document.head.appendChild(styleElement);
    
    styleInjectedRef.current = true;
  }, []);
  
  // 處理跨越日期變更線的路徑，將其分割成不跨越經線的多段
  const handleCrossAntimeridianPath = useCallback((points) => {
    if (points.length < 2) return points;
    
    const segments = [];
    let currentSegment = [points[0]];
    
    for (let i = 1; i < points.length; i++) {
      const prevLon = points[i-1][0];
      const currLon = points[i][0];
      
      // 檢測是否跨越日期變更線 (更精確的檢測)
      if (Math.abs(currLon - prevLon) > 180) {
        // 找到跨越點（插值）
        // 如果從正到負
        if (prevLon > 0 && currLon < 0) {
          const ratio = (180 - prevLon) / ((180 - prevLon) + (180 + currLon));
          const crossLat = points[i-1][1] + (points[i][1] - points[i-1][1]) * ratio;
          
          // 添加到當前段的終點
          currentSegment.push([180, crossLat]);
          segments.push([...currentSegment]);
          
          // 開始新段
          currentSegment = [[-180, crossLat]];
        }
        // 如果從負到正
        else if (prevLon < 0 && currLon > 0) {
          const ratio = (180 + prevLon) / ((180 + prevLon) + (180 - currLon));
          const crossLat = points[i-1][1] + (points[i][1] - points[i-1][1]) * ratio;
          
          // 添加到當前段的終點
          currentSegment.push([-180, crossLat]);
          segments.push([...currentSegment]);
          
          // 開始新段
          currentSegment = [[180, crossLat]];
        }
      }
      
      currentSegment.push(points[i]);
    }
    
    // 添加最後一段
    if (currentSegment.length > 0) {
      segments.push(currentSegment);
    }
    
    // 如果需要分段處理，返回多個線段；否則返回原始點
    return segments.length > 1 ? segments : points;
  }, []);
  
  // 改進的大圓弧線函數 - 解決跨180度和0度經線問題
  const createImprovedGreatCircleArc = useCallback((start, end, heightFactor = 0.5, numPoints = 100) => {
    if (!start || !end || !Array.isArray(start) || !Array.isArray(end)) return [start, end];
    if (start.length < 2 || end.length < 2) return [start, end];
    
    try {
      const [lon1, lat1] = start;
      const [lon2, lat2] = end;
      
      // 檢查坐標有效性
      if (isNaN(lon1) || isNaN(lat1) || isNaN(lon2) || isNaN(lat2)) {
        console.error('無效坐標:', start, end);
        return [start, end];
      }
      
      // 判斷是否跨越國際日期變更線（更準確的判斷）
      let crossesAntimeridian = false;
      
      // 如果經度差超過180度，很可能跨越了國際日期變更線
      if (Math.abs(lon2 - lon1) > 180) {
        crossesAntimeridian = true;
      }
      
      // 轉換為弧度
      const phi1 = lat1 * Math.PI / 180;
      const lambda1 = lon1 * Math.PI / 180;
      const phi2 = lat2 * Math.PI / 180;
      const lambda2 = lon2 * Math.PI / 180;
      
      // 計算最短路徑的大圓距離
      let deltaLambda = lambda2 - lambda1;
      
      // 如果跨越日期變更線，調整 deltaLambda 為最短路徑
      if (crossesAntimeridian) {
        if (deltaLambda > 0) {
          deltaLambda = deltaLambda - 2 * Math.PI;
        } else {
          deltaLambda = deltaLambda + 2 * Math.PI;
        }
      }
      
      const cosPhiDist = Math.sin(phi1) * Math.sin(phi2) + 
                          Math.cos(phi1) * Math.cos(phi2) * Math.cos(deltaLambda);
      const angularDist = Math.acos(Math.max(-1, Math.min(1, cosPhiDist)));
      
      // 調整弧形高度係數（距離越遠，弧度越高）
      const maxHeightFactor = 0.5;
      const effectiveHeightFactor = Math.min(maxHeightFactor, heightFactor * (angularDist / Math.PI) * 3);
      
      // 創建等間距的弧線點
      const points = [];
      let prevLon = null;
      
      for (let i = 0; i <= numPoints; i++) {
        const t = i / numPoints;
        
        // 球面插值（按角度比例）
        const fraction = t;
        const A = Math.sin((1 - fraction) * angularDist) / Math.sin(angularDist);
        const B = Math.sin(fraction * angularDist) / Math.sin(angularDist);
        
        // 計算位置
        const x = A * Math.cos(phi1) * Math.cos(lambda1) + B * Math.cos(phi2) * Math.cos(lambda2);
        const y = A * Math.cos(phi1) * Math.sin(lambda1) + B * Math.cos(phi2) * Math.sin(lambda2);
        const z = A * Math.sin(phi1) + B * Math.sin(phi2);
        
        // 計算經緯度
        const phi = Math.atan2(z, Math.sqrt(x*x + y*y));
        let lambda = Math.atan2(y, x);
        
        // 轉回度數
        let finalLat = phi * 180 / Math.PI;
        let finalLon = lambda * 180 / Math.PI;
        
        // 處理跨越經線的情況 - 確保經度變化平滑
        if (prevLon !== null && crossesAntimeridian) {
          // 處理跨越國際日期變更線的情況
          if (Math.abs(finalLon - prevLon) > 180) {
            if (prevLon > 0 && finalLon < 0) {
              // 從正到負，確保值在相同的範圍內
              finalLon += 360;
            } else if (prevLon < 0 && finalLon > 0) {
              // 從負到正，確保值在相同的範圍內
              finalLon -= 360;
            }
          }
        }
        prevLon = finalLon;
        
        // 應用高度調整 - 用正弦函數使弧線平滑
        if (effectiveHeightFactor > 0) {
          // 僅在中間部分增加高度（正弦波）
          const heightBoost = Math.sin(t * Math.PI) * effectiveHeightFactor;
          
          // 從球心向外延伸，使弧線脫離地球表面
          // 1.0 表示完全貼合地球表面，>1.0 表示脫離地球表面
          const radiusFactor = 1.0 + heightBoost;
          
          // 將點推離地球表面
          const lat_rad = finalLat * Math.PI / 180;
          const lon_rad = finalLon * Math.PI / 180;
          
          // 3D坐標換算
          const xCart = Math.cos(lat_rad) * Math.cos(lon_rad) * radiusFactor;
          const yCart = Math.cos(lat_rad) * Math.sin(lon_rad) * radiusFactor;
          const zCart = Math.sin(lat_rad) * radiusFactor;
          
          // 轉回經緯度
          finalLat = Math.atan2(zCart, Math.sqrt(xCart*xCart + yCart*yCart)) * 180 / Math.PI;
          finalLon = Math.atan2(yCart, xCart) * 180 / Math.PI;
        }
        
        // 標準化最終經度到 -180 到 180 範圍 (Mapbox需要)
        while (finalLon > 180) finalLon -= 360;
        while (finalLon < -180) finalLon += 360;
        
        points.push([finalLon, finalLat]);
      }
      
      // 測試航線是否跨越經線，並在需要時分割路徑
      if (crossesAntimeridian) {
        // 使用處理函數將路徑分割為多段
        const splitResult = handleCrossAntimeridianPath(points);
        
        // 如果分割成功，則返回分割後的多段路徑
        if (splitResult.length > 0) {
          return splitResult;
        }
      }
      
      return points;
    } catch (error) {
      console.error('生成弧形路徑失敗:', error);
      // 備用：直接連接兩點
      return [start, end];
    }
  }, [handleCrossAntimeridianPath]);
  
  // 檢查是否為台灣機場
  const isTaiwanAirport = useCallback((airportName) => {
    if (!airportName) return false;
    const taiwanKeywords = ['桃園', '臺北', '高雄', '臺中', '花蓮', '澎湖', '臺南', '台北', '台中', '台南'];
    return taiwanKeywords.some(keyword => airportName.includes(keyword));
  }, []);

  // 改進的篩選航班函數，使用airportCountryMap正確匹配國家
  const filterFlights = useCallback((flights) => {
    if (!flights) return [];
    
    let filteredFlights = [...flights];
    
    // 如果選擇了特定機場，只顯示相關航班
    if (selectedAirport) {
      filteredFlights = filteredFlights.filter(f =>
        f.source === selectedAirport || f.target === selectedAirport
      );
    }
    
    // 如果選擇了特定國家，顯示連接台灣和該國家的航班
    if (selectedCountry) {
      const countryName = selectedCountry.name || selectedCountry;
      // console.log('篩選國家:', countryName);
      
      // 查找所有到/從選定國家的航班
      filteredFlights = filteredFlights.filter(f => {
        // 檢查是否有一端是台灣機場
        const isSourceTaiwan = isTaiwanAirport(f.source);
        const isTargetTaiwan = isTaiwanAirport(f.target);
        
        // 如果兩端都是台灣或都不是台灣，跳過
        if ((isSourceTaiwan && isTargetTaiwan) || (!isSourceTaiwan && !isTargetTaiwan)) {
          return false;
        }
        
        // 確定非台灣端的機場名稱
        const nonTaiwanAirport = isSourceTaiwan ? f.target : f.source;
        
        // 關鍵改進：使用 airportCountryMap 匹配離岸機場所屬國家
        if (airportCountryMap && airportCountryMap[nonTaiwanAirport]) {
          const airportCountry = airportCountryMap[nonTaiwanAirport].name;
          return airportCountry === countryName;
        }
        
        // 如果沒有在 airportCountryMap 中找到，使用幾何形狀檢查（如果有）
        if (selectedCountry.geometry) {
          const nonTaiwanPosition = isSourceTaiwan ? f.targetPosition : f.sourcePosition;
          return pointInPolygon(nonTaiwanPosition, selectedCountry.geometry);
        }
        
        // 退回到名稱匹配（最不可靠的方法）
        return nonTaiwanAirport.includes(countryName);
      });
      
      // console.log(`篩選後顯示 ${filteredFlights.length} 條航線`);
      
      // 如果找到了航線，更新選定路線數據以顯示圖表
      if (filteredFlights.length > 0 && setSelectedRouteData) {
        const countryFlights = flights.filter(f => {
          const isSourceTaiwan = isTaiwanAirport(f.source);
          const isTargetTaiwan = isTaiwanAirport(f.target);
          
          if ((isSourceTaiwan && isTargetTaiwan) || (!isSourceTaiwan && !isTargetTaiwan)) {
            return false;
          }
          
          const nonTaiwanAirport = isSourceTaiwan ? f.target : f.source;
          
          if (airportCountryMap && airportCountryMap[nonTaiwanAirport]) {
            const airportCountry = airportCountryMap[nonTaiwanAirport].name;
            return airportCountry === countryName;
          }
          
          if (selectedCountry.geometry) {
            const nonTaiwanPosition = isSourceTaiwan ? f.targetPosition : f.sourcePosition;
            return pointInPolygon(nonTaiwanPosition, selectedCountry.geometry);
          }
          
          return nonTaiwanAirport.includes(countryName);
        });
        
        // 按年月分組並匯總數據（這部分代碼簡化，完整實現在 useFlightData.js）
        // 這裡只是為了確保視覺上有正確的航線顯示
      }
    }
    
    return filteredFlights;
  }, [selectedAirport, selectedCountry, isTaiwanAirport, airportCountryMap, setSelectedRouteData]);
  
  // 設置事件監聽器
  const setupEventListeners = useCallback(() => {
    const map = getMapInstance();
    if (!map) return;
    
    console.log('設置事件處理器...');
    
    // 移除所有現有的事件
    map.off('click', 'countries-fill');
    map.off('click', 'routes-layer');
    map.off('click', 'airports-layer');
    map.off('click', 'flight-trail-layer');
    map.off('mouseenter', 'countries-fill');
    map.off('mouseleave', 'countries-fill');
    map.off('mouseenter', 'routes-layer');
    map.off('mouseleave', 'routes-layer');
    map.off('mouseenter', 'airports-layer');
    map.off('mouseleave', 'airports-layer');
    map.off('mouseenter', 'flight-trail-layer');
    map.off('mouseleave', 'flight-trail-layer');
    
    // 處理空白處點擊
    map.on('click', (e) => {
      try {
        // 查詢點擊點的圖層特徵
        const features = map.queryRenderedFeatures(e.point, {
          layers: ['countries-fill', 'routes-layer', 'airports-layer', 'flight-trail-layer']
        });
        
        // 如果沒有點擊到任何特徵，則取消選擇
        if (features.length === 0) {
          console.log('點擊空白處，取消選擇');
          setSelectedCountry(null);
          setSelectedRoute(null);
          
          // 確保不會意外取消當應該保持的選擇
          e.originalEvent.stopPropagation();
          return;
        }
        
        // 檢查是否點擊了特定類型的圖層
        const clickedOnCountry = features.some(f => f.layer.id === 'countries-fill');
        const clickedOnRoute = features.some(f => 
          f.layer.id === 'routes-layer' || f.layer.id === 'flight-trail-layer'
        );
        const clickedOnAirport = features.some(f => f.layer.id === 'airports-layer');
        
        // 如果沒有點擊任何互動元素，取消選擇
        if (!clickedOnCountry && !clickedOnRoute && !clickedOnAirport) {
          console.log('點擊非互動元素，取消選擇');
          setSelectedCountry(null);
          setSelectedRoute(null);
        }
      } catch (error) {
        console.error('處理點擊事件出錯:', error);
      }
    });
    
    // 國家點擊事件
    map.on('click', 'countries-fill', (e) => {
      if (!e.features || e.features.length === 0) return;
      
      const feature = e.features[0];
      let countryName = null;
      
      // 從屬性獲取國家名稱
      if (feature.properties && feature.properties.NAME) {
        countryName = feature.properties.NAME;
      } else if (feature.properties && feature.properties.name) {
        countryName = feature.properties.name;
      }
      
      // 獲取國家代碼
      let countryCode = null;
      if (feature.properties && feature.properties.ISO_A2) {
        countryCode = feature.properties.ISO_A2;
      } else if (feature.properties && feature.properties.iso_a2) {
        countryCode = feature.properties.iso_a2;
      }
      
      console.log('解析的國家名稱:', countryName, '國家代碼:', countryCode);
      
      if (countryName) {
        // 存儲國家名稱、代碼和幾何形狀
        setSelectedCountry({
          name: countryName,
          code: countryCode,
          geometry: feature.geometry
        });
        setSelectedRoute(null);
        console.log('已選擇國家:', countryName);
      }
    });
    
    // 航線點擊事件
    map.on('click', 'routes-layer', (e) => {
      if (!e.features || e.features.length === 0) return;
      
      const feature = e.features[0];
      const source = feature.properties.source;
      const target = feature.properties.target;
      
      console.log(`點擊航線: ${source} -> ${target}`);
      if (source && target) {
        setSelectedRoute({
          source: source,
          target: target
        });
        setSelectedCountry(null);
      }
    });
    
    // 機場點擊事件
    map.on('click', 'airports-layer', (e) => {
      if (!e.features || e.features.length === 0) return;
      
      const feature = e.features[0];
      const airportName = feature.properties.name;
      
      console.log(`點擊機場: ${airportName}`);
      
      if (feature.properties.isRouteEndpoint) {
        // 如果這個機場是一個航線端點
        if (feature.properties.relatedRoute) {
          try {
            const route = JSON.parse(feature.properties.relatedRoute);
            setSelectedRoute(route);
            setSelectedCountry(null);
          } catch (err) {
            console.error('解析航線數據失敗:', err);
          }
        }
      }
    });
    
    // 航班軌跡點擊事件
    map.on('click', 'flight-trail-layer', (e) => {
      if (!e.features || e.features.length === 0) return;
      
      const feature = e.features[0];
      const source = feature.properties.source;
      const target = feature.properties.target;
      
      if (source && target) {
        console.log(`點擊航班軌跡: ${source} -> ${target}`);
        setSelectedRoute({
          source: source,
          target: target
        });
        setSelectedCountry(null);
      }
    });
    
    // 添加懸停效果 - 所有可點擊圖層
    const setHoverEffect = (layerId) => {
      map.on('mouseenter', layerId, () => {
        map.getCanvas().style.cursor = 'pointer';
      });
      
      map.on('mouseleave', layerId, () => {
        map.getCanvas().style.cursor = '';
      });
    };
    
    // 為各圖層添加懸停效果
    setHoverEffect('countries-fill');
    setHoverEffect('routes-layer');
    setHoverEffect('airports-layer');
    setHoverEffect('flight-trail-layer');
    
    // 機場懸停提示 - 新增功能
    map.on('mouseenter', 'airports-layer', (e) => {
      if (!e.features || e.features.length === 0) return;
      
      const feature = e.features[0];
      
      // 設置指針樣式
      map.getCanvas().style.cursor = 'pointer';
      
      // 關閉任何現有的彈出框
      if (popupRef.current) {
        popupRef.current.remove();
      }
      
      // 格式化乘客數
      const formattedPassengers = parseInt(feature.properties.passengers).toLocaleString();
      
      // 創建新的彈出框
      popupRef.current = new mapboxgl.Popup({
        closeButton: false,
        closeOnClick: false,
        className: 'dark-popup',
        offset: 10
      });
      
      popupRef.current.setLngLat(e.lngLat)
        .setHTML(`
          <div>
            <div class="popup-title">機場資訊</div>
            <div class="popup-content">
              <div><b>機場名稱:</b> ${feature.properties.name}</div>
              <div><b>乘客數:</b> ${formattedPassengers}</div>
              ${feature.properties.country ? `<div><b>國家:</b> ${feature.properties.country}</div>` : ''}
            </div>
          </div>
        `)
        .addTo(map);
    });
    
    map.on('mouseleave', 'airports-layer', () => {
      map.getCanvas().style.cursor = '';
      
      if (popupRef.current) {
        popupRef.current.remove();
        popupRef.current = null;
      }
    });
    
    // 航線懸停提示
    map.on('mouseenter', 'routes-layer', (e) => {
      if (!e.features || e.features.length === 0) return;
      
      const feature = e.features[0];
      
      // 關閉任何現有的彈出框
      if (popupRef.current) {
        popupRef.current.remove();
      }
      
      // 創建新的彈出框
      popupRef.current = new mapboxgl.Popup({
        closeButton: false,
        closeOnClick: false,
        className: 'dark-popup'
      });
      
      popupRef.current.setLngLat(e.lngLat)
        .setHTML(`
          <div>
            <div class="popup-title">航線資訊</div>
            <div class="popup-content">
              <div><b>出發地:</b> ${feature.properties.source}</div>
              <div><b>目的地:</b> ${feature.properties.target}</div>
              <div><b>乘客數:</b> ${Math.round(feature.properties.passengers).toLocaleString()}</div>
            </div>
            <div class="popup-hint">點擊查看歷史數據</div>
          </div>
        `)
        .addTo(map);
    });
    
    map.on('mouseleave', 'routes-layer', () => {
      if (popupRef.current) {
        popupRef.current.remove();
        popupRef.current = null;
      }
    });
    
    // 航班軌跡懸停提示
    map.on('mouseenter', 'flight-trail-layer', (e) => {
      if (!e.features || e.features.length === 0) return;
      
      const feature = e.features[0];
      
      // 關閉任何現有的彈出框
      if (popupRef.current) {
        popupRef.current.remove();
      }
      
      // 創建新的彈出框
      popupRef.current = new mapboxgl.Popup({
        closeButton: false,
        closeOnClick: false,
        className: 'dark-popup'
      });
      
      popupRef.current.setLngLat(e.lngLat)
        .setHTML(`
          <div>
            <div class="popup-title">航線資訊</div>
            <div class="popup-content">
              <div><b>航線:</b> ${feature.properties.source} → ${feature.properties.target}</div>
              <div><b>乘客數:</b> ${Math.round(feature.properties.passengers).toLocaleString()}</div>
            </div>
            <div class="popup-hint">點擊查看詳細資料</div>
          </div>
        `)
        .addTo(map);
    });
    
    map.on('mouseleave', 'flight-trail-layer', () => {
      if (popupRef.current) {
        popupRef.current.remove();
        popupRef.current = null;
      }
    });
    
  }, [setSelectedCountry, setSelectedRoute, getMapInstance]);
  
  // 初始化圖層 - 改進版本，確保重新加載時正確處理
  const initializeLayers = useCallback(() => {
    const map = getMapInstance();
    if (!map) return;
    
    console.log('開始初始化圖層函數...');
    
    // 檢查是否需要重設圖層
    if (layersInitializedRef.current) {
      console.log('圖層已初始化，檢查是否需要重置...');
      
      // 簡單檢查是否存在主要圖層，如果不存在則重置標記
      try {
        const hasLayer = map.getLayer('countries-fill');
        if (!hasLayer) {
          console.log('找不到主要圖層，重置初始化標記');
          layersInitializedRef.current = false;
        }
      } catch (e) {
        console.log('檢查圖層時出錯，重置初始化標記');
        layersInitializedRef.current = false;
      }
    }
    
    // 如果已經初始化且圖層存在，直接返回
    if (layersInitializedRef.current) {
      console.log('圖層已初始化且存在，跳過初始化');
      return;
    }
    
    console.log('初始化圖層...');
    
    try {
      // 確保先清理已存在的資源
      try {
        // 先檢查並移除圖層
        ['countries-boundary', 'countries-fill', 'airports-layer', 'routes-layer', 'flight-trail-layer'].forEach(layerId => {
          if (map.getLayer(layerId)) {
            map.removeLayer(layerId);
          }
        });
        
        // 然後檢查並移除源
        ['countries-source', 'airports-source', 'routes-source', 'flight-trail-source'].forEach(sourceId => {
          if (map.getSource(sourceId)) {
            map.removeSource(sourceId);
          }
        });
      } catch (cleanupError) {
        console.warn('清理現有圖層時出錯:', cleanupError);
      }
      
      // 添加國家邊界層
      map.addSource('countries-source', {
        type: 'geojson',
        data: 'https://d2ad6b4ur7yvpq.cloudfront.net/naturalearth-3.3.0/ne_50m_admin_0_countries.geojson'
      });
      
      // 添加國家邊界線
      map.addLayer({
        id: 'countries-boundary',
        type: 'line',
        source: 'countries-source',
        paint: {
          'line-color': '#FFFFFF',
          'line-width': 1,
          'line-opacity': 0.5
        }
      });
      
      // 添加陸地填充
      map.addLayer({
        id: 'countries-fill',
        type: 'fill',
        source: 'countries-source',
        paint: {
          'fill-color': '#223344',
          'fill-opacity': 0.8
        }
      });
      
      // 添加機場源
      map.addSource('airports-source', {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features: []
        }
      });
      
      // 添加機場圖層 - 使用飛機符號
      map.addLayer({
        id: 'airports-layer',
        type: 'symbol',
        source: 'airports-source',
        layout: {
          'text-field': '✈️', // 使用飛機表情符號
          'text-size': [
            'interpolate', ['linear'], ['get', 'passengers'],
            1000, 12,
            10000, 16,
            100000, 20,
            1000000, 24
          ],
          'text-allow-overlap': true,
          'text-ignore-placement': false,
          'text-anchor': 'center'
        },
        paint: {
          'text-color': [
            'case',
            ['==', ['get', 'isSelected'], true], '#FFFF00',
            ['==', ['get', 'isRouteEndpoint'], true], '#FFC800',
            '#FFFFFF'
          ],
          'text-halo-width': 1,
          'text-halo-color': '#000000',
          'text-halo-blur': 0
        }
      });
      
      // 添加航線圖層
      map.addSource('routes-source', {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features: []
        },
        lineMetrics: true
      });
      
      map.addLayer({
        id: 'routes-layer',
        type: 'line',
        source: 'routes-source',
        paint: {
          'line-color': ['get', 'color'],
          'line-width': 1.5,
          'line-opacity': 0.9,
          'line-blur': 0
        },
        layout: {
          'line-cap': 'round',
          'line-join': 'round'
        }
      });
      
      // 添加飛行軌跡圖層
      map.addSource('flight-trail-source', {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features: []
        }
      });
      
      map.addLayer({
        id: 'flight-trail-layer',
        type: 'line',
        source: 'flight-trail-source',
        paint: {
          'line-color': ['get', 'color'],
          'line-width': ['get', 'width'],
          'line-opacity': ['get', 'opacity'],
          'line-blur': ['get', 'blur']
        },
        layout: {
          'line-cap': 'round',
          'line-join': 'round'
        }
      });
      
      // 標記圖層已初始化
      layersInitializedRef.current = true;
      console.log('圖層初始化完成');
      
      // 設置事件處理器
      setupEventListeners();
      
    } catch (error) {
      console.error('初始化圖層失敗:', error);
      layersInitializedRef.current = false;
    }
  }, [setupEventListeners, getMapInstance]);
  
  // 更新機場數據 - 改進版，包含國家信息
  const updateAirports = useCallback(() => {
    const map = getMapInstance();
    if (!mapLoaded || !map || !selectedMonthAirports) return;
    
    try {
      const airportsFeatures = selectedMonthAirports.map(airport => {
        // 查找機場所屬國家（如果有）
        let countryName = '';
        let countryCode = '';
        
        // 使用 airportCountryMap 獲取機場所屬國家
        if (airportCountryMap && airportCountryMap[airport.name]) {
          countryName = airportCountryMap[airport.name].name || '';
          countryCode = airportCountryMap[airport.name].code || '';
        }
        
        return {
          type: 'Feature',
          geometry: {
            type: 'Point',
            coordinates: [airport.longitude, airport.latitude]
          },
          properties: {
            name: airport.name,
            passengers: airport.passengers,
            country: countryName,
            countryCode: countryCode,
            isSelected: selectedAirport === airport.name,
            isRouteEndpoint: selectedRoute && 
                         (selectedRoute.source === airport.name || 
                           selectedRoute.target === airport.name),
            relatedRoute: selectedRoute && 
                       (selectedRoute.source === airport.name || 
                         selectedRoute.target === airport.name) ? 
                       JSON.stringify(selectedRoute) : null
          }
        };
      });
      
      const airportsSource = map.getSource('airports-source');
      if (airportsSource) {
        airportsSource.setData({
          type: 'FeatureCollection',
          features: airportsFeatures
        });
      }
    } catch (error) {
      console.error('更新機場數據失敗:', error);
    }
  }, [mapLoaded, selectedMonthAirports, selectedAirport, selectedRoute, getMapInstance, airportCountryMap]);
  
  // 更新航線數據
  const updateRouteVisualization = useCallback(() => {
    const map = getMapInstance();
    if (!mapLoaded || !map || !enhancedFlights || enhancedFlights.length === 0) return;
    
    try {
      // 根據 displayMode 確定是否顯示航線
      if (displayMode === 'routes' || displayMode === 'both') {
        // 篩選要顯示的航班
        let displayFlights = filterFlights(enhancedFlights);
        
        // 生成路徑特性
        const routesFeatures = [];
        
        displayFlights.forEach(flight => {
          // 跳過無效的航線數據
          if (!flight.sourcePosition || !flight.targetPosition) return;
          
          // 獲取顏色
          let color = colorScaleData.scale(flight.passengers);
          if (Array.isArray(color)) {
            color = `rgba(${color[0]}, ${color[1]}, ${color[2]}, ${color[3] || 1})`;
          }
          
          // 檢查是否為選中航線
          const isSelected = selectedRoute && 
            ((flight.source === selectedRoute.source && flight.target === selectedRoute.target) ||
             (flight.source === selectedRoute.target && flight.target === selectedRoute.source));
          
          // 生成真實大圓弧線路徑 - 使用改進的函數
          const arcPoints = createImprovedGreatCircleArc(
            flight.sourcePosition, 
            flight.targetPosition,
            0.5  // 高度係數
          );
          
          // 處理可能的跨經線情況 - arcPoints 可能是點數組或線段數組的數組
          if (Array.isArray(arcPoints[0]) && Array.isArray(arcPoints[0][0])) {
            // 多段路徑 (跨經線) - 為每段創建單獨的特性
            arcPoints.forEach((segment, index) => {
              routesFeatures.push({
                type: 'Feature',
                geometry: {
                  type: 'LineString',
                  coordinates: segment
                },
                properties: {
                  source: flight.source,
                  target: flight.target,
                  passengers: flight.passengers,
                  color: isSelected ? '#FFFF00' : color,
                  isSelected: isSelected,
                  segmentIndex: index,  // 用於識別多段中的哪一段
                  isCrossAntimeridian: true // 標記為跨越日期變更線
                }
              });
            });
          } else {
            // 單一路徑 (不跨經線)
            routesFeatures.push({
              type: 'Feature',
              geometry: {
                type: 'LineString',
                coordinates: arcPoints
              },
              properties: {
                source: flight.source,
                target: flight.target,
                passengers: flight.passengers,
                color: isSelected ? '#FFFF00' : color,
                isSelected: isSelected,
                isCrossAntimeridian: false
              }
            });
          }
        });
        
        // 更新路徑圖層
        const routesSource = map.getSource('routes-source');
        if (routesSource) {
          routesSource.setData({
            type: 'FeatureCollection',
            features: routesFeatures
          });
        }
      } else {
        // 清空航線
        const routesSource = map.getSource('routes-source');
        if (routesSource) {
          routesSource.setData({
            type: 'FeatureCollection',
            features: []
          });
        }
      }
    } catch (error) {
      console.error('更新航線數據失敗:', error);
    }
  }, [mapLoaded, enhancedFlights, selectedRoute, colorScaleData, displayMode, filterFlights, createImprovedGreatCircleArc, getMapInstance]);
  
  // 更新飛行動畫 - 使用漸變線條而非圓點
  const updateFlightAnimation = useCallback((normalizedTime) => {
    const map = getMapInstance();
    if (!mapLoaded || !map || !enhancedFlights) return;
    
    try {
      // 如果不顯示動態飛行，清空圖層並返回
      if (displayMode !== 'flights' && displayMode !== 'both') {
        // 清空飛行軌跡圖層
        const trailSource = map.getSource('flight-trail-source');
        if (trailSource) {
          trailSource.setData({ type: 'FeatureCollection', features: [] });
        }
        return;
      }
      
      // 篩選要顯示的航班
      const flights = filterFlights(enhancedFlights);
      const flightFeatures = [];
      
      flights.forEach((flight, index) => {
        const sourcePos = flight.sourcePosition;
        const targetPos = flight.targetPosition;
        
        if (!sourcePos || !targetPos) return;
        
        // 計算航線長度，用於決定每條航線的飛機數量
        const dx = targetPos[0] - sourcePos[0];
        const dy = targetPos[1] - sourcePos[1];
        
        // 處理跨經線情況的距離計算
        let distance = Math.sqrt(dx * dx + dy * dy);
        const isCrossAntimeridian = Math.abs(dx) > 180;
        
        if (isCrossAntimeridian) {
          // 如果跨越日期變更線，調整距離計算
          const adjustedDx = dx > 0 ? dx - 360 : dx + 360;
          distance = Math.sqrt(adjustedDx * adjustedDx + dy * dy);
        }
        
        // 根據距離調整每條航線的飛機數量
        const flightCount = Math.max(1, Math.min(3, Math.ceil(distance / 40)));
        
        // 生成完整弧線路徑 - 使用改進的函數
        const arcPathResult = createImprovedGreatCircleArc(sourcePos, targetPos, 0.5);
        
        // 處理可能的跨經線情況 - 新方法
        let arcSegments = [];
        
        if (Array.isArray(arcPathResult[0]) && Array.isArray(arcPathResult[0][0])) {
          // 多段路徑 (跨經線) - 保持分段
          arcSegments = arcPathResult;
        } else {
          // 單一路徑 (不跨經線)
          arcSegments = [arcPathResult];
        }
        
        // 獲取顏色
        let color = colorScaleData.scale(flight.passengers);
        if (Array.isArray(color)) {
          color = `rgba(${color[0]}, ${color[1]}, ${color[2]}, ${color[3] || 1})`;
        }
        
        // 檢查是否為選中航線
        const isSelected = selectedRoute && 
          ((flight.source === selectedRoute.source && flight.target === selectedRoute.target) ||
           (flight.source === selectedRoute.target && flight.target === selectedRoute.source));
        
        const flightColor = isSelected ? '#FFFF00' : color;
        
        // 為每條航線創建多個飛機
        for (let i = 0; i < flightCount; i++) {
          // 在航線上分布多個飛機，帶有時間偏移
          const timeOffset = (i / flightCount + index * 0.1) % 1;
          const currentTime = (normalizedTime + timeOffset) % 1;
          
          // 確定當前位置在哪個段
          let segmentIndex = 0;
          let localTime = currentTime;
          
          // 如果有多段，找出當前時間在哪個段
          if (arcSegments.length > 1) {
            const totalLength = arcSegments.reduce((sum, segment) => sum + segment.length, 0);
            const segmentLengths = arcSegments.map(segment => segment.length / totalLength);
            
            let accumTime = 0;
            for (let j = 0; j < segmentLengths.length; j++) {
              accumTime += segmentLengths[j];
              if (currentTime < accumTime) {
                segmentIndex = j;
                // 計算段內的本地時間
                const prevAccum = accumTime - segmentLengths[j];
                localTime = (currentTime - prevAccum) / segmentLengths[j];
                break;
              }
            }
          }
          
          const currentSegment = arcSegments[segmentIndex];
          if (!currentSegment || currentSegment.length < 2) continue;
          
          // 計算動畫位置
          const animationLength = currentSegment.length;
          const calculatedIndex = Math.floor(localTime * animationLength);
          
          // 決定航班軌跡長度 - 整體路徑的15%
          const trailLength = Math.max(3, Math.min(10, Math.floor(animationLength * 0.15)));
          
          // 確保我們有足夠的點來創建軌跡
          if (calculatedIndex >= trailLength) {
            // 建立一個漸變效果的軌跡 - 多段線條
            const trailEndIndex = calculatedIndex;
            const trailStartIndex = Math.max(0, trailEndIndex - trailLength);
            
            // 收集軌跡所有點
            const trailPoints = currentSegment.slice(trailStartIndex, trailEndIndex + 1);
            
            // 如果有足夠的點構建軌跡
            if (trailPoints.length >= 2) {
              // 最前段用光效強調頭部 (不用圓點)
              const leadingSegmentStart = trailPoints[trailPoints.length - 2];
              const leadingSegmentEnd = trailPoints[trailPoints.length - 1];
              
              // 添加發光頭部段 - 較亮
              flightFeatures.push({
                type: 'Feature',
                geometry: {
                  type: 'LineString',
                  coordinates: [leadingSegmentStart, leadingSegmentEnd]
                },
                properties: {
                  source: flight.source,
                  target: flight.target,
                  passengers: flight.passengers,
                  color: flightColor,
                  opacity: 1.0,  // 完全不透明
                  width: 2.5,    // 略粗一些
                  blur: 0.0      // 不模糊
                }
              });
              
              // 添加輕微發光效果 - 無需額外圖層
              flightFeatures.push({
                type: 'Feature',
                geometry: {
                  type: 'LineString',
                  coordinates: [leadingSegmentStart, leadingSegmentEnd]
                },
                properties: {
                  source: flight.source,
                  target: flight.target,
                  passengers: flight.passengers,
                  color: flightColor,
                  opacity: 0.7,  // 稍微透明
                  width: 4.0,    // 更粗
                  blur: 2.0      // 模糊效果
                }
              });
              
              // 添加尾部軌跡 - 使用漸變透明度和寬度
              for (let s = 0; s < trailPoints.length - 2; s++) {
                const segmentRatio = s / (trailPoints.length - 2); // 0接近尾部，1接近頭部
                const fadeInRatio = Math.pow(segmentRatio, 0.5); // 非線性漸變 - 更快淡入
                
                flightFeatures.push({
                  type: 'Feature',
                  geometry: {
                    type: 'LineString',
                    coordinates: [trailPoints[s], trailPoints[s + 1]]
                  },
                  properties: {
                    source: flight.source,
                    target: flight.target,
                    passengers: flight.passengers,
                    color: flightColor,
                    opacity: 0.1 + 0.7 * fadeInRatio, // 從0.1漸變到0.8
                    width: 0.5 + 1.5 * fadeInRatio,   // 從0.5漸變到2.0
                    blur: 2.0 - 2.0 * fadeInRatio     // 從2.0漸變到0.0 (尾部模糊，頭部清晰)
                  }
                });
              }
            }
          }
        }
      });
      
      // 更新飛行軌跡圖層
      const trailSource = map.getSource('flight-trail-source');
      if (trailSource) {
        trailSource.setData({
          type: 'FeatureCollection',
          features: flightFeatures
        });
      }
    } catch (error) {
      console.error('更新飛行動畫失敗:', error);
    }
  }, [mapLoaded, enhancedFlights, selectedRoute, colorScaleData, displayMode, filterFlights, createImprovedGreatCircleArc, getMapInstance]);
  
  // 初始化地圖 - 改進處理3D地球重載問題
  useEffect(() => {
    // 注入自定義樣式
    injectCustomStyles();
    
    // 檢查是否需要重新初始化
    if (window.globalMapInstance) {
      // console.log('發現現有地圖實例');
      
      // 檢查是否標記了需要重新初始化
      if (window.globeNeedsReinitialize) {
        console.log('地圖標記為需要重新初始化');
        
        try {
          // 清理所有資源並強制重新創建地圖
          if (window.globalMapInstance) {
            try {
              window.globalMapInstance.remove();
            } catch (e) {
              console.error('移除舊地圖實例失敗:', e);
            }
            window.globalMapInstance = null;
            mapInstanceRef.current = null;
            layersInitializedRef.current = false;
            window.globeNeedsReinitialize = false;
            
            console.log('已移除舊地圖實例，準備創建新實例');
          }
        } catch (error) {
          console.error('清理資源失敗:', error);
        }
      }
    }
    
    // 如果地圖實例存在，使用它；否則創建新的
    if (window.globalMapInstance) {
      // console.log('使用現有地圖實例');
      mapInstanceRef.current = window.globalMapInstance;
      
      // 然後初始化圖層
      if (mapInstanceRef.current.loaded()) {
        initializeLayers();
        setMapLoaded(true);
      } else {
        mapInstanceRef.current.once('load', () => {
          initializeLayers();
          setMapLoaded(true);
        });
      }
      
      return;
    }
    
    console.log('創建新地圖實例...');
    
    try {
      // 創建地圖實例
      const mapInstance = new mapboxgl.Map({
        container: mapContainer.current,
        style: 'mapbox://styles/mapbox/satellite-streets-v12',
        center: [121.5, 24.0], // 以台灣為中心
        zoom: 1.5,
        projection: 'globe',
        attributionControl: false,
        fadeDuration: 0,
        renderWorldCopies: true,
        trackResize: true,
        doubleClickZoom: true,
        dragPan: true,
        dragRotate: true,
        touchZoomRotate: true,
        preserveDrawingBuffer: true,
        localIdeographFontFamily: "'Noto Sans TC', 'Noto Sans', sans-serif"
      });
      
      // 存儲地圖實例
      mapInstanceRef.current = mapInstance;
      window.globalMapInstance = mapInstance;
      window.globeNeedsReinitialize = false; // 初始化標記
      
      // 添加導航控制
      mapInstance.addControl(new mapboxgl.NavigationControl(), 'top-right');
      
      // 地圖加載完成事件
      mapInstance.once('load', () => {
        console.log('Mapbox 地圖加載完成');
        
        // 設置大氣效果
        mapInstance.setFog({
          color: 'rgb(10, 10, 30)',
          'high-color': 'rgb(36, 92, 223)',
          'horizon-blend': 0.4,
          'space-color': 'rgb(2, 5, 20)',
          'star-intensity': 0.5
        });
        
        // 初始化基礎圖層
        initializeLayers();
        
        // 標記地圖已加載
        setMapLoaded(true);
      });
    } catch (error) {
      console.error('創建地圖失敗:', error);
    }
    
    return () => {
      // 只清理動畫，不刪除地圖實例
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [initializeLayers, injectCustomStyles]);
  
  // 更新所有可視化數據
  useEffect(() => {
    if (!mapLoaded) return;
    
    // 執行各類數據更新
    updateAirports();
    updateRouteVisualization();
  }, [
    mapLoaded,
    enhancedFlights,
    selectedMonthAirports,
    selectedAirport,
    selectedRoute,
    selectedCountry,
    colorScaleData,
    displayMode,
    transitionProgress,
    updateAirports,
    updateRouteVisualization,
    airportCountryMap
  ]);
  
  // 飛行動畫循環
  useEffect(() => {
    // 只有在地圖加載後且顯示模式包含飛行時才開始動畫
    if (mapLoaded && (displayMode === 'flights' || displayMode === 'both')) {
      const animate = () => {
        const normalizedTime = (animationFrame % 100) / 100;
        updateFlightAnimation(normalizedTime);
        setAnimationFrame(prev => (prev + 1) % 1000);
        animationFrameRef.current = requestAnimationFrame(animate);
      };
      
      animationFrameRef.current = requestAnimationFrame(animate);
    } else if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      // 如果不顯示飛行，清空飛行動畫圖層
      const map = getMapInstance();
      if (map) {
        try {
          const trailSource = map.getSource('flight-trail-source');
          if (trailSource) {
            trailSource.setData({ type: 'FeatureCollection', features: [] });
          }
        } catch (error) {
          console.error('清空飛行動畫失敗:', error);
        }
      }
    }
    
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [mapLoaded, displayMode, animationFrame, updateFlightAnimation, getMapInstance]);
  
  return (
    <div
      ref={mapContainer}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%'
      }}
    />
  );
}

export default GlobeMap;