declare namespace Cloudflare {
  interface Env {
    ADMIN_EMAILS?: string;
    DB?: D1Database;
    BUCKET?: R2Bucket;
  }
}
