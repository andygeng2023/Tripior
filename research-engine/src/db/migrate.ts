import fs from "node:fs/promises";
import path from "node:path";
import {pool} from "../db.js";
const sql=await fs.readFile(path.resolve(process.cwd(),"sql/001_initial.sql"),"utf8");
await pool.query(sql); await pool.end(); console.log("Tripior research schema migrated.");
