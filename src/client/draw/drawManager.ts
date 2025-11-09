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
  toEdges?: boolean;
  toCirclePerimeter?: boolean;
}

export interface DrawOptions {
  snap?: SnapOptions;
  autoClosePolygon?: boolean;
  extrudedHeight?: number;
}

interface GeometryRecord {
  kind: 'point' | 'polyline' | 'polygon' | 'rectangle' | 'circle';
  positions?: Cartesian3[];
  corners?: Cartesian3[];
  center?: Cartesian3;
  radiusMeters?: number;
}

/**
 * DrawManager - Manages interactive drawing on Cesium viewer
 * 
 * Responsibilities:
 * - Create preview and final entities for different draw modes
 * - Handle mouse interactions (move, click, right-click)
 * - Apply snapping to vertices, edges, and perimeters
 * - Store completed geometries for snapping reference
 */
export class DrawManager {
  private viewer: Viewer;
  private handler: ScreenSpaceEventHandler | null = null;
  private activeEntity: Entity | null = null;
  private activeMode: DrawMode | null = null;
  private positions: Cartesian3[] = [];
  private cleanupFns: Array<() => void> = [];
  
  // Snapping data
  private allVertices: Cartesian3[] = [];
  private allGeometries: GeometryRecord[] = [];
  private entityToRecord = new Map<Entity, GeometryRecord>();

  // Callbacks
  public onDrawingComplete?: (entity: Entity, record: GeometryRecord) => void;

  private defaultOptions: DrawOptions = {
    snap: { 
      enabled: true, 
      pixelTolerance: 20, 
      toVertices: true, 
      toFirstVertex: true, 
      toEdges: true, 
      toCirclePerimeter: true 
    },
    autoClosePolygon: true
  };

  constructor(viewer: Viewer) {
    this.viewer = viewer;
  }

