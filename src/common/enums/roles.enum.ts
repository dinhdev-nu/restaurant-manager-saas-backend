export enum Role {
  USER = 'user', 
  CUSTOMER = 'customer',
  ADMIN = 'admin',
}

export const RolesArray = Object.values(Role);

export enum RestaurantRole {
  OWNER = 'owner',
  MANAGER = 'manager',
  CASHIER = 'cashier',
  CLEANER = 'cleaner',
  WAITER = 'waiter',
  KITCHEN = 'kitchen',
}

export const RestaurantRolesArray = Object.values(RestaurantRole); 

export enum RestaurantRoleDisplay {
  OWNER = 'Chủ nhà hàng',
  MANAGER = 'Quản lý',
  CASHIER = 'Thu ngân',
  CLEANER = 'Nhân viên vệ sinh',
  WAITER = 'Phục vụ',
  KITCHEN = 'Nhân viên bếp',
}
