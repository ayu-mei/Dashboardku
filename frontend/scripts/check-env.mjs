import { loadEnv } from "vite";
const env = { ...loadEnv("production", process.cwd(), ""), ...process.env };
if (
  !/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(env.VITE_SUPABASE_URL || "") ||
  !env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  !/^https:\/\//.test(env.VITE_API_BASE_URL || "")
)
  throw new Error(
    "Set VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY, and VITE_API_BASE_URL. See DEPLOY_NETLIFY.md.",
  );
const key = env.VITE_SUPABASE_PUBLISHABLE_KEY;
if (!key.startsWith("sb_publishable_")) {
  try {
    if (
      JSON.parse(Buffer.from(key.split(".")[1], "base64url").toString())
        .role !== "anon"
    )
      throw new Error();
  } catch {
    throw new Error(
      "Use a publishable or legacy anon key. Never put service_role/secret/database credentials in VITE variables.",
    );
  }
}
