// utils/countryTranslation.js
// 常見國家名稱的中英文對照表 (作為備用和常用國家的快取)
const commonCountries = {
    'China': '中國',
    'United States': '美國',
    'Japan': '日本',
    'South Korea': '韓國',
    'Hong Kong': '香港',
    'Macau': '澳門',
    'Thailand': '泰國',
    'Singapore': '新加坡',
    'Malaysia': '馬來西亞',
    'Philippines': '菲律賓',
    'Vietnam': '越南',
    'Indonesia': '印尼',
    'Cambodia': '柬埔寨',
    'Australia': '澳洲',
    'France': '法國',
    'United Kingdom': '英國',
    'Germany': '德國',
    'Italy': '義大利',
    'Spain': '西班牙',
    'Canada': '加拿大',
    'Taiwan': '台灣',
    'Macao': '澳門',
    'United Arab Emirates': '阿聯'
  };
  
  // 翻譯快取
  const translationCache = new Map();
  
  /**
   * 獲取國家的中文名稱
   * @param {string|object} country 國家名稱或國家物件
   * @returns {Promise<string>} 中文國家名稱
   */
  export const getChineseCountryName = async (country) => {
    // 處理不同的輸入格式
    const englishName = typeof country === 'object' ? country.name : country;
    
    if (!englishName) return '';
    
    // 檢查是否為台灣 (特別處理)
    if (englishName.toLowerCase() === 'taiwan') return '台灣';
    
    // 檢查常見國家名單
    if (commonCountries[englishName]) {
      return commonCountries[englishName];
    }
    
    // 檢查快取
    if (translationCache.has(englishName)) {
      return translationCache.get(englishName);
    }
    
    try {
      // 使用 MyMemory API 進行翻譯 (免費且不需要 API key)
      const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(englishName)}&langpair=en|zh-tw`;
      const response = await fetch(url);
      const data = await response.json();
      
      if (data && data.responseData) {
        const translation = data.responseData.translatedText;
        // 儲存到快取
        translationCache.set(englishName, translation);
        return translation;
      }
      
      // 如果 API 失敗，則回傳原始英文名稱
      return englishName;
    } catch (error) {
      console.error('翻譯請求失敗:', error);
      // 如果 API 請求失敗，則回傳原始英文名稱
      return englishName;
    }
  };
  
  /**
   * 同步獲取國家的中文名稱 (適用於已有快取的情況)
   * @param {string|object} country 國家名稱或國家物件
   * @returns {string} 中文國家名稱
   */
  export const getChineseCountryNameSync = (country) => {
    const englishName = typeof country === 'object' ? country.name : country;
    
    if (!englishName) return '';
    
    // 檢查是否為台灣 (特別處理)
    if (englishName.toLowerCase() === 'taiwan') return '台灣';
    
    // 檢查常見國家名單
    if (commonCountries[englishName]) {
      return commonCountries[englishName];
    }
    
    // 檢查快取
    if (translationCache.has(englishName)) {
      return translationCache.get(englishName);
    }
    
    // 如果沒有快取，回傳原始英文名稱
    return englishName;
  };
  
  // 避免 ESLint 警告
  const countryTranslationUtils = {
    getChineseCountryName,
    getChineseCountryNameSync
  };
  
  export default countryTranslationUtils;