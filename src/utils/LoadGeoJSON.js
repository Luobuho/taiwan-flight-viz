// utils/LoadGeoJSON.js - 修改以支持 GitHub Pages 路徑和基於座標的機場去重複

// 將年月轉換為更容易閱讀的格式
export function formatYearMonth(ym) {
  if (!ym) {
    return "未知日期";
  }
  
  const ymStr = String(parseInt(ym));
  if (ymStr.length !== 6) {
    return ymStr;
  }
  
  const year = ymStr.slice(0, 4);
  const month = parseInt(ymStr.slice(4, 6));
  
  // 將月份數字轉換為月份名稱
  const months = ["一月", "二月", "三月", "四月", "五月", "六月", "七月", "八月", "九月", "十月", "十一月", "十二月"];
  try {
    const monthName = months[month - 1];
    return `${year}年${monthName}`;
  } catch {
    return ymStr;
  }
}

// 處理 LineString 幾何對象，提取起點和終點座標
function extractCoordinates(feature) {
  try {
    // 檢查是否有有效的 geometry
    if (feature.geometry && feature.geometry.type === 'LineString' && 
        feature.geometry.coordinates && feature.geometry.coordinates.length >= 2) {
      // 直接從 LineString 中提取起點和終點坐標
      const startCoord = feature.geometry.coordinates[0];
      const endCoord = feature.geometry.coordinates[1];
      return [startCoord[0], startCoord[1], endCoord[0], endCoord[1]];
    } 
    
    // 如果沒有有效的 geometry，嘗試從屬性中提取坐標
    if (feature.properties) {
      const props = feature.properties;
      if (props['出發經度'] && props['出發緯度'] && props['到達經度'] && props['到達緯度']) {
        return [
          parseFloat(props['出發經度']), 
          parseFloat(props['出發緯度']), 
          parseFloat(props['到達經度']), 
          parseFloat(props['到達緯度'])
        ];
      }
    }
    
    // 如果上述方法都失敗，返回默認值
    return [0, 0, 0, 0];
  } catch (error) {
    console.error('提取座標時出錯:', error);
    return [0, 0, 0, 0];
  }
}

// 新增: 獲取正確的數據URL（考慮GitHub Pages路徑）
function getDataUrl(path) {
  // 處理相對路徑，確保在GitHub Pages上正確加載
  const publicUrl = process.env.PUBLIC_URL || '';
  return `${publicUrl}${path}`;
}

