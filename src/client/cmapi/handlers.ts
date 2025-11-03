import { Viewer, ScreenSpaceEventHandler, ScreenSpaceEventType, Math as CesiumMath } from 'cesium';
import { screenToCartographic } from '../utils/coordinates';

/**
 * CMAPI event handler'larını yapılandırır (click, double-click)
 */
export function setupCmapiHandlers(viewer: Viewer, cmajs: any): void {
  // Tek tıklama handler
  const clickHandler = new ScreenSpaceEventHandler(viewer.canvas);
  clickHandler.setInputAction((movement: any) => {
    const carto = screenToCartographic(viewer, movement.position);
    if (!carto) return;

    const lat = CesiumMath.toDegrees(carto.latitude);
    const lon = CesiumMath.toDegrees(carto.longitude);

    cmajs.publish({
      channel: 'map.view.clicked',
      payload: {
        lat,
        lon,
        button: 'left',
        type: 'single',
        keys: ['none']
      }
    });

    console.log('[CMAPI] Published map.view.clicked:', { lat, lon });
  }, ScreenSpaceEventType.LEFT_CLICK);

  // Çift tıklama handler
  const doubleClickHandler = new ScreenSpaceEventHandler(viewer.canvas);
  doubleClickHandler.setInputAction((movement: any) => {
    const carto = screenToCartographic(viewer, movement.position);
    if (!carto) return;

    const lat = CesiumMath.toDegrees(carto.latitude);
    const lon = CesiumMath.toDegrees(carto.longitude);

    cmajs.publish({
      channel: 'map.view.clicked',
      payload: {
        lat,
        lon,
        button: 'left',
        type: 'double',
        keys: ['none']
      }
    });

    console.log('[CMAPI] Published map.view.clicked (double):', { lat, lon });
  }, ScreenSpaceEventType.LEFT_DOUBLE_CLICK);
}

/**
 * Kamera değişikliklerini CMAPI üzerinden yayınlar (debounced)
 */
export function setupViewChangePublisher(viewer: Viewer, cmajs: any, debounceMs: number = 500): void {
  let viewUpdateTimeout: NodeJS.Timeout | null = null;

  viewer.camera.changed.addEventListener(() => {
    if (viewUpdateTimeout) clearTimeout(viewUpdateTimeout);

    viewUpdateTimeout = setTimeout(() => {
      const rect = viewer.camera.computeViewRectangle();
      if (!rect) return;

      const centerLon = (rect.west + rect.east) / 2;
      const centerLat = (rect.south + rect.north) / 2;

      cmajs.publish({
        channel: 'map.status.view',
        payload: {
          bounds: {
            southWest: {
              lat: CesiumMath.toDegrees(rect.south),
              lon: CesiumMath.toDegrees(rect.west)
            },
            northEast: {
              lat: CesiumMath.toDegrees(rect.north),
              lon: CesiumMath.toDegrees(rect.east)
            }
          },
          center: {
            lat: CesiumMath.toDegrees(centerLat),
            lon: CesiumMath.toDegrees(centerLon)
          },
          range: viewer.camera.positionCartographic.height
        }
      });
    }, debounceMs);
  });
}
