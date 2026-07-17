import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Raiz do hub: pasta que contém package.json e scripts/ (pai de scripts/lib). */
export const ROOT = path.resolve(__dirname, "../..");
