import { createBrowserClient } from "@supabase/ssr";

const supabase = createBrowserClient("https://x.supabase.co", "key");

supabase.auth.getSession().then((result) => {
  const check: string = result;
});
