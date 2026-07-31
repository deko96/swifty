import type { User } from '../../db/schema';

export interface UserResponse {
  id: string;
  email: string;
  username: string;
  role: User['role'];
  createdAt: string;
}

export function toUserResponse(user: User): UserResponse {
  return {
    id: user.id,
    email: user.email,
    username: user.username,
    role: user.role,
    createdAt: user.createdAt.toISOString(),
  };
}