  setOptions(options: DrawOptions) {
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

  /**
   * Remove entities from snap data
   */
  removeFromSnapData(entities: Entity[]) {
    entities.forEach(entity => {
      const record = this.entityToRecord.get(entity);
      if (record) {
        // Remove from allGeometries
        const geomIdx = this.allGeometries.indexOf(record);
        if (geomIdx >= 0) {
          this.allGeometries.splice(geomIdx, 1);
        }
        
        // Remove vertices from allVertices
        const vertsToRemove: Cartesian3[] = [];
        if (record.positions) vertsToRemove.push(...record.positions);
        if (record.corners) vertsToRemove.push(...record.corners);
        if (record.center) vertsToRemove.push(record.center);
        
        this.allVertices = this.allVertices.filter(v => !vertsToRemove.includes(v));
        
        // Remove from map
        this.entityToRecord.delete(entity);
      }
    });
  }

  // Public draw methods
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

  /**
   * Main draw orchestration method
   */
  private startDraw(mode: DrawMode, style: DrawStyle, options?: DrawOptions): Promise<Entity> {
    if (this.activeMode) {
      this.teardown();
    }

    this.activeMode = mode;
    const draftPositions: Cartesian3[] = [];
    const opts = this.mergeOptions(options);
    const colors = this.getColors(style);

    // Create preview point (yellow dot at cursor)
    const previewPoint = this.createPreviewPoint(draftPositions, mode, colors.previewColor);
    
    // Create main drawing entity
    this.activeEntity = this.createDrawingEntity(mode, draftPositions, colors, opts);

    return new Promise<Entity>((resolve, reject) => {
      const handleFinish = () => this.finishDrawing(mode, draftPositions, previewPoint, resolve);
      const handleCancel = () => this.cancelDrawing(previewPoint, reject);

      this.setupEventHandlers(mode, draftPositions, opts, handleFinish, handleCancel);
    });
  }

  /**
   * Merge user options with defaults
   */
  private mergeOptions(options?: DrawOptions): DrawOptions {
    return {
      ...this.defaultOptions,
      ...options,
      snap: { ...this.defaultOptions.snap, ...options?.snap }
    };
  }

  /**
   * Get colors for drawing
   */
  private getColors(style: DrawStyle) {
    return {
      strokeColor: style.strokeColor ?? Color.CYAN.withAlpha(0.9),
      fillColor: style.fillColor ?? Color.CYAN.withAlpha(0.1),
      strokeWidth: style.strokeWidth ?? 4,
      outlineColor: Color.fromBytes(0, 139, 139, 255),
      previewColor: Color.YELLOW.withAlpha(0.8),
      pointColor: style.strokeColor ?? Color.CYAN.withAlpha(1.0),
      pixelSize: style.strokeWidth ?? 10
    };
  }

  /**
   * Create preview point entity (yellow cursor follower)
   */
  private createPreviewPoint(positions: Cartesian3[], mode: DrawMode, color: Color): Entity {
    return this.viewer.entities.add({
      position: new CallbackProperty(() => positions[positions.length - 1], false) as any,
      point: {
        pixelSize: 8,
        color,
        outlineColor: Color.BLACK,
        outlineWidth: 1,
        show: new CallbackProperty(() => this.shouldShowPreview(mode, positions), false) as any
      }
    });
  }

  /**
   * Determine if preview point should be visible
   */
  private shouldShowPreview(mode: DrawMode, positions: Cartesian3[]): boolean {
    if (mode === 'point') return positions.length > 0;
    if (mode === 'polyline' || mode === 'polygon') return positions.length > 0;
    if (mode === 'rectangle' || mode === 'circle') return positions.length <= 2;
    return false;
  }

  /**
   * Create the main drawing entity based on mode
   */
  private createDrawingEntity(
    mode: DrawMode, 
    positions: Cartesian3[], 
    colors: any, 
    opts: DrawOptions
  ): Entity {
    switch (mode) {
      case 'point':
        return this.createPointEntity(positions, colors);
      case 'polyline':
        return this.createPolylineEntity(positions, colors);
      case 'polygon':
        return this.createPolygonEntity(positions, colors, opts);
      case 'rectangle':
        return this.createRectangleEntity(positions, colors, opts);
      case 'circle':
        return this.createCircleEntity(positions, colors, opts);
    }
  }

  private createPointEntity(positions: Cartesian3[], colors: any): Entity {
    return this.viewer.entities.add({
      position: new CallbackProperty(() => positions[positions.length - 1], false) as any,
      point: {
        pixelSize: colors.pixelSize,
        color: colors.pointColor,
        outlineColor: colors.outlineColor,
        outlineWidth: 1
      }
    });
  }

  private createPolylineEntity(positions: Cartesian3[], colors: any): Entity {
    return this.viewer.entities.add({
      polyline: new PolylineGraphics({
        material: colors.strokeColor,
        width: colors.strokeWidth,
        positions: new CallbackProperty(() => positions, false)
      })
    });
  }

  private createPolygonEntity(positions: Cartesian3[], colors: any, opts: DrawOptions): Entity {
    return this.viewer.entities.add({
      polygon: {
        hierarchy: new CallbackProperty(() => new PolygonHierarchy(positions), false),
        material: colors.fillColor,
        outline: true,
        outlineColor: colors.outlineColor,
        height: 0,
        extrudedHeight: opts?.extrudedHeight
      }
    });
  }

  private createRectangleEntity(positions: Cartesian3[], colors: any, opts: DrawOptions): Entity {
    return this.viewer.entities.add({
      rectangle: {
        coordinates: new CallbackProperty(() => {
          if (positions.length < 2) return undefined;
          const c1 = Cartographic.fromCartesian(positions[0]);
          const c2 = Cartographic.fromCartesian(positions[positions.length - 1]);
          return Rectangle.fromRadians(
            Math.min(c1.longitude, c2.longitude),
            Math.min(c1.latitude, c2.latitude),
            Math.max(c1.longitude, c2.longitude),
            Math.max(c1.latitude, c2.latitude)
          );
        }, false),
        material: colors.fillColor,
        outline: true,
        outlineColor: colors.outlineColor,
        height: 0,
        extrudedHeight: opts?.extrudedHeight
      }
    });
  }

  private createCircleEntity(positions: Cartesian3[], colors: any, opts: DrawOptions): Entity {
    const computeRadius = () => {
      if (positions.length < 2) return undefined;
      const c1 = Cartographic.fromCartesian(positions[0]);
      const c2 = Cartographic.fromCartesian(positions[positions.length - 1]);
      const geod = new EllipsoidGeodesic(c1, c2);
      return Math.max(1, geod.surfaceDistance);
    };

    return this.viewer.entities.add({
      ellipse: {
        semiMajorAxis: new CallbackProperty(computeRadius, false),
        semiMinorAxis: new CallbackProperty(computeRadius, false),
        material: colors.fillColor,
        outline: true,
        granularity: Math.PI / 180,
        outlineColor: colors.outlineColor,
        height: 0,
        extrudedHeight: opts?.extrudedHeight
      }
    });
  }

  /**
   * Setup all mouse event handlers
   */
  private setupEventHandlers(
    mode: DrawMode,
    positions: Cartesian3[],
    opts: DrawOptions,
    onFinish: () => void,
    onCancel: () => void
  ) {
    this.handler = new ScreenSpaceEventHandler(this.viewer.canvas);

    // Mouse move - update cursor position
    this.handler.setInputAction((movement: any) => {
      this.handleMouseMove(movement, mode, positions, opts);
    }, ScreenSpaceEventType.MOUSE_MOVE);

    // Left click - add point
    this.handler.setInputAction((movement: any) => {
      this.handleLeftClick(movement, mode, positions, opts, onFinish);
    }, ScreenSpaceEventType.LEFT_CLICK);

    // Right click - finish drawing
    this.handler.setInputAction((movement: any) => {
      this.handleRightClick(movement, mode, positions, onFinish);
    }, ScreenSpaceEventType.RIGHT_CLICK);

    // Double click - finish drawing
    this.handler.setInputAction((movement: any) => {
      this.handleDoubleClick(movement, mode, positions, onFinish);
    }, ScreenSpaceEventType.LEFT_DOUBLE_CLICK);

    // ESC key - cancel
    this.setupCancelHandler(onCancel);
  }

  /**
   * Handle mouse move - update preview position
   */
  private handleMouseMove(movement: any, mode: DrawMode, positions: Cartesian3[], opts: DrawOptions) {
    const pos = this.getWorldPosition(movement.endPosition);
    if (!pos) return;

    const snappedPos = this.applySnapping(movement.endPosition, pos, mode, positions, opts);
    
    if (positions.length === 0) {
      positions.push(snappedPos);
    } else {
      positions[positions.length - 1] = snappedPos;
    }

    // Update circle center position
    if (mode === 'circle' && this.activeEntity && positions[0]) {
      this.activeEntity.position = new ConstantPositionProperty(positions[0]);
    }
  }

  /**
   * Handle left click - add anchor point
   */
  private handleLeftClick(
    movement: any, 
    mode: DrawMode, 
    positions: Cartesian3[], 
    opts: DrawOptions,
    onFinish: () => void
  ) {
    // Skip drawing if Shift is held (allow selection instead)
    const shiftHeld = (movement as any).shiftKey || (window.event as any)?.shiftKey;
    if (shiftHeld) return;

    const pos = this.getWorldPosition(movement.position);
    if (!pos) return;

    const snappedPos = this.applySnapping(movement.position, pos, mode, positions, opts);

    // Point mode - single click finishes
    if (mode === 'point') {
      if (positions.length === 0) {
        positions.push(snappedPos);
      } else {
        positions[positions.length - 1] = snappedPos;
      }
      onFinish();
      return;
    }

    // First click - add anchor point
    if (positions.length <= 1) {
      if (positions.length === 1) {
        positions[0] = snappedPos;
      } else {
        positions.push(snappedPos);
      }
      
      // Add trailing point for dynamic drawing
      if (mode === 'polyline' || mode === 'polygon' || mode === 'rectangle' || mode === 'circle') {
        positions.push(snappedPos.clone());
      }

      if (mode === 'circle' && this.activeEntity) {
        this.activeEntity.position = new ConstantPositionProperty(snappedPos);
      }
      return;
    }

    // Rectangle/Circle - second click finishes
    if (mode === 'rectangle' || mode === 'circle') {
      positions[positions.length - 1] = snappedPos;
      onFinish();
      return;
    }

    // Polygon auto-close check
    if (mode === 'polygon' && opts.autoClosePolygon && positions.length >= 3) {
      if (this.isNearFirstVertex(positions[0], movement.position, opts)) {
        positions[positions.length - 1] = positions[0];
        onFinish();
        return;
      }
    }

    // Polyline/Polygon - add intermediate point
    positions[positions.length - 1] = snappedPos;
    positions.push(snappedPos.clone());
  }

  /**
   * Handle right click - finish at cursor
   */
  private handleRightClick(movement: any, mode: DrawMode, positions: Cartesian3[], onFinish: () => void) {
    if (positions.length > 0) {
      const pos = this.getWorldPosition(movement.position);
      if (pos) {
        positions[positions.length - 1] = pos;
        if (mode === 'polyline' || mode === 'polygon') {
          positions.push(pos.clone());
        }
      }
    }
    onFinish();
  }

  /**
   * Handle double click - finish at cursor
   */
  private handleDoubleClick(movement: any, mode: DrawMode, positions: Cartesian3[], onFinish: () => void) {
    if (positions.length > 0) {
      const pos = this.getWorldPosition(movement.position);
      if (pos) {
        positions[positions.length - 1] = pos;
        if (mode === 'polyline' || mode === 'polygon') {
          positions.push(pos.clone());
        }
      }
    }
    onFinish();
  }

  /**
   * Setup ESC key cancel handler
   */
  private setupCancelHandler(onCancel: () => void) {
    const keydown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCancel();
      }
    };
    window.addEventListener('keydown', keydown);
    this.cleanupFns.push(() => window.removeEventListener('keydown', keydown));
  }

  /**
   * Convert screen position to world position
   */
  private getWorldPosition(screenPos: Cartesian2): Cartesian3 | null {
    const carto = screenToCartographic(this.viewer, screenPos);
    if (!carto) return null;
    return Cartesian3.fromRadians(carto.longitude, carto.latitude, carto.height ?? 0);
  }

  /**
   * Apply snapping to position (edges first, then vertices)
   */
  private applySnapping(
    screenPos: Cartesian2, 
    worldPos: Cartesian3, 
    mode: DrawMode, 
    positions: Cartesian3[], 
    opts: DrawOptions
  ): Cartesian3 {
    if (!opts.snap?.enabled) return worldPos;

    const anchors = (mode === 'polyline' || mode === 'polygon')
      ? positions.slice(0, Math.max(0, positions.length - 1))
      : [];

    // Try edge/perimeter snap first
    const edgeSnap = this.snapToBoundaries(screenPos, worldPos, anchors, opts.snap);
    if (edgeSnap) return edgeSnap;

    // Try vertex snap
    const candidates = anchors.concat(this.allVertices);
    const vertexSnap = this.snapToVertices(screenPos, candidates, opts.snap);
    if (vertexSnap) return vertexSnap;

    return worldPos;
  }

  /**
   * Snap to nearest vertex
   */
  private snapToVertices(screenPos: Cartesian2, vertices: Cartesian3[], snap: SnapOptions): Cartesian3 | null {
    if (!vertices.length) return null;
    
    const tol = snap.pixelTolerance ?? 10;
    let best: { dist: number; vertex: Cartesian3 } | null = null;

    for (const vertex of vertices) {
      const canvas = this.viewer.scene.cartesianToCanvasCoordinates(vertex);
      if (!canvas) continue;
      
      const dist = Cartesian2.distance(canvas, screenPos);
      if (dist <= tol && (!best || dist < best.dist)) {
        best = { dist, vertex };
      }
    }

    return best?.vertex ?? null;
  }

  /**
   * Snap to edges/perimeters
   */
  private snapToBoundaries(
    screenPos: Cartesian2, 
    worldGuess: Cartesian3, 
    anchorVerts: Cartesian3[], 
    snap: SnapOptions
  ): Cartesian3 | null {
    const tol = snap.pixelTolerance ?? 10;
    let best: { dist: number; pos: Cartesian3 } | null = null;

    // Helper to check edge snapping
    const checkEdge = (A: Cartesian3, B: Cartesian3) => {
      const canvasA = this.viewer.scene.cartesianToCanvasCoordinates(A);
      const canvasB = this.viewer.scene.cartesianToCanvasCoordinates(B);
      if (!canvasA || !canvasB) return;

      const seg = new Cartesian2(canvasB.x - canvasA.x, canvasB.y - canvasA.y);
      const segLen2 = seg.x * seg.x + seg.y * seg.y;
      if (segLen2 === 0) return;

      const ap = new Cartesian2(screenPos.x - canvasA.x, screenPos.y - canvasA.y);
      let t = (ap.x * seg.x + ap.y * seg.y) / segLen2;
      t = Math.max(0, Math.min(1, t));

      const proj = new Cartesian2(canvasA.x + t * seg.x, canvasA.y + t * seg.y);
      const dist = Cartesian2.distance(proj, screenPos);

      if (dist <= tol && (!best || dist < best.dist)) {
        const cartoA = Cartographic.fromCartesian(A);
        const cartoB = Cartographic.fromCartesian(B);
        const geod = new EllipsoidGeodesic(cartoA, cartoB);
        const mid = geod.interpolateUsingFraction(t);
        best = { dist, pos: Cartesian3.fromRadians(mid.longitude, mid.latitude, mid.height) };
      }
    };

    // Check current drawing anchors
    if (snap.toEdges && anchorVerts.length >= 2) {
      for (let i = 0; i < anchorVerts.length - 1; i++) {
        checkEdge(anchorVerts[i], anchorVerts[i + 1]);
      }
    }

    // Check completed geometries
    for (const geom of this.allGeometries) {
      if (geom.kind === 'polyline' || geom.kind === 'polygon' || geom.kind === 'rectangle') {
        const verts = geom.kind === 'rectangle' ? geom.corners! : geom.positions!;
        const closed = geom.kind !== 'polyline';

        for (let i = 0; i < verts.length - 1; i++) {
          checkEdge(verts[i], verts[i + 1]);
        }
        if (closed && verts.length >= 2) {
          checkEdge(verts[verts.length - 1], verts[0]);
        }
      } else if (geom.kind === 'circle' && snap.toCirclePerimeter) {
        const centerCanvas = this.viewer.scene.cartesianToCanvasCoordinates(geom.center!);
        if (!centerCanvas) continue;

        const mouseCarto = Cartographic.fromCartesian(worldGuess);
        const centerCarto = Cartographic.fromCartesian(geom.center!);
        const geod = new EllipsoidGeodesic(centerCarto, mouseCarto);
        const onCircle = geod.interpolateUsingSurfaceDistance(geom.radiusMeters!);
        const onCircleXyz = Cartesian3.fromRadians(onCircle.longitude, onCircle.latitude, onCircle.height);
        const onCircleCanvas = this.viewer.scene.cartesianToCanvasCoordinates(onCircleXyz);
        
        if (onCircleCanvas) {
          const dist = Cartesian2.distance(onCircleCanvas, screenPos);
          if (dist <= tol && (!best || dist < best.dist)) {
            best = { dist, pos: onCircleXyz };
          }
        }
      }
    }

    return best?.pos ?? null;
  }

  /**
   * Check if near first vertex (for polygon auto-close)
   */
  private isNearFirstVertex(firstVertex: Cartesian3, screenPos: Cartesian2, opts: DrawOptions): boolean {
    const firstCanvas = this.viewer.scene.cartesianToCanvasCoordinates(firstVertex);
    if (!firstCanvas) return false;
    const dist = Cartesian2.distance(firstCanvas, screenPos);
    return dist <= (opts.snap?.pixelTolerance ?? 20);
  }

  /**
   * Finish drawing - validate, store, cleanup
   */
  private finishDrawing(
    mode: DrawMode, 
    positions: Cartesian3[], 
    previewPoint: Entity,
    resolve: (entity: Entity) => void
  ) {
    // Validate minimum points
    const minPoints = { point: 1, polyline: 2, polygon: 3, rectangle: 2, circle: 2 };
    if (positions.length < minPoints[mode]) return;

    // Build final positions
    const finalPositions = (mode === 'polyline' || mode === 'polygon')
      ? positions.slice(0, -1)
      : positions.slice();

  // Store for snapping and selection mapping
  const record = this.recordGeometry(mode, finalPositions);

    // Cleanup
    this.viewer.entities.remove(previewPoint);
    const entity = this.activeEntity!;
    
    // Map entity to record for later removal
    if (record) {
      this.entityToRecord.set(entity, record);
    }
    
    this.teardown();
    
    // Notify that drawing is complete with entity and record
    if (record && this.onDrawingComplete) {
      this.onDrawingComplete(entity, record);
    }
    
    resolve(entity);
  }

  /**
   * Cancel drawing
   */
  private cancelDrawing(previewPoint: Entity, reject: (error: Error) => void) {
    this.viewer.entities.remove(this.activeEntity!);
    this.viewer.entities.remove(previewPoint);
    this.teardown();
    reject(new Error('Draw cancelled'));
  }

  /**
   * Record completed geometry for future snapping
   */
  private recordGeometry(mode: DrawMode, positions: Cartesian3[]): GeometryRecord | void {
    try {
      if (!positions || positions.length === 0) return;

      switch (mode) {
        case 'point':
          this.allVertices.push(positions[0]);
          const rPoint: GeometryRecord = { kind: 'point', positions: [positions[0]] };
          this.allGeometries.push(rPoint);
          return rPoint;

        case 'polyline':
        case 'polygon': {
          this.allVertices.push(...positions);
          const r: GeometryRecord = { kind: mode, positions: positions.slice() } as any;
          this.allGeometries.push(r);
          return r;
        }

        case 'rectangle': {
          const c1 = Cartographic.fromCartesian(positions[0]);
          const c2 = Cartographic.fromCartesian(positions[positions.length - 1]);
          const h = ((c1.height || 0) + (c2.height || 0)) / 2;
          const west = Math.min(c1.longitude, c2.longitude);
          const south = Math.min(c1.latitude, c2.latitude);
          const east = Math.max(c1.longitude, c2.longitude);
          const north = Math.max(c1.latitude, c2.latitude);
          const corners = [
            Cartesian3.fromRadians(west, south, h),
            Cartesian3.fromRadians(west, north, h),
            Cartesian3.fromRadians(east, north, h),
            Cartesian3.fromRadians(east, south, h)
          ];
          this.allVertices.push(...corners);
          const rRect: GeometryRecord = { kind: 'rectangle', corners };
          this.allGeometries.push(rRect);
          return rRect;
        }

        case 'circle': {
          const c1 = Cartographic.fromCartesian(positions[0]);
          const c2 = Cartographic.fromCartesian(positions[positions.length - 1]);
          const geod = new EllipsoidGeodesic(c1, c2);
          const radiusMeters = Math.max(1, geod.surfaceDistance);
          this.allVertices.push(positions[0]);
          const rCirc: GeometryRecord = { kind: 'circle', center: positions[0], radiusMeters };
          this.allGeometries.push(rCirc);
          return rCirc;
        }
      }
    } catch { /* ignore */ }
  }

  /**
   * Cleanup handlers and state
   */
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
