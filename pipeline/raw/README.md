# pipeline/raw

把從政府開放資料下載的原始檔解壓縮到這裡。這個資料夾的內容不進版控（見根目錄 `.gitignore`），
因為檔案大，而且應該隨時能從官方來源重新下載。

| 檔案 | 內容 |
| --- | --- |
| `TOWN_MOI_*.shp`（連同 .dbf .shx .prj .cpg） | 鄉鎮市區界線 |
| `population.csv` | 人口統計（選用） |
| 斷層 `.shp`（連同附屬檔） | 活動斷層（選用） |
| `beds.csv` | 醫院床數（選用，欄位 `district,beds`） |

下載方式與指令見 [../README.md](../README.md)。
