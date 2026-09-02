export type Role = "owner" | "admin";

export interface Account {
  id: string;
  name: string;
  email: string;
  role: Role;
  demo: boolean;
}

export interface Vehicle {
  id: string;
  name: string;
  plate: string;
  connector: "CCS2" | "Type 2";
  capacity: number;
  battery: number;
  isDefault: boolean;
}

export interface Station {
  id: string;
  name: string;
  address: string;
  landmark: string;
  lat: number;
  lng: number;
  distance: number;
  price: number;
  solar: number;
  power: number;
  available: number;
  bays: number;
  online: boolean;
  connector: "CCS2" | "Type 2";
  battery: number;
  amenities: string[];
  image: string;
  deviceId: string;
  enabledBayIds?: string[];
  openingHours?: string;
  maintenance?: boolean;
  pricing?: PricingRule;
}

export type BookingStatus = "upcoming" | "charging" | "completed" | "cancelled";

export interface Booking {
  id: string;
  stationId: string;
  vehicleId: string;
  start: string;
  duration: number;
  bayId: string;
  status: BookingStatus;
  estimate: number;
  advance: number;
  fee: number;
  discount: number;
  paymentId: string;
  createdAt: string;
  ownerId?: string;
  approved?: boolean;
  unitPrice?: number;
  cancellationFee?: number;
  discountRate?: number;
}

export type ChargingStatus = "waiting" | "car-detected" | "starting" | "charging" | "paused" | "completed" | "offline" | "fault";

export interface Session {
  id: string;
  bookingId: string;
  stationId: string;
  vehicleId: string;
  status: ChargingStatus;
  battery: number;
  initialBattery: number;
  energy: number;
  elapsed: number;
  power: number;
  solar: number;
  updatedAt: string;
  createdAt: string;
  bayId?: string;
  deviceId?: string;
  commandId?: string;
  energyWh?: number;
  completedAt?: string;
  stopReason?: string;
  targetBattery?: number;
  finalCost?: number;
  points: {
    minute: number;
    power: number;
  }[];
}

export interface Payment {
  id: string;
  bookingId: string;
  amount: number;
  method: string;
  kind: "payment" | "refund";
  status: "succeeded" | "refunded";
  createdAt: string;
  description: string;
}

export interface OwnerData {
  profile: {
    name: string;
    phone: string;
    city: string;
  };
  vehicles: Vehicle[];
  selectedVehicleId: string;
  bookings: Booking[];
  sessions: Session[];
  payments: Payment[];
  savedStations: string[];
  notificationsRead: boolean;
  preferences: {
    booking: boolean;
    charging: boolean;
    offers: boolean;
  };
}

export interface BookingInput {
  stationId: string;
  vehicleId: string;
  start: string;
  duration: number;
  method: string;
  promo: string;
  requestId: string;
}

export type ChargingSession = Session;
export interface Bay {
  id: string;
  stationId: string;
  deviceId: string;
  enabled: boolean;
  blocked: boolean;
  maintenance: boolean;
}
export type CommandName = "START" | "STOP" | "PAUSE" | "EMERGENCY_STOP" | "RESTART" | "TEST";
export type CommandStatus = "pending" | "acknowledged" | "failed" | "timed-out";
export interface DeviceCommand {
  commandId: string;
  command: CommandName;
  sessionId?: string;
  stationId: string;
  bayId: string;
  deviceId: string;
  maximumMinutes: number;
  issuedAt: string;
  expiresAt: string;
  status: CommandStatus;
  actorId: string;
  override: boolean;
  outcome: "success" | "failure" | "timeout";
}
export interface CommandAcknowledgement {
  commandId: string;
  deviceId: string;
  success: boolean;
  state: string;
  message: string;
  receivedAt: string;
}
export interface Telemetry {
  deviceId: string;
  bayId: string;
  online: boolean;
  occupied: boolean;
  charging: boolean;
  solarVoltage: number | null;
  solarCurrent: number | null;
  solarPower: number | null;
  carBatteryVoltage: number | null;
  carBatteryPercent: number | null;
  chargingCurrent: number | null;
  chargingPower: number | null;
  energyWh: number;
  stationBatteryPercent: number;
  source: "SOLAR" | "STORAGE" | "GRID" | "EXPORT";
  timestamp: string;
  simulated: boolean;
}
export interface Device {
  id: string;
  stationId: string;
  bayId: string;
  online: boolean;
  vehicleDetected: boolean;
  mosfetOn: boolean;
  firmware: string;
  lastSeen: string;
  stationBattery: number;
  solarPower: number;
  gridBackup: boolean;
  gridExport: boolean;
  sensorFault: boolean;
  testMode: boolean;
  commandOutcome: "success" | "failure" | "timeout";
  telemetry?: Telemetry;
  timeline: Telemetry[];
}
export interface Fault {
  id: string;
  stationId: string;
  deviceId: string;
  severity: "warning" | "critical";
  code: "SENSOR" | "OFFLINE" | "EMERGENCY" | "LOW_BATTERY" | "MAINTENANCE";
  message: string;
  status: "open" | "acknowledged" | "resolved";
  createdAt: string;
  updatedAt: string;
}
export interface MaintenanceRecord {
  id: string;
  stationId: string;
  deviceId: string;
  faultId?: string;
  note: string;
  actorId: string;
  createdAt: string;
}
export interface AuditLog {
  id: string;
  actorId: string;
  action: string;
  targetId: string;
  detail: string;
  createdAt: string;
}
export interface Refund {
  id: string;
  paymentId: string;
  bookingId: string;
  ownerId: string;
  amount: number;
  status: "pending" | "approved" | "succeeded";
  reason: string;
  createdAt: string;
}
export interface PricingRule {
  pricePerKwh: number;
  bookingFee: number;
  cancellationFee: number;
  peakMultiplier: number;
  demoScalingFactor: number;
  promoPercent: number;
  taperFactor: number;
  targetBattery: number;
}
export interface NetworkData {
  stations: Station[];
  bays: Bay[];
  devices: Device[];
  commands: DeviceCommand[];
  acknowledgements: CommandAcknowledgement[];
  faults: Fault[];
  maintenance: MaintenanceRecord[];
  audit: AuditLog[];
  refunds: Refund[];
  pricing: PricingRule;
  previousPricing: PricingRule | null;
  demoSpeed: 1 | 10 | 60;
  lastTick: string;
  solarWh: number;
  gridWh: number;
  exportWh: number;
  energyHistory: { timestamp: string; solarWh: number; gridWh: number; exportWh: number }[];
}
export interface PlatformSnapshot { network: NetworkData; owners: Record<string, OwnerData> }
