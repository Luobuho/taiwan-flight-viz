// FlightMap.js - 重構版本，移除3D相關代碼並增強2D功能
import React, { useRef, useMemo, useState, useEffect, useCallback, forwardRef } from 'react';
import { DeckGL } from 'deck.gl';
import { ScatterplotLayer, ArcLayer, GeoJsonLayer, LineLayer } from '@deck.gl/layers';
import { COORDINATE_SYSTEM } from '@deck.gl/core';
import ReactMapGL from 'react-map-gl';
import { pointInPolygon } from '../utils/GeoUtils';

// Mapbox API Key
const MAPBOX_TOKEN = process.env.REACT_APP_MAPBOX_TOKEN || '';

// Create a wrapper component for Map to handle refs correctly
const StaticMap = forwardRef((props, ref) => {
  return (
    <ReactMapGL
      {...props}
      ref={ref}
      reuseMaps
      preventStyleDiffing
    />
  );
});

function FlightMap({
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
  const deckRef = useRef(null);
  const mapRef = useRef(null);
  const animationFrameRef = useRef(null);
  
  // 視圖狀態
  const [viewState, setViewState] = useState({
    longitude: 121.5,
    latitude: 24.0,
    zoom: 2,
    pitch: 40,
    bearing: 0
  });
  
  // 內部動畫狀態
  const [localAnimationTime, setLocalAnimationTime] = useState(0);
  
  // 顏色比例尺
  const colorScale = colorScaleData.scale;
  
  // 台灣機場關鍵字列表 - 使用 useMemo 避免重新創建
  const taiwanKeywords = useMemo(() => 
    ['桃園', '臺北', '高雄', '臺中', '花蓮', '澎湖', '臺南', '台北', '台中', '台南'], 
    []
  );
  
  // 檢查是否為台灣機場
  const isTaiwanAirport = useCallback((airportName) => {
    return taiwanKeywords.some(keyword => airportName.includes(keyword));
  }, [taiwanKeywords]);
  
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
  
  // 計算路徑上的點位置 - 使用大圓航線 (大地測量線)
  const getGreatCirclePosition = (source, target, ratio) => {
    if (!source || !target) return [0, 0, 0];
    
    // 確保輸入坐標有效
    if (!Array.isArray(source) || !Array.isArray(target)) return [0, 0, 0];
    if (source.length < 2 || target.length < 2) return [0, 0, 0];
    
    // 轉換為弧度
    const start = [source[0] * Math.PI / 180, source[1] * Math.PI / 180];
    const end = [target[0] * Math.PI / 180, target[1] * Math.PI / 180];
    
    // 計算大圓弧路徑上的中間點
    const d = 2 * Math.asin(Math.sqrt(
      Math.pow(Math.sin((start[1] - end[1]) / 2), 2) +
      Math.cos(start[1]) * Math.cos(end[1]) * 
      Math.pow(Math.sin((start[0] - end[0]) / 2), 2)
    ));
    
    // 如果起點和終點相同，只需返回起點
    if (Math.abs(d) < 0.000001) {
      return [...source, 0];
    }
    
    const A = Math.sin((1 - ratio) * d) / Math.sin(d);
    const B = Math.sin(ratio * d) / Math.sin(d);
    
    // 計算球面上的中間點
    const x = A * Math.cos(start[1]) * Math.cos(start[0]) + B * Math.cos(end[1]) * Math.cos(end[0]);
    const y = A * Math.cos(start[1]) * Math.sin(start[0]) + B * Math.cos(end[1]) * Math.sin(end[0]);
    const z = A * Math.sin(start[1]) + B * Math.sin(end[1]);
    
    // 將笛卡爾坐標轉回經緯度
    const lat = Math.atan2(z, Math.sqrt(x * x + y * y)) * 180 / Math.PI;
    const lng = Math.atan2(y, x) * 180 / Math.PI;

    // 添加微小高度以避免與地球表面重疊
    return [lng, lat, 0.001];
  };
  
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
  
  // 生成飛行路線 - 使用細長的直線段
  const flightLines = useMemo(() => {
    // 篩選顯示的航班
    let displayFlights = filterFlights(enhancedFlights);
    
    // 根據 displayMode 進一步過濾
    if (displayMode === 'routes') {
      // 只顯示航線，不顯示航班移動，返回空陣列
      return [];
    }
    
    // 計算當前動畫時間（0-1之間循環）
    const normalizedTime = (localAnimationTime % 2000) / 2000;
    
    // 為每條航線生成多個直線段
    const lines = [];
    
    displayFlights.forEach((flight, flightIndex) => {
      // 提取源頭和目標的位置
      const sourcePos = flight.sourcePosition || [0, 0];
      const targetPos = flight.targetPosition || [0, 0];
      
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
      const flightCount = Math.max(1, Math.min(5, Math.ceil(distance * 2)));
      
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
      
      // 為每條航線生成多個飛機
      for (let i = 0; i < flightCount; i++) {
        // 在航線上分布多個飛機，帶有時間偏移
        const timeOffset = (i / flightCount + flightIndex * 0.1) % 1;
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
            
            // 選擇顏色
            let color;
            if (selectedRoute && 
               ((flight.source === selectedRoute.source && flight.target === selectedRoute.target) ||
               (flight.source === selectedRoute.target && flight.target === selectedRoute.source))) {
              color = [255, 255, 0, 255]; // 黃色高亮選中的航線
            } else {
              // 使用航線的顏色
              color = colorScale(flight.passengers);
              // 確保顏色有alpha值
              if (color.length === 3) color = [...color, 255];
            }
            
            // 添加發光頭部段
            lines.push({
              id: `flight-head-${flightIndex}-${i}`,
              sourcePosition: leadingSegmentStart,
              targetPosition: leadingSegmentEnd,
              color: color,
              width: 2.5,
              opacity: 1.0,
              blur: 0.0,
              flight: flight
            });
            
            // 添加發光效果
            lines.push({
              id: `flight-glow-${flightIndex}-${i}`,
              sourcePosition: leadingSegmentStart,
              targetPosition: leadingSegmentEnd,
              color: color,
              width: 4.0,
              opacity: 0.7,
              blur: 2.0,
              flight: flight
            });
            
            // 添加尾部軌跡
            for (let s = 0; s < trailPoints.length - 2; s++) {
              const segmentRatio = s / (trailPoints.length - 2); // 0接近尾部，1接近頭部
              const fadeInRatio = Math.pow(segmentRatio, 0.5); // 非線性漸變
              
              lines.push({
                id: `flight-trail-${flightIndex}-${i}-${s}`,
                sourcePosition: trailPoints[s],
                targetPosition: trailPoints[s + 1],
                color: color,
                width: 0.5 + 1.5 * fadeInRatio,
                opacity: 0.1 + 0.7 * fadeInRatio,
                blur: 2.0 - 2.0 * fadeInRatio,
                flight: flight
              });
            }
          }
        }
      }
    });
    
    return lines;
  }, [enhancedFlights, selectedAirport, selectedCountry, selectedRoute, localAnimationTime, colorScale, displayMode, isTaiwanAirport, filterFlights, createImprovedGreatCircleArc]);
  
  // 處理地圖點擊
  const handleClick = (info) => {
    console.log('點擊事件:', info);
    
    // 檢查是否點擊了任何物體
    if (!info.object) {
      console.log('點擊空白處');
      setSelectedRoute(null);
      setSelectedCountry(null);
      return;
    }
    
    // 航線點擊處理
    if (info.layer && info.layer.id === 'arc-layer' && info.object.source && info.object.target) {
      console.log('點擊航線:', info.object.source, '->', info.object.target);
      setSelectedRoute({
        source: info.object.source,
        target: info.object.target
      });
      setSelectedCountry(null);
      return;
    }
    
    // 如果點擊了帶有flight屬性的物體 (可能是動態航班)
    if (info.object && info.object.flight) {
      const flight = info.object.flight;
      console.log('點擊動態航班:', flight.source, '->', flight.target);
      setSelectedRoute({
        source: flight.source,
        target: flight.target
      });
      setSelectedCountry(null);
      return;
    }
    
    // 國家點擊處理
    if (info.layer && info.layer.id === 'geojson-layer') {
      console.log('原始國家點擊數據:', info.object);
      
      let countryName = null;
      if (info.object.properties && info.object.properties.NAME) {
        countryName = info.object.properties.NAME;
      } else if (info.object.properties && info.object.properties.name) {
        countryName = info.object.properties.name;
      }
      
      // 獲取國家代碼
      let countryCode = null;
      if (info.object.properties && info.object.properties.ISO_A2) {
        countryCode = info.object.properties.ISO_A2;
      } else if (info.object.properties && info.object.properties.iso_a2) {
        countryCode = info.object.properties.iso_a2;
      }
      
      // 獲取國家幾何形狀
      const countryGeometry = info.object.geometry;
      
      console.log('解析的國家名稱:', countryName);
      
      if (countryName) {
        // 存儲國家名稱、代碼和幾何形狀
        setSelectedCountry({
          name: countryName,
          code: countryCode,
          geometry: countryGeometry
        });
        setSelectedRoute(null);
        console.log('已選擇國家:', countryName);
      }
      return;
    }
    
    // 機場點擊處理
    if (info.layer && info.layer.id === 'scatterplot-layer') {
      const airport = info.object;
      console.log('點擊機場:', airport.name);
      
      // 如果機場是選定航線的端點之一，顯示該航線
      if (selectedRoute && 
          (airport.name === selectedRoute.source || airport.name === selectedRoute.target)) {
        // 保持當前選擇不變
        return;
      }
      
      // 如果點擊了其他機場，清除選擇
      if (selectedRoute || selectedCountry) {
        setSelectedRoute(null);
        setSelectedCountry(null);
      }
      
      return;
    }
    
    // 如果都不符合，也清除選擇
    console.log('點擊其他物體，清除選擇');
    setSelectedRoute(null);
    setSelectedCountry(null);
  };
  
  // 層配置
  const layers = useMemo(() => {
    // 篩選要顯示的航班
    let displayFlights = filterFlights(enhancedFlights);
    
    // 構建數據圖層
    // 1. 添加國家圖層
    const countryLayer = new GeoJsonLayer({
      id: 'geojson-layer',
      data: 'https://d2ad6b4ur7yvpq.cloudfront.net/naturalearth-3.3.0/ne_50m_admin_0_countries.geojson',
      filled: true,
      stroked: true,
      pickable: true, // 啟用點擊
      getFillColor: f => {
        // 如果選擇了國家，高亮顯示
        if (selectedCountry) {
          const countryName = selectedCountry.name || selectedCountry;
          const featureName = f.properties.NAME || f.properties.name;
          
          if (featureName === countryName) {
            return [255, 255, 0, 40]; // 半透明黃色
          }
        }
        return [100, 100, 100, 40]; // 深灰色作為基本顏色
      },
      getLineColor: [200, 200, 200],
      lineWidthMinPixels: 1,
      lineMiterLimit: 2,
      getLineWidth: 1,
      opacity: 0.8,
      autoHighlight: true,
      highlightColor: [255, 255, 100, 60], // 懸停高亮顏色
      updateTriggers: {
        getFillColor: [selectedCountry]
      },
      extensions: []
    });
    
    // 2. 根據 displayMode 添加航線圖層
    const routeLayers = [];
    if (displayMode === 'routes' || displayMode === 'both') {
      // 航線圖層
      routeLayers.push(new ArcLayer({
        id: 'arc-layer',
        data: displayFlights,
        pickable: true,
        getWidth: d => 1.5 * (transitionProgress),
        getSourcePosition: d => d.sourcePosition,
        getTargetPosition: d => d.targetPosition,
        getSourceColor: d => {
          if (selectedRoute && 
             ((d.source === selectedRoute.source && d.target === selectedRoute.target) ||
             (d.source === selectedRoute.target && d.target === selectedRoute.source))) {
            return [255, 255, 0, 200]; // 黃色高亮選中的航線
          }
          return colorScale(d.passengers);
        },
        getTargetColor: d => {
          if (selectedRoute && 
             ((d.source === selectedRoute.source && d.target === selectedRoute.target) ||
             (d.source === selectedRoute.target && d.target === selectedRoute.source))) {
            return [255, 255, 0, 200]; // 黃色高亮選中的航線
          }
          return colorScale(d.passengers);
        },
        greatCircle: true, // 使用大圓航線 (最短路徑)
        widthMinPixels: 1.5,
        widthMaxPixels: 2.5,
        autoHighlight: true,
        pickingRadius: 20,
        parameters: {
          depthTest: true,
          blend: true,
          blendFunc: [770, 771],
          blendEquation: 32774
        },
        updateTriggers: {
          getSourceColor: [selectedRoute],
          getTargetColor: [selectedRoute]
        }
      }));
    }
    
    // 3. 添加飛行航班圖層
    const flightTrailLayers = [];
    if ((displayMode === 'flights' || displayMode === 'both') && flightLines.length > 0) {
      flightTrailLayers.push(new LineLayer({
        id: 'flight-line-layer',
        data: flightLines,
        pickable: true,
        getWidth: d => d.width || 2,
        getSourcePosition: d => d.sourcePosition,
        getTargetPosition: d => d.targetPosition,
        getColor: d => {
          const baseColor = d.color || [255, 255, 255];
          const opacity = d.opacity !== undefined ? d.opacity : 1.0;
          return [...baseColor.slice(0, 3), opacity * 255];
        },
        widthUnits: 'pixels',
        widthMinPixels: 0.5,
        widthMaxPixels: 4,
        parameters: {
          depthTest: true,
          blend: true,
          blendFunc: [770, 771]
        }
      }));
    }
    
    // 4. 添加機場圖層
    const airportLayer = new ScatterplotLayer({
      id: 'scatterplot-layer',
      data: selectedMonthAirports,
      pickable: true,
      opacity: 0.8 * transitionProgress,
      stroked: true,
      filled: true,
      radiusScale: 6,
      radiusMinPixels: 4,
      radiusMaxPixels: 25,
      lineWidthMinPixels: 1,
      getPosition: d => [d.longitude, d.latitude],
      getRadius: d => Math.sqrt(d.passengers) / 100,
      getFillColor: d => {
        if (selectedAirport && d.name === selectedAirport) {
          return [255, 255, 0, 200]; // 黃色高亮選中機場
        }
        if (selectedRoute && (d.name === selectedRoute.source || d.name === selectedRoute.target)) {
          return [255, 200, 0, 200]; // 橙色高亮航線相關機場
        }
        return [255, 255, 255, 150];
      },
      getLineColor: [0, 0, 0, 100],
      updateTriggers: {
        getFillColor: [selectedAirport, selectedRoute]
      }
    });
    
    return [
      countryLayer,
      ...routeLayers,
      ...flightTrailLayers,
      airportLayer
    ];
  }, [
    enhancedFlights, 
    selectedMonthAirports,
    selectedAirport,
    selectedRoute,
    selectedCountry,
    transitionProgress,
    colorScale,
    displayMode,
    flightLines,
    filterFlights
  ]);
  
  // 航班動畫更新
  useEffect(() => {
    // 航班動畫循環
    const animate = () => {
      setLocalAnimationTime(prev => prev + 10); // 增加動畫時間
      animationFrameRef.current = requestAnimationFrame(animate);
    };
    
    // 開始動畫
    if (displayMode === 'flights' || displayMode === 'both') {
      animationFrameRef.current = requestAnimationFrame(animate);
    }
    
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [displayMode]);
  
  // 組件卸載時清理動畫
  useEffect(() => {
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []);
  
  return (
    <DeckGL
      ref={deckRef}
      layers={layers}
      initialViewState={viewState}
      onViewStateChange={evt => setViewState(evt.viewState)}
      controller={{
        doubleClickZoom: false,
        scrollZoom: {
          speed: 0.003,
          smooth: true
        },
        dragPan: true,
        dragRotate: true,
        inertia: 250,
        touchRotate: true,
        keyboard: true
      }}
      getCursor={() => 'default'}
      onClick={handleClick}
      getTooltip={({ object }) => {
        if (!object) return null;
        
        // 航班提示 - 原始航線
        if (object.source && object.target) {
          // 處理航空公司信息
          let airlineList = '無數據';
          try {
            if (object.airlineList && Array.isArray(object.airlineList) && object.airlineList.length > 0) {
              airlineList = object.airlineList.join(', ');
            } else if (object.properties && 
                object.properties["航空公司列表"] && 
                Array.isArray(object.properties["航空公司列表"]) && 
                object.properties["航空公司列表"].length > 0) {
              airlineList = object.properties["航空公司列表"].join(', ');
            }
          } catch (err) {
            console.error("處理航空公司數據時出錯:", err);
          }
          
          return {
            html: `
              <div>
                <div><b>航線:</b> ${object.source} → ${object.target}</div>
                <div><b>航空公司:</b> ${airlineList}</div>
                <div><b>乘客數:</b> ${Math.round(object.passengers).toLocaleString()}</div>
                <div><b>時間:</b> ${object.yearMonthStr || ''}</div>
                <div style="font-style: italic; margin-top: 8px;">點擊查看歷史數據</div>
              </div>
            `
          };
        }
        
        // 航班提示 - 動態航班
        if (object.flight) {
          const flight = object.flight;
          
          // 處理航空公司信息
          let airlineList = '無數據';
          try {
            if (flight.airlineList && Array.isArray(flight.airlineList) && flight.airlineList.length > 0) {
              airlineList = flight.airlineList.join(', ');
            } else if (flight.properties && 
                flight.properties["航空公司列表"] && 
                Array.isArray(flight.properties["航空公司列表"]) && 
                flight.properties["航空公司列表"].length > 0) {
              airlineList = flight.properties["航空公司列表"].join(', ');
            }
          } catch (err) {
            console.error("處理航空公司數據時出錯:", err);
          }
          
          return {
            html: `
              <div>
                <div><b>航線:</b> ${flight.source} → ${flight.target}</div>
                <div><b>航空公司:</b> ${airlineList}</div>
                <div><b>乘客數:</b> ${Math.round(flight.passengers).toLocaleString()}</div>
                <div><b>時間:</b> ${flight.yearMonthStr || ''}</div>
                <div style="font-style: italic; margin-top: 8px;">點擊查看歷史數據</div>
              </div>
            `
          };
        }
        
        // 機場提示
        else if (object.name) {
          // 獲取國家名稱 (從 airportCountryMap)
          let countryInfo = '';
          if (airportCountryMap && airportCountryMap[object.name]) {
            countryInfo = `<div><b>國家:</b> ${airportCountryMap[object.name].name}</div>`;
          }
          
          return {
            html: `
              <div>
                <div><b>機場:</b> ${object.name}</div>
                <div><b>乘客數:</b> ${Math.round(object.passengers).toLocaleString()}</div>
                ${countryInfo}
              </div>
            `
          };
        }
        
        // 國家提示
        else if (object.properties && (object.properties.NAME || object.properties.name)) {
          const countryName = object.properties.NAME || object.properties.name;
          return {
            html: `
              <div>
                <div><b>國家:</b> ${countryName}</div>
                <div style="font-style: italic; margin-top: 8px;">點擊查看所有到此國家的航線</div>
              </div>
            `
          };
        }
        
        return null;
      }}
    >
      <StaticMap
        ref={mapRef}
        mapStyle="mapbox://styles/mapbox/dark-v10"
        mapboxAccessToken={MAPBOX_TOKEN}
        reuseMaps
        preventStyleDiffing
      />
    </DeckGL>
  );
}

export default FlightMap;