#include "MapBridge.h"

MapBridge::MapBridge(QObject* parent) : QObject(parent) {
    qDebug() << "[MapBridge] Created";
}

void MapBridge::receiveMapMessage(const QString& channel, const QJsonObject& payload) {
    qDebug() << "[MapBridge] Received:" << channel;
       
    // map.view.clicked - Harita tıklamaları
    if (channel == "map.view.clicked") {
        double lat = payload["lat"].toDouble();
        double lon = payload["lon"].toDouble();
        qDebug() << "  -> Map clicked at:" << lat << "," << lon;
        emit mapClicked(lat, lon);
    }
    // map.status.view - Kamera değişiklikleri
    else if (channel == "map.status.view") {
        // UI log için stringe çevir
        const QString json = QString::fromUtf8(QJsonDocument(payload).toJson(QJsonDocument::Compact));
        emit viewChanged(json);
    }
    // map.message.complete - İşlem tamamlandı (feature plot sonrası)
    else if (channel == "map.message.complete") {
        QString status = payload["status"].toString();
        qDebug() << "  -> Operation completed with status:" << status;
        
        QJsonObject details = payload["details"].toObject();
        if (details.contains("featureId")) {
            QString featureId = details["featureId"].toString();
            emit featurePlotted(featureId);
        }
    }
}
