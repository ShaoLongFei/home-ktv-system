export interface QueryResult<TRow> {
  rows: TRow[];
}

export interface QueryExecutor {
  query<TRow>(text: string, values?: readonly unknown[]): Promise<QueryResult<TRow>>;
}
