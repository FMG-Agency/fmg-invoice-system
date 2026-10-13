export const CLIENT_ROLES = ['Client Owner', 'Client Marketing', 'Client Finance'] as const;
export function clientAccess(role = 'Client Portal') {
  // Existing portal logins retain their full account access.
  const owner = role === 'Client Portal' || role === 'Client Owner';
  return { owner, invoices: owner || role === 'Client Finance', plans: owner || role === 'Client Marketing', arrivals: owner || role === 'Client Marketing' };
}
