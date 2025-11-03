#include "MainWindow.h"
#include <QMessageBox>
#include <QDateTime>
#include <QJsonDocument>
#include <QJsonObject>
#include <QJsonArray>

MainWindow::MainWindow(QWidget *parent)
    : QMainWindow(parent)
    , m_webView(nullptr)
    , m_channel(nullptr)
    , m_bridge(nullptr)
{
    setupUI();
    setupWebEngine();
    
    setWindowTitle("Cesium CMAPI Test - Qt WebEngine");
    resize(1400, 900);
}

MainWindow::~MainWindow() {
}

void MainWindow::setupUI() {
    // Ana widget ve layout
    QWidget* centralWidget = new QWidget(this);
    QHBoxLayout* mainLayout = new QHBoxLayout(centralWidget);
    
    // Sol panel - Kontroller
    QWidget* leftPanel = new QWidget();
    QVBoxLayout* leftLayout = new QVBoxLayout(leftPanel);
    leftPanel->setMaximumWidth(350);
    
    // Koordinat girişi grubu
    QGroupBox* coordGroup = new QGroupBox("Konum Bilgisi");
    QVBoxLayout* coordLayout = new QVBoxLayout();
    
    QHBoxLayout* latLayout = new QHBoxLayout();
    latLayout->addWidget(new QLabel("Enlem (Lat):"));
    m_latSpinBox = new QDoubleSpinBox();
    m_latSpinBox->setRange(-90.0, 90.0);
    m_latSpinBox->setDecimals(6);
    m_latSpinBox->setValue(39.9334);
    latLayout->addWidget(m_latSpinBox);
    coordLayout->addLayout(latLayout);
    
    QHBoxLayout* lonLayout = new QHBoxLayout();
    lonLayout->addWidget(new QLabel("Boylam (Lon):"));
    m_lonSpinBox = new QDoubleSpinBox();
    m_lonSpinBox->setRange(-180.0, 180.0);
    m_lonSpinBox->setDecimals(6);
    m_lonSpinBox->setValue(32.8597);
    lonLayout->addWidget(m_lonSpinBox);
    coordLayout->addLayout(lonLayout);
    
    QHBoxLayout* nameLayout = new QHBoxLayout();
    nameLayout->addWidget(new QLabel("İsim:"));
    m_nameLineEdit = new QLineEdit();
    m_nameLineEdit->setPlaceholderText("Nokta ismi");
    m_nameLineEdit->setText("Test Noktası");
    nameLayout->addWidget(m_nameLineEdit);
    coordLayout->addLayout(nameLayout);
    
    coordGroup->setLayout(coordLayout);
    leftLayout->addWidget(coordGroup);
    
    // Aksiyon butonları grubu
    QGroupBox* actionGroup = new QGroupBox("Harita Komutları");
    QVBoxLayout* actionLayout = new QVBoxLayout();
    
    m_addPointBtn = new QPushButton("📍 Nokta Ekle (map.feature.plot)");
    connect(m_addPointBtn, &QPushButton::clicked, this, &MainWindow::onAddPointClicked);
    actionLayout->addWidget(m_addPointBtn);
    
    m_flyToBtn = new QPushButton("✈️ Konuma Git (map.view.center.location)");
    connect(m_flyToBtn, &QPushButton::clicked, this, &MainWindow::onFlyToClicked);
    actionLayout->addWidget(m_flyToBtn);
    
    actionGroup->setLayout(actionLayout);
    leftLayout->addWidget(actionGroup);
    
    // Durum göstergesi
    QGroupBox* statusGroup = new QGroupBox("Durum");
    QVBoxLayout* statusLayout = new QVBoxLayout();
    m_statusLabel = new QLabel("Hazır");
    m_statusLabel->setWordWrap(true);
    m_statusLabel->setStyleSheet("QLabel { padding: 10px; background-color: #e8f5e9; border-radius: 5px; }");
    statusLayout->addWidget(m_statusLabel);
    statusGroup->setLayout(statusLayout);
    leftLayout->addWidget(statusGroup);
    
    // Log alanı
    QGroupBox* logGroup = new QGroupBox("CMAPI Mesajları");
    QVBoxLayout* logLayout = new QVBoxLayout();
    m_logTextEdit = new QTextEdit();
    m_logTextEdit->setReadOnly(true);
    m_logTextEdit->setMaximumHeight(200);
    m_logTextEdit->setStyleSheet("QTextEdit { font-family: 'Courier New'; font-size: 10pt; }");
    logLayout->addWidget(m_logTextEdit);
    logGroup->setLayout(logLayout);
    leftLayout->addWidget(logGroup);
    
    leftLayout->addStretch();
    
    // Sağ panel - Harita (WebEngineView)
    m_webView = new QWebEngineView();
    
    // Layout'a ekle
    mainLayout->addWidget(leftPanel);
    mainLayout->addWidget(m_webView, 1); // stretch factor 1 = genişleyebilir
    
    setCentralWidget(centralWidget);
    
    logMessage("UI hazırlandı");
}

