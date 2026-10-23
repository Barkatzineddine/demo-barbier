// What the shop sells and who works when. Names and descriptions live in the i18n dictionaries.
export const SERVICE_IDS = ['coupe', 'coupe-barbe', 'degrade', 'barbe', 'rasage', 'enfant', 'soin', 'mariage'] as const;
export type ServiceId = (typeof SERVICE_IDS)[number];
export interface Service { id: ServiceId; minutes: number; price: number }

export const SERVICES: readonly Service[] = [
  { id: 'coupe', minutes: 30, price: 28 },
  { id: 'coupe-barbe', minutes: 50, price: 42 },
  { id: 'degrade', minutes: 40, price: 32 },
  { id: 'barbe', minutes: 25, price: 20 },
  { id: 'rasage', minutes: 40, price: 32 },
  { id: 'enfant', minutes: 25, price: 18 },
  { id: 'soin', minutes: 20, price: 22 },
  { id: 'mariage', minutes: 90, price: 85 },
];

export const BARBER_IDS = ['karim', 'theo', 'ines'] as const;
export type BarberId = (typeof BARBER_IDS)[number];
/** days: 0 = Sunday … 6 = Saturday; pause in minutes since midnight. */
export interface Barber { id: BarberId; name: string; days: readonly number[]; pause: readonly [number, number] }

export const BARBERS: readonly Barber[] = [
  { id: 'karim', name: 'Karim', days: [2, 3, 4, 5, 6], pause: [780, 825] },
  { id: 'theo', name: 'Théo', days: [3, 4, 5, 6], pause: [810, 855] },
  { id: 'ines', name: 'Inès', days: [2, 4, 5, 6], pause: [765, 810] },
];

/** Opening hours per weekday; null = closed. Thursday is a late opening. */
export const HOURS: Readonly<Record<number, readonly [number, number] | null>> = {
  0: null, 1: null, 2: [600, 1170], 3: [600, 1170], 4: [600, 1260], 5: [600, 1170], 6: [540, 1080],
};

export const STEP = 15;
export const LEAD_MINUTES = 30;
export const CANCEL_LIMIT_MINUTES = 120;
export const BOOKING_WINDOW_DAYS = 28;
export const MAX_UPCOMING_PER_PHONE = 2;

export const service = (id: ServiceId): Service => SERVICES.find((s) => s.id === id) as Service;
export const barber = (id: BarberId): Barber => BARBERS.find((b) => b.id === id) as Barber;

/** Staff accounts. Passwords are only stored as PBKDF2-SHA256 hashes (100 000 iterations). */
export type StaffRole = 'manager' | 'barber';
export interface StaffAccount { id: string; name: string; role: StaffRole; barber: BarberId; email: string; salt: string; hash: string }

export const STAFF: readonly StaffAccount[] = [
  { id: 'staff-karim', name: 'Karim', role: 'manager', barber: 'karim', email: 'gerant@maison-corbin.example',
    salt: '3a5dc65d6b80443483c32cdf93c97257', hash: '3bdebac60214e3ac0db7e0ffd2e27cb44bbddc1dbded203956c0881d28d9e28c' },
  { id: 'staff-theo', name: 'Théo', role: 'barber', barber: 'theo', email: 'theo@maison-corbin.example',
    salt: '345d5f8f83d664d81760c824f8a8fb20', hash: '9f8f71bf62fcc6ebecff8e5f04ea245b1707c529f67fdb0148d19f3d33ff8dd5' },
];

/** Public demo credentials, printed on the staff login page so visitors can try both roles. */
export const DEMO_LOGINS: readonly { role: StaffRole; email: string; password: string }[] = [
  { role: 'manager', email: 'gerant@maison-corbin.example', password: 'corbin-gerant' },
  { role: 'barber', email: 'theo@maison-corbin.example', password: 'corbin-theo' },
];
