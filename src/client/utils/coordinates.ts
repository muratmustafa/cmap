import { Cartesian2, Cartographic, Ellipsoid, Viewer } from 'cesium';

/**
 * Ekran koordinatlarını coğrafi koordinatlara (Cartographic) çevirir
 */
export function screenToCartographic(viewer: Viewer, pos: Cartesian2): Cartographic | null {
  const cart = viewer.camera.pickEllipsoid(pos, Ellipsoid.WGS84);
  if (cart) return Cartographic.fromCartesian(cart);

  const ray = viewer.camera.getPickRay(pos);
  if (ray) {
    const picked = viewer.scene.globe?.pick(ray, viewer.scene);
    if (picked) return Cartographic.fromCartesian(picked);
  }
  return null;
}
