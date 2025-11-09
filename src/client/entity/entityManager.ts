import { Viewer, Entity } from 'cesium';
import { DrawManager, DrawStyle, DrawOptions } from '../draw/drawManager';
import { SelectionManager, SelectionMode } from '../selection/selectionManager';

/**
 * EntityManager - Coordinates drawing and selection operations
 * 
 * Responsibilities:
 * - Initialize and manage DrawManager and SelectionManager
 * - Wire up callbacks between managers
 * - Provide unified API for entity operations
 * - Handle mode transitions (draw ↔ select)
 */
export class EntityManager {
  private viewer: Viewer;
  private drawManager: DrawManager;
  private selectionManager: SelectionManager;

  constructor(viewer: Viewer) {
    this.viewer = viewer;
    this.drawManager = new DrawManager(viewer);
    this.selectionManager = new SelectionManager(viewer);
    
    this.wireManagerCallbacks();
  }

  /**
   * Wire up callbacks between managers
   */
  private wireManagerCallbacks() {
    // When drawing completes: register geometry and return to pointer select mode
    this.drawManager.onDrawingComplete = (entity, record) => {
      this.selectionManager.registerGeometry(entity, record);
      this.selectionManager.enableSelect('pointer');
    };

    // When delete key pressed: delete selected entities
    this.selectionManager.onDeleteRequested = () => {
      this.deleteSelected();
    };
  }

  // === Drawing API ===
  
  async drawPoint(style?: DrawStyle, options?: DrawOptions): Promise<Entity> {
    this.selectionManager.disableSelect();
    return this.drawManager.drawPoint(style, options);
  }

  async drawPolyline(style?: DrawStyle, options?: DrawOptions): Promise<Entity> {
    this.selectionManager.disableSelect();
    return this.drawManager.drawPolyline(style, options);
  }

  async drawPolygon(style?: DrawStyle, options?: DrawOptions): Promise<Entity> {
    this.selectionManager.disableSelect();
    return this.drawManager.drawPolygon(style, options);
  }

  async drawRectangle(style?: DrawStyle, options?: DrawOptions): Promise<Entity> {
    this.selectionManager.disableSelect();
    return this.drawManager.drawRectangle(style, options);
  }

  async drawCircle(style?: DrawStyle, options?: DrawOptions): Promise<Entity> {
    this.selectionManager.disableSelect();
    return this.drawManager.drawCircle(style, options);
  }

  cancelDraw() {
    this.drawManager.cancel();
  }

  setDrawOptions(options: DrawOptions) {
    this.drawManager.setOptions(options);
  }

  // === Selection API ===
  
  enableSelect(mode: SelectionMode = 'pointer') {
    this.selectionManager.enableSelect(mode);
  }

  disableSelect(clearSelection: boolean = false) {
    this.selectionManager.disableSelect(clearSelection);
  }

  /**
   * Delete selected entities
   * Coordinates deletion across both managers
   */
  deleteSelected() {
    // Get selected entities and clear selection
    const entities = this.selectionManager.getAndClearSelected();
    
    if (entities.length === 0) return;
    
    // Remove from viewer
    entities.forEach(entity => {
      this.viewer.entities.remove(entity);
    });
    
    // Remove from snap data
    this.drawManager.removeFromSnapData(entities);
  }

  clearSelection() {
    this.selectionManager.clearSelection();
  }

  getSelectionCount(): number {
    return this.selectionManager.getSelectionCount();
  }

  getSelectedEntities(): Entity[] {
    return this.selectionManager.getSelectedEntities();
  }

  // === Callbacks for UI ===
  
  /**
   * Set callback for selection mode changes
   */
  onSelectionModeChanged(callback: (mode: SelectionMode | null) => void) {
    this.selectionManager.onModeChanged = callback;
  }

  /**
   * Set callback for selection changes
   */
  onSelectionChanged(callback: () => void) {
    // Listen to selectionChanged custom event
    window.addEventListener('selectionChanged', callback as EventListener);
  }
}
