#ifndef MAPBRIDGE_H
#define MAPBRIDGE_H

#include <QObject>
#include <QString>
#include <QDebug>
#include <QJsonDocument>
#include <QJsonObject>

/**
 * MapBridge - CMAPI mesajları için Qt WebChannel köprüsü
 * 
 * Bu sınıf harita (JS) ile Qt C++ arasında CMAPI mesajlarını iletir.
 * 
 * JS → Qt: receiveMapMessage slot'u çağrılır
 * Qt → JS: sendMapMessage sinyali emit edilir
 */
class MapBridge : public QObject {
    Q_OBJECT
    
public:
    explicit MapBridge(QObject* parent = nullptr);
    
public slots:
    /**
     * JS'den gelen CMAPI mesajlarını al (harita → Qt)
     * 
     * @param channel CMAPI kanal adı (ör: "map.view.clicked")
     * @param payload JSON string olarak mesaj içeriği
     */
    void receiveMapMessage(const QString& channel, const QJsonObject& payload);
    
signals:
    /**
     * Qt'den JS'e CMAPI mesajı gönder (Qt → harita)
     * 
     * @param channel CMAPI kanal adı
     * @param payload JSON string olarak mesaj içeriği
     */
    void sendMapMessage(const QString& channel, const QJsonObject& payload);
    
    /**
     * UI için yardımcı sinyaller - parse edilmiş veriler
     */
    void mapClicked(double lat, double lon);
    void viewChanged(const QString& boundsJson);
    void featurePlotted(const QString& featureId);
};

#endif // MAPBRIDGE_H
