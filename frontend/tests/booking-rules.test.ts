import test from "node:test";
import assert from "node:assert/strict";
import { stations, createOwnerData } from "../lib/demo/seed.ts";
import { estimateCost, validateBooking, refundableAmount, findBay, overlaps } from "../lib/services/booking-rules.ts";
const now = new Date("2026-09-02T08:00:00Z").getTime();
const start = "2026-09-04T10:00:00+06:00";
const owner = createOwnerData("Test", true, new Date(now));
const vehicle = owner.vehicles[0];
const station = stations[0];
test("cost caps energy at the vehicle's remaining capacity", () => {
  const cost = estimateCost(station, 120, "", vehicle);
  assert.ok(Math.abs(cost.energy - 21.6) < .001);
  assert.equal(cost.estimate, 409);
  assert.equal(cost.advance, 123);
});
test("promo discount applies to energy, not booking fee", () => {
  const cost = estimateCost(station, 60, "HELIO10", vehicle);
  assert.equal(cost.discount, 39); assert.equal(cost.fee, 20); assert.equal(cost.estimate, 370);
});
test("valid future booking receives the first free bay", () => assert.equal(validateBooking(station, vehicle, start, 60, [], now), "BAY01"));
test("reject past and invalid dates", () => {
  assert.throws(() => validateBooking(station, vehicle, "2026-09-01", 60, [], now), /future/);
  assert.throws(() => validateBooking(station, vehicle, "invalid", 60, [], now), /future/);
});
test("reject offline stations, missing vehicle and incompatible connectors", () => {
  assert.throws(() => validateBooking(stations[4], vehicle, start, 60, [], now), /offline/);
  assert.throws(() => validateBooking(station, undefined, start, 60, [], now), /vehicle/);
  assert.throws(() => validateBooking(stations[2], vehicle, start, 60, [], now), /compatible/);
});
test("reject invalid duration and bookings beyond 30 days", () => {
  assert.throws(() => validateBooking(station, vehicle, start, 17, [], now), /duration/);
  assert.throws(() => validateBooking(station, vehicle, "2026-11-01", 60, [], now), /30 days/);
});
test("overlapping bookings cannot share a vehicle", () => {
  const b = { ...owner.bookings[0], start };
  assert.throws(() => validateBooking(station, vehicle, start, 60, [b], now), /already has a booking/);
});
test("adjacent bookings do not conflict; cancelled bookings release capacity", () => {
  const b = { ...owner.bookings[0], start };
  assert.equal(overlaps("2026-09-04T11:00:00+06:00", 60, b), false);
  assert.equal(overlaps(start, 60, { ...b, status: "cancelled" }), false);
});
test("all occupied bays reject new reservations", () => {
  const booked = [1,2,3].map(i=>({...owner.bookings[0],start,vehicleId:`other-${i}`,bayId:`BAY0${i}`}));
  assert.equal(findBay(station, booked, start, 60), null);
  assert.throws(()=>validateBooking(station,vehicle,start,60,booked,now),/no longer available/);
});
test("refund boundary and non-refundable fees", () => {
  const b = { ...owner.bookings[0], start: new Date(now+3600000).toISOString(), advance: 123, fee: 20 };
  assert.equal(refundableAmount(b, now), 103);
  assert.equal(refundableAmount(b, now+1), 0);
  assert.equal(refundableAmount({...b,status:"cancelled"},now),0);
  assert.equal(refundableAmount({...b,advance:10},now),0);
});
