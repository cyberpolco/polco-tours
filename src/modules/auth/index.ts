// auth module — public interface. Other modules import ONLY from here.
export { authService } from './service';
export type { AuthContext, PublicUser } from './domain';
export { isOrgMember } from './domain';
