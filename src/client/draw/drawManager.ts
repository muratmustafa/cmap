import { Viewer, ScreenSpaceEventHandler, ScreenSpaceEventType, Cartesian2, Cartesian3, Color, Entity, PolylineGraphics, PolygonHierarchy, CallbackProperty, Cartographic, Rectangle, EllipsoidGeodesic, ConstantPositionProperty } from 'cesium';
import { screenToCartographic } from '../utils/coordinates';

export type DrawMode = 'polyline' | 'polygon' | 'rectangle' | 'circle';

export interface DrawStyle {
  strokeColor?: Color;
  fillColor?: Color;
  strokeWidth?: number;
}

export interface SnapOptions {
  enabled?: boolean;
  pixelTolerance?: number;
  toVertices?: boolean;
  toFirstVertex?: boolean;
}

export interface DrawOptions {
  snap?: SnapOptions;
  autoClosePolygon?: boolean;
  extrudedHeight?: number;
}

export class DrawManager {
  private viewer: Viewer;
  private handler: ScreenSpaceEventHandler | null = null;
  private activeEntity: Entity | null = null;
  private activeMode: DrawMode | null = null;
  private positions: Cartesian3[] = [];
  private cleanupFns: Array<() => void> = [];

  private defaultOptions: DrawOptions = {
    snap: { enabled: true, pixelTolerance: 20, toVertices: true, toFirstVertex: true },
    autoClosePolygon: true
  };

  constructor(viewer: Viewer) {
    this.viewer = viewer;
  }

  setOptions(options: DrawOptions) {
    // shallow merge
    this.defaultOptions = {
      ...this.defaultOptions,
      ...options,
      snap: { ...this.defaultOptions.snap, ...options.snap }
    };
  }



  cancel() {
    if (this.activeEntity) {
      this.viewer.entities.remove(this.activeEntity);
    }
    this.teardown();
  }

  async drawPolyline(style: DrawStyle = {}, options?: DrawOptions): Promise<Entity> {
    return this.startDraw('polyline', style, options);
  }

  async drawPolygon(style: DrawStyle = {}, options?: DrawOptions): Promise<Entity> {
    return this.startDraw('polygon', style, options);
  }

  async drawRectangle(style: DrawStyle = {}, options?: DrawOptions): Promise<Entity> {
    return this.startDraw('rectangle', style, options);
  }

  async drawCircle(style: DrawStyle = {}, options?: DrawOptions): Promise<Entity> {
    return this.startDraw('circle', style, options);
  }

