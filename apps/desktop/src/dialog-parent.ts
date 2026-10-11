import type { DialogOptions, ShowMessageBox, ShowMessageBoxResult } from './confirm-port.js';

export interface ParentWindowLike {
  isDestroyed(): boolean;
  isVisible(): boolean;
  isMinimized(): boolean;
  isFocused(): boolean;
}

export interface ParentedDialogDeps<W extends ParentWindowLike> {
  isParentingAllowed: () => boolean;
  listWindows: () => readonly (W | null | undefined)[];
  showWithParent: (parent: W, options: DialogOptions) => Promise<ShowMessageBoxResult>;
  showWithoutParent: (options: DialogOptions) => Promise<ShowMessageBoxResult>;
}

export function selectDialogParent<W extends ParentWindowLike>(
  windows: readonly (W | null | undefined)[] | null | undefined,
): W | undefined {
  for (const candidate of windows ?? []) {
    if (candidate === null || candidate === undefined) continue;
    try {
      if (
        !candidate.isDestroyed() &&
        candidate.isVisible() &&
        !candidate.isMinimized() &&
        candidate.isFocused()
      ) {
        return candidate;
      }
    } catch {
      // Uma janela pode ser destruída entre a enumeração e a inspeção.
    }
  }
  return undefined;
}

export function createParentedShowMessageBox<W extends ParentWindowLike>(
  deps: ParentedDialogDeps<W>,
): ShowMessageBox {
  return (options) => {
    let parent: W | undefined;
    try {
      if (deps.isParentingAllowed()) {
        parent = selectDialogParent(deps.listWindows());
      }
    } catch {
      parent = undefined;
    }
    return parent === undefined
      ? deps.showWithoutParent(options)
      : deps.showWithParent(parent, options);
  };
}
