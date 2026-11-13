import { loadEnvConfig } from "@next/env";
import path from "node:path";
import type { NextConfig } from "next";

// One .env for the whole project: load the secrets from the repository root
// (login keys and AUTH_SECRET are shared with the Python API).
// forceReload: Next has already loaded env for frontend/ once and would
// otherwise return that cached result and ignore the root .env.
loadEnvConfig(path.resolve(process.cwd(), ".."), process.env.NODE_ENV !== "production", console, true);

// A separate output folder lets a production build run while the dev server
// (which owns .next) is still running.
const nextConfig: NextConfig = { distDir: process.env.NEXT_DIST_DIR || ".next" };

export default nextConfig;
