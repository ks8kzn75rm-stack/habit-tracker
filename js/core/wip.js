/**
 * Limiting work in progress: at most three projects are active at once.
 * Everything else waits in the parking lot until there's room.
 */
export const ACTIVE_LIMIT = 3;

export const isOpen = (project) => !project.completedDay;
export const isActive = (project) => isOpen(project) && project.status !== 'parked';
export const isParked = (project) => isOpen(project) && project.status === 'parked';

const byOrder = (a, b) => (a.order ?? 0) - (b.order ?? 0) || (a.createdAt ?? 0) - (b.createdAt ?? 0);

export function activeProjects(projects) {
  return projects.filter(isActive).sort(byOrder);
}

export function parkedProjects(projects) {
  return projects.filter(isParked).sort(byOrder);
}

/** Whether project `id` (or a new project, if id is omitted) can be made active. */
export function canActivate(projects, id = null) {
  return activeProjects(projects).filter((p) => p.id !== id).length < ACTIVE_LIMIT;
}

/** New projects start active while there's room, otherwise in the parking lot. */
export function statusForNewProject(projects) {
  return canActivate(projects) ? 'active' : 'parked';
}
