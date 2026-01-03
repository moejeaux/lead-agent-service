import { Request, Response, NextFunction } from "express";
import { Tenant, TenantScoringConfig } from "../types/universal";
import { getTenantByApiKey, getTenantScoringConfig, getDefaultScoringConfig } from "../db/tenants";
import { isSupabaseConfigured } from "../db/supabase";

// Extend Express Request to include tenant context
declare global {
  namespace Express {
    interface Request {
      tenant?: Tenant;
      tenantConfig?: TenantScoringConfig;
    }
  }
}

// Default tenant for when Supabase isn't configured (dev mode)
const DEFAULT_TENANT: Tenant = {
  id: "00000000-0000-0000-0000-000000000000",
  name: "Default Tenant",
  api_key: "dev-api-key",
  source_crm: "api",
  is_active: true,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

/**
 * Middleware to authenticate tenant via API key
 * Looks for key in: X-API-Key header, Authorization Bearer, or ?api_key query param
 */
export async function tenantAuth(req: Request, res: Response, next: NextFunction) {
  try {
    // Extract API key from various sources
    const apiKey = extractApiKey(req);
    
    // If Supabase not configured, use default tenant (dev mode)
    if (!isSupabaseConfigured()) {
      console.log(`[tenantAuth] Supabase not configured, using default tenant`);
      req.tenant = DEFAULT_TENANT;
      req.tenantConfig = getDefaultScoringConfig() as TenantScoringConfig;
      return next();
    }
    
    // Require API key when Supabase is configured
    if (!apiKey) {
      return res.status(401).json({
        error: "Missing API key. Provide via X-API-Key header, Authorization Bearer, or api_key query param"
      });
    }
    
    // Look up tenant
    const tenant = await getTenantByApiKey(apiKey);
    
    if (!tenant) {
      return res.status(401).json({ error: "Invalid API key" });
    }
    
    if (!tenant.is_active) {
      return res.status(403).json({ error: "Tenant account is inactive" });
    }
    
    // Load tenant scoring config (or use defaults)
    const config = await getTenantScoringConfig(tenant.id);
    
    req.tenant = tenant;
    req.tenantConfig = config ?? (getDefaultScoringConfig() as TenantScoringConfig);
    
    console.log(`[tenantAuth] Authenticated tenant: ${tenant.name} (${tenant.id})`);
    
    next();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Auth error";
    console.error(`[tenantAuth] Error:`, message);
    return res.status(500).json({ error: message });
  }
}

/**
 * Extract API key from request
 */
function extractApiKey(req: Request): string | null {
  // 1. X-API-Key header
  const headerKey = req.headers["x-api-key"];
  if (typeof headerKey === "string" && headerKey) {
    return headerKey;
  }
  
  // 2. Authorization: Bearer <key>
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith("Bearer ")) {
    return authHeader.slice(7);
  }
  
  // 3. Query param
  const queryKey = req.query.api_key;
  if (typeof queryKey === "string" && queryKey) {
    return queryKey;
  }
  
  return null;
}

/**
 * Optional auth - doesn't fail if no key provided, just uses defaults
 */
export async function optionalTenantAuth(req: Request, res: Response, next: NextFunction) {
  try {
    const apiKey = extractApiKey(req);
    
    if (!isSupabaseConfigured() || !apiKey) {
      req.tenant = DEFAULT_TENANT;
      req.tenantConfig = getDefaultScoringConfig() as TenantScoringConfig;
      return next();
    }
    
    const tenant = await getTenantByApiKey(apiKey);
    
    if (tenant && tenant.is_active) {
      const config = await getTenantScoringConfig(tenant.id);
      req.tenant = tenant;
      req.tenantConfig = config ?? (getDefaultScoringConfig() as TenantScoringConfig);
    } else {
      req.tenant = DEFAULT_TENANT;
      req.tenantConfig = getDefaultScoringConfig() as TenantScoringConfig;
    }
    
    next();
  } catch (error) {
    req.tenant = DEFAULT_TENANT;
    req.tenantConfig = getDefaultScoringConfig() as TenantScoringConfig;
    next();
  }
}

