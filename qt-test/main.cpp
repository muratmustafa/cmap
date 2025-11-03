#include "MainWindow.h"
#include <QApplication>
#include <QWebEngineSettings>

int main(int argc, char *argv[]) {
    // WebEngine remote debugging'i aktif et (port 9222)
    qputenv("QTWEBENGINE_REMOTE_DEBUGGING", "2626");
    
    QApplication app(argc, argv);
    
    // Uygulama bilgileri
    app.setApplicationName("Cesium CMAPI Test");
    app.setApplicationVersion("1.0");
    app.setOrganizationName("MapTest");
    
    // Ana pencereyi oluştur ve göster
    MainWindow window;
    window.show();
    
    return app.exec();
}
