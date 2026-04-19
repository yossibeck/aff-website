/// <reference types="astro/client" />
/// <reference types="@cloudflare/workers-types" />

declare module 'cloudflare:workers' {
  interface Env {
    DB: D1Database;
  }
  export const env: Env;
}

declare namespace App {
  interface Locals {
    tenant: import('./lib/db').Tenant;
    runtime: {
      cf?: Request['cf'];
      ctx: ExecutionContext;
    };
  }
}
