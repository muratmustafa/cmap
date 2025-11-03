#ifndef MAINWINDOW_H
#define MAINWINDOW_H

#include <QMainWindow>
#include <QWebEngineView>
#include <QWebChannel>
#include <QPushButton>
#include <QLineEdit>
#include <QDoubleSpinBox>
#include <QLabel>
#include <QVBoxLayout>
#include <QHBoxLayout>
#include <QGroupBox>
#include <QTextEdit>
#include "MapBridge.h"

class MainWindow : public QMainWindow {
    Q_OBJECT
    
public:
    MainWindow(QWidget *parent = nullptr);
    ~MainWindow();
    
private slots:
    void onAddPointClicked();
    void onFlyToClicked();
    void onMapClicked(double lat, double lon);
    void onViewChanged(const QString& boundsJson);
    void onFeaturePlotted(const QString& featureId);
    void onWebPageLoadFinished(bool ok);
    
private:
    void setupUI();
    void setupWebEngine();
    void logMessage(const QString& message);
    
    QWebEngineView* m_webView;
    QWebChannel* m_channel;
    MapBridge* m_bridge;
    
    // UI Controls
    QDoubleSpinBox* m_latSpinBox;
    QDoubleSpinBox* m_lonSpinBox;
    QLineEdit* m_nameLineEdit;
    QLabel* m_statusLabel;
    QTextEdit* m_logTextEdit;
    QPushButton* m_addPointBtn;
    QPushButton* m_flyToBtn;
};

#endif // MAINWINDOW_H
