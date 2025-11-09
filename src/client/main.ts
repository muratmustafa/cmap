import { Viewer } from 'cesium';
import 'cesium/Build/Cesium/Widgets/widgets.css';
import '@esri/calcite-components/dist/calcite/calcite.css';
import { defineCustomElements as defineCalcite } from '@esri/calcite-components/dist/loader';
import { createViewer } from './viewer/viewerConfig';
import { setupCmapiHandlers, setupViewChangePublisher } from './cmapi/handlers';
import { setupCmapiSubscribers } from './cmapi/subscribers';
import { EntityManager } from './entity/entityManager';

declare global {
  interface Window {
    cesiumView: Viewer;
    cmajs?: any;
  }
}

defineCalcite(window);

const viewer = createViewer('cesiumContainer');
window.cesiumView = viewer;

// Initialize EntityManager - coordinates all drawing and selection operations
const entityManager = new EntityManager(viewer);

// Selection mode activations
const rectangleSelect = document.getElementById('rectangle-select') as any;
const lassoSelect = document.getElementById('lasso-select') as any;
const pointerSelect = document.getElementById('pointer-select') as any;

// Update button states based on selection mode
const updateSelectionButtons = (mode: 'pointer' | 'rectangle' | 'lasso' | null) => {
  if (pointerSelect) pointerSelect.active = mode === 'pointer';
  if (rectangleSelect) rectangleSelect.active = mode === 'rectangle';
  if (lassoSelect) lassoSelect.active = mode === 'lasso';
};

// Listen to selection mode changes
entityManager.onSelectionModeChanged((mode) => {
  updateSelectionButtons(mode);
});

pointerSelect?.addEventListener('click', () => {
  entityManager.enableSelect('pointer');
});

rectangleSelect?.addEventListener('click', () => {
  entityManager.enableSelect('rectangle');
});

lassoSelect?.addEventListener('click', () => {
  entityManager.enableSelect('lasso');
});

// Drawing operations
document.getElementById('draw-point')?.addEventListener('click', async () => {
  try { await entityManager.drawPoint(); } catch {}
});
document.getElementById('draw-line')?.addEventListener('click', async () => {
  try { await entityManager.drawPolyline(); } catch {}
});
document.getElementById('draw-polygon')?.addEventListener('click', async () => {
  try { await entityManager.drawPolygon(); } catch {}
});
document.getElementById('draw-rectangle')?.addEventListener('click', async () => {
  try { await entityManager.drawRectangle(); } catch {}
});
document.getElementById('draw-circle')?.addEventListener('click', async () => {
  try { await entityManager.drawCircle(); } catch {}
});
document.getElementById('draw-cancel')?.addEventListener('click', () => { 
  entityManager.cancelDraw(); 
});

const snapSwitch = document.getElementById('snap-switch') as any;
if (snapSwitch) {
  snapSwitch.checked = true;
  snapSwitch.addEventListener('calciteSwitchChange', (e: any) => {
    const enabled = (e.target as any).checked;
    entityManager.setDrawOptions({ snap: { enabled } });
  });
}

const autoCloseSwitch = document.getElementById('autoclose-switch') as any;
if (autoCloseSwitch) {
  autoCloseSwitch.checked = true;
  autoCloseSwitch.addEventListener('calciteSwitchChange', (e: any) => {
    const enabled = (e.target as any).checked;
    entityManager.setDrawOptions({ autoClosePolygon: enabled });
  });
}

const extrudeSlider = document.getElementById('extrude-slider') as any;
if (extrudeSlider) {
  extrudeSlider.addEventListener('calciteSliderChange', (e: any) => {
    const val = Number((e.target as any).value ?? 0);
    entityManager.setDrawOptions({ extrudedHeight: val > 0 ? val : undefined });
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