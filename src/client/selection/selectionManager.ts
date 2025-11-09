import { Viewer, ScreenSpaceEventHandler, ScreenSpaceEventType, Cartesian2, Cartesian3, Color, Entity, PolygonHierarchy, CallbackProperty, Cartographic, Rectangle, EllipsoidGeodesic, PolylineDashMaterialProperty } from 'cesium';

export type SelectionMode = 'pointer' | 'rectangle' | 'lasso';

interface GeometryRecord {
  kind: 'point' | 'polyline' | 'polygon' | 'rectangle' | 'circle';
  positions?: Cartesian3[];
  corners?: Cartesian3[];
  center?: Cartesian3;
  radiusMeters?: number;
}

/**
 * SelectionManager - Manages entity selection with pointer, rectangle, and lasso modes
 */
export class SelectionManager {
  private viewer: Viewer;
  private selectHandler: ScreenSpaceEventHandler | null = null;
  private isSelecting = false;
  private selectionMode: SelectionMode = 'pointer';
  private selectedEntities: Set<Entity> = new Set();
  private storedGeometries: Array<{ entity: Entity; record: GeometryRecord }> = [];
  
  // Callbacks
  public onModeChanged?: (mode: SelectionMode | null) => void;
  public onDeleteRequested?: () => void;
  
  private selectionStyles = new WeakMap<Entity, {
    pointColor?: any;
    pointPixelSize?: any;
    pointOutlineColor?: any;
    pointOutlineWidth?: any;
    polylineMaterial?: any;
    polylineWidth?: any;
    polygonOutlineColor?: any;
    polygonMaterial?: any;
    polygonOutline?: any;
    rectangleOutlineColor?: any;
    rectangleMaterial?: any;
    rectangleOutline?: any;
    ellipseOutlineColor?: any;
    ellipseMaterial?: any;
    ellipseOutline?: any;
  }>();

  constructor(viewer: Viewer) {
    this.viewer = viewer;
  }

  /**
   * Enable selection with specified mode
   */
  enableSelect(mode: SelectionMode = 'pointer') {
    if (this.isSelecting && this.selectionMode === mode) return;
    this.disableSelect(false);
    this.isSelecting = true;
    this.selectionMode = mode;

    if (mode === 'pointer') {
      this.setupPointerSelect();
    } else if (mode === 'rectangle') {
      this.setupRectangleSelect();
    } else if (mode === 'lasso') {
      this.setupLassoSelect();
    }

    // Delete key to trigger delete request
    const keydown = (e: KeyboardEvent) => {
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (this.onDeleteRequested) {
          this.onDeleteRequested();
        }
      }
    };
    window.addEventListener('keydown', keydown);
    
