export const RESTAURANT_ROLE = {
    OWNER: 'owner',
    MANAGER: 'manager',
    CASHIER: 'cashier',
    CLEANER: 'cleaner',
    WAITER: 'waiter',
    KITCHEN: 'kitchen',
} as const;

export type RestaurantRole = typeof RESTAURANT_ROLE[keyof typeof RESTAURANT_ROLE];

export const RESTAURANT_ROLE_LIST = Object.values(RESTAURANT_ROLE);