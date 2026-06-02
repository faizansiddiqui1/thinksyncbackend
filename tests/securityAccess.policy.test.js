import assert from "node:assert/strict";
import test from "node:test";

process.env.CRYPTO_KEY ||= "a".repeat(64);

const { buildAssignmentSnapshot } = await import(
  "../src/services/securityAccess/securityAccess.service.js"
);

const SPACE_ID = "space-private-office";
const ROOM_1 = "meeting-room-1";
const ROOM_2 = "meeting-room-2";
const ROOM_3 = "meeting-room-3";

function createBooking(resourceId) {
  return {
    space: SPACE_ID,
    bookingType: "hourly",
    resources: [{ resourceId }],
  };
}

function createDevice(overrides = {}) {
  return {
    _id: "device-1",
    deviceName: "Mock access controller",
    enabledAccessMethods: ["qr", "rfid"],
    assignments: [
      {
        space: SPACE_ID,
        resource: ROOM_1,
        bookingTypes: ["hourly"],
        accessMethods: ["qr", "rfid"],
        bookingAccessEnabled: true,
        isActive: true,
      },
      {
        space: SPACE_ID,
        resource: ROOM_2,
        bookingTypes: ["hourly"],
        accessMethods: ["rfid"],
        bookingAccessEnabled: true,
        isActive: true,
      },
    ],
    ...overrides,
  };
}

test("resource assignment exposes QR and RFID only for the configured room", () => {
  const snapshot = buildAssignmentSnapshot([createDevice()], createBooking(ROOM_1));

  assert.equal(snapshot.length, 1);
  assert.deepEqual(snapshot[0].accessMethods, ["qr", "rfid"]);
});

test("RFID-only room does not inherit QR access", () => {
  const snapshot = buildAssignmentSnapshot([createDevice()], createBooking(ROOM_2));

  assert.equal(snapshot.length, 1);
  assert.deepEqual(snapshot[0].accessMethods, ["rfid"]);
  assert.equal(snapshot[0].accessMethods.includes("qr"), false);
});

test("unassigned room does not receive a security-access assignment", () => {
  const snapshot = buildAssignmentSnapshot([createDevice()], createBooking(ROOM_3));

  assert.deepEqual(snapshot, []);
});

test("disabled assignment does not issue access", () => {
  const device = createDevice({
    assignments: [
      {
        space: SPACE_ID,
        resource: ROOM_1,
        bookingTypes: ["hourly"],
        accessMethods: ["qr"],
        bookingAccessEnabled: false,
        isActive: true,
      },
    ],
  });

  assert.deepEqual(buildAssignmentSnapshot([device], createBooking(ROOM_1)), []);
});

test("resource methods are constrained by the device-level allow-list", () => {
  const device = createDevice({
    enabledAccessMethods: ["rfid"],
  });
  const snapshot = buildAssignmentSnapshot([device], createBooking(ROOM_1));

  assert.equal(snapshot.length, 1);
  assert.deepEqual(snapshot[0].accessMethods, ["rfid"]);
});
