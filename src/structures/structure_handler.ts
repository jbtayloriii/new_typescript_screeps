

export interface StructureHandler<T extends Structure> {
  getStructure(): T;

  execute(): void;
}