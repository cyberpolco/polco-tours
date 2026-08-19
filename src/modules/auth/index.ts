// auth module — public interface. Other modules and src/app import ONLY from here.
export { authService } from './service';
export type { AuthContext, PublicUser, StaffRosterSummary } from './domain';
export {
  isOrgMember,
  isSuperAdmin,
  UpdateProfileInput,
  CreateUserInput,
  UpdateUserInput,
  SetRolePermissionInput,
  ASSIGNABLE_ROLES,
} from './domain';

