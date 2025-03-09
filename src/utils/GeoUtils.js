// utils/GeoUtils.js

/**
 * 檢查一個點是否在多邊形內
 * 使用射線法 (Ray Casting Algorithm)
 * @param {Array} point - [longitude, latitude]
 * @param {Object} polygon - GeoJSON geometry object
 * @return {Boolean} - true if point is inside polygon
 */
export function pointInPolygon(point, polygon) {
  // 處理不同的GeoJSON幾何類型
  let coordinates;
  if (polygon.type === 'Polygon') {
    coordinates = [polygon.coordinates];
  } else if (polygon.type === 'MultiPolygon') {
    coordinates = polygon.coordinates;
  } else {
    return false; // 非多邊形類型
  }
  
  // 檢查每個多邊形
  for (const poly of coordinates) {
    for (const ring of poly) {
      if (pointInRing(point, ring)) {
        return true;
      }
    }
  }
  
  return false;
}

/**
 * 檢查一個點是否在多邊形環內
 * @param {Array} point - [longitude, latitude]
 * @param {Array} ring - 多邊形環坐標
 * @return {Boolean} - true if point is inside ring
 */
function pointInRing(point, ring) {
  const x = point[0], y = point[1];
  let inside = false;
  
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1];
    const xj = ring[j][0], yj = ring[j][1];
    
    const intersect = ((yi > y) !== (yj > y)) && 
                      (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  
  return inside;
}

/**
 * 獲取兩個點之間的距離（以公里為單位）
 * @param {Array} point1 - [longitude, latitude]
 * @param {Array} point2 - [longitude, latitude]
 * @return {Number} - distance in kilometers
 */
export function getDistance(point1, point2) {
  const [lon1, lat1] = point1;
  const [lon2, lat2] = point2;
  
  const R = 6371; // 地球半徑（公里）
  const dLat = deg2rad(lat2 - lat1);
  const dLon = deg2rad(lon2 - lon1);
  
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) * 
            Math.sin(dLon/2) * Math.sin(dLon/2);
  
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

function deg2rad(deg) {
  return deg * (Math.PI/180);
}

/**
 * 尋找最接近點的多邊形
 * @param {Array} point - [longitude, latitude]
 * @param {Array} polygons - 多邊形數組，每個需有geometry和properties屬性
 * @return {Object} - 最近的多邊形對象
 */
export function findNearestPolygon(point, polygons) {
  if (!point || !Array.isArray(polygons) || polygons.length === 0) {
    return null;
  }
  
  // 首先檢查點是否在任何多邊形內
  for (const polygon of polygons) {
    if (pointInPolygon(point, polygon.geometry)) {
      return polygon;
    }
  }
  
  // 如果不在任何多邊形內，找到最近的多邊形
  let minDistance = Infinity;
  let nearestPolygon = null;
  
  for (const polygon of polygons) {
    // 計算點到多邊形的最小距離
    const distance = getMinDistanceToPolygon(point, polygon.geometry);
    
    if (distance < minDistance) {
      minDistance = distance;
      nearestPolygon = polygon;
    }
  }
  
  return nearestPolygon;
}

/**
 * 計算點到多邊形的最小距離（簡化版）
 * @param {Array} point - [longitude, latitude]
 * @param {Object} polygonGeometry - GeoJSON geometry object
 * @return {Number} - 最小距離（公里）
 */
function getMinDistanceToPolygon(point, polygonGeometry) {
  let minDistance = Infinity;
  
  // 處理不同的GeoJSON幾何類型
  let coordinates;
  if (polygonGeometry.type === 'Polygon') {
    coordinates = [polygonGeometry.coordinates];
  } else if (polygonGeometry.type === 'MultiPolygon') {
    coordinates = polygonGeometry.coordinates;
  } else {
    return minDistance; // 非多邊形類型
  }
  
  // 檢查每個多邊形
  for (const poly of coordinates) {
    for (const ring of poly) {
      // 檢查環上的每個點
      for (const coord of ring) {
        const distance = getDistance(point, coord);
        if (distance < minDistance) {
          minDistance = distance;
        }
      }
    }
  }
  
  return minDistance;
}