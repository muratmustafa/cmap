import { Viewer, SceneMode, MapMode2D, WebMercatorProjection, Cartesian3, OpenStreetMapImageryProvider, Terrain } from 'cesium';
import CesiumNavigation from 'cesium-navigation-es6';

export function createViewer(containerId: string): Viewer {
  const viewer = new Viewer(containerId, {
    terrain: Terrain.fromWorldTerrain(),
    animation: false,
    baseLayerPicker: false,
    fullscreenButton: false,
    geocoder: false,
    homeButton: false,
    infoBox: false,
    sceneModePicker: true,
    selectionIndicator: false,
    timeline: false,
    navigationHelpButton: false,
    sceneMode: SceneMode.SCENE3D,
    mapProjection: new WebMercatorProjection(),
    mapMode2D: MapMode2D.ROTATE
  });

  // OpenStreetMap imagery provider
  viewer.imageryLayers.removeAll();
  viewer.imageryLayers.addImageryProvider(new OpenStreetMapImageryProvider({
    url: 'https://tile.openstreetmap.org/'
  }));

  // 2D rotasyonu aktif et
  viewer.scene.screenSpaceCameraController.enableRotate = true;

  // Navigation widget
  new CesiumNavigation(viewer, {
    enableCompass: true,
    enableZoomControls: true,
    enableDistanceLegend: true,
    enableCompassOuterRing: true
  });
   
  // Credit container'ı kaldır
  viewer.cesiumWidget.creditContainer.remove();

  // Başlangıç konumu (Türkiye)
  viewer.camera.flyTo({
    destination: Cartesian3.fromDegrees(35.2433, 38.9637, 1500000),
    orientation: {
      heading: 0.0,
      pitch: -1.5,
      roll: 0.0
    }
  });

  return viewer;
}
