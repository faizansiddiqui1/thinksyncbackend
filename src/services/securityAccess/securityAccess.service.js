import crypto from "crypto";
import QRCode from "qrcode";
import mongoose from "mongoose";
import AdminProfile from "../../models/admin_models/AdminProfile.js";
import Company from "../../models/super_admin_models/Company.model.js";
import Tenant from "../../models/admin_models/tenant.model.js";
import Space from "../../models/admin_models/Space.js";
import Resource from "../../models/admin_models/ResourceSchema.js";
import Booking from "../../models/user_models/Booking.js";
import User from "../../models/user_models/User.js";
import SecurityDevice from "../../models/admin_models/SecurityDevice.js";
import BookingAccessCredential from "../../models/user_models/BookingAccessCredential.js";
import SecurityAccessLog from "../../models/admin_models/SecurityAccessLog.js";
import { encrypt, decrypt } from "../../utils/crypto.util.js";
import { getCompanySpaceIds } from "../spaceAccess.service.js";
import {
  buildCredentialMask,
  getDefaultSecurityAssignment,
  getDefaultSyncConfiguration,
  getProviderSupportedAccessMethods,
  getRequiredProviderFields,
  getSecurityAuthMethodDefinition,
  getSecurityProviderCatalog,
  getSecurityProviderDefinition,
  normalizeDeviceBrand,
} from "./catalog.service.js";
import { sendProviderRequest } from "./deviceClient.service.js";

const BOOKING_ACCESSABLE_STATUSES = new Set([
  "confirmed",
  "completed",
  "expired",
  "cancelled",
  "no_show",
]);

