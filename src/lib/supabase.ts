import { createClient } from "@supabase/supabase-js";

// Browser client. Uses the publishable key only: every table is protected by row level security,
// so what a person can read or change depends on their login and role.
export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
);
