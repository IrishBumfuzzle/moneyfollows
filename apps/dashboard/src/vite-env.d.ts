/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
  /** The student app's URL; the join QR code opens <this>/?code=<CLASS_CODE>. */
  readonly VITE_STUDENT_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