  private startDraw(mode: DrawMode, style: DrawStyle, options?: DrawOptions): Promise<Entity> {
    if (this.activeMode) {
      // if already drawing, cancel previous
      this.teardown();
    }

  this.activeMode = mode;
  // Create a fresh positions array per draw session and close over it
  const draftPositions: Cartesian3[] = [];
  // positionsRef is what all CallbackProperty closures read; we can swap it atomically at finish
  let positionsRef: Cartesian3[] = draftPositions;
  this.positions = draftPositions;

  const opts: DrawOptions = {
      ...this.defaultOptions,
      ...options,
      snap: { ...this.defaultOptions.snap, ...options?.snap }
    };

    const strokeColor = style.strokeColor ?? Color.CYAN.withAlpha(0.9);
    const fillColor = style.fillColor ?? Color.CYAN.withAlpha(0.1);
    const strokeWidth = style.strokeWidth ?? 4;
    // Outline için koyu, tam opak renk
    const outlineColor = Color.fromBytes(0, 139, 139, 255);

    // Create dynamic entity depending on mode
    switch (mode) {
      case 'polyline':
        this.activeEntity = this.viewer.entities.add({
          polyline: new PolylineGraphics({
            material: strokeColor,
            width: strokeWidth,
            positions: new CallbackProperty(() => positionsRef, false)
          })
        });
        break;
      case 'polygon':
        this.activeEntity = this.viewer.entities.add({
          polygon: {
            hierarchy: new CallbackProperty(() => new PolygonHierarchy(positionsRef), false),
            material: fillColor,
            outline: true,
            outlineColor: outlineColor,
            height: 0, // Outline'ların görünmesi için terrain clamping'i devre dışı bırak
            extrudedHeight: opts?.extrudedHeight
          }
        });
        break;
      case 'rectangle':
        this.activeEntity = this.viewer.entities.add({
          rectangle: {
            coordinates: new CallbackProperty(() => this.rectangleFromPositions(positionsRef), false),
            material: fillColor,
            outline: true,
            outlineColor: outlineColor,
            height: 0, // Outline'ların görünmesi için terrain clamping'i devre dışı bırak
            extrudedHeight: opts?.extrudedHeight
          }
        });
        break;
      case 'circle':
        this.activeEntity = this.viewer.entities.add({
          ellipse: {
            semiMajorAxis: new CallbackProperty(() => this.computeCircleRadiusMeters(positionsRef), false),
            semiMinorAxis: new CallbackProperty(() => this.computeCircleRadiusMeters(positionsRef), false),
            material: fillColor,
            outline: true,
            granularity: Math.PI / 180, // 1° açı = performanslı ve pürüzsüz
            outlineColor: outlineColor,
            height: 0, // Outline'ların görünmesi için terrain clamping'i devre dışı bırak
            extrudedHeight: opts?.extrudedHeight
          }
        });
        break;
    }

    

    // Prepare promise to resolve when completed
    return new Promise<Entity>((resolve, reject) => {
      // Finish handler (completes drawing and freezes geometry)
      const finish = () => {
        // Validate minimum points
        if (mode === 'polyline' && draftPositions.length < 2) return;
        if (mode === 'polygon' && draftPositions.length < 3) return;
        if ((mode === 'rectangle' || mode === 'circle') && draftPositions.length < 2) return;

        // Build final immutable coordinates and atomically swap data provider
        const finalPositions = (mode === 'polyline' || mode === 'polygon')
          ? draftPositions.slice(0, -1)
          : draftPositions.slice();

        positionsRef = finalPositions; // callbacks now return static array

        const entity = this.activeEntity!;
        this.teardown();
        resolve(entity);
      };

      this.handler = new ScreenSpaceEventHandler(this.viewer.canvas);

      // Left click: add anchor (with optional snapping and polygon auto-close)
      this.handler.setInputAction((movement: any) => {
        const screenPos = movement.position as Cartesian2;
        const carto = screenToCartographic(this.viewer, screenPos);
        if (!carto) return;
        let pos = Cartesian3.fromRadians(carto.longitude, carto.latitude, carto.height ?? 0);

        // Snapping (sadece polygon için): snap to closest existing vertex within tolerance
        if (mode === 'polygon' && opts.snap?.enabled) {
          const anchors = draftPositions.slice(0, Math.max(0, draftPositions.length - 1));
          const snapped = this.trySnapToVertices(screenPos, anchors, opts.snap);
          if (snapped) pos = snapped;
        }
        if (draftPositions.length === 0) {
          draftPositions.push(pos);
          // For polyline/polygon add a duplicate for dynamic update
          if (mode === 'polyline' || mode === 'polygon') {
            draftPositions.push(pos.clone());
          }
          if (mode === 'rectangle' || mode === 'circle') {
            draftPositions.push(pos.clone()); // second point to be updated by mouse move
          }
          if (mode === 'circle' && this.activeEntity) {
            this.activeEntity.position = new ConstantPositionProperty(pos);
          }
        } else {
          if (mode === 'rectangle' || mode === 'circle') {
            // For rectangle/circle, second left click should complete
            draftPositions[draftPositions.length - 1] = pos; // update trailing point
            finish();
            return;
          } else {
            // Polygon auto-close: if click near first vertex, finalize
            if (mode === 'polygon' && opts.autoClosePolygon && draftPositions.length >= 3) {
              const first = draftPositions[0];
              const firstCanvas = this.viewer.scene.cartesianToCanvasCoordinates(first);
              const dist = firstCanvas ? Cartesian2.distance(firstCanvas, screenPos) : Number.MAX_VALUE;
              if (dist <= (opts.snap?.pixelTolerance ?? 20)) {  // opts'tan kullan
                draftPositions[draftPositions.length - 1] = first; // lock to first vertex
                finish();
                return;
              }
            }
            // For polyline/polygon: lock current dynamic to clicked point, then add new dynamic point
            draftPositions[draftPositions.length - 1] = pos; // lock previous dynamic as anchor
            draftPositions.push(pos.clone()); // new dynamic point follows the mouse
          }
        }
      }, ScreenSpaceEventType.LEFT_CLICK);

      // Mouse move: update last position (with optional snapping)
      this.handler.setInputAction((movement: any) => {
        if (draftPositions.length === 0) return;
        const screenPos = movement.endPosition as Cartesian2;
        const carto = screenToCartographic(this.viewer, screenPos);
        if (!carto) return;
        let pos = Cartesian3.fromRadians(carto.longitude, carto.latitude, carto.height ?? 0);

        if (mode === 'polygon' && opts.snap?.enabled) {
          const anchors = draftPositions.slice(0, Math.max(0, draftPositions.length - 1));
          const snapped = this.trySnapToVertices(screenPos, anchors, opts.snap);
          if (snapped) pos = snapped;
        }
        // Update the last point for dynamic drafting
        draftPositions[draftPositions.length - 1] = pos;
        if (this.activeMode === 'circle' && this.activeEntity && draftPositions[0]) {
          this.activeEntity.position = new ConstantPositionProperty(draftPositions[0]);
        }
      }, ScreenSpaceEventType.MOUSE_MOVE);

      // Right click: finalize at current cursor position
      this.handler.setInputAction((movement: any) => {
        // Update trailing point to current click position
        if (draftPositions.length > 0) {
          const carto = screenToCartographic(this.viewer, movement.position as Cartesian2);
          if (carto) {
            const pos = Cartesian3.fromRadians(carto.longitude, carto.latitude, carto.height ?? 0);
            draftPositions[draftPositions.length - 1] = pos;
            // For polyline/polygon ensure last selected point is preserved after finish()
            if (this.activeMode === 'polyline' || this.activeMode === 'polygon') {
              draftPositions.push(pos.clone());
            }
          }
        }
        finish();
      }, ScreenSpaceEventType.RIGHT_CLICK);

      // Double click: finalize at current cursor position
      this.handler.setInputAction((movement: any) => {
        if (draftPositions.length > 0) {
          const carto = screenToCartographic(this.viewer, movement.position as Cartesian2);
          if (carto) {
            const pos = Cartesian3.fromRadians(carto.longitude, carto.latitude, carto.height ?? 0);
            draftPositions[draftPositions.length - 1] = pos;
            if (this.activeMode === 'polyline' || this.activeMode === 'polygon') {
              draftPositions.push(pos.clone());
            }
          }
        }
        finish();
      }, ScreenSpaceEventType.LEFT_DOUBLE_CLICK);

      // Cancel on ESC
      const keydown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          this.viewer.entities.remove(this.activeEntity!);
          this.teardown();
          reject(new Error('Draw cancelled'));
        }
      };
      window.addEventListener('keydown', keydown);
      this.cleanupFns.push(() => window.removeEventListener('keydown', keydown));
    });
  }

  private rectangleFromPositions(positions: Cartesian3[] = this.positions): Rectangle | undefined {
    if (positions.length < 2) return undefined;
    const c1 = Cartographic.fromCartesian(positions[0]);
    const c2 = Cartographic.fromCartesian(positions[positions.length - 1]);
    const west = Math.min(c1.longitude, c2.longitude);
    const south = Math.min(c1.latitude, c2.latitude);
    const east = Math.max(c1.longitude, c2.longitude);
    const north = Math.max(c1.latitude, c2.latitude);
    return Rectangle.fromRadians(west, south, east, north);
  }

  private computeCircleRadiusMeters(positions: Cartesian3[] = this.positions): number | undefined {
    if (positions.length < 2) return undefined;
    const c1 = Cartographic.fromCartesian(positions[0]);
    const c2 = Cartographic.fromCartesian(positions[positions.length - 1]);
    const geod = new EllipsoidGeodesic(c1, c2);
    const meters = geod.surfaceDistance;
    return Math.max(1, meters);
  }

  // Try snap to nearest existing vertex within pixel tolerance; returns snapped Cartesian or null
  private trySnapToVertices(screenPos: Cartesian2, anchors: Cartesian3[], snap?: SnapOptions): Cartesian3 | null {
    if (!snap?.enabled || !anchors.length) return null;
    const tol = snap.pixelTolerance ?? 10;
    let bestDist = Number.MAX_VALUE;
    let best: Cartesian3 | null = null;
    for (const a of anchors) {
      const canvas = this.viewer.scene.cartesianToCanvasCoordinates(a);
      if (!canvas) continue;
      const d = Cartesian2.distance(canvas, screenPos);
      if (d <= tol && d < bestDist) {
        bestDist = d;
        best = a;
      }
    }
    return best;
  }

  private teardown() {
    if (this.handler) {
      this.handler.destroy();
      this.handler = null;
    }
    this.cleanupFns.forEach(fn => fn());
    this.cleanupFns = [];
    this.activeMode = null;
    this.activeEntity = null;
    this.positions = [];
  }
}
