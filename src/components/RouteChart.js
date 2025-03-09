// components/RouteChart.js - 更新國家名稱顯示與圖表樣式
import React, { useMemo, useEffect, useState } from 'react';
import countryTranslationUtils from '../utils/countryTranslation';

// 解構出需要的函數
const { getChineseCountryName, getChineseCountryNameSync } = countryTranslationUtils;

function RouteChart({
  selectedRoute,
  selectedCountry,
  selectedRouteData,
  setSelectedRoute,
  setSelectedCountry
}) {
  // 國家名稱的翻譯狀態
  const [translatedSourceCountry, setTranslatedSourceCountry] = useState('');
  const [translatedTargetCountry, setTranslatedTargetCountry] = useState('');
  const [translatedSelectedCountry, setTranslatedSelectedCountry] = useState('');

  // 當選擇的路線或國家改變時進行翻譯
  useEffect(() => {
    const translateCountries = async () => {
      if (selectedRoute) {
        // 嘗試先使用同步方法以避免閃爍
        setTranslatedSourceCountry(getChineseCountryNameSync(selectedRoute.source));
        setTranslatedTargetCountry(getChineseCountryNameSync(selectedRoute.target));
        
        // 然後非同步獲取更準確的翻譯
        const sourceTranslation = await getChineseCountryName(selectedRoute.source);
        const targetTranslation = await getChineseCountryName(selectedRoute.target);
        
        setTranslatedSourceCountry(sourceTranslation);
        setTranslatedTargetCountry(targetTranslation);
      } else if (selectedCountry) {
        // 同樣的模式用於 selectedCountry
        setTranslatedSelectedCountry(getChineseCountryNameSync(selectedCountry));
        const countryTranslation = await getChineseCountryName(selectedCountry);
        setTranslatedSelectedCountry(countryTranslation);
      }
    };

    translateCountries();
  }, [selectedRoute, selectedCountry]);

  // 檢查是否為無直飛航班的情況
  const hasNoDirectFlights = useMemo(() => {
    return selectedRouteData && 
           selectedRouteData.length === 1 && 
           selectedRouteData[0].noDirectFlights;
  }, [selectedRouteData]);

  // 計算圖表數據和軸刻度
  const chartData = useMemo(() => {
    if (!selectedRouteData || selectedRouteData.length === 0 || hasNoDirectFlights) {
      return {
        dataPoints: [],
        maxPassengers: 0,
        yAxisTicks: [],
        years: [],
        allMonths: []
      };
    }

    // 找出最大值
    const maxPassengers = Math.max(...selectedRouteData.map(d => d.passengers));
    
    // 計算Y軸刻度 (使用整數倍)
    const calculateYAxisTicks = (min, max) => {
      // 計算一個合適的刻度間隔 (向上取整到"漂亮"的數字)
      let range = max - min;
      let tickCount = 5; // 希望有多少個刻度
      let rawInterval = range / (tickCount - 1);
      
      // 找一個"漂亮"的間隔值 (1, 2, 5, 10, 20, 50, 100, ...)
      const magnitude = Math.pow(10, Math.floor(Math.log10(rawInterval)));
      const normalizedInterval = rawInterval / magnitude;
      
      let niceInterval;
      if (normalizedInterval < 1.5) {
        niceInterval = 1;
      } else if (normalizedInterval < 3) {
        niceInterval = 2;
      } else if (normalizedInterval < 7) {
        niceInterval = 5;
      } else {
        niceInterval = 10;
      }
      niceInterval *= magnitude;
      
      // 計算最小和最大刻度值 (向下和向上取整)
      const niceMin = Math.floor(min / niceInterval) * niceInterval;
      const niceMax = Math.ceil(max / niceInterval) * niceInterval;
      
      // 生成刻度值數組
      const ticks = [];
      for (let tick = niceMin; tick <= niceMax; tick += niceInterval) {
        ticks.push(tick);
      }
      
      return ticks;
    };
    
    const yAxisTicks = calculateYAxisTicks(0, maxPassengers);
    const maxTickValue = yAxisTicks[yAxisTicks.length - 1] || maxPassengers;
    
    // 解析年月字符串，轉換為標準格式
    const parseYearMonth = (yearMonthStr) => {
      const [year, month] = yearMonthStr.split('年');
      const monthIndex = ['一月', '二月', '三月', '四月', '五月', '六月', '七月', '八月', '九月', '十月', '十一月', '十二月'].indexOf(month);
      return {
        year: parseInt(year),
        month: monthIndex,
        fullLabel: yearMonthStr
      };
    };
    
    // 將數據轉換為年月對象
    const yearMonthObjects = selectedRouteData.map(d => ({
      ...parseYearMonth(d.yearMonth),
      passengers: d.passengers,
      hasData: true
    }));
    
    // 找出最早和最晚的年月
    const earliestYM = yearMonthObjects.reduce((earliest, current) => {
      if (current.year < earliest.year || 
          (current.year === earliest.year && current.month < earliest.month)) {
        return current;
      }
      return earliest;
    }, yearMonthObjects[0]);
    
    const latestYM = yearMonthObjects.reduce((latest, current) => {
      if (current.year > latest.year || 
          (current.year === latest.year && current.month > latest.month)) {
        return current;
      }
      return latest;
    }, yearMonthObjects[0]);
    
    // 生成連續的時間線（填補缺失的月份）
    const months = ['一月', '二月', '三月', '四月', '五月', '六月', '七月', '八月', '九月', '十月', '十一月', '十二月'];
    const allMonths = [];
    
    for (let year = earliestYM.year; year <= latestYM.year; year++) {
      const startMonth = (year === earliestYM.year) ? earliestYM.month : 0;
      const endMonth = (year === latestYM.year) ? latestYM.month : 11;
      
      for (let month = startMonth; month <= endMonth; month++) {
        const fullLabel = `${year}年${months[month]}`;
        const existing = yearMonthObjects.find(ym => 
          ym.year === year && ym.month === month
        );
        
        allMonths.push({
          year,
          month,
          fullLabel,
          passengers: existing ? existing.passengers : 0,
          hasData: !!existing
        });
      }
    }
    
    // 提取唯一年份
    const years = [...new Set(allMonths.map(d => d.year))];
    
    // 生成繪圖點 - 使用固定的X坐標間距
    const chartWidth = 800; // 假設的圖表寬度
    const chartHeight = 120;
    const chartTop = 10;
    const chartBottom = chartTop + chartHeight;
    
    const dataPoints = allMonths.map((d, i) => {
      // X坐標 (相對位置)
      const xPos = i * (chartWidth / (allMonths.length - 1 || 1));
      
      // Y坐標 (相對位置) - 全部月份都計算位置，缺少數據的月份設為0
      const yPos = chartBottom - ((d.passengers / maxTickValue) * chartHeight);
      
      return {
        x: xPos,
        y: yPos,
        xPercent: `${(i / (allMonths.length - 1 || 1)) * 100}%`,
        yearMonth: d.fullLabel,
        value: d.passengers,
        hasData: d.hasData
      };
    });
    
    return {
      dataPoints,
      maxPassengers,
      yAxisTicks,
      maxTickValue,
      years,
      chartHeight,
      chartTop,
      chartBottom,
      allMonths
    };
  }, [selectedRouteData, hasNoDirectFlights]);
  
  // 決定標題 - 使用翻譯後的國家名稱
  const title = selectedRoute
    ? `${translatedSourceCountry || selectedRoute.source} ↔ ${translatedTargetCountry || selectedRoute.target} 航線乘客數量趨勢`
    : selectedCountry 
    ? `台灣 ↔ ${translatedSelectedCountry || (typeof selectedCountry === 'object' ? selectedCountry.name : selectedCountry)} 航線乘客數量趨勢`
    : '';

  // 關閉圖表
  const handleClose = () => {
    setSelectedRoute(null);
    setSelectedCountry(null);
  };

  // 生成折線段 - 創建連接相鄰點的線段
  const generateLineSegments = () => {
    if (!chartData.dataPoints || chartData.dataPoints.length < 2) return [];
    
    const segments = [];
    let lastPoint = null;
    
    // 遍歷所有數據點
    for (let i = 0; i < chartData.dataPoints.length; i++) {
      const point = chartData.dataPoints[i];
      
      if (lastPoint !== null) {
        // 創建線段
        segments.push({
          x1: lastPoint.x,
          y1: lastPoint.y,
          x2: point.x,
          y2: point.y
        });
      }
      
      lastPoint = point;
    }
    
    return segments;
  };

  // 決定哪些月份標籤應該顯示
  const determineVisibleMonthLabels = (allMonths) => {
    if (!allMonths || allMonths.length === 0) return [];
    
    // 根據總月數量決定顯示頻率
    let frequency;
    if (allMonths.length <= 24) { // 兩年以內
      frequency = 2; // 每兩個月顯示一次
    } else if (allMonths.length <= 48) { // 四年以內
      frequency = 3; // 每季度顯示一次
    } else if (allMonths.length <= 72) { // 六年以內
      frequency = 6; // 每半年顯示一次
    } else {
      frequency = 12; // 每年顯示一次
    }
    
    return allMonths.filter((_, index) => index % frequency === 0);
  };

  const visibleMonthLabels = useMemo(() => {
    return determineVisibleMonthLabels(chartData.allMonths);
  }, [chartData.allMonths]);

  // Y軸寬度的偏移量，為 Y 軸留出空間
  const yAxisWidth = 60;

  return (
    <div className="route-chart panel">
      <div className="route-chart-header">
        <h3 className="route-chart-title">{title}</h3>
        <button className="route-chart-close" onClick={handleClose}>✕</button>
      </div>
      <div className="simple-chart">
        {hasNoDirectFlights ? (
          <div style={{ color: 'white', textAlign: 'center', paddingTop: '40px' }}>
            無直飛航班
          </div>
        ) : chartData.dataPoints.length > 0 ? (
          <svg width="100%" height="200" viewBox={`0 0 800 200`} preserveAspectRatio="none">
            {/* 預留 Y 軸空間的背景 */}
            <rect x="0" y="0" width={yAxisWidth} height="200" fill="rgba(0,0,0,0.4)" />
            
            {/* 網格線和Y軸刻度 */}
            {chartData.yAxisTicks.map((tick, index) => {
              const yPos = chartData.chartBottom - (tick / chartData.maxTickValue * chartData.chartHeight);
              return (
                <g key={`grid-${index}`}>
                  <line 
                    x1={yAxisWidth} 
                    y1={yPos} 
                    x2="100%" 
                    y2={yPos} 
                    stroke="rgba(255,255,255,0.1)" 
                  />
                  <text 
                    x={yAxisWidth - 5} 
                    y={yPos - 5}
                    fill="white" 
                    fontSize="10"
                    textAnchor="end"
                  >
                    {tick.toLocaleString()}
                  </text>
                </g>
              );
            })}
            
            {/* 折線 - 現在使用多條線段而不是polyline，並且從 Y 軸偏移開始 */}
            {generateLineSegments().map((segment, index) => (
              <line
                key={`line-${index}`}
                x1={segment.x1 + yAxisWidth}
                y1={segment.y1}
                x2={segment.x2 + yAxisWidth}
                y2={segment.y2}
                stroke="#82ca9d"
                strokeWidth="3"
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            ))}
            
            {/* 數據點 - 同樣從 Y 軸偏移開始 */}
            {chartData.dataPoints.map((point, i) => (
              <g key={`point-${i}`}>
                <circle
                  cx={point.x + yAxisWidth}
                  cy={point.y}
                  r={point.hasData ? 3 : 2} // 縮小圓點大小
                  fill={point.hasData ? "#82ca9d" : "#555"} // 有數據的點用綠色，無數據用灰色
                />
                {/* 添加懸停時的數值提示 */}
                <title>{point.yearMonth}: {Math.round(point.value).toLocaleString()} 乘客</title>
              </g>
            ))}
            
            {/* X軸線 */}
            <line 
              x1={yAxisWidth} 
              y1={chartData.chartBottom} 
              x2="100%" 
              y2={chartData.chartBottom} 
              stroke="rgba(255,255,255,0.3)" 
            />
            
            {/* X軸標籤：年份 */}
            {chartData.years.map(year => {
              // 找出該年的所有月份
              const yearMonths = chartData.allMonths.filter(ym => ym.year === year);
              
              // 找出年份標籤的位置 (該年的中間點)
              const firstIndex = chartData.allMonths.findIndex(ym => ym.year === year);
              const yearWidth = yearMonths.length / chartData.allMonths.length;
              const midPosition = firstIndex / chartData.allMonths.length + yearWidth / 2;
              
              // 調整 X 座標，考慮 Y 軸寬度
              const xPos = yAxisWidth + ((800 - yAxisWidth) * midPosition);
              
              return (
                <text
                  key={`year-${year}`}
                  x={xPos}
                  y={chartData.chartBottom + 25}
                  textAnchor="middle"
                  fill="white"
                  fontSize="12"
                  fontWeight="bold"
                >
                  {year}年
                </text>
              );
            })}
            
            {/* X軸標籤：僅顯示選定的月份，避免重疊 */}
            {visibleMonthLabels.map((yearMonth, i) => {
              const allMonthsIndex = chartData.allMonths.findIndex(ym => 
                ym.year === yearMonth.year && ym.month === yearMonth.month
              );
              
              const xPosition = (allMonthsIndex / (chartData.allMonths.length - 1)) * (800 - yAxisWidth) + yAxisWidth;
              
              return (
                <text
                  key={`month-${i}`}
                  x={xPosition}
                  y={chartData.chartBottom + 45}
                  textAnchor="middle"
                  fill="rgba(255, 255, 255, 0.8)"
                  fontSize="10"
                >
                  {['一月', '二月', '三月', '四月', '五月', '六月', '七月', '八月', '九月', '十月', '十一月', '十二月'][yearMonth.month]}
                </text>
              );
            })}
          </svg>
        ) : (
          <div style={{ color: 'white', textAlign: 'center', paddingTop: '40px' }}>
            無歷史數據
          </div>
        )}
      </div>
    </div>
  );
}

export default RouteChart;