    // Notify mode change
    if (this.onModeChanged) {
      this.onModeChanged(mode);
    }
  }

  /**
   * Disable selection
   */
  disableSelect(clearSelection: boolean = false) {
    this.isSelecting = false;
    if (this.selectHandler) {
      this.selectHandler.destroy();
      this.selectHandler = null;
    }
    if (clearSelection) this.clearSelection();
    
    // Notify mode change
    if (this.onModeChanged) {
      this.onModeChanged(null);
    }
  }

  /**
   * Clear all selections
   */
  clearSelection() {
    this.selectedEntities.forEach(e => this.setHighlight(e, false));
    this.selectedEntities.clear();
    this.emitSelectionChanged();
  }

  /**
   * Get selected entities and clear selection
   * Returns entities that were selected (for deletion by EntityManager)
   */
  getAndClearSelected(): Entity[] {
    if (this.selectedEntities.size === 0) return [];
    
    const entities = Array.from(this.selectedEntities);
    
    // Remove from stored geometries and clear highlights
    entities.forEach(entity => {
      const idx = this.storedGeometries.findIndex(g => g.entity === entity);
      if (idx >= 0) {
        this.storedGeometries.splice(idx, 1);
      }
      this.setHighlight(entity, false);
    });
    
    this.selectedEntities.clear();
    this.emitSelectionChanged();
    
    return entities;
  }

  /**
   * Register a geometry for selection tracking
   */
  registerGeometry(entity: Entity, record: GeometryRecord) {
    this.storedGeometries.push({ entity, record });
  }

  /**
   * Unregister a geometry
   */
  unregisterGeometry(entity: Entity) {
    const idx = this.storedGeometries.findIndex(g => g.entity === entity);
    if (idx >= 0) this.storedGeometries.splice(idx, 1);
  }

  /**
   * Get current selection count
   */
  getSelectionCount(): number {
    return this.selectedEntities.size;
  }

  /**
   * Get selected entities
   */
  getSelectedEntities(): Entity[] {
    return Array.from(this.selectedEntities);
  }

  private setupPointerSelect() {
    this.selectHandler = new ScreenSpaceEventHandler(this.viewer.canvas);
    this.selectHandler.setInputAction((movement: any) => {
      const picked = this.viewer.scene.pick(movement.position);
      const entity = (picked && (picked as any).id) ? (picked.id as Entity) : null;
      this.selectEntity(entity ?? null);
    }, ScreenSpaceEventType.LEFT_CLICK);
  }

  private setupRectangleSelect() {
    const positions: Cartesian3[] = [];
    let previewEntity: Entity | null = null;
    let isDrawing = false;

    this.selectHandler = new ScreenSpaceEventHandler(this.viewer.canvas);

    this.selectHandler.setInputAction((movement: any) => {
      const pos = this.getWorldPosition(movement.position);
      if (!pos) return;
      isDrawing = true;
      this.viewer.scene.screenSpaceCameraController.enableRotate = false;
      this.viewer.scene.screenSpaceCameraController.enableTranslate = false;
      this.viewer.scene.screenSpaceCameraController.enableZoom = false;
      
      positions.length = 0;
      positions.push(pos, pos);
      
      previewEntity = this.viewer.entities.add({
        polyline: {
          positions: new CallbackProperty(() => {
            if (positions.length < 2) return [];
            const carto1 = Cartographic.fromCartesian(positions[0]);
            const carto2 = Cartographic.fromCartesian(positions[1]);
            const h = (carto1.height + carto2.height) / 2;
            const p1 = Cartesian3.fromRadians(carto1.longitude, carto1.latitude, h);
            const p2 = Cartesian3.fromRadians(carto2.longitude, carto1.latitude, h);
            const p3 = Cartesian3.fromRadians(carto2.longitude, carto2.latitude, h);
            const p4 = Cartesian3.fromRadians(carto1.longitude, carto2.latitude, h);
            return [p1, p2, p3, p4, p1];
          }, false),
          width: 3,
          material: new PolylineDashMaterialProperty({ color: Color.RED, dashLength: 16 }),
          clampToGround: true
        } as any
      });
    }, ScreenSpaceEventType.LEFT_DOWN);

    this.selectHandler.setInputAction((movement: any) => {
      if (!isDrawing) return;
      const pos = this.getWorldPosition(movement.endPosition);
      if (pos && positions.length >= 2) {
        positions[1] = pos;
      }
    }, ScreenSpaceEventType.MOUSE_MOVE);

    this.selectHandler.setInputAction(() => {
      if (!isDrawing) return;
      isDrawing = false;
      this.viewer.scene.screenSpaceCameraController.enableRotate = true;
      this.viewer.scene.screenSpaceCameraController.enableTranslate = true;
      this.viewer.scene.screenSpaceCameraController.enableZoom = true;
      
      if (positions.length >= 2 && previewEntity) {
        this.viewer.entities.remove(previewEntity);
        const carto1 = Cartographic.fromCartesian(positions[0]);
        const carto2 = Cartographic.fromCartesian(positions[1]);
        const rect = Rectangle.fromRadians(
          Math.min(carto1.longitude, carto2.longitude),
          Math.min(carto1.latitude, carto2.latitude),
          Math.max(carto1.longitude, carto2.longitude),
          Math.max(carto1.latitude, carto2.latitude)
        );
        const selected = this.getEntitiesInRectangle(rect);
        this.selectMultiple(selected);
      }
      positions.length = 0;
      previewEntity = null;
      this.enableSelect('pointer');
    }, ScreenSpaceEventType.LEFT_UP);
  }

  private setupLassoSelect() {
    const positions: Cartesian3[] = [];
    let previewEntity: Entity | null = null;
    let isDrawing = false;

    this.selectHandler = new ScreenSpaceEventHandler(this.viewer.canvas);

    this.selectHandler.setInputAction((movement: any) => {
      const pos = this.getWorldPosition(movement.position);
      if (!pos) return;
      isDrawing = true;
      this.viewer.scene.screenSpaceCameraController.enableRotate = false;
      this.viewer.scene.screenSpaceCameraController.enableTranslate = false;
      this.viewer.scene.screenSpaceCameraController.enableZoom = false;
      
      positions.length = 0;
      positions.push(pos);
      
      previewEntity = this.viewer.entities.add({
        polygon: {
          hierarchy: new CallbackProperty(() => {
            if (positions.length < 3) return new PolygonHierarchy([]);
            return new PolygonHierarchy(positions);
          }, false),
          material: Color.GRAY.withAlpha(0.1),
          outline: true,
          outlineColor: Color.GRAY,
          outlineWidth: 3
        } as any,
        polyline: {
          positions: new CallbackProperty(() => {
            if (positions.length < 2) return [];
            return [...positions, positions[0]];
          }, false),
          width: 3,
          material: new PolylineDashMaterialProperty({ color: Color.RED, dashLength: 16 }),
          clampToGround: true
        } as any
      });
    }, ScreenSpaceEventType.LEFT_DOWN);

    this.selectHandler.setInputAction((movement: any) => {
      if (!isDrawing) return;
      const pos = this.getWorldPosition(movement.endPosition);
      if (!pos) return;
      
      if (positions.length > 0) {
        const lastPos = positions[positions.length - 1];
        const dist = Cartesian3.distance(lastPos, pos);
        if (dist > 10) {
          positions.push(pos);
        }
      } else {
        positions.push(pos);
      }
    }, ScreenSpaceEventType.MOUSE_MOVE);

    this.selectHandler.setInputAction(() => {
      if (!isDrawing) return;
      isDrawing = false;
      this.viewer.scene.screenSpaceCameraController.enableRotate = true;
      this.viewer.scene.screenSpaceCameraController.enableTranslate = true;
      this.viewer.scene.screenSpaceCameraController.enableZoom = true;
      
      if (positions.length >= 3 && previewEntity) {
        this.viewer.entities.remove(previewEntity);
        const selected = this.getEntitiesInPolygon(positions);
        this.selectMultiple(selected);
      }
      positions.length = 0;
      previewEntity = null;
      this.enableSelect('pointer');
    }, ScreenSpaceEventType.LEFT_UP);
  }

  private selectEntity(entity: Entity | null, additive = false) {
    if (!additive) {
      this.selectedEntities.forEach(e => this.setHighlight(e, false));
      this.selectedEntities.clear();
    }
    if (entity) {
      if (this.selectedEntities.has(entity)) {
        this.setHighlight(entity, false);
        this.selectedEntities.delete(entity);
      } else {
        this.selectedEntities.add(entity);
        this.setHighlight(entity, true);
      }
    }
    this.emitSelectionChanged();
  }

  private selectMultiple(entities: Entity[]) {
    this.selectedEntities.forEach(e => this.setHighlight(e, false));
    this.selectedEntities.clear();
    entities.forEach(e => {
      this.selectedEntities.add(e);
      this.setHighlight(e, true);
    });
    this.emitSelectionChanged();
  }

  private setHighlight(entity: Entity, on: boolean) {
    const selColor = Color.ORANGE;
    let stash = this.selectionStyles.get(entity);
    if (!stash) {
      stash = {};
      this.selectionStyles.set(entity, stash);
    }
    if ((entity as any).point) {
      const point = (entity as any).point;
      if (on) {
        if (!stash.pointColor) stash.pointColor = point.color;
        if (!stash.pointPixelSize) stash.pointPixelSize = point.pixelSize;
        if (!stash.pointOutlineColor) stash.pointOutlineColor = point.outlineColor;
        if (!stash.pointOutlineWidth) stash.pointOutlineWidth = point.outlineWidth;
        point.color = selColor;
        point.pixelSize = Math.max(10, Number(point.pixelSize ?? 8));
        point.outlineColor = Color.WHITE;
        point.outlineWidth = 2;
      } else if (stash.pointColor) {
        point.color = stash.pointColor;
        if (stash.pointPixelSize !== undefined) point.pixelSize = stash.pointPixelSize;
        if (stash.pointOutlineColor !== undefined) point.outlineColor = stash.pointOutlineColor;
        if (stash.pointOutlineWidth !== undefined) point.outlineWidth = stash.pointOutlineWidth;
      }
    }
    if ((entity as any).polyline) {
      const pl = (entity as any).polyline;
      if (on) {
        if (!stash.polylineMaterial) stash.polylineMaterial = pl.material;
        if (!stash.polylineWidth) stash.polylineWidth = pl.width;
        pl.material = selColor;
        pl.width = Math.max(5, Number(pl.width ?? 2));
      } else if (stash.polylineMaterial) {
        pl.material = stash.polylineMaterial;
        if (stash.polylineWidth !== undefined) pl.width = stash.polylineWidth;
      }
    }
    if ((entity as any).polygon) {
      const pg = (entity as any).polygon;
      if (on) {
        if (!stash.polygonOutlineColor) stash.polygonOutlineColor = pg.outlineColor;
        if (!stash.polygonMaterial) stash.polygonMaterial = pg.material;
        if (!stash.polygonOutline) stash.polygonOutline = pg.outline;
        pg.outline = true;
        pg.outlineColor = selColor;
        pg.material = Color.ORANGE.withAlpha(0.2);
      } else if (stash.polygonOutlineColor) {
        pg.outlineColor = stash.polygonOutlineColor;
        if (stash.polygonMaterial !== undefined) pg.material = stash.polygonMaterial;
        if (stash.polygonOutline !== undefined) pg.outline = stash.polygonOutline;
      }
    }
    if ((entity as any).rectangle) {
      const rc = (entity as any).rectangle;
      if (on) {
        if (!stash.rectangleOutlineColor) stash.rectangleOutlineColor = rc.outlineColor;
        if (!stash.rectangleMaterial) stash.rectangleMaterial = rc.material;
        if (!stash.rectangleOutline) stash.rectangleOutline = rc.outline;
        rc.outline = true;
        rc.outlineColor = selColor;
        rc.material = Color.ORANGE.withAlpha(0.2);
      } else if (stash.rectangleOutlineColor) {
        rc.outlineColor = stash.rectangleOutlineColor;
        if (stash.rectangleMaterial !== undefined) rc.material = stash.rectangleMaterial;
        if (stash.rectangleOutline !== undefined) rc.outline = stash.rectangleOutline;
      }
    }
    if ((entity as any).ellipse) {
      const el = (entity as any).ellipse;
      if (on) {
        if (!stash.ellipseOutlineColor) stash.ellipseOutlineColor = el.outlineColor;
        if (!stash.ellipseMaterial) stash.ellipseMaterial = el.material;
        if (!stash.ellipseOutline) stash.ellipseOutline = el.outline;
        el.outline = true;
        el.outlineColor = selColor;
        el.material = Color.ORANGE.withAlpha(0.2);
      } else if (stash.ellipseOutlineColor) {
        el.outlineColor = stash.ellipseOutlineColor;
        if (stash.ellipseMaterial !== undefined) el.material = stash.ellipseMaterial;
        if (stash.ellipseOutline !== undefined) el.outline = stash.ellipseOutline;
      }
    }
    if (!on) {
      this.selectionStyles.delete(entity);
    }
  }

  private emitSelectionChanged() {
    try {
      const detail = { count: this.selectedEntities.size };
      window.dispatchEvent(new CustomEvent('selectionChanged', { detail }));
    } catch {}
  }

  private getWorldPosition(screenPos: Cartesian2): Cartesian3 | null {
    const ray = this.viewer.camera.getPickRay(screenPos);
    if (!ray) return null;
    const cartesian = this.viewer.scene.globe.pick(ray, this.viewer.scene);
    return cartesian ?? null;
  }

  private getEntitiesInRectangle(rect: Rectangle): Entity[] {
    const result: Entity[] = [];
    const west = rect.west, east = rect.east, south = rect.south, north = rect.north;
    const rectCornersCart: Cartesian3[] = [
      Cartesian3.fromRadians(west, south, 0),
      Cartesian3.fromRadians(east, south, 0),
      Cartesian3.fromRadians(east, north, 0),
      Cartesian3.fromRadians(west, north, 0)
    ];
    const rectCenterCart = Cartesian3.fromRadians((west + east) / 2, (south + north) / 2, 0);
    const scene = this.viewer.scene;
    const rectCornersScreen = rectCornersCart.map(c => scene.cartesianToCanvasCoordinates(c)).filter(Boolean) as Array<{ x: number; y: number }>;
    const rectCenterScreen = scene.cartesianToCanvasCoordinates(rectCenterCart);

    for (const item of this.storedGeometries) {
      const { entity, record } = item;
      let inside = false;

      const testPoints: Cartesian3[] = [];
      if (record.positions) testPoints.push(...record.positions);
      if (record.corners) testPoints.push(...record.corners);
      if (record.center) testPoints.push(record.center);
      if (testPoints.length > 0) {
        inside = testPoints.some(pos => Rectangle.contains(rect, Cartographic.fromCartesian(pos)));
      }

      if (!inside && (record.kind === 'polygon' || record.kind === 'rectangle')) {
        const shapePositions = record.kind === 'polygon' ? (record.positions ?? []) : (record.corners ?? []);
        const polyScreen = shapePositions
          .map(p => scene.cartesianToCanvasCoordinates(p))
          .filter(Boolean) as Array<{ x: number; y: number }>;
        if (polyScreen.length >= 3) {
          if (rectCenterScreen && this.pointInPolygon({ x: rectCenterScreen.x, y: rectCenterScreen.y }, polyScreen)) {
            inside = true;
          } else if (rectCornersScreen.some(rc => this.pointInPolygon(rc, polyScreen))) {
            inside = true;
          }
        }
      }

      if (!inside && record.kind === 'circle' && record.center && record.radiusMeters) {
        const centerCarto = Cartographic.fromCartesian(record.center);
        const centerGeod = new EllipsoidGeodesic(centerCarto, Cartographic.fromCartesian(rectCenterCart));
        const distCenter = centerGeod.surfaceDistance;
        if (distCenter <= record.radiusMeters) {
          inside = true;
        } else {
          inside = rectCornersCart.some(c => {
            const geod = new EllipsoidGeodesic(centerCarto, Cartographic.fromCartesian(c));
            return geod.surfaceDistance <= record.radiusMeters!;
          });
        }
      }

      if (inside) result.push(entity);
    }
    return result;
  }

  private getEntitiesInPolygon(polygon: Cartesian3[]): Entity[] {
    const scene = this.viewer.scene;
    const screenPoly = polygon.map(pos => scene.cartesianToCanvasCoordinates(pos)).filter(Boolean) as Array<{ x: number; y: number }>;
    if (screenPoly.length < 3) return [];

    const centroid = screenPoly.reduce((acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y }), { x: 0, y: 0 });
    centroid.x /= screenPoly.length;
    centroid.y /= screenPoly.length;

    const result: Entity[] = [];
    for (const item of this.storedGeometries) {
      const { entity, record } = item;
      let inside = false;
      const testPoints: Cartesian3[] = [];
      if (record.positions) testPoints.push(...record.positions);
      if (record.corners) testPoints.push(...record.corners);
      if (record.center) testPoints.push(record.center);

      for (const pos of testPoints) {
        const screenPos = scene.cartesianToCanvasCoordinates(pos);
        if (screenPos && this.pointInPolygon({ x: screenPos.x, y: screenPos.y }, screenPoly)) {
          inside = true;
          break;
        }
      }

      if (!inside && (record.kind === 'polygon' || record.kind === 'rectangle')) {
        const shapePositions = record.kind === 'polygon' ? (record.positions ?? []) : (record.corners ?? []);
        const polyScreen = shapePositions
          .map(p => scene.cartesianToCanvasCoordinates(p))
          .filter(Boolean) as Array<{ x: number; y: number }>;
        if (polyScreen.length >= 3) {
          if (this.pointInPolygon(centroid, polyScreen)) {
            inside = true;
          } else if (screenPoly.some(lp => this.pointInPolygon(lp, polyScreen))) {
            inside = true;
          }
        }
      }

      if (!inside && record.kind === 'circle' && record.center && record.radiusMeters) {
        const centerCarto = Cartographic.fromCartesian(record.center);
        const centroidCart = scene.pickPosition(new Cartesian2(centroid.x, centroid.y));
        let centroidInside = false;
        if (centroidCart) {
          const centroidCarto = Cartographic.fromCartesian(centroidCart);
          centroidInside = new EllipsoidGeodesic(centerCarto, centroidCarto).surfaceDistance <= record.radiusMeters;
        }
        if (centroidInside) {
          inside = true;
        } else {
          inside = polygon.some(p => {
            const geod = new EllipsoidGeodesic(centerCarto, Cartographic.fromCartesian(p));
            return geod.surfaceDistance <= record.radiusMeters!;
          });
        }
      }

      if (inside) result.push(entity);
    }
    return result;
  }

  private pointInPolygon(point: { x: number; y: number }, polygon: Array<{ x: number; y: number }>): boolean {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const xi = polygon[i].x, yi = polygon[i].y;
      const xj = polygon[j].x, yj = polygon[j].y;
      const intersect = ((yi > point.y) !== (yj > point.y)) &&
        (point.x < (xj - xi) * (point.y - yi) / (yj - yi) + xi);
      if (intersect) inside = !inside;
    }
    return inside;
  }
}
