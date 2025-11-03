import { Viewer, Cartesian3, Cartesian2, Color, LabelStyle, VerticalOrigin, HorizontalOrigin, NearFarScalar, DistanceDisplayCondition, CallbackProperty } from 'cesium';
import ms from 'milsymbol';

/**
 * CMAPI subscriber'larını yapılandırır
 */
export function setupCmapiSubscribers(viewer: Viewer, cmajs: any): void {
  // map.view.center.location - Kameraya konuma git
  cmajs.subscribe({
    channel: cmajs.channels.MAP_VIEW_CENTER_LOCATION,
    callback: (sender: any, message: any) => {
      console.log('[CMAPI] Received map.view.center.location:', message);

      const lat = message.location.lat;
      const lon = message.location.lon;

      viewer.camera.flyTo({
        destination: Cartesian3.fromDegrees(lon, lat, 10000)
      });
    }
  });

  // map.feature.plot - Haritaya feature ekle
  cmajs.subscribe({
    channel: cmajs.channels.MAP_FEATURE_PLOT,
    callback: (sender: any, message: any) => {
      console.log('[CMAPI] Received map.feature.plot:', message);

      if (message.format === 'geojson' && message.feature?.geometry?.type === 'Point') {
        const [lon, lat, height = 0] = message.feature.geometry.coordinates;

        // Milsymbol oluştur
        const symbol = new ms.Symbol("130315003611010300000000000000", {
          size: 35,
          direction: 90
        }).asCanvas();

        const entity = viewer.entities.add({
          id: message.featureId || `point-${Date.now()}`,
          position: Cartesian3.fromDegrees(lon, lat, height),
          name: message.name,
          label: {
            text: message.name,
            font: '16px sans-serif',
            fillColor: Color.WHITE,
            outlineColor: Color.BLACK,
            outlineWidth: 2,
            style: LabelStyle.FILL_AND_OUTLINE,
            verticalOrigin: VerticalOrigin.BASELINE,
            pixelOffset: new Cartesian2(0, 75),
            translucencyByDistance: new NearFarScalar(1000, 1.0, 10000000, 0),
            pixelOffsetScaleByDistance: new NearFarScalar(1000, 1.0, 10000000, 0),
            distanceDisplayCondition: new DistanceDisplayCondition(0, 500000)
          },
          billboard: {
            image: symbol,
            rotation: new CallbackProperty(() => viewer.camera.heading, false),
            verticalOrigin: VerticalOrigin.CENTER,
            horizontalOrigin: HorizontalOrigin.CENTER,
            scaleByDistance: new NearFarScalar(100000, 1.0, 100000000, 0.1),
            translucencyByDistance: new NearFarScalar(1000, 1.0, 10000000, 0)
          }
        });

        // Zoom istenmişse konuma git
        if (message.zoom) {
          viewer.camera.flyTo({
            destination: Cartesian3.fromDegrees(lon, lat, 10000)
          });
        }
      }
    }
  });
}
