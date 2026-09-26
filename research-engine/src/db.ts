import pg from "pg";
const { Pool } = pg;
export const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 5 });
export async function q<T = any>(text: string, params: unknown[] = []) {
  const result = await pool.query<T>(text, params);
  return result.rows;
}
