export type ResourceType = 'file' | 'directory';

export interface ResourceRef {
  readonly type: ResourceType;
  readonly path: string;
}

/** 'read' contra readRoots; 'write'/'delete' contra writeRoots ('delete' produz confirm, não allowed). */
export type AccessMode = 'read' | 'write' | 'delete';

export interface ActionRequest {
  readonly resource: ResourceRef;
  readonly access: AccessMode;
}

/**
 * Vocabulário dos 4 do Module Catalog. O serviço produz 'allowed'/'blocked'
 * (read/write) e 'confirm' (delete, SPEC-0013); 'free' = ausência de
 * requirement (o Runtime nem consulta o serviço).
 */
export type PermissionVerdict = 'free' | 'allowed' | 'confirm' | 'blocked';

export interface PermissionDecision {
  readonly verdict: PermissionVerdict;
  readonly reason?: string;
}

export interface PermissionService {
  /** Puro e síncrono, sem IO. */
  evaluate(action: ActionRequest): PermissionDecision;
}
