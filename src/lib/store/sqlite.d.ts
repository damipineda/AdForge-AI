/** Shim mínimo para `node:sqlite` (runtime Node ≥ 22; @types/node@20 no lo declara). */
declare module "node:sqlite" {
  export interface StatementSync {
    get(...params: unknown[]): Record<string, unknown> | undefined;
    all(...params: unknown[]): Record<string, unknown>[];
    run(...params: unknown[]): { changes: number | bigint; lastInsertRowid: number | bigint };
  }
  export class DatabaseSync {
    constructor(path?: string);
    exec(sql: string): void;
    prepare(sql: string): StatementSync;
    close(): void;
  }
}