void MainWindow::setupWebEngine() {
    // Bridge oluştur
    m_bridge = new MapBridge(this);
    
    // WebChannel kur
    m_channel = new QWebChannel(m_webView->page());
    m_channel->registerObject("qtBridge", m_bridge);
    m_webView->page()->setWebChannel(m_channel);
    
    // Bridge sinyallerini bağla
    connect(m_bridge, &MapBridge::mapClicked, this, &MainWindow::onMapClicked);
    connect(m_bridge, &MapBridge::viewChanged, this, &MainWindow::onViewChanged);
    connect(m_bridge, &MapBridge::featurePlotted, this, &MainWindow::onFeaturePlotted);
    
    // Sayfa yükleme durumunu dinle
    connect(m_webView, &QWebEngineView::loadFinished, this, &MainWindow::onWebPageLoadFinished);
    
    // Harita URL'ini yükle (Vite dev server)
    QString mapUrl = "http://localhost:5173";
    m_webView->load(QUrl(mapUrl));
    
    logMessage("WebChannel kuruldu, harita yükleniyor: " + mapUrl);
}

void MainWindow::onAddPointClicked() {
    double lat = m_latSpinBox->value();
    double lon = m_lonSpinBox->value();
    QString name = m_nameLineEdit->text();
    
    if (name.isEmpty()) {
        name = "İsimsiz Nokta";
    }
    
    // CMAPI map.feature.plot mesajı oluştur (GeoJSON Point)
    QJsonObject feature;
    feature["type"] = "Feature";
    
    QJsonObject geometry;
    geometry["type"] = "Point";
    QJsonArray coordinates;
    coordinates.append(lon);
    coordinates.append(lat);
    coordinates.append(0.0);
    geometry["coordinates"] = coordinates;
    feature["geometry"] = geometry;
    
    QJsonObject payload;
    payload["featureId"] = QString("qt-point-%1").arg(QDateTime::currentMSecsSinceEpoch());
    payload["name"] = name;
    payload["format"] = "geojson";
    payload["feature"] = feature;
    payload["zoom"] = true;
    
    logMessage(QString("→ Qt: map.feature.plot (%1, %2) '%3'").arg(lat).arg(lon).arg(name));
    
    emit m_bridge->sendMapMessage("map.feature.plot", payload);
    
    m_statusLabel->setText(QString("✓ Nokta eklendi: %1 (%2, %3)").arg(name).arg(lat, 0, 'f', 4).arg(lon, 0, 'f', 4));
}

void MainWindow::onFlyToClicked() {
    double lat = m_latSpinBox->value();
    double lon = m_lonSpinBox->value();
    
    // CMAPI map.view.center.location mesajı
    QJsonObject location;
    location["lat"] = lat;
    location["lon"] = lon;
    
    QJsonObject payload;
    payload["location"] = location;
    payload["zoom"] = 10000.0;
    
    logMessage(QString("→ Qt: map.view.center.location (%1, %2)").arg(lat).arg(lon));
    
    emit m_bridge->sendMapMessage("map.view.center.location", payload);
    
    m_statusLabel->setText(QString("✈️ Konuma gidiliyor: (%1, %2)").arg(lat, 0, 'f', 4).arg(lon, 0, 'f', 4));
}

void MainWindow::onMapClicked(double lat, double lon) {
    logMessage(QString("← Harita: map.view.clicked (%1, %2)").arg(lat).arg(lon));
    
    // Form alanlarını güncelle
    m_latSpinBox->setValue(lat);
    m_lonSpinBox->setValue(lon);
    
    m_statusLabel->setText(QString("🖱️ Harita tıklandı: (%1, %2)").arg(lat, 0, 'f', 4).arg(lon, 0, 'f', 4));
}

void MainWindow::onViewChanged(const QString& boundsJson) {
    // Sadece log
    logMessage("← Harita: map.status.view (kamera değişti)");
}

void MainWindow::onFeaturePlotted(const QString& featureId) {
    logMessage(QString("← Harita: Feature plotted - %1").arg(featureId));
}

void MainWindow::onWebPageLoadFinished(bool ok) {
    if (ok) {
        logMessage("✓ Harita yüklendi, CMAPI bağlantısı hazır");
        m_statusLabel->setText("✓ Harita hazır - CMAPI aktif");
        m_statusLabel->setStyleSheet("QLabel { padding: 10px; background-color: #00ff15ff; border-radius: 5px; }");
    } else {
        logMessage("✗ Harita yüklenemedi! Vite dev server çalışıyor mu?");
        m_statusLabel->setText("✗ Harita yüklenemedi");
        m_statusLabel->setStyleSheet("QLabel { padding: 10px; background-color: #ff0026ff; border-radius: 5px; }");
        
        QMessageBox::warning(this, "Yükleme Hatası", 
            "Harita yüklenemedi!\n\n"
            "Vite dev server'ın çalıştığından emin olun:\n"
            "  cd /Users/mustafamurat/Documents/map\n"
            "  npm run dev");
    }
}

void MainWindow::logMessage(const QString& message) {
    QString timestamp = QDateTime::currentDateTime().toString("hh:mm:ss");
    m_logTextEdit->append(QString("[%1] %2").arg(timestamp).arg(message));
}
