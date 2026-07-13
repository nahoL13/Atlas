export interface CognitiveCore {
  ask(objective: string): Promise<string>;
}
