import { Viewer } from 'cesium';
import 'cesium/Build/Cesium/Widgets/widgets.css';
import '@esri/calcite-components/dist/calcite/calcite.css';
import { defineCustomElements as defineCalcite } from '@esri/calcite-components/dist/loader';
import { createViewer } from './viewer/viewerConfig';
import { setupCmapiHandlers, setupViewChangePublisher } from './cmapi/handlers';
import { setupCmapiSubscribers } from './cmapi/subscribers';
import { DrawManager } from './draw/drawManager';

declare global {
  interface Window {
    cesiumView: Viewer;
    cmajs?: any;
  }
}

defineCalcite(window);

const viewer = createViewer('cesiumContainer');
window.cesiumView = viewer;

const draw = new DrawManager(viewer);

document.getElementById('draw-line')?.addEventListener('click', async () => {
  try { await draw.drawPolyline(); } catch {}
});
document.getElementById('draw-polygon')?.addEventListener('click', async () => {
  try { await draw.drawPolygon(); } catch {}
});
document.getElementById('draw-rectangle')?.addEventListener('click', async () => {
  try { await draw.drawRectangle(); } catch {}
});
document.getElementById('draw-circle')?.addEventListener('click', async () => {
  try { await draw.drawCircle(); } catch {}
});
document.getElementById('draw-cancel')?.addEventListener('click', () => draw.cancel());

const snapSwitch = document.getElementById('snap-switch') as any;
if (snapSwitch) {
  snapSwitch.checked = true;
  snapSwitch.addEventListener('calciteSwitchChange', (e: any) => {
    const enabled = (e.target as any).checked;
    draw.setOptions({ snap: { enabled } });
  });
}

const autoCloseSwitch = document.getElementById('autoclose-switch') as any;
if (autoCloseSwitch) {
  autoCloseSwitch.checked = true;
  autoCloseSwitch.addEventListener('calciteSwitchChange', (e: any) => {
    const enabled = (e.target as any).checked;
    draw.setOptions({ autoClosePolygon: enabled });
  });
}

const extrudeSlider = document.getElementById('extrude-slider') as any;
if (extrudeSlider) {
  extrudeSlider.addEventListener('calciteSliderChange', (e: any) => {
    const val = Number((e.target as any).value ?? 0);
    draw.setOptions({ extrudedHeight: val > 0 ? val : undefined });
  });
}

if (window.cmajs) {
  console.log('[CMAPI] Initialized with Qt and Browser runtimes');

  setupCmapiHandlers(viewer, window.cmajs);

  setupCmapiSubscribers(viewer, window.cmajs);

  setupViewChangePublisher(viewer, window.cmajs, 500);

  console.log('[CMAPI] Map is ready. Listening for commands...');
} else {
  console.warn('[CMAPI] cmajs not loaded. CMAPI integration disabled.');
}