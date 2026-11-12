import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm";
import { SUPABASE_URL, SUPABASE_KEY } from "./config.js";

const configured = SUPABASE_URL.startsWith("https://") && SUPABASE_KEY.length > 20;

export const supabase = configured ? createClient(SUPABASE_URL, SUPABASE_KEY) : null;
