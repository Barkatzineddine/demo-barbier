// The persisted state, described once with Zod: the types come from the schema and every load
// from localStorage is checked against it (types, lengths, formats, known ids).
// zod/mini is the tree-shakable build: same validation, a fraction of the bundle.
import * as z from 'zod/mini';
import { BARBER_IDS, SERVICE_IDS } from './catalog';

// The strict CSP forbids eval, so Zod must not try its compiled fast path (it would log a violation).
z.config({ jitless: true });

const day = z.string().check(z.regex(/^\d{4}-\d{2}-\d{2}$/));
const text = (max: number) => z.string().check(z.maxLength(max));
const hex = (length: number) => z.string().check(z.regex(new RegExp(`^[0-9a-f]{${length}}$`)));

export const BOOKING_STATUSES = ['confirmed', 'done', 'no-show', 'cancelled'] as const;

export const bookingSchema = z.object({
  id: text(20),
  code: z.string().check(z.regex(/^MC-[A-Z2-9]{5}$/)),
  service: z.enum(SERVICE_IDS),
  barber: z.enum(BARBER_IDS),
  date: day,
  start: z.int().check(z.gte(0), z.lte(24 * 60)),
  status: z.enum(BOOKING_STATUSES),
  name: text(60),
  phone: text(20),
  email: text(254),
  note: text(300),
  source: z.enum(['online', 'phone']),
  created: text(40),
  clientId: z.optional(text(20)),
});

export const messageSchema = z.object({
  id: text(20), name: text(60), email: text(254), subject: text(60), message: text(1000), read: z.boolean(), at: text(40),
});

export const closureSchema = z.object({ date: day, reason: text(80) });

export const clientSchema = z.object({
  id: text(20), name: text(60), email: text(254), phone: text(20), salt: hex(32), hash: hex(64), created: text(40),
});

export const stateSchema = z.object({
  v: z.literal(2),
  bookings: z.array(bookingSchema).check(z.maxLength(5000)),
  messages: z.array(messageSchema).check(z.maxLength(500)),
  closures: z.array(closureSchema).check(z.maxLength(366)),
  clients: z.array(clientSchema).check(z.maxLength(1000)),
});

export type Booking = z.infer<typeof bookingSchema>;
export type BookingStatus = (typeof BOOKING_STATUSES)[number];
export type Message = z.infer<typeof messageSchema>;
export type Closure = z.infer<typeof closureSchema>;
export type Client = z.infer<typeof clientSchema>;
export type State = z.infer<typeof stateSchema>;