// 讀取 GeoJSON 文件並處理數據
export async function loadFlightData(url) {
  try {
    // 修改: 使用getDataUrl處理路徑
    const dataUrl = getDataUrl(url);
    console.log('載入 GeoJSON 檔案:', dataUrl);
    
    // 使用 fetch API 加載 GeoJSON 文件 (使用修正後的URL)
    const response = await fetch(dataUrl);
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const geojson = await response.json();
    console.log('GeoJSON 載入完成:', geojson);
    
    // 檢查是否有有效的 features
    if (!geojson.features || geojson.features.length === 0) {
      console.error('GeoJSON 沒有有效的 features');
      return {
        flights: [],
        airports: []
      };
    }
    
    console.log('讀取到數據行數:', geojson.features.length);
    console.log('數據示例:', geojson.features[0]);
    
    const processedData = [];
    const airportsByCoords = {}; // 以座標為索引的機場字典
    const airportNameLatest = {}; // 跟踪每對座標的最新機場名稱
    
    // 第一步：預處理所有特徵以收集機場名稱和座標的映射
    // 假設數據按時間順序排列，較新的數據出現在後面
    geojson.features.forEach(feature => {
      try {
        if (!feature.properties) return;
        
        const props = feature.properties;
        const [startLon, startLat, endLon, endLat] = extractCoordinates(feature);
        
        // 生成座標鍵（四捨五入到固定小數位以處理微小差異）
        const sourceCoordKey = `${parseFloat(startLon).toFixed(4)},${parseFloat(startLat).toFixed(4)}`;
        const targetCoordKey = `${parseFloat(endLon).toFixed(4)},${parseFloat(endLat).toFixed(4)}`;
        
        // 更新座標到機場名稱的映射
        if (props['出發機場']) {
          airportNameLatest[sourceCoordKey] = props['出發機場'];
        }
        
        if (props['到達機場']) {
          airportNameLatest[targetCoordKey] = props['到達機場'];
        }
      } catch (error) {
        console.error('預處理機場時出錯:', error, feature);
      }
    });
    
    // 第二步：處理每條航線數據
    geojson.features.forEach(feature => {
      try {
        if (!feature.properties) {
          console.warn('Feature 缺少 properties:', feature);
          return;
        }
        
        const props = feature.properties;
        
        // 提取年月
        const yearMonth = props['年月'];
        
        // 提取座標
        const [startLon, startLat, endLon, endLat] = extractCoordinates(feature);
        
        // 生成座標鍵
        const sourceCoordKey = `${parseFloat(startLon).toFixed(4)},${parseFloat(startLat).toFixed(4)}`;
        const targetCoordKey = `${parseFloat(endLon).toFixed(4)},${parseFloat(endLat).toFixed(4)}`;
        
        // 使用最新的機場名稱（如果有）
        const sourceName = airportNameLatest[sourceCoordKey] || props['出發機場'];
        const targetName = airportNameLatest[targetCoordKey] || props['到達機場'];
        
        // 更健壯的航空公司列表處理
        if (!props["航空公司列表"] || !Array.isArray(props["航空公司列表"])) {
          // 如果是字符串，嘗試不同的分隔符
          if (typeof props["航空公司列表"] === 'string') {
            const airlineStr = props["航空公司列表"];
            
            if (airlineStr.includes(',')) {
              props["航空公司列表"] = airlineStr.split(',').map(s => s.trim()).filter(Boolean);
            } else if (airlineStr.includes('、')) {
              props["航空公司列表"] = airlineStr.split('、').map(s => s.trim()).filter(Boolean);
            } else if (airlineStr.includes('|')) {
              props["航空公司列表"] = airlineStr.split('|').map(s => s.trim()).filter(Boolean);
            } else {
              // 如果沒有分隔符，視為單個值
              props["航空公司列表"] = [airlineStr.trim()];
            }
          } else {
            // 如果不是字符串也不是數組，設為空數組
            props["航空公司列表"] = [];
          }
        }
        
        // 複製並深度克隆 properties 對象，確保所有數據都被正確複製
        let clonedProps;
        try {
          clonedProps = JSON.parse(JSON.stringify(props));
        } catch (e) {
          console.error("無法深度克隆 properties:", e);
          clonedProps = {...props}; // 退回到淺拷貝
        }
        
        // 創建航線數據 - 使用最新的機場名稱
        processedData.push({
          sourcePosition: [parseFloat(startLon), parseFloat(startLat)],
          targetPosition: [parseFloat(endLon), parseFloat(endLat)],
          passengers: parseFloat(props['載客人次'] || 0),
          flights: parseInt(props['航班數'] || 0),
          loadFactor: parseFloat(props['平均載客率'] || 0),
          source: sourceName, // 使用最新名稱
          target: targetName, // 使用最新名稱
          sourceCoordKey, // 存儲座標鍵以便後續處理
          targetCoordKey,
          yearMonth,
          yearMonthStr: formatYearMonth(yearMonth),
          // 在對象根級別也添加航空公司列表，以便多種方式訪問
          airlineList: [...(props["航空公司列表"] || [])],
          // 保留原始 properties 對象，確保航空公司列表可用
          properties: clonedProps
        });
        
        // 收集機場資訊 - 按座標去重複
        if (!airportsByCoords[sourceCoordKey]) {
          airportsByCoords[sourceCoordKey] = {
            name: sourceName,
            longitude: parseFloat(startLon), 
            latitude: parseFloat(startLat),
            coordKey: sourceCoordKey,
            flights: 0,
            passengers: 0
          };
        }
        
        // 更新機場統計數據
        airportsByCoords[sourceCoordKey].flights += parseInt(props['航班數'] || 0);
        airportsByCoords[sourceCoordKey].passengers += parseFloat(props['載客人次'] || 0);
        
        // 收集機場資訊 - 到達機場
        if (!airportsByCoords[targetCoordKey]) {
          airportsByCoords[targetCoordKey] = {
            name: targetName,
            longitude: parseFloat(endLon), 
            latitude: parseFloat(endLat),
            coordKey: targetCoordKey,
            flights: 0,
            passengers: 0
          };
        }
        
        // 更新機場統計數據
        airportsByCoords[targetCoordKey].flights += parseInt(props['航班數'] || 0);
        airportsByCoords[targetCoordKey].passengers += parseFloat(props['載客人次'] || 0);
      } catch (error) {
        console.error('處理航線時出錯:', error, feature);
      }
    });
    
    console.log(`處理完成: ${processedData.length} 條航線, ${Object.keys(airportsByCoords).length} 個機場`);
    
    return {
      flights: processedData,
      airports: Object.values(airportsByCoords)
    };
  } catch (error) {
    console.error('加載航線數據時出錯:', error);
    return {
      flights: [],
      airports: []
    };
  }
}