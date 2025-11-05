export enum Role {
  USER = 'user', 
  CUSTOMER = 'customer',
  ADMIN = 'admin',
}

export const RolesArray = Object.values(Role);

export enum RestaurantRole {
  OWNER = 'owner',
  MANAGER = 'manager',
  STAFF = 'staff',
  DELIVERY = 'delivery',
  KITCHEN = 'kitchen',
  SERVER = 'server',
}

export const RestaurantRolesArray = Object.values(RestaurantRole); 