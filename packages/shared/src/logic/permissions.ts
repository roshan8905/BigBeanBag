export const canControlPlayback = (role: 'OWNER' | 'HOST' | 'MEMBER' | null | undefined) =>
  role === 'OWNER' || role === 'HOST';

export const canModerate = (
  actor: 'OWNER' | 'HOST' | 'MEMBER' | null | undefined,
  target: 'OWNER' | 'HOST' | 'MEMBER' | null | undefined,
) => {
  if (!actor || !target) return false;
  if (target === 'OWNER') return false;
  if (actor === 'OWNER') return true;
  if (actor === 'HOST') return target === 'MEMBER';
  return false;
};

export const canManageRoles = (actor: 'OWNER' | 'HOST' | 'MEMBER' | null | undefined) =>
  actor === 'OWNER';

export const canManageRoom = (actor: 'OWNER' | 'HOST' | 'MEMBER' | null | undefined) =>
  actor === 'OWNER';

export const canRemoveFromQueue = (actor: 'OWNER' | 'HOST' | 'MEMBER' | null | undefined) =>
  actor === 'OWNER' || actor === 'HOST';
