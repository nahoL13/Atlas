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

  /**
   * Julga um caminho já canônico (ex.: o `realpath` que uma porta de IO
   * ancorou num file descriptor) contra as raízes já resolvidas na criação
   * do serviço. Puro e síncrono, sem IO, sem re-resolver caminho — usado
   * pelo fecho atômico de TOCTOU (SPEC-0017/ADR-0014) como veredicto de
   * contenção aplicado no instante do uso, não como (re)decisão de pré-check.
   * Roteia por access: 'read' contra readRoots; 'write'/'delete' contra
   * writeRoots.
   */
  isContained(canonicalPath: string, access: AccessMode): boolean;
}
