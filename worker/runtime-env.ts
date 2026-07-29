export type SiteRuntimeEnv = {
  DB?: D1Database;
  INVENTORY_PHOTOS?: R2Bucket;
};

let runtimeEnv: SiteRuntimeEnv = {};

export function setSiteRuntimeEnv(env: SiteRuntimeEnv) {
  runtimeEnv = env;
}

export function getSiteRuntimeEnv() {
  return runtimeEnv;
}
