# Cesium Map App (Node.js + TypeScript + Vite)

Bu proje, Node.js, TypeScript, Vite ve Cesium kullanarak web tabanlı bir harita uygulamasıdır. Calcite Design System tabanlı bir araç çubuğu içerir ve çizim araçları (line, polygon, rectangle, circle), polygon için snap ve auto-close, ayrıca 3B extrusion (extrudedHeight) gibi özellikler sunar. CMAPI entegrasyonu ve Qt WebEngine test uygulaması da mevcuttur.

Hızlı başlangıç:

1. Bağımlılıkları yükleyin:

```bash
npm install
```

2. Geliştirme sunucularını başlatın (server + vite):

```bash
npm run dev
```

 - Server: http://localhost:3000 (API endpoints)
 - Vite (client): http://localhost:5173

Notlar:
- Geliştirme sırasında Vite, `public/index.html` uygulamasını sunar ve `src/client/main.ts` içindeki Cesium başlatılır.
- Üretim için `npm run build` çalıştırın; sonra `npm start` ile derlenmiş sunucuyu çalıştırabilirsiniz.

Calcite toolbar ve ayarlar:
- Sol üstteki Calcite action bar üzerinden çizim araçlarını kullanın.
- Dişli (Settings) popover'ında:
	- Snap (polygon)
	- Polygon auto-close
	- Extruded height (m)

Çizim hakkında:
- Polygon snap varsayılan olarak açıktır (20px tolerans).
- Auto-close: ilk verteks yakınında tıklayınca polygon otomatik kapanır.
- Extruded height > 0 ise 3B hacim olarak çizilir (polygon/rectangle/ellipse).

GitHub'a yayınlama:
1) Git init ve ilk commit
```bash
git init
git add .
git commit -m "Initial commit"
```
2) GitHub repo oluşturun ve uzak adresi ekleyip push edin
```bash
git branch -M main
git remote add origin https://github.com/<kullanici-adi>/<repo-adi>.git
git push -u origin main
```

Sorularınız veya eklemek istediğiniz özellikler (örneğin işaretçi, katman yönetimi, veri API'leri) varsa söyleyin, beraber ilerleyelim.
