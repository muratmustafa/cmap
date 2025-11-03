# CMAPI ile Qt WebEngine Entegrasyonu

Bu harita uygulaması CMAPI (Common Map API) kullanarak Qt WebEngineWidget ile iki yönlü iletişim kurar.

## Hızlı Başlangıç

### 1. Qt Tarafı - Bridge Sınıfı

```cpp
// MapBridge.h
#ifndef MAPBRIDGE_H
#define MAPBRIDGE_H

#include <QObject>
#include <QString>
#include <QDebug>

class MapBridge : public QObject {
    Q_OBJECT
    
public:
    explicit MapBridge(QObject* parent = nullptr) : QObject(parent) {}
    
public slots:
    // JS'den gelen CMAPI mesajları (harita → Qt)
    void receiveMapMessage(const QString& channel, const QString& payload) {
        qDebug() << "[CMAPI Bridge]" << channel << payload;
        
        // map.view.clicked → harita tıklamaları
        if (channel == "map.view.clicked") {
            // payload JSON parse et ve UI güncelle
            emit mapClicked(payload);
        }
        // map.status.view → kamera değişiklikleri
        else if (channel == "map.status.view") {
            emit viewChanged(payload);
        }
    }
    
signals:
    // Qt → JS mesaj göndermek için (Qt tarafından emit edilir)
    void sendMapMessage(const QString& channel, const QString& payload);
    
    // UI için yardımcı sinyaller
    void mapClicked(const QString& data);
    void viewChanged(const QString& data);
};

#endif // MAPBRIDGE_H
```

### 2. Qt WebChannel Kurulumu

```cpp
// MainWindow.cpp veya başlangıç kodunuzda

#include <QWebEngineView>
#include <QWebChannel>
#include <QUrl>
#include "MapBridge.h"

// WebEngine view oluştur
QWebEngineView* webView = new QWebEngineView(this);
QWebEnginePage* page = webView->page();

// Bridge nesnesi oluştur
MapBridge* bridge = new MapBridge(this);

// WebChannel'i kur
QWebChannel* channel = new QWebChannel(page);
channel->registerObject("qtBridge", bridge);  // JS'de window.qtBridge olarak erişilir
page->setWebChannel(channel);

// qwebchannel.js'i resource olarak ekle (veya statik dosya)
// Qt WebEngine otomatik olarak qrc:///qtwebchannel/qwebchannel.js sağlar

// Harita HTML'ini yükle
webView->load(QUrl("http://localhost:5173"));  // Vite dev server
// veya
// webView->setUrl(QUrl::fromLocalFile("/path/to/public/index.html"));

// Bridge sinyallerini dinle
connect(bridge, &MapBridge::mapClicked, this, [](const QString& data) {
    qDebug() << "Harita tıklandı:" << data;
    // JSON parse edip lat/lon çıkar, UI güncelle
});
```

### 3. Qt'den Haritaya Mesaj Gönderme

#### A) Signal/Slot ile (Önerilen)
```cpp
// Haritaya nokta ekle
QString geoJsonPoint = R"({
    "type": "Feature",
    "geometry": {
        "type": "Point",
        "coordinates": [32.8597, 39.9334, 0]
    },
    "properties": {
        "name": "Ankara"
    }
})";

QString payload = QString(R"({
    "featureId": "ankara-point",
    "name": "Ankara",
    "format": "geojson",
    "feature": %1,
    "zoom": true
})").arg(geoJsonPoint);

emit bridge->sendMapMessage("map.feature.plot", payload);
```

#### B) Direct JavaScript Execution (Alternatif)
```cpp
// Haritaya direkt komut gönder
QString js = QString(
    "if (window.qtDispatchMessage) { "
    "  window.qtDispatchMessage('map.feature.plot', %1); "
    "}"
).arg(payload);

page->runJavaScript(js);
```

### 4. CMAPI Kanalları - Hızlı Referans

#### Qt → Harita (emit sendMapMessage)
- `map.feature.plot` - Haritaya feature ekle
- `map.feature.unplot` - Feature sil
- `map.view.center.location` - Haritayı merkez

