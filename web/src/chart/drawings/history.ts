// Undo/redo stack of drawing-list snapshots (pure). Every committed change records the list as
// it was before; snapshots are immutable arrays, so recording is cheap.

export class History<T> {
  private undoStack: { state: T; key?: string }[] = [];
  private redoStack: T[] = [];

  constructor(readonly limit = 100) {}

  /**
   * Records `before` as an undo step. With `mergeKey` equal to the previous step's key the step
   * is merged (live-preview edits of one settings session become one step).
   */
  record(before: T, mergeKey?: string): void {
    const top = this.undoStack[this.undoStack.length - 1];
    this.redoStack = [];
    if (mergeKey !== undefined && top?.key === mergeKey) return;
    this.undoStack.push({ state: before, key: mergeKey });
    if (this.undoStack.length > this.limit) this.undoStack.splice(0, this.undoStack.length - this.limit);
  }

  /** Returns the state to restore, or null. `current` becomes the redo step. */
  undo(current: T): T | null {
    const step = this.undoStack.pop();
    if (!step) return null;
    this.redoStack.push(current);
    return step.state;
  }

  redo(current: T): T | null {
    const next = this.redoStack.pop();
    if (next === undefined) return null;
    this.undoStack.push({ state: current });
    return next;
  }

  /** Ends a merge run so the next edit with the same key is a new step. */
  seal(): void {
    const top = this.undoStack[this.undoStack.length - 1];
    if (top) top.key = undefined;
  }

  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  get size(): number {
    return this.undoStack.length;
  }

  clear(): void {
    this.undoStack = [];
    this.redoStack = [];
  }
}
