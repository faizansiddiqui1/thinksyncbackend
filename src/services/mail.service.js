import EmailTemplate from "../models/super_admin_models/EmailTemplate.js";
import Space from "../models/admin_models/Space.js";
import { getActiveSMTP } from "./smtp.service.js";
import createTransporter from "../utils/createTransporter.js";
import {
  ensureDefaultEmailTemplates,
  getEmailVariableCatalog,
  renderEmailTemplate,
} from "./emailTemplateRegistry.service.js";
import { ensureBookingAccessCredential } from "./securityAccess/securityAccess.service.js";

const transporterCache = new Map();
const emailQueue = [];
let activeWorkers = 0;
const MAIL_QUEUE_CONCURRENCY = 2;

function getAppBaseUrl() {
  return (
    process.env.FRONTEND_URL ||
    process.env.PUBLIC_FRONTEND_URL ||
    "http://localhost:3000"
  ).replace(/\/+$/, "");
}

function getPlatformName() {
  return process.env.PLATFORM_NAME || "ThinkSync";
}

function getSupportEmail() {
  return process.env.SUPPORT_EMAIL || process.env.DEFAULT_FROM_EMAIL || "support@thinksyncspace.com";
}

function getCurrentYear() {
  return String(new Date().getFullYear());
}

function formatCurrencyInr(amount = 0) {
  const numericAmount = Number(amount || 0);
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(Number.isFinite(numericAmount) ? numericAmount : 0);
}

