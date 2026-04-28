/// <reference types="astro/client" />
/// <reference types="@cloudflare/workers-types" />

declare module 'cloudflare:workers' {
  interface Env {
    DB: D1Database;
    CLARITY_ID?: string;
    SESSION_SECRET: string;
    PINTEREST_APP_ID: string;
    PINTEREST_APP_SECRET: string;
  }
  export const env: Env;
}

declare namespace App {
  interface Locals {
    tenant: import('./lib/db').Tenant;
    sc: string | null;
    cfContext: ExecutionContext;
    user: { id: number; tenantId: number } | null;
  }
}
