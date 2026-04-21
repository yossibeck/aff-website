/// <reference types="astro/client" />
/// <reference types="@cloudflare/workers-types" />

declare module 'cloudflare:workers' {
  interface Env {
    DB: D1Database;
    CLARITY_ID?: string;
  }
  export const env: Env;
}

declare namespace App {
  interface Locals {
    tenant: import('./lib/db').Tenant;
    sc: string | null;
    runtime: {
      cf?: Request['cf'];
      ctx: ExecutionContext;
    };
  }
}
