## 维护

# 1. 更新資料後，修復和提交
sed -i 's/\bNaN\b/null/g' public/data/aggregated_flights.json
git add public/data/aggregated_flights.json  
git commit -m "$(date +'%Y%m%d')更新"
git push origin main

# 2. 部署（會自動建置）
npm run deploy