/** Environment bindings for the Eternal Blocks Worker. */
export interface Env {
  /** Durable Object namespace binding (see wrangler.jsonc). */
  ETERNAL_WORLD: DurableObjectNamespace;
  /** Comma-separated allowed browser origins ('*' allows all - dev only). */
  ALLOWED_ORIGINS?: string;
  /** Bearer token guarding /export, /import and moderation endpoints. */
  ADMIN_TOKEN?: string;
  /** Optional seed string override; only honored on first world init. */
  SEED_STRING?: string;
  /** Durable Object instance name hosting the one canonical world. */
  WORLD_ID?: string;
}

export const DEFAULT_WORLD_ID = 'the-eternal-world';