const ACTIVE_BOOKING_STATUSES = new Set(["confirmed"]);
const DATE_TIME_FORMAT = new Intl.DateTimeFormat("en-IN", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

function enc(value) {
  return `enc:${encrypt(String(value))}`;
}

function safeDecrypt(value) {
  try {
    if (typeof value === "string" && value.startsWith("enc:")) {
      return decrypt(value.slice(4));
    }
    return value;
  } catch {
    return "";
  }
}

function toObject(value) {
  return value?.toObject?.() || value || null;
}

function cleanString(value = "") {
  return String(value || "").trim();
}

function hashValue(value = "") {
  return crypto.createHash("sha256").update(String(value)).digest("hex");
}

function uniqueStrings(values = []) {
  return [...new Set((Array.isArray(values) ? values : []).filter(Boolean))];
}

function normalizeRefId(value = null) {
  if (!value) return null;
  return value?._id || value;
}

function normalizeAccessMethods(values = [], fallback = []) {
  const methods = uniqueStrings(
    (Array.isArray(values) ? values : []).map((value) =>
      String(value || "").trim().toLowerCase(),
    ),
  ).filter((value) =>
    ["qr", "rfid", "fingerprint", "face"].includes(value),
  );

  return methods.length
    ? methods
    : uniqueStrings(
        (Array.isArray(fallback) ? fallback : []).map((value) =>
          String(value || "").trim().toLowerCase(),
        ),
      ).filter((value) =>
        ["qr", "rfid", "fingerprint", "face"].includes(value),
      );
}

function formatDateTime(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return DATE_TIME_FORMAT.format(date);
}

function getByPath(source = {}, path = "") {
  return String(path || "")
    .split(".")
    .filter(Boolean)
    .reduce((accumulator, key) => accumulator?.[key], source);
}

function setByPath(target = {}, path = "", value) {
  const parts = String(path || "").split(".").filter(Boolean);
  if (!parts.length) return target;

  let current = target;
  parts.forEach((part, index) => {
    if (index === parts.length - 1) {
      current[part] = value;
      return;
    }

    if (!current[part] || typeof current[part] !== "object") {
      current[part] = {};
    }
    current = current[part];
  });

  return target;
}

function flattenDevicePayload(payload = {}) {
  const credentials = payload.credentials || {};
  const syncConfiguration = payload.syncConfiguration || {};

  return {
    deviceName: payload.deviceName,
    brand: payload.brand,
    deviceType: payload.deviceType,
    authMethod: payload.authMethod,
    apiEndpoint: payload.apiEndpoint,
    protocol: payload.protocol,
    deviceIp: payload.deviceIp,
    port: payload.port,
    apiKey: credentials.apiKey ?? payload.apiKey,
    secretKey: credentials.secretKey ?? payload.secretKey,
    username: credentials.username ?? payload.username,
    password: credentials.password ?? payload.password,
    accessToken: credentials.accessToken ?? payload.accessToken,
    deviceIdentifier: payload.deviceIdentifier,
    "syncConfiguration.healthcheckPath": syncConfiguration.healthcheckPath,
    "syncConfiguration.personSyncPath": syncConfiguration.personSyncPath,
    "syncConfiguration.cardSyncPath": syncConfiguration.cardSyncPath,
    "syncConfiguration.accessEventPath": syncConfiguration.accessEventPath,
    "syncConfiguration.openDoorPath": syncConfiguration.openDoorPath,
    "syncConfiguration.remoteCheckPath": syncConfiguration.remoteCheckPath,
    "syncConfiguration.autoSyncEnabled": syncConfiguration.autoSyncEnabled,
    "syncConfiguration.autoSyncIntervalMinutes":
      syncConfiguration.autoSyncIntervalMinutes,
  };
}

async function createSecurityAccessLog(payload = {}) {
  try {
    await SecurityAccessLog.create(payload);
  } catch (error) {
    console.error("security access log create failed:", error.message);
  }
}

function isWhiteLabelHardwareEnabled(adminProfile = null) {
  return (
    adminProfile?.whiteLabel?.status === "approved" &&
    adminProfile?.whiteLabel?.request?.needsHardwareAccess === true
  );
}

async function resolveSecurityScope(user) {
  if (!user?._id) {
    throw new Error("Unauthorized");
  }

  let ownerUserId = null;
  let company = null;
  let companyId = user.companyId || null;
  let adminProfile = null;
  let allowedSpaceIds = [];

  if (user.companyId) {
    company = await Company.findById(user.companyId).select(
      "_id owner assignedSpaceId spaces employees.user employees.spaces legalName displayName",
    );

    if (company && String(company.owner) === String(user._id)) {
      ownerUserId = company.owner;
      companyId = company._id;
      allowedSpaceIds = await getCompanySpaceIds(user);
    }
  }

  if (!ownerUserId && user.role === "admin") {
    ownerUserId = user._id;
    adminProfile = await AdminProfile.findOne({ owner: user._id });
    const spaces = await Space.find({ owner: user._id }).select("_id").lean();
    allowedSpaceIds = spaces.map((space) => String(space._id));
  }

  if (!ownerUserId) {
    throw new Error("Security access is available only to approved company owners");
  }

  if (!adminProfile) {
    adminProfile = await AdminProfile.findOne({ owner: ownerUserId });
  }

  if (!adminProfile || !isWhiteLabelHardwareEnabled(adminProfile)) {
    throw new Error(
      "Hardware security access is available only after white-label approval with hardware access enabled",
    );
  }

  const tenant = await Tenant.findOne({
    $or: [{ ownerId: ownerUserId }, { adminProfileId: adminProfile._id }],
  }).lean();

  return {
    ownerUserId,
    adminProfile: toObject(adminProfile),
    tenant,
    companyId,
    company: toObject(company),
    allowedSpaceIds: uniqueStrings(
      allowedSpaceIds.map((value) => String(value)),
    ),
  };
}

function assertAllowedSpace(scope, spaceId) {
  const normalizedSpaceId = String(normalizeRefId(spaceId) || "");
  if (!normalizedSpaceId) {
    throw new Error("Space is required");
  }

  if (
    Array.isArray(scope.allowedSpaceIds) &&
    scope.allowedSpaceIds.length > 0 &&
    !scope.allowedSpaceIds.includes(normalizedSpaceId)
  ) {
    throw new Error("This space is outside your allowed company scope");
  }
}

function decryptDeviceCredentials(device = {}) {
  const credentials = device?.credentials || {};
  return Object.keys(credentials).reduce((accumulator, key) => {
    accumulator[key] = safeDecrypt(credentials[key]);
    return accumulator;
  }, {});
}

function mergeEncryptedCredentials(existingCredentials = {}, nextCredentials = {}) {
  const merged = { ...(existingCredentials || {}) };

  Object.entries(nextCredentials || {}).forEach(([key, value]) => {
    const normalizedValue = cleanString(value);
    if (!normalizedValue) return;
    merged[key] = enc(normalizedValue);
  });

  return merged;
}

function normalizeAssignments(assignments = [], scope) {
  if (!Array.isArray(assignments)) return [];

  return assignments.map((assignment) => {
    const normalizedSpaceId = normalizeRefId(assignment.space);
    const normalizedResourceId = normalizeRefId(assignment.resource);
    assertAllowedSpace(scope, normalizedSpaceId);

    const accessMethods = normalizeAccessMethods(assignment.accessMethods, []);
    const bookingAccessEnabled = assignment.bookingAccessEnabled !== false;
    const isActive = assignment.isActive !== false;

    if (bookingAccessEnabled && isActive && accessMethods.length === 0) {
      throw new Error(
        "Every active booking-access assignment must allow at least one access method",
      );
    }

    const merged = {
      ...getDefaultSecurityAssignment(),
      ...assignment,
      space: normalizedSpaceId,
      bookingTypes: uniqueStrings(
        Array.isArray(assignment.bookingTypes)
          ? assignment.bookingTypes.map((value) =>
              String(value || "").trim().toLowerCase(),
            )
          : ["hourly", "daily", "weekly", "monthly"],
      ),
      accessMethods,
      accessWindow: {
        beforeStartMinutes: Number(
          assignment?.accessWindow?.beforeStartMinutes ?? 15,
        ),
        afterEndMinutes: Number(
          assignment?.accessWindow?.afterEndMinutes ?? 15,
        ),
      },
      floorLabel: cleanString(assignment.floorLabel),
      entryGate: cleanString(assignment.entryGate),
      workspaceLabel: cleanString(assignment.workspaceLabel),
      meetingRoomLabel: cleanString(assignment.meetingRoomLabel),
      resource: normalizedResourceId || null,
      bookingAccessEnabled,
      isActive,
    };

    return merged;
  });
}

async function assertAssignmentResourcesBelongToSpaces(assignments = []) {
  const resourceIds = uniqueStrings(
    assignments
      .map((assignment) => assignment.resource)
      .filter(Boolean)
      .map((resourceId) => String(resourceId)),
  );

  if (resourceIds.length === 0) return;

  const resources = await Resource.find({
    _id: { $in: resourceIds },
  })
    .select("_id space")
    .lean();
  const resourceSpaceMap = new Map(
    resources.map((resource) => [String(resource._id), String(resource.space)]),
  );

  assignments.forEach((assignment) => {
    if (!assignment.resource) return;

    const resourceSpaceId = resourceSpaceMap.get(String(assignment.resource));
    if (!resourceSpaceId) {
      throw new Error("Assigned resource was not found");
    }

    if (resourceSpaceId !== String(assignment.space)) {
      throw new Error("Assigned resource does not belong to the selected space");
    }
  });
}

async function performDeviceHealthcheck(devicePayload = {}) {
  const provider = getSecurityProviderDefinition(devicePayload.brand);
  const authMethod = getSecurityAuthMethodDefinition(
    devicePayload.brand,
    devicePayload.authMethod,
  );

  if (!provider || !authMethod) {
    throw new Error("Unsupported hardware provider configuration");
  }

  const path =
    cleanString(devicePayload?.syncConfiguration?.healthcheckPath) ||
    authMethod.connectionPath ||
    "/";

  const response = await sendProviderRequest({
    payload: devicePayload,
    method: "GET",
    path,
    timeout: 10000,
    headers: {
      Accept: "application/json,text/plain,*/*",
    },
  });

  const ok = response.status >= 200 && response.status < 300;
  let message = ok
    ? `${provider.label} device responded successfully`
    : `Device validation failed with status ${response.status}`;

  if (!ok && response?.data?.message) {
    message = String(response.data.message);
  }

  return {
    ok,
    online: ok,
    statusCode: response.status,
    message,
    sample: response.data || null,
  };
}

function serializeAssignment(assignment = {}) {
  const space = toObject(assignment.space);
  const resource = toObject(assignment.resource);

  return {
    _id: assignment._id,
    space: space?._id || assignment.space || null,
    spaceName: space?.name || "",
    resource: resource?._id || assignment.resource || null,
    resourceName: resource?.name || "",
    resourceType: resource?.type || "",
    floorLabel: assignment.floorLabel || "",
    entryGate: assignment.entryGate || "",
    workspaceLabel: assignment.workspaceLabel || "",
    meetingRoomLabel: assignment.meetingRoomLabel || "",
    bookingTypes: assignment.bookingTypes || [],
    accessMethods: assignment.accessMethods || [],
    accessWindow: assignment.accessWindow || {
      beforeStartMinutes: 15,
      afterEndMinutes: 15,
    },
    bookingAccessEnabled: assignment.bookingAccessEnabled !== false,
    isActive: assignment.isActive !== false,
  };
}

function serializeSecurityDevice(device = {}) {
  const provider = getSecurityProviderDefinition(device.brand);
  const decryptedCredentials = decryptDeviceCredentials(device);
  const assignments = Array.isArray(device.assignments)
    ? device.assignments.map(serializeAssignment)
    : [];

  return {
    _id: device._id,
    companyId: device.companyId || null,
    deviceName: device.deviceName,
    brand: device.brand,
    brandLabel: provider?.label || device.brand,
    providerKey: device.providerKey,
    deviceType: device.deviceType,
    authMethod: device.authMethod,
    apiEndpoint: device.apiEndpoint || "",
    deviceIp: device.deviceIp || "",
    port: device.port || null,
    protocol: device.protocol || "http",
    deviceIdentifier: device.deviceIdentifier || "",
    enabledAccessMethods: device.enabledAccessMethods || [],
    bookingAccessEnabled: device.bookingAccessEnabled !== false,
    approvalStatus: device.approvalStatus || "pending_review",
    connectionStatus: device.connectionStatus || {
      state: "not_configured",
      online: false,
    },
    syncConfiguration: device.syncConfiguration || {},
    credentials: buildCredentialMask(decryptedCredentials),
    assignments,
    metrics: device.metrics || {},
    lastSyncAt: device.lastSyncAt || null,
    lastAccessAt: device.lastAccessAt || null,
    lastError: device.lastError || null,
    docs: provider?.docs || [],
    totalAssignedSpaces: uniqueStrings(
      assignments.map((assignment) => String(assignment.space || "")),
    ).length,
    usage:
      Number(device?.metrics?.accessGrantedCount || 0) +
      Number(device?.metrics?.accessDeniedCount || 0),
  };
}

function validateProviderFields(payload = {}) {
  const provider = getSecurityProviderDefinition(payload.brand);
  const authMethod = getSecurityAuthMethodDefinition(
    payload.brand,
    payload.authMethod,
  );

  if (!provider) {
    throw new Error("Unsupported hardware brand");
  }

  if (!authMethod) {
    throw new Error("Unsupported hardware authentication method");
  }

  const flattened = flattenDevicePayload(payload);
  const missingFields = getRequiredProviderFields(
    payload.brand,
    payload.authMethod,
  ).filter((fieldKey) => {
    const value = flattened[fieldKey];
    return value === undefined || value === null || cleanString(value) === "";
  });

  if (missingFields.length > 0) {
    throw new Error(`Missing required fields: ${missingFields.join(", ")}`);
  }

  return provider;
}

function buildDeviceWritePayload(scope, payload = {}, existingDevice = null) {
  const brand = normalizeDeviceBrand(payload.brand || existingDevice?.brand);
  const authMethod = cleanString(payload.authMethod || existingDevice?.authMethod);
  const existingCredentials = decryptDeviceCredentials(existingDevice || {});
  const provider = validateProviderFields({
    ...existingDevice,
    ...payload,
    brand,
    authMethod,
    credentials: {
      ...existingCredentials,
      ...(payload.credentials || {}),
    },
    syncConfiguration: {
      ...(existingDevice?.syncConfiguration || {}),
      ...(payload.syncConfiguration || {}),
    },
  });
  const supportedAccessMethods = getProviderSupportedAccessMethods(brand);

  const credentialsPayload = {
    apiKey: payload?.credentials?.apiKey ?? payload.apiKey,
    secretKey: payload?.credentials?.secretKey ?? payload.secretKey,
    username: payload?.credentials?.username ?? payload.username,
    password: payload?.credentials?.password ?? payload.password,
    accessToken: payload?.credentials?.accessToken ?? payload.accessToken,
  };

  const mergedSyncConfiguration = {
    ...(existingDevice?.syncConfiguration || {}),
    ...getDefaultSyncConfiguration(brand, authMethod),
    ...(payload.syncConfiguration || {}),
  };

  const bookingAccessEnabled =
    payload.bookingAccessEnabled !== undefined
      ? Boolean(payload.bookingAccessEnabled)
      : existingDevice?.bookingAccessEnabled !== false;
  const deviceAccessMethods = normalizeAccessMethods(
    Array.isArray(payload.enabledAccessMethods)
      ? payload.enabledAccessMethods.filter((value) =>
          supportedAccessMethods.includes(String(value || "").toLowerCase()),
        )
      : existingDevice?.enabledAccessMethods || ["qr"],
    [],
  );
  const assignments =
    payload.assignments !== undefined
      ? normalizeAssignments(payload.assignments, scope)
      : normalizeAssignments(existingDevice?.assignments || [], scope);

  if (bookingAccessEnabled && deviceAccessMethods.length === 0) {
    throw new Error("Enable at least one device access method");
  }

  assignments.forEach((assignment) => {
    const unsupportedMethods = assignment.accessMethods.filter(
      (method) => !deviceAccessMethods.includes(method),
    );
    if (unsupportedMethods.length > 0) {
      throw new Error(
        `Assignment access methods must also be enabled on the device: ${unsupportedMethods.join(", ")}`,
      );
    }
  });

  return {
    ownerUserId: scope.ownerUserId,
    adminProfileId: scope.adminProfile?._id || null,
    tenantId: scope.tenant?._id || null,
    companyId: scope.companyId || null,
    deviceName: cleanString(payload.deviceName || existingDevice?.deviceName),
    brand,
    providerKey: provider.providerKey,
    deviceType: cleanString(payload.deviceType || existingDevice?.deviceType),
    authMethod,
    apiEndpoint: cleanString(payload.apiEndpoint || existingDevice?.apiEndpoint),
    deviceIp: cleanString(payload.deviceIp || existingDevice?.deviceIp),
    port:
      payload.port !== undefined && payload.port !== null && payload.port !== ""
        ? Number(payload.port)
        : existingDevice?.port || null,
    protocol: cleanString(payload.protocol || existingDevice?.protocol || "http"),
    deviceIdentifier: cleanString(
      payload.deviceIdentifier || existingDevice?.deviceIdentifier,
    ),
    enabledAccessMethods: deviceAccessMethods,
    bookingAccessEnabled,
    syncConfiguration: mergedSyncConfiguration,
    assignments,
    credentialsPayload,
    notes: cleanString(payload.notes || existingDevice?.notes),
  };
}

function materializeDevicePayloadForValidation(payload = {}, existingDevice = null) {
  const existingCredentials = decryptDeviceCredentials(existingDevice || {});
  return {
    brand: payload.brand,
    authMethod: payload.authMethod,
    apiEndpoint: payload.apiEndpoint,
    protocol: payload.protocol,
    deviceIp: payload.deviceIp,
    port: payload.port,
    syncConfiguration: payload.syncConfiguration,
    credentials: {
      ...existingCredentials,
      ...Object.fromEntries(
        Object.entries(payload.credentialsPayload || {}).filter(
          ([, value]) => cleanString(value) !== "",
        ),
      ),
    },
  };
}

async function getAccessibleSpaces(scope) {
  const query =
    scope.allowedSpaceIds.length > 0
      ? { _id: { $in: scope.allowedSpaceIds } }
      : { owner: scope.ownerUserId };

  const spaces = await Space.find(query)
    .select("name slug spaceType address city centerDetails bookingRules")
    .lean();
  const resources = spaces.length
    ? await Resource.find({
        space: { $in: spaces.map((space) => space._id) },
      })
        .select("space name type")
        .lean()
    : [];

  const resourcesBySpace = resources.reduce((accumulator, resource) => {
    const key = String(resource.space);
    if (!accumulator[key]) {
      accumulator[key] = [];
    }
    accumulator[key].push({
      _id: resource._id,
      name: resource.name,
      type: resource.type,
    });
    return accumulator;
  }, {});

  return spaces.map((space) => ({
    _id: space._id,
    name: space.name,
    slug: space.slug,
    spaceType: space.spaceType,
    resources: resourcesBySpace[String(space._id)] || [],
  }));
}

function buildCredentialStatusFromBooking(booking = {}) {
  const status = String(booking?.status || "").toLowerCase();
  const endDateTime = booking?.endDateTime ? new Date(booking.endDateTime) : null;
  const now = new Date();

  if (status === "cancelled") return "cancelled";

  if (
    status === "completed" ||
    status === "expired" ||
    (endDateTime && !Number.isNaN(endDateTime.getTime()) && endDateTime < now)
  ) {
    return "expired";
  }

  return "active";
}

function isBookingEligibleForAccess(booking = {}) {
  return BOOKING_ACCESSABLE_STATUSES.has(
    String(booking?.status || "").toLowerCase(),
  );
}

export function buildAssignmentSnapshot(devices = [], booking = {}) {
  const bookingResourceIds = uniqueStrings(
    (Array.isArray(booking.resources) ? booking.resources : []).map((item) =>
      String(item?.resourceId?._id || item?.resourceId || ""),
    ),
  );
  const bookingType = String(booking?.bookingType || "").toLowerCase();

  return devices.flatMap((device) =>
    (Array.isArray(device.assignments) ? device.assignments : [])
      .filter((assignment) => assignment.isActive !== false)
      .filter((assignment) => assignment.bookingAccessEnabled !== false)
      .filter(
        (assignment) =>
          String(assignment.space?._id || assignment.space) ===
          String(booking.space?._id || booking.space),
      )
      .filter((assignment) => {
        if (!assignment.resource) return true;
        return bookingResourceIds.includes(
          String(assignment.resource?._id || assignment.resource),
        );
      })
      .filter((assignment) => {
        const types = Array.isArray(assignment.bookingTypes)
          ? assignment.bookingTypes
          : [];
        return !types.length || types.includes(bookingType);
      })
      .map((assignment) => {
        const deviceAccessMethods = normalizeAccessMethods(
          device.enabledAccessMethods,
          [],
        );
        const accessMethods = normalizeAccessMethods(
          assignment.accessMethods,
          [],
        ).filter((method) => deviceAccessMethods.includes(method));

        return {
          deviceId: device._id,
          deviceName: device.deviceName,
          space: assignment.space?._id || assignment.space || null,
          resource: assignment.resource?._id || assignment.resource || null,
          floorLabel: assignment.floorLabel || "",
          entryGate: assignment.entryGate || "",
          workspaceLabel: assignment.workspaceLabel || "",
          meetingRoomLabel: assignment.meetingRoomLabel || "",
          bookingTypes: assignment.bookingTypes || [],
          accessMethods,
          accessWindow: assignment.accessWindow || {
            beforeStartMinutes: 15,
            afterEndMinutes: 15,
          },
        };
      })
      .filter((assignment) => assignment.accessMethods.length > 0),
  );
}

function buildEntryPermissions(snapshot = []) {
  return uniqueStrings(
    snapshot.map((item) => {
      const parts = [
        item.entryGate,
        item.floorLabel,
        item.workspaceLabel,
        item.meetingRoomLabel,
      ].filter(Boolean);
      return parts.join(" • ");
    }),
  ).filter(Boolean);
}

function buildEntryPermissionLabels(snapshot = []) {
  return uniqueStrings(
    snapshot.map((item) => {
      const parts = [
        item.entryGate,
        item.floorLabel,
        item.workspaceLabel,
        item.meetingRoomLabel,
      ].filter(Boolean);
      return parts.join(" / ");
    }),
  ).filter(Boolean);
}

function decryptQrPayload(credential = null) {
  if (!credential?.qr?.encryptedPayload) return "";
  return safeDecrypt(credential.qr.encryptedPayload);
}

function createBookingAccessId(bookingId) {
  return `ACC-${String(bookingId).slice(-6).toUpperCase()}-${crypto
    .randomBytes(3)
    .toString("hex")
    .toUpperCase()}`;
}

function getCredentialAccessId(credential = null) {
  return cleanString(credential?.accessId || credential?.qr?.publicId);
}

async function createQrCredential(accessId) {
  const secret = crypto.randomBytes(24).toString("hex");
  const qrPayload = `TSA|${accessId}|${secret}`;

  return {
    publicId: accessId,
    secretHash: hashValue(secret),
    encryptedPayload: enc(qrPayload),
    dataUri: await QRCode.toDataURL(qrPayload, {
      errorCorrectionLevel: "M",
      margin: 1,
      width: 280,
    }),
    version: 1,
  };
}

function serializeAccessCredential(credential, booking = {}, logs = []) {
  if (!credential) return null;

  const accessWindowStart = new Date(credential.validity.startsAt);
  const accessWindowEnd = new Date(credential.validity.endsAt);

  return {
    _id: credential._id,
    status: credential.status,
    primaryMethod: credential.primaryMethod,
    accessMethods: credential.accessMethods || [],
    accessCode: credential.qr?.publicId || "",
    qrImage: credential.qr?.dataUri || "",
    qrPayload: decryptQrPayload(credential),
    bookingLinked: true,
    validity: {
      startsAt: credential.validity?.startsAt || null,
      endsAt: credential.validity?.endsAt || null,
      timezone: credential.validity?.timezone || booking?.timezone || "Asia/Kolkata",
      displayStart: formatDateTime(accessWindowStart),
      displayEnd: formatDateTime(accessWindowEnd),
      label:
        credential.permissions?.accessTimingLabel ||
        `${formatDateTime(accessWindowStart)} to ${formatDateTime(accessWindowEnd)}`,
    },
    locations: (credential.assignmentSnapshot || []).map((item) => ({
      deviceId: item.deviceId || null,
      deviceName: item.deviceName || "",
      floorLabel: item.floorLabel || "",
      entryGate: item.entryGate || "",
      workspaceLabel: item.workspaceLabel || "",
      meetingRoomLabel: item.meetingRoomLabel || "",
      accessMethods: item.accessMethods || [],
    })),
    entryPermissions:
      credential.permissions?.entryPermissions ||
      buildEntryPermissionLabels(credential.assignmentSnapshot || []),
    logs: (Array.isArray(logs) ? logs : []).map((log) => ({
      _id: log._id,
      eventType: log.eventType,
      accessMethod: log.accessMethod,
      result: log.result,
      message: log.message,
      createdAt: log.createdAt,
    })),
    deviceEnabledEntries: (credential.deviceIds || []).length,
    canRegenerate: Boolean(credential.qr?.publicId),
  };
}

function isSerializedAccessCredential(value = null) {
  return Boolean(
    value &&
      typeof value === "object" &&
      "bookingLinked" in value &&
      "qrImage" in value &&
      "validity" in value,
  );
}

async function getDevicesForBookingAccess(spaceOwnerId, spaceId) {
  return SecurityDevice.find({
    ownerUserId: spaceOwnerId,
    approvalStatus: { $in: ["approved", "pending_review"] },
    bookingAccessEnabled: true,
    "connectionStatus.state": "connected",
    "assignments.space": spaceId,
  })
    .populate("assignments.space", "name slug")
    .populate("assignments.resource", "name type")
    .lean();
}

async function pushCredentialToDevice(device, credential, booking) {
  const accessId = getCredentialAccessId(credential);
  if (!accessId) {
    throw new Error("Booking access ID is missing");
  }

  const credentials = decryptDeviceCredentials(device);
  const payload = {
    brand: device.brand,
    authMethod: device.authMethod,
    apiEndpoint: device.apiEndpoint,
    protocol: device.protocol,
    deviceIp: device.deviceIp,
    port: device.port,
    syncConfiguration: device.syncConfiguration || {},
    credentials,
  };

  if (device.brand === "hikvision") {
    const personSyncPath =
      cleanString(device?.syncConfiguration?.personSyncPath) ||
      "/ISAPI/AccessControl/UserInfo/SetUp?format=json";

    const userResponse = await sendProviderRequest({
      payload,
      method: "PUT",
      path: personSyncPath,
      headers: {
        "Content-Type": "application/json",
      },
      data: {
        UserInfo: {
          employeeNo: accessId,
          name:
            booking?.user?.name ||
            booking?.user?.email ||
            accessId,
          userType: "visitor",
          Valid: {
            enable: true,
            beginTime: new Date(credential.validity.startsAt).toISOString(),
            endTime: new Date(credential.validity.endsAt).toISOString(),
          },
        },
      },
    });

    if (userResponse.status < 200 || userResponse.status >= 300) {
      throw new Error(
        `Hikvision user sync failed with status ${userResponse.status}`,
      );
    }

    if (Array.isArray(credential.rfidCards) && credential.rfidCards.length > 0) {
      const cardSyncPath =
        cleanString(device?.syncConfiguration?.cardSyncPath) ||
        "/ISAPI/AccessControl/CardInfo/SetUp?format=json";

      const cardResponse = await sendProviderRequest({
        payload,
        method: "PUT",
        path: cardSyncPath,
        headers: {
          "Content-Type": "application/json",
        },
        data: {
          CardInfo: {
            employeeNo: accessId,
            cardNo: credential.rfidCards[0].providerCardRef || accessId,
          },
        },
      });

      if (cardResponse.status < 200 || cardResponse.status >= 300) {
        throw new Error(
          `Hikvision card sync failed with status ${cardResponse.status}`,
        );
      }
    }

    return {
      success: true,
      provider: "hikvision",
    };
  }

  const personSyncPath = cleanString(device?.syncConfiguration?.personSyncPath);
  if (!personSyncPath) {
    return {
      success: true,
      skipped: true,
      provider: "zkteco",
      message: "ZKTeco sync path is not configured",
    };
  }

  const response = await sendProviderRequest({
    payload,
    method: "POST",
    path: personSyncPath,
    headers: {
      "Content-Type": "application/json",
    },
    data: {
      bookingAccess: {
        bookingId: String(booking._id),
        accessId,
        userId: String(booking?.user?.userId || ""),
        userName: booking?.user?.name || booking?.user?.email || "",
        validFrom: credential.validity.startsAt,
        validTo: credential.validity.endsAt,
        qrToken: decryptQrPayload(credential),
        cardRefs: (credential.rfidCards || []).map(
          (item) => item.providerCardRef || "",
        ),
        spaceId: String(booking.space?._id || booking.space || ""),
      },
    },
  });

  if (response.status < 200 || response.status >= 300) {
    throw new Error(`ZKTeco sync failed with status ${response.status}`);
  }

  return {
    success: true,
    provider: "zkteco",
  };
}

async function loadBookingWithSpace(bookingInput) {
  if (!bookingInput) return null;

  if (bookingInput?.space && bookingInput?.user) {
    return toObject(bookingInput);
  }

  const bookingId = bookingInput?._id || bookingInput;
  if (!bookingId) return null;

  const booking = await Booking.findById(bookingId)
    .populate("space", "name slug owner address spaceType")
    .populate({
      path: "resources.resourceId",
      model: "Resource",
      select: "name type",
    })
    .lean();

  return booking || null;
}

export async function ensureBookingAccessCredential(
  bookingInput,
  { regenerate = false, includeLogs = false, syncDevices = true } = {},
) {
  const booking = await loadBookingWithSpace(bookingInput);
  if (!booking || !isBookingEligibleForAccess(booking)) {
    return null;
  }

  const space = toObject(booking.space);
  if (!space?._id || !space?.owner) {
    return null;
  }

  const [existingCredential, ownerAdminProfile, tenant, bookingUser, devices] =
    await Promise.all([
      BookingAccessCredential.findOne({ booking: booking._id }),
      AdminProfile.findOne({ owner: space.owner }).lean(),
      Tenant.findOne({ ownerId: space.owner }).lean(),
      booking?.user?.userId
        ? User.findById(booking.user.userId).select("companyId").lean()
        : Promise.resolve(null),
      getDevicesForBookingAccess(space.owner, space._id),
    ]);

  const assignmentSnapshot = buildAssignmentSnapshot(devices, booking);
  const accessMethods = normalizeAccessMethods(
    assignmentSnapshot.flatMap((item) => item.accessMethods || []),
    [],
  );
  const assignedDeviceIds = new Set(
    assignmentSnapshot.map((assignment) => String(assignment.deviceId || "")),
  );
  const matchedDevices = devices.filter((device) =>
    assignedDeviceIds.has(String(device._id)),
  );

  if (assignmentSnapshot.length === 0 || accessMethods.length === 0) {
    if (existingCredential) {
      existingCredential.accessId =
        getCredentialAccessId(existingCredential) ||
        createBookingAccessId(booking._id);
      existingCredential.status = "revoked";
      existingCredential.deviceIds = [];
      existingCredential.accessMethods = [];
      existingCredential.assignmentSnapshot = [];
      existingCredential.qr = undefined;
      await existingCredential.save();
    }

    if (regenerate) {
      throw new Error("QR access is not enabled for this booked resource");
    }

    return null;
  }
  const beforeStartMinutes = Math.max(
    15,
    ...assignmentSnapshot.map(
      (item) => Number(item?.accessWindow?.beforeStartMinutes || 0),
    ),
  );
  const afterEndMinutes = Math.max(
    15,
    ...assignmentSnapshot.map(
      (item) => Number(item?.accessWindow?.afterEndMinutes || 0),
    ),
  );

  const validityStartsAt = new Date(
    new Date(booking.startDateTime).getTime() - beforeStartMinutes * 60 * 1000,
  );
  const validityEndsAt = new Date(
    new Date(booking.endDateTime).getTime() + afterEndMinutes * 60 * 1000,
  );
  const currentStatus = buildCredentialStatusFromBooking(booking);
  const companyNameSnapshot =
    ownerAdminProfile?.company?.name ||
    booking?.space?.name ||
    "ThinkSync Workspace";

  let credentialDoc = existingCredential;

  if (!credentialDoc) {
    const accessId = createBookingAccessId(booking._id);
    const qr = accessMethods.includes("qr")
      ? await createQrCredential(accessId)
      : undefined;

    credentialDoc = await BookingAccessCredential.create({
      booking: booking._id,
      ownerUserId: space.owner,
      adminProfileId: ownerAdminProfile?._id || null,
      tenantId: tenant?._id || null,
      companyId: bookingUser?.companyId || null,
      companyNameSnapshot,
      userId: booking?.user?.userId || null,
      space: space._id,
      resourceIds: uniqueStrings(
        (Array.isArray(booking.resources) ? booking.resources : []).map((item) =>
          String(item?.resourceId?._id || item?.resourceId || ""),
        ),
      ),
      accessId,
      deviceIds: uniqueStrings(matchedDevices.map((device) => String(device._id))),
      status: currentStatus,
      accessMethods,
      primaryMethod: accessMethods[0],
      validity: {
        startsAt: validityStartsAt,
        endsAt: validityEndsAt,
        timezone: booking?.timezone || "Asia/Kolkata",
        earlyAccessMinutes: beforeStartMinutes,
        lateAccessMinutes: afterEndMinutes,
      },
      ...(qr ? { qr } : {}),
      assignmentSnapshot,
      permissions: {
        entryPermissions: buildEntryPermissionLabels(assignmentSnapshot),
        accessTimingLabel: `${formatDateTime(validityStartsAt)} to ${formatDateTime(
          validityEndsAt,
        )}`,
      },
    });
  } else {
    credentialDoc.accessId =
      getCredentialAccessId(credentialDoc) || createBookingAccessId(booking._id);
    credentialDoc.status = currentStatus;
    credentialDoc.ownerUserId = space.owner;
    credentialDoc.adminProfileId = ownerAdminProfile?._id || null;
    credentialDoc.tenantId = tenant?._id || null;
    credentialDoc.companyId = bookingUser?.companyId || null;
    credentialDoc.companyNameSnapshot = companyNameSnapshot;
    credentialDoc.userId = booking?.user?.userId || null;
    credentialDoc.space = space._id;
    credentialDoc.resourceIds = uniqueStrings(
      (Array.isArray(booking.resources) ? booking.resources : []).map((item) =>
        String(item?.resourceId?._id || item?.resourceId || ""),
      ),
    );
    credentialDoc.deviceIds = uniqueStrings(
      matchedDevices.map((device) => String(device._id)),
    );
    credentialDoc.accessMethods = accessMethods;
    credentialDoc.primaryMethod = accessMethods[0];
    credentialDoc.validity = {
      startsAt: validityStartsAt,
      endsAt: validityEndsAt,
      timezone: booking?.timezone || "Asia/Kolkata",
      earlyAccessMinutes: beforeStartMinutes,
      lateAccessMinutes: afterEndMinutes,
    };
    credentialDoc.assignmentSnapshot = assignmentSnapshot;
    credentialDoc.permissions.entryPermissions = buildEntryPermissionLabels(
      assignmentSnapshot,
    );
    credentialDoc.permissions.accessTimingLabel = `${formatDateTime(
      validityStartsAt,
    )} to ${formatDateTime(validityEndsAt)}`;

    if (!accessMethods.includes("qr")) {
      credentialDoc.qr = undefined;
    } else if (!credentialDoc.qr?.publicId) {
      credentialDoc.qr = await createQrCredential(credentialDoc.accessId);
    }

    if (regenerate) {
      if (!accessMethods.includes("qr") || !credentialDoc.qr?.publicId) {
        throw new Error("QR access is not enabled for this booked resource");
      }

      const secret = crypto.randomBytes(24).toString("hex");
      const qrPayload = `TSA|${credentialDoc.qr.publicId}|${secret}`;
      credentialDoc.qr.secretHash = hashValue(secret);
      credentialDoc.qr.encryptedPayload = enc(qrPayload);
      credentialDoc.qr.dataUri = await QRCode.toDataURL(qrPayload, {
        errorCorrectionLevel: "M",
        margin: 1,
        width: 280,
      });
      credentialDoc.qr.version = Number(credentialDoc.qr.version || 1) + 1;
      credentialDoc.qr.regeneratedAt = new Date();
      credentialDoc.permissions.regenerateCount =
        Number(credentialDoc?.permissions?.regenerateCount || 0) + 1;
    }

    await credentialDoc.save();
  }

  const plainCredential = toObject(credentialDoc);

  for (const device of syncDevices ? matchedDevices : []) {
    try {
      const syncResult = await pushCredentialToDevice(
        device,
        plainCredential,
        booking,
      );

      await SecurityDevice.updateOne(
        { _id: device._id },
        {
          $set: {
            lastSyncAt: new Date(),
            lastError: {
              code: "",
              message: "",
              occurredAt: null,
            },
          },
          $inc: {
            "metrics.syncCount": syncResult.skipped ? 0 : 1,
          },
        },
      );

      await createSecurityAccessLog({
        ownerUserId: space.owner,
        adminProfileId: ownerAdminProfile?._id || null,
        tenantId: tenant?._id || null,
        companyId: bookingUser?.companyId || null,
        booking: booking._id,
        accessCredential: plainCredential._id,
        userId: booking?.user?.userId || null,
        space: space._id,
        deviceId: device._id,
        eventType: "device_sync",
        accessMethod: "system",
        result: "info",
        message: syncResult.skipped
          ? syncResult.message || "Device sync skipped"
          : "Booking access synced to device",
        metadata: {
          provider: device.brand,
        },
      });
    } catch (error) {
      await SecurityDevice.updateOne(
        { _id: device._id },
        {
          $inc: {
            "metrics.failedSyncAttempts": 1,
          },
          $set: {
            lastError: {
              code: "device_sync_failed",
              message: error.message,
              occurredAt: new Date(),
            },
          },
        },
      );

      await createSecurityAccessLog({
        ownerUserId: space.owner,
        adminProfileId: ownerAdminProfile?._id || null,
        tenantId: tenant?._id || null,
        companyId: bookingUser?.companyId || null,
        booking: booking._id,
        accessCredential: plainCredential._id,
        userId: booking?.user?.userId || null,
        space: space._id,
        deviceId: device._id,
        eventType: "device_sync_failed",
        accessMethod: "system",
        result: "error",
        message: error.message,
      });
    }
  }

  const logs = includeLogs
    ? await SecurityAccessLog.find({ accessCredential: plainCredential._id })
        .sort({ createdAt: -1 })
        .limit(10)
        .lean()
    : [];

  return serializeAccessCredential(plainCredential, booking, logs);
}

export async function attachAccessToBookings(bookings = []) {
  const list = Array.isArray(bookings) ? bookings : [];
  if (!list.length) return list;

  const credentialMap = new Map();
  const eligibleBookings = list.filter(isBookingEligibleForAccess);

  for (const booking of eligibleBookings) {
    const credential = await ensureBookingAccessCredential(booking, {
      syncDevices: false,
    });
    if (credential) {
      credentialMap.set(String(booking._id), credential);
    }
  }

  const logs = await SecurityAccessLog.find({
    booking: { $in: eligibleBookings.map((booking) => booking._id) },
  })
    .sort({ createdAt: -1 })
    .lean();

  const logsByBooking = logs.reduce((accumulator, log) => {
    const key = String(log.booking || "");
    if (!key) return accumulator;
    if (!accumulator[key]) {
      accumulator[key] = [];
    }
    if (accumulator[key].length < 5) {
      accumulator[key].push(log);
    }
    return accumulator;
  }, {});

  return list.map((booking) => ({
    ...booking,
    access: isSerializedAccessCredential(credentialMap.get(String(booking._id)))
      ? credentialMap.get(String(booking._id))
      : serializeAccessCredential(
          credentialMap.get(String(booking._id)) || null,
          booking,
          logsByBooking[String(booking._id)] || [],
        ),
  }));
}

async function findScopedDevice(scope, deviceId) {
  const device = await SecurityDevice.findOne({
    _id: deviceId,
    ownerUserId: scope.ownerUserId,
  })
    .populate("assignments.space", "name slug")
    .populate("assignments.resource", "name type")
    .lean();

  if (!device) {
    throw new Error("Security device not found");
  }

  return device;
}

export async function getCompanySecurityOverview(user) {
  const scope = await resolveSecurityScope(user);
  const [devices, spaces, logs] = await Promise.all([
    SecurityDevice.find({
      ownerUserId: scope.ownerUserId,
    })
      .populate("assignments.space", "name slug")
      .populate("assignments.resource", "name type")
      .sort({ createdAt: -1 })
      .lean(),
    getAccessibleSpaces(scope),
    SecurityAccessLog.find({
      ownerUserId: scope.ownerUserId,
    })
      .sort({ createdAt: -1 })
      .limit(25)
      .lean(),
  ]);

  const serializedDevices = devices.map(serializeSecurityDevice);

  return {
    providers: getSecurityProviderCatalog(),
    spaces,
    summary: {
      totalDevices: serializedDevices.length,
      connectedDevices: serializedDevices.filter(
        (device) => device.connectionStatus?.state === "connected",
      ).length,
      pendingApproval: serializedDevices.filter(
        (device) => device.approvalStatus === "pending_review",
      ).length,
      assignedSpaces: uniqueStrings(
        serializedDevices.flatMap((device) =>
          device.assignments.map((assignment) => String(assignment.space || "")),
        ),
      ).length,
      accessUsage: serializedDevices.reduce(
        (sum, device) => sum + Number(device.usage || 0),
        0,
      ),
    },
    devices: serializedDevices,
    logs,
    scope: {
      ownerUserId: scope.ownerUserId,
      companyId: scope.companyId || null,
      companyName:
        scope.company?.displayName ||
        scope.company?.legalName ||
        scope.adminProfile?.company?.name ||
        "Workspace",
    },
  };
}

export async function saveCompanySecurityDevice(user, payload, deviceId = null) {
  const scope = await resolveSecurityScope(user);
  let existingDevice = null;

  if (deviceId) {
    existingDevice = await findScopedDevice(scope, deviceId);
  }

  const writePayload = buildDeviceWritePayload(scope, payload, existingDevice);
  await assertAssignmentResourcesBelongToSpaces(writePayload.assignments);
  const validationPayload = materializeDevicePayloadForValidation(
    writePayload,
    existingDevice,
  );
  const healthcheck = await performDeviceHealthcheck(validationPayload);

  const encryptedCredentials = mergeEncryptedCredentials(
    existingDevice?.credentials || {},
    writePayload.credentialsPayload,
  );

  const docPayload = {
    ownerUserId: writePayload.ownerUserId,
    adminProfileId: writePayload.adminProfileId,
    tenantId: writePayload.tenantId,
    companyId: writePayload.companyId,
    deviceName: writePayload.deviceName,
    brand: writePayload.brand,
    providerKey: writePayload.providerKey,
    deviceType: writePayload.deviceType,
    authMethod: writePayload.authMethod,
    apiEndpoint: writePayload.apiEndpoint,
    deviceIp: writePayload.deviceIp,
    port: writePayload.port,
    protocol: writePayload.protocol,
    deviceIdentifier: writePayload.deviceIdentifier,
    credentials: encryptedCredentials,
    enabledAccessMethods: writePayload.enabledAccessMethods,
    bookingAccessEnabled: writePayload.bookingAccessEnabled,
    syncConfiguration: writePayload.syncConfiguration,
    assignments: writePayload.assignments,
    notes: writePayload.notes,
    connectionStatus: {
      state: healthcheck.ok ? "connected" : "failed",
      online: healthcheck.online,
      message: healthcheck.message,
      statusCode: healthcheck.statusCode,
      lastCheckedAt: new Date(),
    },
    lastError: healthcheck.ok
      ? {
          code: "",
          message: "",
          occurredAt: null,
        }
      : {
          code: "device_validation_failed",
          message: healthcheck.message,
          occurredAt: new Date(),
        },
  };

  const deviceDoc = existingDevice
    ? await SecurityDevice.findByIdAndUpdate(existingDevice._id, docPayload, {
        new: true,
        runValidators: true,
      })
    : await SecurityDevice.create(docPayload);

  await createSecurityAccessLog({
    ownerUserId: scope.ownerUserId,
    adminProfileId: scope.adminProfile?._id || null,
    tenantId: scope.tenant?._id || null,
    companyId: scope.companyId || null,
    deviceId: deviceDoc._id,
    eventType: healthcheck.ok
      ? "device_connected"
      : "device_validation_failed",
    accessMethod: "system",
    result: healthcheck.ok ? "info" : "error",
    message: healthcheck.message,
    metadata: {
      brand: writePayload.brand,
      authMethod: writePayload.authMethod,
      statusCode: healthcheck.statusCode,
    },
  });

  const hydratedDevice = await SecurityDevice.findById(deviceDoc._id)
    .populate("assignments.space", "name slug")
    .populate("assignments.resource", "name type")
    .lean();

  return {
    device: serializeSecurityDevice(hydratedDevice),
    validation: healthcheck,
  };
}

export async function retestCompanySecurityDevice(user, deviceId) {
  const scope = await resolveSecurityScope(user);
  const device = await findScopedDevice(scope, deviceId);
  const decryptedCredentials = decryptDeviceCredentials(device);

  const healthcheck = await performDeviceHealthcheck({
    brand: device.brand,
    authMethod: device.authMethod,
    apiEndpoint: device.apiEndpoint,
    protocol: device.protocol,
    deviceIp: device.deviceIp,
    port: device.port,
    syncConfiguration: device.syncConfiguration,
    credentials: decryptedCredentials,
  });

  await SecurityDevice.updateOne(
    { _id: deviceId },
    {
      $set: {
        connectionStatus: {
          state: healthcheck.ok ? "connected" : "failed",
          online: healthcheck.online,
          message: healthcheck.message,
          statusCode: healthcheck.statusCode,
          lastCheckedAt: new Date(),
        },
        lastError: healthcheck.ok
          ? {
              code: "",
              message: "",
              occurredAt: null,
            }
          : {
              code: "device_validation_failed",
              message: healthcheck.message,
              occurredAt: new Date(),
            },
      },
    },
  );

  await createSecurityAccessLog({
    ownerUserId: scope.ownerUserId,
    adminProfileId: scope.adminProfile?._id || null,
    tenantId: scope.tenant?._id || null,
    companyId: scope.companyId || null,
    deviceId,
    eventType: healthcheck.ok
      ? "device_connected"
      : "device_validation_failed",
    accessMethod: "system",
    result: healthcheck.ok ? "info" : "error",
    message: healthcheck.message,
  });

  const hydratedDevice = await SecurityDevice.findById(deviceId)
    .populate("assignments.space", "name slug")
    .populate("assignments.resource", "name type")
    .lean();

  return {
    device: serializeSecurityDevice(hydratedDevice),
    validation: healthcheck,
  };
}

export async function syncCompanySecurityDevice(user, deviceId) {
  const scope = await resolveSecurityScope(user);
  const device = await findScopedDevice(scope, deviceId);
  const assignedSpaceIds = uniqueStrings(
    (Array.isArray(device.assignments) ? device.assignments : [])
      .filter((assignment) => assignment.isActive !== false)
      .map((assignment) => String(assignment.space?._id || assignment.space || "")),
  );

  const bookings = await Booking.find({
    space: { $in: assignedSpaceIds },
    status: { $in: [...ACTIVE_BOOKING_STATUSES] },
    endDateTime: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
  })
    .populate("space", "name slug owner address spaceType")
    .populate({
      path: "resources.resourceId",
      model: "Resource",
      select: "name type",
    })
    .lean();

  const synced = [];
  for (const booking of bookings) {
    const access = await ensureBookingAccessCredential(booking);
    if (access) {
      synced.push(access._id || booking._id);
    }
  }

  return {
    syncedCount: synced.length,
    bookingIds: synced,
  };
}

export async function getCompanySecurityLogs(user, filters = {}) {
  const scope = await resolveSecurityScope(user);
  const query = {
    ownerUserId: scope.ownerUserId,
  };

  if (filters.deviceId) query.deviceId = filters.deviceId;
  if (filters.result) query.result = filters.result;
  if (filters.eventType) query.eventType = filters.eventType;

  return SecurityAccessLog.find(query)
    .sort({ createdAt: -1 })
    .limit(Math.min(Number(filters.limit || 100), 250))
    .lean();
}

export async function getMyBookingAccess(userId, bookingId) {
  const booking = await Booking.findOne({
    _id: bookingId,
    "user.userId": userId,
  })
    .populate("space", "name slug owner address spaceType")
    .populate({
      path: "resources.resourceId",
      model: "Resource",
      select: "name type",
    })
    .lean();

  if (!booking) {
    throw new Error("Booking not found");
  }

  return ensureBookingAccessCredential(booking, {
    includeLogs: true,
  });
}

export async function regenerateMyBookingAccess(userId, bookingId) {
  const booking = await Booking.findOne({
    _id: bookingId,
    "user.userId": userId,
  })
    .populate("space", "name slug owner address spaceType")
    .populate({
      path: "resources.resourceId",
      model: "Resource",
      select: "name type",
    })
    .lean();

  if (!booking) {
    throw new Error("Booking not found");
  }

  return ensureBookingAccessCredential(booking, {
    regenerate: true,
    includeLogs: true,
  });
}

function resolveAssignmentTimeWindow(booking = {}, assignment = null, credential = null) {
  const beforeStartMinutes =
    assignment?.accessWindow?.beforeStartMinutes ??
    credential?.validity?.earlyAccessMinutes ??
    15;
  const afterEndMinutes =
    assignment?.accessWindow?.afterEndMinutes ??
    credential?.validity?.lateAccessMinutes ??
    15;

  return {
    startsAt: new Date(
      new Date(booking.startDateTime).getTime() - beforeStartMinutes * 60 * 1000,
    ),
    endsAt: new Date(
      new Date(booking.endDateTime).getTime() + afterEndMinutes * 60 * 1000,
    ),
  };
}

async function sendGrantToDevice(device, granted, metadata = {}) {
  if (!device) {
    return {
      triggered: false,
    };
  }

  const payload = {
    brand: device.brand,
    authMethod: device.authMethod,
    apiEndpoint: device.apiEndpoint,
    protocol: device.protocol,
    deviceIp: device.deviceIp,
    port: device.port,
    syncConfiguration: device.syncConfiguration,
    credentials: decryptDeviceCredentials(device),
  };

  if (device.brand === "hikvision" && cleanString(metadata.serialNo)) {
    const response = await sendProviderRequest({
      payload,
      method: "PUT",
      path:
        cleanString(device?.syncConfiguration?.remoteCheckPath) ||
        "/ISAPI/AccessControl/remoteCheck?format=json",
      headers: {
        "Content-Type": "application/json",
      },
      data: {
        RemoteCheck: {
          serialNo: metadata.serialNo,
          checkResult: granted ? "success" : "failed",
          remark: metadata.remark || "",
        },
      },
    });

    return {
      triggered: response.status >= 200 && response.status < 300,
      statusCode: response.status,
    };
  }

  if (device.brand === "zkteco" && cleanString(device?.syncConfiguration?.openDoorPath)) {
    const response = await sendProviderRequest({
      payload,
      method: "POST",
      path: device.syncConfiguration.openDoorPath,
      headers: {
        "Content-Type": "application/json",
      },
      data: {
        action: granted ? "grant" : "deny",
        ...metadata,
      },
    });

    return {
      triggered: response.status >= 200 && response.status < 300,
      statusCode: response.status,
    };
  }

  return {
    triggered: false,
  };
}

export async function validateSecurityAccessAttempt(payload = {}) {
  const credentialValue = cleanString(payload.credentialValue);
  const accessMethod = cleanString(payload.accessMethod || "qr").toLowerCase();
  const deviceId = payload.deviceId || null;
  const spaceId = payload.spaceId || null;
  const direction = cleanString(payload.direction || "entry") || "entry";

  if (!credentialValue) {
    throw new Error("Credential value is required");
  }

  if (!deviceId) {
    throw new Error("Device ID is required");
  }

  if (!["qr", "rfid", "fingerprint", "face"].includes(accessMethod)) {
    throw new Error("Unsupported access method");
  }

  let credential = null;
  let credentialPreview = credentialValue;
  let reasonCode = "";

  if (accessMethod === "qr") {
    const parts = credentialValue.split("|");
    if (parts.length !== 3 || parts[0] !== "TSA") {
      reasonCode = "invalid_qr_format";

      await createSecurityAccessLog({
        eventType: "access_denied",
        accessMethod,
        result: "denied",
        direction,
        reasonCode,
        message: "Credential was not recognized",
        credentialPreview,
        metadata: {
          deviceId,
          spaceId,
        },
      });

      return {
        granted: false,
        reason: "Credential not recognized",
        reasonCode,
      };
    }

    credentialPreview = parts[1];
    credential = await BookingAccessCredential.findOne({
      "qr.publicId": parts[1],
    }).lean();

    if (!credential || credential.qr.secretHash !== hashValue(parts[2])) {
      reasonCode = "invalid_qr";
      credential = null;
    }
  } else if (accessMethod === "rfid") {
    credentialPreview = `RFID-${credentialValue.slice(-6)}`;
    credential = await BookingAccessCredential.findOne({
      "rfidCards.cardNoHash": hashValue(credentialValue),
    }).lean();
    if (!credential) reasonCode = "rfid_not_mapped";
  } else {
    credentialPreview = credentialValue.slice(0, 16);
    credential = await BookingAccessCredential.findOne({
      biometricBindings: {
        $elemMatch: {
          method: accessMethod,
          subjectRef: credentialValue,
        },
      },
    }).lean();
    if (!credential) reasonCode = "biometric_not_mapped";
  }

  if (!credential) {
    await createSecurityAccessLog({
      eventType: "access_denied",
      accessMethod,
      result: "denied",
      direction,
      reasonCode,
      message: "Credential was not recognized",
      credentialPreview,
      metadata: {
        deviceId,
        spaceId,
      },
    });

    return {
      granted: false,
      reason: "Credential not recognized",
      reasonCode,
    };
  }

  const booking = await Booking.findById(credential.booking)
    .populate("space", "name slug owner address spaceType")
    .lean();

  if (!booking) {
    await createSecurityAccessLog({
      ownerUserId: credential.ownerUserId || null,
      adminProfileId: credential.adminProfileId || null,
      tenantId: credential.tenantId || null,
      companyId: credential.companyId || null,
      booking: credential.booking || null,
      accessCredential: credential._id,
      userId: credential.userId || null,
      space: credential.space || null,
      deviceId,
      eventType: "access_denied",
      accessMethod,
      result: "denied",
      direction,
      reasonCode: "booking_missing",
      message: "Booking not found",
      credentialPreview,
    });

    return {
      granted: false,
      reason: "Booking not found",
      reasonCode: "booking_missing",
    };
  }

  const device = await SecurityDevice.findById(deviceId).lean();
  const liveAssignments = device
    ? buildAssignmentSnapshot([device], booking)
    : [];
  const assignment =
    liveAssignments.find((item) => item.accessMethods.includes(accessMethod)) ||
    liveAssignments[0] ||
    null;
  const timeWindow = resolveAssignmentTimeWindow(booking, assignment, credential);
  const now = new Date();

  let granted = true;
  let message = "Access granted";
  reasonCode = "";

  if (credential.status !== "active") {
    granted = false;
    message = "Access credential is no longer active";
    reasonCode = "credential_inactive";
  }

  if (granted && buildCredentialStatusFromBooking(booking) !== "active") {
    granted = false;
    message = "Booking is not active";
    reasonCode = "booking_inactive";
  }

  if (
    granted &&
    (now < timeWindow.startsAt || now > timeWindow.endsAt)
  ) {
    granted = false;
    message = "Booking timing does not allow entry right now";
    reasonCode = "outside_access_window";
  }

  if (
    granted &&
    spaceId &&
    String(booking.space?._id || booking.space || "") !== String(spaceId)
  ) {
    granted = false;
    message = "Booking is not assigned to this space";
    reasonCode = "space_mismatch";
  }

  if (granted) {
    if (!device) {
      granted = false;
      message = "Device not found";
      reasonCode = "device_missing";
    } else if (
      !["approved", "pending_review"].includes(device.approvalStatus)
    ) {
      granted = false;
      message = "Device integration is suspended or disabled";
      reasonCode = "device_suspended";
    } else if (device.connectionStatus?.state !== "connected") {
      granted = false;
      message = "Device is offline or disconnected";
      reasonCode = "device_offline";
    } else if (!assignment) {
      granted = false;
      message = "Credential is not assigned to this device";
      reasonCode = "device_not_assigned";
    } else if (
      Array.isArray(assignment.accessMethods) &&
      assignment.accessMethods.length > 0 &&
      !assignment.accessMethods.includes(accessMethod)
    ) {
      granted = false;
      message = "This access method is not enabled for the device assignment";
      reasonCode = "access_method_not_allowed";
    }
  }

  const deviceTrigger = await sendGrantToDevice(device, granted, {
    serialNo: payload.serialNo,
    remark: getCredentialAccessId(credential) || credentialPreview,
    bookingId: String(booking._id),
    accessMethod,
  }).catch((error) => ({
    triggered: false,
    error: error.message,
  }));

  await BookingAccessCredential.updateOne(
    { _id: credential._id },
    {
      $set: {
        lastValidationAt: now,
        ...(granted ? { lastGrantAt: now } : { lastDenyAt: now }),
      },
      $inc: granted
        ? { "stats.totalGranted": 1 }
        : { "stats.totalDenied": 1 },
    },
  );

  if (deviceId) {
    await SecurityDevice.updateOne(
      { _id: deviceId },
      {
        $set: {
          lastAccessAt: now,
        },
        $inc: granted
          ? { "metrics.accessGrantedCount": 1 }
          : { "metrics.accessDeniedCount": 1 },
      },
    );
  }

  await createSecurityAccessLog({
    ownerUserId: credential.ownerUserId || null,
    adminProfileId: credential.adminProfileId || null,
    tenantId: credential.tenantId || null,
    companyId: credential.companyId || null,
    booking: booking._id,
    accessCredential: credential._id,
    userId: credential.userId || null,
    space: credential.space || null,
    deviceId,
    eventType: granted ? "access_granted" : "access_denied",
    accessMethod,
    result: granted ? "granted" : "denied",
    direction,
    reasonCode,
    message,
    credentialPreview,
    metadata: {
      gateTriggered: deviceTrigger?.triggered || false,
      deviceTriggerError: deviceTrigger?.error || "",
    },
  });

  return {
    granted,
    reason: message,
    reasonCode,
    bookingId: booking._id,
    accessCode: credential.qr?.publicId || "",
    deviceTriggered: Boolean(deviceTrigger?.triggered),
    location:
      assignment?.entryGate ||
      assignment?.meetingRoomLabel ||
      assignment?.workspaceLabel ||
      booking?.space?.name ||
      "Workspace",
    validFrom: timeWindow.startsAt,
    validTo: timeWindow.endsAt,
  };
}

export async function getSuperAdminSecurityOverview(filters = {}) {
  const query = {};
  if (filters.brand) query.brand = normalizeDeviceBrand(filters.brand);
  if (filters.approvalStatus) query.approvalStatus = filters.approvalStatus;
  if (filters.connectionState) {
    query["connectionStatus.state"] = filters.connectionState;
  }

  const [devices, logs] = await Promise.all([
    SecurityDevice.find(query)
      .populate("assignments.space", "name slug")
      .populate("assignments.resource", "name type")
      .populate("companyId", "displayName legalName")
      .populate("ownerUserId", "username email")
      .sort({ createdAt: -1 })
      .lean(),
    SecurityAccessLog.find({})
      .sort({ createdAt: -1 })
      .limit(Math.min(Number(filters.limit || 100), 250))
      .lean(),
  ]);

  const serializedDevices = devices.map((device) => {
    const serialized = serializeSecurityDevice(device);
    return {
      ...serialized,
      companyName:
        device?.companyId?.displayName ||
        device?.companyId?.legalName ||
        device?.deviceName ||
        "",
      owner: {
        name: device?.ownerUserId?.username || "",
        email: device?.ownerUserId?.email || "",
      },
    };
  });

  return {
    summary: {
      totalDevices: serializedDevices.length,
      connectedDevices: serializedDevices.filter(
        (device) => device.connectionStatus?.state === "connected",
      ).length,
      offlineDevices: serializedDevices.filter(
        (device) => device.connectionStatus?.state !== "connected",
      ).length,
      suspendedDevices: serializedDevices.filter(
        (device) =>
          device.approvalStatus === "suspended" ||
          device.approvalStatus === "disabled",
      ).length,
      totalAssignedSpaces: uniqueStrings(
        serializedDevices.flatMap((device) =>
          device.assignments.map((assignment) => String(assignment.space || "")),
        ),
      ).length,
      accessActivity: serializedDevices.reduce(
        (sum, device) => sum + Number(device.usage || 0),
        0,
      ),
      failedSyncAttempts: serializedDevices.reduce(
        (sum, device) =>
          sum + Number(device?.metrics?.failedSyncAttempts || 0),
        0,
      ),
    },
    devices: serializedDevices,
    logs,
  };
}

export async function updateSuperAdminSecurityDeviceStatus(
  deviceId,
  approvalStatus,
  actorUser,
  reason = "",
) {
  const allowedStatuses = ["approved", "suspended", "disabled", "pending_review"];
  if (!allowedStatuses.includes(approvalStatus)) {
    throw new Error("Unsupported device status");
  }

  const device = await SecurityDevice.findById(deviceId).lean();
  if (!device) {
    throw new Error("Security device not found");
  }

  const connectionState =
    approvalStatus === "suspended"
      ? "suspended"
      : approvalStatus === "disabled"
        ? "disabled"
        : device?.connectionStatus?.online
          ? "connected"
          : device?.connectionStatus?.state || "failed";

  await SecurityDevice.updateOne(
    { _id: deviceId },
    {
      $set: {
        approvalStatus,
        connectionStatus: {
          ...(device.connectionStatus || {}),
          state: connectionState,
        },
      },
    },
  );

  await createSecurityAccessLog({
    ownerUserId: device.ownerUserId || null,
    adminProfileId: device.adminProfileId || null,
    tenantId: device.tenantId || null,
    companyId: device.companyId || null,
    deviceId,
    eventType: "device_status_changed",
    accessMethod: "system",
    result: "info",
    message:
      reason ||
      `Device status changed to ${approvalStatus} by super admin ${actorUser?._id || ""}`,
  });

  const hydratedDevice = await SecurityDevice.findById(deviceId)
    .populate("assignments.space", "name slug")
    .populate("assignments.resource", "name type")
    .lean();

  return serializeSecurityDevice(hydratedDevice);
}
