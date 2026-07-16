export type ResourceType = 'file' | 'directory';

export interface ResourceRef {
  readonly type: ResourceType;
  readonly path: string;
}

/** 'read' e 'write' são ambos produzidos: 'read' contra readRoots, 'write' contra writeRoots. */
export type AccessMode = 'read' | 'write';

export interface ActionRequest {
  readonly resource: ResourceRef;
  readonly access: AccessMode;
}

/**
 * Vocabulário dos 4 do Module Catalog. Nesta fatia o serviço só produz
 * 'allowed'/'blocked'; 'free' = ausência de requirement (o Runtime nem
 * consulta o serviço); 'confirm' é reservado ao fluxo interativo futuro.
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
