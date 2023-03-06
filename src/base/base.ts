

export interface IBase {
  processResourceRequests(): void;

  run(): void;

  cleanUp(): void;
}