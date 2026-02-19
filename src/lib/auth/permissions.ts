'use server';

import { getSession } from '@/lib/auth/session';
import { getSalesAgentByUsername } from '@/app/actions/sales_agents';

/**
 * Check if the current user (admin or sales agent) has access to a specific permission
 * Admins always have access, sales agents need the specific permission
 */
export async function hasPermission(requiredPermission: string): Promise<boolean> {
  try {
    const session = await getSession();
    
    if (!session) {
      return false;
    }

    // Admins always have access
    if (session.role === 'admin') {
      return true;
    }

    // For sales agents, check if they have the required permission
    if (session.role === 'sales_agent') {
      const result = await getSalesAgentByUsername(session.username);
      
      if (result && 'salesAgent' in result && result.salesAgent) {
        const permissions = result.salesAgent.permissions;
        
        if (Array.isArray(permissions)) {
          return permissions.includes(requiredPermission);
        }
      }
    }

    return false;
  } catch {
    return false;
  }
}

/**
 * Check if the current user is an admin or has a specific permission
 * This is a convenience function that combines role check and permission check
 */
export async function isAuthorized(requiredPermission?: string): Promise<boolean> {
  const session = await getSession();
  
  if (!session) {
    return false;
  }

  // Admins always have access
  if (session.role === 'admin') {
    return true;
  }

  // If no specific permission required, only admins are authorized
  if (!requiredPermission) {
    return false;
  }

  // For sales agents, check permission
  if (session.role === 'sales_agent') {
    return await hasPermission(requiredPermission);
  }

  return false;
}
