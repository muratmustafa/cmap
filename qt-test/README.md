# Cesium CMAPI Qt Test Uygulaması

Bu minimal Qt uygulaması, Cesium haritasının Qt WebEngineWidget içinde CMAPI ile nasıl entegre edileceğini gösterir.

## Gereksinimler

- Qt 6.x (Qt6::Core, Widgets, WebEngineWidgets, WebChannel)
- CMake 3.16+
- C++17 compiler
- Çalışan Vite dev server (harita için)

## Derleme (CMake)

```bash
cd qt-test
mkdir build
cd build

# Configure
cmake ..

# Build
cmake --build .

# veya make kullan
make
```

## macOS'ta Qt yolu belirleme

Eğer Qt'yi Homebrew ile yüklediysen:
```bash
export CMAKE_PREFIX_PATH="/opt/homebrew/opt/qt@6"
cmake ..
```

Eğer resmi Qt installer kullandıysan:
```bash
export CMAKE_PREFIX_PATH="~/Qt/6.x.x/macos"
cmake ..
```

## Çalıştırma

### 1. Önce Vite dev server'ı başlat
```bash
cd /Users/mustafamurat/Documents/map
npm run dev
```
Dev server `http://localhost:5173` adresinde çalışmalı.

### 2. Qt uygulamasını çalıştır
```bash
cd qt-test/build
./CesiumMapTest

# veya macOS bundle ise:
./CesiumMapTest.app/Contents/MacOS/CesiumMapTest
```

## Kullanım

Uygulama açıldığında:

### Sol Panel
- **Koordinat girişi**: Enlem/Boylam ve isim
- **Nokta Ekle**: Qt'den haritaya CMAPI ile nokta ekler (`map.feature.plot`)
- **Konuma Git**: Haritayı belirtilen koordinata götürür (`map.view.center.location`)
- **Durum**: Son işlemin durumu
- **CMAPI Mesajları**: Tüm gönderilen/alınan CMAPI mesajları loglanır

### Sağ Panel
- Cesium haritası (WebEngineView)
- Haritayı tıkladığında koordinatlar sol panele aktarılır

### Test Senaryoları

1. **Harita → Qt**:
   - Haritayı tıkla
   - Koordinatlar sol panelde güncellenir
   - Log'da `← Harita: map.view.clicked` görünür

2. **Qt → Harita (Nokta)**:
   - Koordinat gir (ör: 39.9334, 32.8597)
   - İsim yaz (ör: "Ankara")
   - "Nokta Ekle" butonuna tıkla
   - Haritada kırmızı nokta görünür

3. **Qt → Harita (Kamera)**:
   - Koordinat gir
   - "Konuma Git" butonuna tıkla
   - Harita o konuma uçar (flyTo)

## Yapı

```
qt-test/
├── CMakeLists.txt          # CMake build config
├── main.cpp                # Qt uygulama başlangıcı
├── MainWindow.h/cpp        # Ana pencere + UI
├── MapBridge.h/cpp         # CMAPI WebChannel köprüsü
└── README.md               # Bu dosya
```

## CMAPI Mesaj Akışı

```
Qt Application          WebChannel          Cesium Map (JS)
─────────────          ──────────          ───────────────
     │                      │                      │
     │  emit sendMapMessage │                      │
     ├─────────────────────>│                      │
     │                      │  qtBridge.sendMap... │
     │                      ├─────────────────────>│
     │                      │                      │ (cmajs.publish)
     │                      │                      │
     │                      │  qtBridge.receive... │
     │                      │<─────────────────────┤
     │  receiveMapMessage() │                      │ (map.view.clicked)
     │<─────────────────────┤                      │
     │                      │                      │
```

## Debug İpuçları

### Qt Console
Tüm CMAPI mesajları `qDebug()` ile console'a yazılır:
```
[MapBridge] Received: map.view.clicked
  Payload: {"lat":39.9334,"lon":32.8597,...}
  -> Map clicked at: 39.9334, 32.8597
```

### Web Inspector (Chromium DevTools)
Qt WebEngineView → Sağ tık → "Inspect" (Qt 5.11+)

Console'da:
```js
window.cmajs           // CMAPI nesnesi
window.qtBridge        // Qt bridge
window.cmajs.runtimes  // browser ve qt runtime'ları
```

### Sorun Giderme

**Problem**: Harita yüklenmiyor
- Vite dev server çalışıyor mu? `http://localhost:5173` tarayıcıda açılıyor mu?
- Firewall/CORS sorunu var mı?

**Problem**: CMAPI mesajları iletilmiyor
- Web Inspector'da `window.qtBridge` tanımlı mı?
- Console'da `[Qt Runtime] QWebChannel connected` yazısı var mı?
- `window.cmajs.runtimes` içinde hem `browser` hem `qt` var mı?

**Problem**: Qt build hatası
- Qt6 kurulu mu? `qmake --version` veya `cmake --find-package Qt6`
- WebEngineWidgets modülü yüklü mü? (bazı Qt kurulumlarında ayrı paket)

## Genişletme Önerileri

- Polyline/Polygon çizim desteği (`map.feature.draw`)
- WMS layer ekleme (`map.feature.plot.url`)
- Feature seçimi (`map.feature.clicked`, `map.feature.selected`)
- Overlay yönetimi (`map.overlay.create`, `show`, `hide`)
- Mesaj geçmişi kaydetme/dışa aktarma

## Lisans

MIT - Test/eğitim amaçlı örnek kod
