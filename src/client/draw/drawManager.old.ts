import { Viewer, ScreenSpaceEventHandler, ScreenSpaceEventType, Cartesian2, Cartesian3, Color, Entity, PolylineGraphics, PolygonHierarchy, CallbackProperty, Cartographic, Rectangle, EllipsoidGeodesic, ConstantPositionProperty } from 'cesium';
import { screenToCartographic } from '../utils/coordinates';

export type DrawMode = 'point' | 'polyline' | 'polygon' | 'rectangle' | 'circle';

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
  toEdges?: boolean; // snap to line/polygon/rectangle edges
  toCirclePerimeter?: boolean; // snap to circle circumference
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
  // Completed geometry vertices for global snapping
  private allVertices: Cartesian3[] = [];
  // Completed geometries for edge/perimeter snapping
  private allGeometries: Array<
    | { kind: 'point'; p: Cartesian3 }
    | { kind: 'polyline'; positions: Cartesian3[] }
    | { kind: 'polygon'; positions: Cartesian3[] }
    | { kind: 'rectangle'; corners: Cartesian3[] }
    | { kind: 'circle'; center: Cartesian3; radiusMeters: number }
  > = [];

  private defaultOptions: DrawOptions = {
    snap: { enabled: true, pixelTolerance: 20, toVertices: true, toFirstVertex: true, toEdges: true, toCirclePerimeter: true },
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

  async drawPoint(style: DrawStyle = {}, options?: DrawOptions): Promise<Entity> {
    return this.startDraw('point', style, options);
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

    // Preview point entity shown for all modes (follows cursor before first click)
    const previewPointSize = 8;
    const previewPointColor = Color.YELLOW.withAlpha(0.8);
    const previewPoint = this.viewer.entities.add({
      position: new CallbackProperty(() => draftPositions[draftPositions.length - 1], false) as any,
      point: {
        pixelSize: previewPointSize,
        color: previewPointColor,
        outlineColor: Color.BLACK,
        outlineWidth: 1,
        show: new CallbackProperty(() => {
          // Show preview point at cursor position
          // For point mode: always show during drawing
          // For polyline/polygon: always show (follows cursor at last position)
          // For rectangle/circle: show only when length is 1 (before first click)
          if (mode === 'point') return draftPositions.length > 0;
          if (mode === 'polyline' || mode === 'polygon') return draftPositions.length > 0;
          if (mode === 'rectangle' || mode === 'circle') return draftPositions.length === 1;
          return false;
        }, false) as any
      }
    });

    // Create dynamic entity depending on mode
    switch (mode) {
      case 'point': {
        const pixelSize = (style.strokeWidth ?? 10);
        const pointColor = (style.strokeColor ?? Color.CYAN.withAlpha(1.0));
        const outlineColor = Color.fromBytes(0, 139, 139, 255);
        this.activeEntity = this.viewer.entities.add({
          position: new CallbackProperty(() => positionsRef[positionsRef.length - 1], false) as any,
          point: {
            pixelSize,
            color: pointColor,
            outlineColor,
            outlineWidth: 1
          }
        });
        break;
      }
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
            coordinates: new CallbackProperty(() => {
              if (positionsRef.length < 2) return undefined;
              const c1 = Cartographic.fromCartesian(positionsRef[0]);
              const c2 = Cartographic.fromCartesian(positionsRef[positionsRef.length - 1]);
              const west = Math.min(c1.longitude, c2.longitude);
              const south = Math.min(c1.latitude, c2.latitude);
              const east = Math.max(c1.longitude, c2.longitude);
              const north = Math.max(c1.latitude, c2.latitude);
              return Rectangle.fromRadians(west, south, east, north);
            }, false),
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
            semiMajorAxis: new CallbackProperty(() => {
              if (positionsRef.length < 2) return undefined;
              const c1 = Cartographic.fromCartesian(positionsRef[0]);
              const c2 = Cartographic.fromCartesian(positionsRef[positionsRef.length - 1]);
              const geod = new EllipsoidGeodesic(c1, c2);
              return Math.max(1, geod.surfaceDistance);
            }, false),
            semiMinorAxis: new CallbackProperty(() => {
              if (positionsRef.length < 2) return undefined;
              const c1 = Cartographic.fromCartesian(positionsRef[0]);
              const c2 = Cartographic.fromCartesian(positionsRef[positionsRef.length - 1]);
              const geod = new EllipsoidGeodesic(c1, c2);
              return Math.max(1, geod.surfaceDistance);
            }, false),
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

    // Store preview point reference for cleanup
    const previewPointEntity = previewPoint;

    

    // Prepare promise to resolve when completed
    return new Promise<Entity>((resolve, reject) => {
      // Finish handler (completes drawing and freezes geometry)
      const finish = () => {
        // Validate minimum points
        if (mode === 'point' && draftPositions.length < 1) return;
        if (mode === 'polyline' && draftPositions.length < 2) return;
        if (mode === 'polygon' && draftPositions.length < 3) return;
        if ((mode === 'rectangle' || mode === 'circle') && draftPositions.length < 2) return;

        // Build final immutable coordinates and atomically swap data provider
        const finalPositions = (mode === 'polyline' || mode === 'polygon')
          ? draftPositions.slice(0, -1)
          : draftPositions.slice();

        positionsRef = finalPositions; // callbacks now return static array

        // Record geometry and vertices for global snapping in subsequent drawings
        this.addCompletedGeometry(mode, finalPositions);

        const entity = this.activeEntity!;
        // Remove preview point
        this.viewer.entities.remove(previewPointEntity);
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

        console.log(`[${mode}] LEFT_CLICK - draftPositions.length before:`, draftPositions.length);

        // Snapping: edges/circle perimeter first, then vertices
        if (opts.snap?.enabled) {
          const anchors = (mode === 'polyline' || mode === 'polygon')
            ? draftPositions.slice(0, Math.max(0, draftPositions.length - 1))
            : [];
          const snappedEdge = this.trySnapToBoundaries(screenPos, pos, anchors, opts.snap);
          if (snappedEdge) pos = snappedEdge;
          else {
            const candidates = anchors.concat(this.allVertices);
            const snappedVertex = this.trySnapToVertices(screenPos, candidates, opts.snap);
            if (snappedVertex) pos = snappedVertex;
          }
        }
        if (mode === 'point') {
          // Tek tıkla noktayı yerleştir ve tamamla (önizleme varsa güncelle)
          if (draftPositions.length === 0) {
            draftPositions.push(pos);
          } else {
            draftPositions[draftPositions.length - 1] = pos;
          }
          finish();
          return;
        }
        // First click: add anchor point (length will be 0 or 1 from mouse move)
        if (draftPositions.length <= 1) {
          // Update existing preview position or add first one
          if (draftPositions.length === 1) {
            draftPositions[0] = pos; // Lock the preview position
          } else {
            draftPositions.push(pos);
          }
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
          console.log(`[${mode}] First click - draftPositions.length after:`, draftPositions.length);
        } else {
          if (mode === 'rectangle' || mode === 'circle') {
            // For rectangle/circle, second left click should complete
            draftPositions[draftPositions.length - 1] = pos; // update trailing point
            console.log(`[${mode}] Second click - calling finish(), draftPositions.length:`, draftPositions.length);
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
        const screenPos = movement.endPosition as Cartesian2;
        const carto = screenToCartographic(this.viewer, screenPos);
        if (!carto) return;
        let pos = Cartesian3.fromRadians(carto.longitude, carto.latitude, carto.height ?? 0);

        if (opts.snap?.enabled) {
          const anchors = (mode === 'polyline' || mode === 'polygon')
            ? draftPositions.slice(0, Math.max(0, draftPositions.length - 1))
            : [];
          const snappedEdge = this.trySnapToBoundaries(screenPos, pos, anchors, opts.snap);
          if (snappedEdge) pos = snappedEdge;
          else {
            const candidates = anchors.concat(this.allVertices);
            const snappedVertex = this.trySnapToVertices(screenPos, candidates, opts.snap);
            if (snappedVertex) pos = snappedVertex;
          }
        }
        
        // Always update/add position for preview (even before first click)
        if (draftPositions.length === 0) {
          draftPositions.push(pos);
          console.log(`[${mode}] MOUSE_MOVE - first position added, length:`, draftPositions.length);
        } else {
          draftPositions[draftPositions.length - 1] = pos;
        }
        
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
            if (mode === 'point') {
              draftPositions[draftPositions.length - 1] = pos;
            } else {
              draftPositions[draftPositions.length - 1] = pos;
              // For polyline/polygon ensure last selected point is preserved after finish()
              if (this.activeMode === 'polyline' || this.activeMode === 'polygon') {
                draftPositions.push(pos.clone());
              }
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
            if (mode === 'point') {
              draftPositions[draftPositions.length - 1] = pos;
            } else {
              draftPositions[draftPositions.length - 1] = pos;
              if (this.activeMode === 'polyline' || this.activeMode === 'polygon') {
                draftPositions.push(pos.clone());
              }
            }
          }
        }
        finish();
      }, ScreenSpaceEventType.LEFT_DOUBLE_CLICK);

      // Cancel on ESC
      const keydown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          this.viewer.entities.remove(this.activeEntity!);
          this.viewer.entities.remove(previewPointEntity);
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

  // Try to snap to edges of anchors and completed geometries, and to circle perimeters.
  private trySnapToBoundaries(screenPos: Cartesian2, worldGuess: Cartesian3, anchorVerts: Cartesian3[], snap?: SnapOptions): Cartesian3 | null {
    if (!snap?.enabled) return null;
    const tol = snap.pixelTolerance ?? 10;
    let best: { dist: number; pos: Cartesian3 } | null = null;

    const consider = (canvasA: Cartesian2 | undefined, canvasB: Cartesian2 | undefined, A: Cartographic, B: Cartographic) => {
      if (!canvasA || !canvasB) return;
      const seg = new Cartesian2(canvasB.x - canvasA.x, canvasB.y - canvasA.y);
      const segLen2 = seg.x * seg.x + seg.y * seg.y;
      if (segLen2 === 0) return;
      const ap = new Cartesian2(screenPos.x - canvasA.x, screenPos.y - canvasA.y);
      let t = (ap.x * seg.x + ap.y * seg.y) / segLen2;
      t = Math.max(0, Math.min(1, t));
      const proj = new Cartesian2(canvasA.x + t * seg.x, canvasA.y + t * seg.y);
      const d = Cartesian2.distance(proj, screenPos);
      if (d <= tol && (!best || d < best.dist)) {
        // Interpolate geodesic between A and B using fraction t
        const geod = new EllipsoidGeodesic(A, B);
        const mid = geod.interpolateUsingFraction(t);
        const xyz = Cartesian3.fromRadians(mid.longitude, mid.latitude, mid.height);
        best = { dist: d, pos: xyz };
      }
    };

    // 1) anchors edges (polyline/polygon drafting anchors)
    if (snap.toEdges && anchorVerts.length >= 2) {
      for (let i = 0; i < anchorVerts.length - 1; i++) {
        const A3 = anchorVerts[i];
        const B3 = anchorVerts[i + 1];
        const canvasA = this.viewer.scene.cartesianToCanvasCoordinates(A3);
        const canvasB = this.viewer.scene.cartesianToCanvasCoordinates(B3);
        consider(canvasA, canvasB, Cartographic.fromCartesian(A3), Cartographic.fromCartesian(B3));
      }
    }

    // 2) completed geometries edges and circle perimeters
    if (this.allGeometries.length) {
      for (const g of this.allGeometries) {
        if (g.kind === 'polyline' || g.kind === 'polygon' || g.kind === 'rectangle') {
          const verts = g.kind === 'rectangle' ? g.corners : g.positions;
          const closed = g.kind !== 'polyline';
          for (let i = 0; i < verts.length - 1; i++) {
            const A3 = verts[i];
            const B3 = verts[i + 1];
            const canvasA = this.viewer.scene.cartesianToCanvasCoordinates(A3);
            const canvasB = this.viewer.scene.cartesianToCanvasCoordinates(B3);
            consider(canvasA, canvasB, Cartographic.fromCartesian(A3), Cartographic.fromCartesian(B3));
          }
          if (closed && verts.length >= 2) {
            const A3 = verts[verts.length - 1];
            const B3 = verts[0];
            const canvasA = this.viewer.scene.cartesianToCanvasCoordinates(A3);
            const canvasB = this.viewer.scene.cartesianToCanvasCoordinates(B3);
            consider(canvasA, canvasB, Cartographic.fromCartesian(A3), Cartographic.fromCartesian(B3));
          }
        } else if (g.kind === 'circle' && snap.toCirclePerimeter) {
          // Snap to circumference near the current mouse direction if close enough in pixels
          const centerCanvas = this.viewer.scene.cartesianToCanvasCoordinates(g.center);
          if (!centerCanvas) continue;
          const mouseCarto = Cartographic.fromCartesian(worldGuess);
          const centerCarto = Cartographic.fromCartesian(g.center);
          const geod = new EllipsoidGeodesic(centerCarto, mouseCarto);
          const onCircle = geod.interpolateUsingSurfaceDistance(g.radiusMeters);
          const onCircleXyz = Cartesian3.fromRadians(onCircle.longitude, onCircle.latitude, onCircle.height);
          const onCircleCanvas = this.viewer.scene.cartesianToCanvasCoordinates(onCircleXyz);
          if (!onCircleCanvas) continue;
          const d = Cartesian2.distance(onCircleCanvas, screenPos);
          if (d <= tol && (!best || d < best.dist)) {
            best = { dist: d, pos: onCircleXyz };
          }
        }
      }
    }

    return best?.pos ?? null;
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

  // Capture geometry and vertices from a finished drawing to power global snapping.
  private addCompletedGeometry(mode: DrawMode, finalPositions: Cartesian3[]) {
    try {
      if (!finalPositions || finalPositions.length === 0) return;
      switch (mode) {
        case 'point': {
          this.allVertices.push(finalPositions[0]);
          this.allGeometries.push({ kind: 'point', p: finalPositions[0] });
          break;
        }
        case 'polyline':
        case 'polygon': {
          // Push all vertices
          this.allVertices.push(...finalPositions);
          this.allGeometries.push({ kind: mode, positions: finalPositions.slice() });
          break;
        }
        case 'rectangle': {
          const rect = this.rectangleFromPositions(finalPositions);
          if (!rect) break;
          // Approximate height from the two defining points (or 0 if missing)
          const h = (() => {
            const h1 = Cartographic.fromCartesian(finalPositions[0]).height || 0;
            const h2 = Cartographic.fromCartesian(finalPositions[finalPositions.length - 1]).height || 0;
            return (h1 + h2) / 2;
          })();
          const west = rect.west, south = rect.south, east = rect.east, north = rect.north;
          const corners = [
            Cartesian3.fromRadians(west, south, h),
            Cartesian3.fromRadians(west, north, h),
            Cartesian3.fromRadians(east, north, h),
            Cartesian3.fromRadians(east, south, h)
          ];
          this.allVertices.push(...corners);
          this.allGeometries.push({ kind: 'rectangle', corners });
          break;
        }
        case 'circle': {
          // Store center
          this.allVertices.push(finalPositions[0]);
          // radius from first and last points
          const c1 = Cartographic.fromCartesian(finalPositions[0]);
          const c2 = Cartographic.fromCartesian(finalPositions[finalPositions.length - 1]);
          const geod = new EllipsoidGeodesic(c1, c2);
          const radiusMeters = Math.max(1, geod.surfaceDistance);
          this.allGeometries.push({ kind: 'circle', center: finalPositions[0], radiusMeters });
          break;
        }
      }
    } catch { /* ignore */ }
  }
}
