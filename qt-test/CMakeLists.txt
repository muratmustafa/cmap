cmake_minimum_required(VERSION 3.16)

project(CesiumMapTest VERSION 1.0 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

set(CMAKE_AUTOMOC ON)
set(CMAKE_AUTORCC ON)
set(CMAKE_AUTOUIC ON)

# Qt6 bileşenlerini bul
find_package(Qt6 REQUIRED COMPONENTS 
    Core 
    Gui 
    Widgets 
    WebEngineWidgets 
    WebChannel
)

# Kaynak dosyalar
set(PROJECT_SOURCES
    main.cpp
    MainWindow.cpp
    MainWindow.h
    MapBridge.cpp
    MapBridge.h
)

# Executable oluştur
add_executable(${PROJECT_NAME} ${PROJECT_SOURCES})

# Qt kütüphanelerini bağla
target_link_libraries(${PROJECT_NAME} PRIVATE
    Qt6::Core
    Qt6::Gui
    Qt6::Widgets
    Qt6::WebEngineWidgets
    Qt6::WebChannel
)

# macOS için bundle ayarları (opsiyonel)
if(APPLE)
    set_target_properties(${PROJECT_NAME} PROPERTIES
        MACOSX_BUNDLE TRUE
    )
endif()
