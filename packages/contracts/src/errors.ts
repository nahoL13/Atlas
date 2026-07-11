import type { LifecycleState } from './platform.js';

export class AtlasError extends Error {
  readonly code: string;

  constructor(code: string, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = new.target.name;
    this.code = code;
  }
}

export class InvalidConfigError extends AtlasError {
  readonly issues: readonly string[];

  constructor(issues: readonly string[]) {
    super('ATLAS_INVALID_CONFIG', `Configuração inválida: ${issues.join('; ')}`);
    this.issues = issues;
  }
}

export class LifecycleError extends AtlasError {
  readonly from: LifecycleState;
  readonly to: LifecycleState;

  constructor(from: LifecycleState, to: LifecycleState) {
    super('ATLAS_INVALID_TRANSITION', `Transição de lifecycle inválida: ${from} → ${to}`);
    this.from = from;
    this.to = to;
  }
}