le
- `map.view.zoom` - Zoom seviyesi ayarla

#### Harita → Qt (receiveMapMessage slot'u)
- `map.view.clicked` - Kullanıcı haritayı tıkladı
- `map.feature.clicked` - Kullanıcı feature tıkladı
- `map.status.view` - Kamera değişti (debounced)

## Örnek: Basit UI Akışı

```cpp
// Button click → haritaya nokta ekle
void MainWindow::onAddPointClicked() {
    double lat = ui->latSpinBox->value();
    double lon = ui->lonSpinBox->value();
    QString name = ui->nameLineEdit->text();
    
    QString payload = QString(R"({
        "featureId": "point-%1",
        "name": "%2",
        "format": "geojson",
        "feature": {
            "type": "Feature",
            "geometry": {
                "type": "Point",
                "coordinates": [%3, %4, 0]
            }
        },
        "zoom": true
    })").arg(QDateTime::currentMSecsSinceEpoch())
        .arg(name).arg(lon).arg(lat);
    
    emit m_bridge->sendMapMessage("map.feature.plot", payload);
}

// Harita tıklama → UI güncelle
void MainWindow::onMapClicked(const QString& data) {
    // JSON parse (QJsonDocument kullan)
    QJsonDocument doc = QJsonDocument::fromJson(data.toUtf8());
    QJsonObject obj = doc.object();
    
    double lat = obj["lat"].toDouble();
    double lon = obj["lon"].toDouble();
    
    ui->statusBar->showMessage(
        QString("Tıklanan konum: %1, %2").arg(lat).arg(lon)
    );
    
    // Form alanlarını doldur
    ui->latSpinBox->setValue(lat);
    ui->lonSpinBox->setValue(lon);
}
```

## Debug İpuçları

### 1. Qt Console Output
```cpp
// Bridge'den gelen mesajları logla
qDebug() << "[CMAPI]" << channel << payload;
```

### 2. JS Console (Chrome DevTools)
- WebEngineView → sağ tık → "Inspect" (Qt 5.11+)
- Console'da kontrol et:
```js
window.cmajs           // CMAPI nesnesi
window.qtBridge        // Qt bridge nesnesi
window.qtDispatchMessage // Qt → JS dispatcher
```

### 3. Test Mesajları (JS Console'dan)
```js
// Qt'ye test mesajı gönder
window.cmajs.publish({
  channel: 'map.view.clicked',
  payload: { lat: 39.9, lon: 32.85, button: 'left', type: 'single', keys: ['none'] }
});

// Qt'den haritaya test mesajı (Qt tarafında emit sendMapMessage yap)
```

## Production Build

Vite ile build:
```bash
npm run build
# dist/ klasörünü Qt resources'a ekle veya file:/// ile yükle
```

Qt'de local file yükle:
```cpp
QString htmlPath = QCoreApplication::applicationDirPath() + "/map/index.html";
webView->load(QUrl::fromLocalFile(htmlPath));
```

## Ek Kaynaklar
- CMAPI Spec: https://github.com/CMAPI/cmapi
- Qt WebChannel Docs: https://doc.qt.io/qt-6/qwebchannel.html
- Cesium Docs: https://cesium.com/learn/cesiumjs/ref-doc/

## Sorun Giderme

**Problem:** `window.cmajs` undefined
- **Çözüm:** index.html'de CMAPI scriptleri yüklü mü kontrol et

**Problem:** `qtBridge` bulunamıyor
- **Çözüm:** 
  1. qwebchannel.js yüklenmiş mi?
  2. `channel->registerObject("qtBridge", bridge)` doğru mu?
  3. Page yüklenmeden önce WebChannel kuruldu mu?

**Problem:** Mesajlar gönderilmiyor
- **Çözüm:**
  1. Qt console'da bridge mesajlarını gör (qDebug)
  2. JS console'da `[CMAPI]` loglarını kontrol et
  3. `debug: true` ile qt-runtime'ı başlat
