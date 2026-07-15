// auth module — public interface. Other modules and src/app import ONLY from here.
export { authService } from './service';
export type { AuthContext, PublicUser } from './domain';
export { isOrgMember, UpdateProfileInput, AssignOfficerCountryInput, CreateUserInput, ASSIGNABLE_ROLES } from './domain';