function formatDateTime(value, timeZone = "Asia/Kolkata") {
  if (!value) return "";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  return new Intl.DateTimeFormat("en-IN", {
    timeZone,
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatDateOnly(value, timeZone = "Asia/Kolkata") {
  if (!value) return "";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  return new Intl.DateTimeFormat("en-IN", {
    timeZone,
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

function formatTimeOnly(value, timeZone = "Asia/Kolkata") {
  if (!value) return "";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  return new Intl.DateTimeFormat("en-IN", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatBookingDuration(booking = {}) {
  const start = new Date(
    booking.startDateTime || booking.bookingDuration?.startDate || "",
  );
  const end = new Date(
    booking.endDateTime || booking.bookingDuration?.endDate || "",
  );

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return "";
  }

  const minutes = Math.max(0, Math.round((end - start) / (60 * 1000)));
  if (minutes >= 24 * 60 && minutes % (24 * 60) === 0) {
    const days = minutes / (24 * 60);
    return `${days} ${days === 1 ? "day" : "days"}`;
  }

  if (minutes >= 60 && minutes % 60 === 0) {
    const hours = minutes / 60;
    return `${hours} ${hours === 1 ? "hour" : "hours"}`;
  }

  return `${minutes} minutes`;
}

function formatWorkspaceAddress(space = {}) {
  const address = space.address || {};
  const city =
    address.city?.name ||
    address.city?.label ||
    address.city ||
    space.location?.cityName ||
    space.location?.city ||
    "";

  return [
    address.line1,
    address.line2,
    address.street,
    address.locality,
    city,
    address.state,
    address.pincode || address.postalCode,
  ]
    .filter(Boolean)
    .join(", ");
}

async function getTransporter(tenant) {
  const smtp = await getActiveSMTP(tenant);
  const cacheKey = [
    smtp.host,
    smtp.port,
    smtp.secure,
    smtp.username,
    smtp.password,
    smtp.fromEmail,
  ].join(":");

  const cached = transporterCache.get(cacheKey);
  if (cached?.transporter && cached?.verified) {
    return {
      smtp,
      transporter: cached.transporter,
    };
  }

  const transporter = cached?.transporter || createTransporter(smtp);

  await transporter.verify();

  transporterCache.set(cacheKey, {
    transporter,
    verified: true,
  });

  return {
    smtp,
    transporter,
  };
}

function drainEmailQueue() {
  while (
    activeWorkers < MAIL_QUEUE_CONCURRENCY &&
    emailQueue.length > 0
  ) {
    const item = emailQueue.shift();
    activeWorkers += 1;

    item.task()
      .then(item.resolve)
      .catch(item.reject)
      .finally(() => {
        activeWorkers -= 1;
        drainEmailQueue();
      });
  }
}

export function enqueueEmail(task) {
  return new Promise((resolve, reject) => {
    emailQueue.push({ task, resolve, reject });
    drainEmailQueue();
  });
}

export const sendEmail = async ({
  tenant,
  to,
  subject,
  html,
  queue = true,
}) => {
  if (!to) throw new Error("Email recipient missing");
  if (!subject) throw new Error("Email subject missing");
  if (!html) throw new Error("Email html missing");

  const deliver = async () => {
    const { smtp, transporter } = await getTransporter(tenant);

    await transporter.sendMail({
      from: `"${smtp.fromName}" <${smtp.fromEmail}>`,
      to,
      subject,
      html,
    });

    return true;
  };

  return queue ? enqueueEmail(deliver) : deliver();
};

export async function getEmailTemplateByName(name, { allowInactive = false } = {}) {
  await ensureDefaultEmailTemplates();

  const query = {
    name: String(name || "").trim().toLowerCase(),
  };

  if (!allowInactive) {
    query.isActive = true;
  }

  const template = await EmailTemplate.findOne(query).lean();

  if (!template) {
    throw new Error(
      allowInactive
        ? `Email template "${name}" not found`
        : `Active email template "${name}" not found`,
    );
  }

  return template;
}

export async function previewEmailTemplate({
  subject,
  html,
  variables = {},
}) {
  return renderEmailTemplate({
    subject,
    html,
    variables,
  });
}

export async function sendTemplatedEmail({
  templateName,
  tenant = null,
  to,
  variables = {},
  queue = true,
}) {
  const template = await getEmailTemplateByName(templateName);
  const rendered = renderEmailTemplate({
    subject: template.subject,
    html: template.html,
    variables,
  });

  await sendEmail({
    tenant,
    to,
    subject: rendered.subject,
    html: rendered.html,
    queue,
  });

  return {
    success: true,
    templateName,
    variablesUsed: rendered.variablesUsed,
  };
}

async function resolveSpaceForBooking(booking) {
  if (!booking?.space) return null;

  if (typeof booking.space === "object" && booking.space?.name) {
    return booking.space;
  }

  return Space.findById(booking.space)
    .select("name owner spaceType listingModes address location")
    .lean();
}

async function buildBookingMailContext(
  booking,
  { access: suppliedAccess = null, includeAccess = false } = {},
) {
  const space = await resolveSpaceForBooking(booking);
  const timeZone =
    booking?.timezone || space?.address?.timezone || "Asia/Kolkata";
  const baseUrl = getAppBaseUrl();
  const access = includeAccess
    ? suppliedAccess ||
      (await ensureBookingAccessCredential(booking).catch(() => null))
    : null;
  const accessLocation =
    access?.entryPermissions?.join(", ") ||
    access?.locations
      ?.map((location) => {
        return [
          location.entryGate,
          location.floorLabel,
          location.workspaceLabel,
          location.meetingRoomLabel,
        ]
          .filter(Boolean)
          .join(" • ");
      })
      .filter(Boolean)
      .join(", ") ||
    (space?.name || "Assigned workspace");

  return {
    tenant: space?.owner || null,
    userName:
      booking?.user?.name ||
      booking?.user?.userId?.username ||
      booking?.user?.userId?.name ||
      "Workspace guest",
    workspaceName: space?.name || "Your workspace",
    workspaceType:
      booking?.spaceType ||
      space?.spaceType ||
      "workspace",
    isShortTermBooking: space?.listingModes?.shortTerm !== false,
    workspaceAddress:
      formatWorkspaceAddress(space) || space?.name || "Assigned workspace",
    bookingId: booking?._id ? String(booking._id) : "",
    bookingDate: formatDateOnly(
      booking?.startDateTime || booking?.bookingDuration?.startDate,
      timeZone,
    ),
    bookingStart: formatDateTime(
      booking?.startDateTime || booking?.bookingDuration?.startDate,
      timeZone,
    ),
    bookingEnd: formatDateTime(
      booking?.endDateTime || booking?.bookingDuration?.endDate,
      timeZone,
    ),
    startTime: formatTimeOnly(
      booking?.startDateTime || booking?.bookingDuration?.startDate,
      timeZone,
    ),
    endTime: formatTimeOnly(
      booking?.endDateTime || booking?.bookingDuration?.endDate,
      timeZone,
    ),
    duration: formatBookingDuration(booking),
    paymentAmount: formatCurrencyInr(
      booking?.priceBreakdown?.totalAmount,
    ),
    accessCode: access?.accessCode || "",
    accessValidity: access?.validity?.label || "",
    accessLocation,
    accessQrImage: access?.qrImage || "",
    accessInstructions:
      access?.status === "active"
        ? "Show this QR or access code at the assigned entry during your active booking window. The same pass stays linked to your booking until it expires."
        : "Your booking access status will update automatically in your dashboard if the booking changes.",
    reviewLink: `${baseUrl}/bookings/${booking?._id}/review`,
    manageBookingLink: `${baseUrl}/dashboard/bookings?booking=${booking?._id}`,
    platformName: getPlatformName(),
    supportEmail: getSupportEmail(),
    year: getCurrentYear(),
  };
}

function buildBaseVariables(overrides = {}) {
  return {
    platformName: getPlatformName(),
    supportEmail: getSupportEmail(),
    dashboardLink: `${getAppBaseUrl()}/dashboard`,
    secureAccountLink: `${getAppBaseUrl()}/security`,
    year: getCurrentYear(),
    ...overrides,
  };
}

export async function sendBookingConfirmationEmail({
  booking,
  queue = true,
}) {
  if (!booking?.user?.email) {
    throw new Error("Booking email recipient missing");
  }

  const context = await buildBookingMailContext(booking);

  return sendTemplatedEmail({
    templateName: "booking_confirmed",
    tenant: context.tenant,
    to: booking.user.email,
    variables: buildBaseVariables(context),
    queue,
  });
}

export async function sendShortTermBookingAccessEmail({
  booking,
  access = null,
  queue = true,
}) {
  if (!booking?.user?.email) {
    throw new Error("Booking access email recipient missing");
  }

  const context = await buildBookingMailContext(booking, {
    access,
    includeAccess: true,
  });

  if (!context.isShortTermBooking) {
    return {
      success: true,
      skipped: true,
      reason: "not_a_short_term_booking",
    };
  }

  if (!context.accessQrImage || !context.accessCode) {
    return {
      success: true,
      skipped: true,
      reason: "booking_access_not_available",
    };
  }

  return sendTemplatedEmail({
    templateName: "short_term_booking_access",
    tenant: context.tenant,
    to: booking.user.email,
    variables: buildBaseVariables(context),
    queue,
  });
}

export async function sendReviewEmail({
  booking,
  queue = true,
  force = false,
  templateName = "booking_completed_review_request",
}) {
  const paymentStatus =
    booking?.paymentStatus || booking?.payment?.status || "pending";

  if (!force && booking?.reviewMailSent) {
    return {
      success: true,
      skipped: true,
      reason: "review_mail_already_sent",
    };
  }

  if (booking?.status !== "completed") {
    throw new Error("Review email can only be sent for completed bookings");
  }

  if (paymentStatus !== "paid") {
    throw new Error("Review email can only be sent for paid bookings");
  }

  if (!booking?.user?.email) {
    throw new Error("Review email recipient missing");
  }

  const context = await buildBookingMailContext(booking);

  return sendTemplatedEmail({
    templateName,
    tenant: context.tenant,
    to: booking.user.email,
    variables: buildBaseVariables(context),
    queue,
  });
}

function normalizeEnquiryTemplateName(enquiry = {}) {
  const product = [
    enquiry.product,
    enquiry.spaceType,
    enquiry.pageType,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_");

  if (product.includes("virtual")) {
    return "virtual_office_enquiry_confirmation";
  }
  if (product.includes("private")) {
    return "private_office_enquiry_confirmation";
  }
  if (product.includes("meeting")) {
    return "meeting_room_enquiry_confirmation";
  }
  if (product.includes("hot_desk") || product.includes("hotdesk")) {
    return "hot_desk_enquiry_confirmation";
  }
  if (product.includes("cowork") || product.includes("co_work")) {
    return "coworking_enquiry_confirmation";
  }

  return "workspace_enquiry_confirmation";
}

function humanizeServiceName(value = "") {
  return String(value || "workspace")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

export async function sendEnquiryConfirmationEmail({
  enquiry,
  queue = true,
}) {
  if (!enquiry?.email) {
    throw new Error("Enquiry email recipient missing");
  }

  const spaceId = enquiry.spaceId || enquiry.listingId || null;
  const space = spaceId
    ? await Space.findById(spaceId).select("name owner address location").lean()
    : null;
  const city =
    enquiry.city ||
    space?.address?.city?.name ||
    space?.address?.city ||
    space?.location?.cityName ||
    "";

  return sendTemplatedEmail({
    templateName: normalizeEnquiryTemplateName(enquiry),
    tenant: space?.owner || null,
    to: enquiry.email,
    variables: buildBaseVariables({
      userName: enquiry.name || "there",
      workspaceName: enquiry.listingName || space?.name || "Workspace marketplace",
      city: city || "Your selected city",
      enquiryId: enquiry._id ? String(enquiry._id) : "",
      enquiryService: humanizeServiceName(
        enquiry.product || enquiry.spaceType || "workspace",
      ),
    }),
    queue,
  });
}

export async function sendWelcomeEmail({
  user,
  tenant = null,
  queue = true,
}) {
  if (!user?.email) {
    throw new Error("Welcome email recipient missing");
  }

  return sendTemplatedEmail({
    templateName: "welcome_email",
    tenant,
    to: user.email,
    variables: buildBaseVariables({
      userName: user.username || user.name || "there",
    }),
    queue,
  });
}

export async function sendForgotPasswordEmail({
  user,
  resetLink,
  tenant = null,
  queue = true,
}) {
  if (!user?.email) {
    throw new Error("Forgot password email recipient missing");
  }

  return sendTemplatedEmail({
    templateName: "password_reset",
    tenant,
    to: user.email,
    variables: buildBaseVariables({
      userName: user.username || user.name || "there",
      resetLink,
    }),
    queue,
  });
}

export async function sendOtpEmail({
  tenant = null,
  to,
  userName = "there",
  otp,
  otpExpiryMinutes,
  queue = true,
}) {
  return sendTemplatedEmail({
    templateName: "send_otp",
    tenant,
    to,
    variables: buildBaseVariables({
      userName,
      otp,
      otpExpiryMinutes: String(otpExpiryMinutes),
    }),
    queue,
  });
}

export async function sendVerifyOtpEmail({
  tenant = null,
  to,
  userName = "there",
  otp,
  otpExpiryMinutes,
  queue = true,
}) {
  return sendTemplatedEmail({
    templateName: "verify_otp",
    tenant,
    to,
    variables: buildBaseVariables({
      userName,
      otp,
      otpExpiryMinutes: String(otpExpiryMinutes),
    }),
    queue,
  });
}

export async function sendSecurityAlertEmail({
  tenant = null,
  to,
  userName = "there",
  ip,
  userAgent,
  time,
  secureAccountLink,
  queue = true,
}) {
  return sendTemplatedEmail({
    templateName: "new_device_login_alert",
    tenant,
    to,
    variables: buildBaseVariables({
      userName,
      loginIp: ip || "-",
      deviceInfo: userAgent || "Unknown device",
      loginTime: time
        ? new Date(time).toUTCString()
        : new Date().toUTCString(),
      secureAccountLink:
        secureAccountLink || `${getAppBaseUrl()}/security`,
    }),
    queue,
  });
}

export function getMailTemplateVariableCatalog() {
  return getEmailVariableCatalog();
}
