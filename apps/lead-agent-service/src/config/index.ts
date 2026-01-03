/**
 * Environment configuration
 */
export const config = {
  port: parseInt(process.env.PORT || "3000", 10),
  
  // Supabase
  supabaseUrl: process.env.SUPABASE_URL || "",
  supabaseServiceKey: process.env.SUPABASE_SERVICE_KEY || "",
  
  // Legacy (can remove later)
  databaseUrl: process.env.DATABASE_URL || "",
  
  logLevel: process.env.LOG_LEVEL || "info",
  nodeEnv: process.env.NODE_ENV || "development"
};

