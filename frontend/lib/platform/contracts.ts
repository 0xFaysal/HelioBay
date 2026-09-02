import type { z } from "zod";
import type { realtimeSchema } from "./schemas";
import type { Bay, Booking, BookingInput, CommandName, Device, DeviceCommand, Fault, NetworkData, OwnerData, PlatformSnapshot, PricingRule, Session, Station, Telemetry } from "@/types";

export interface StationService { list(signal?: AbortSignal): Promise<Station[]>; get(id: string): Station | undefined }
export interface BookingService { reserve(input: BookingInput): Promise<Booking>; cancel(id: string): Promise<number> }
export interface ChargingService { enter(bookingId: string): Promise<Session>; command(id: string, command: CommandName, override?: boolean): Promise<DeviceCommand>; presence(id: string, present: boolean): Promise<void> }
export interface PaymentService { simulate(input: BookingInput): Promise<Booking>; approveRefund(id: string): Promise<void> }
export interface DeviceService {
  command(deviceId: string, command: CommandName, sessionId?: string, override?: boolean): Promise<DeviceCommand>;
  configure(id: string, patch: Partial<Pick<Device, "online" | "vehicleDetected" | "stationBattery" | "solarPower" | "gridBackup" | "gridExport" | "sensorFault" | "commandOutcome">>): Promise<void>;
}
export interface TelemetryService { get(stationId: string, signal?: AbortSignal): Promise<Telemetry[]> }
export interface AdminService {
  refresh(signal?: AbortSignal): Promise<void>;
  saveStation(station: Station): Promise<void>;
  updateBay(stationId: string, id: string, patch: Partial<Bay>): Promise<void>;
  updateBooking(id: string, patch: { approved?: boolean; bayId?: string; cancel?: boolean }): Promise<void>;
  updateFault(id: string, status: Fault["status"], note: string): Promise<void>;
  addMaintenance(deviceId: string, note: string): Promise<void>;
  savePricing(pricing: PricingRule): Promise<void>;
  rollbackPricing(): Promise<void>;
  setSpeed(speed: NetworkData["demoSpeed"]): Promise<void>;
}
export type RealtimeEvent = z.infer<typeof realtimeSchema>;
export interface RealtimeClient {
  connect(onEvent: (event: RealtimeEvent) => void, onStatus: (status: "connecting" | "connected" | "disconnected" | "error", message?: string) => void): () => void;
}
export interface PlatformServices {
  stations: StationService; bookings: BookingService; charging: ChargingService; payments: PaymentService;
  devices: DeviceService; telemetry: TelemetryService; admin: AdminService;
  refresh(signal?: AbortSignal): Promise<void>;
  saveOwner(data: OwnerData): Promise<void>;
  snapshot(): PlatformSnapshot;
}
