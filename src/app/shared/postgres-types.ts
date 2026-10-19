/** Minimal pg-compatible interfaces shared by independent repositories. */
export interface PostgresQueryResult<Row> {
  readonly rows: readonly Row[];
  readonly rowCount?: number | null;
}

export interface PostgresQueryable {
  query<Row = Record<string, unknown>>(sql: string, values?: readonly unknown[]): Promise<PostgresQueryResult<Row>>;
}

export interface PostgresPool extends PostgresQueryable {
  connect(): Promise<PostgresClient>;
}

export interface PostgresClient extends PostgresQueryable {
  release(error?: Error | boolean): void;
}
