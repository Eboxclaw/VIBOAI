const requiredVars = ["VITE_CLOUDFLARE_WORKER_URL"] as const;

type RequiredVar = (typeof requiredVars)[number];

function getEnvVar(key: RequiredVar): string {
  const value = import.meta.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

export const env = {
  cloudflareWorkerUrl: getEnvVar("VITE_CLOUDFLARE_WORKER_URL"),
};
