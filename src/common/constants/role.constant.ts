export const ROLE = {
    ADMIN: 'admin',
    USER: 'user',
    GUEST: 'guest',
} as const;

export type Role = typeof ROLE[keyof typeof ROLE];

export const ROLE_LIST = Object.values(ROLE);