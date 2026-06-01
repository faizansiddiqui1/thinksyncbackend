import sanitizeHtml from "sanitize-html";
import EmailTemplate from "../models/super_admin_models/EmailTemplate.js";

const EMAIL_SANITIZE_OPTIONS = {
  allowedTags: [
    "a",
    "b",
    "blockquote",
    "br",
    "caption",
    "center",
    "code",
    "div",
    "em",
    "figcaption",
    "figure",
    "footer",
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "header",
    "hr",
    "img",
    "li",
    "main",
    "ol",
    "p",
    "section",
    "small",
    "span",
    "strong",
    "sub",
    "sup",
    "table",
    "tbody",
    "td",
    "tfoot",
    "th",
    "thead",
    "tr",
    "u",
    "ul",
  ],
  allowedAttributes: {
    "*": [
      "align",
      "bgcolor",
      "class",
      "height",
      "role",
      "style",
      "title",
      "valign",
      "width",
    ],
    a: ["href", "name", "rel", "target"],
    img: ["alt", "height", "src", "srcset", "width"],
    table: ["border", "cellpadding", "cellspacing"],
    td: ["colspan", "rowspan"],
    th: ["colspan", "rowspan"],
  },
  allowedSchemes: ["http", "https", "mailto", "tel", "data"],
  parseStyleAttributes: true,
};

function createEmailShell({
  accent = "#0f172a",
  eyebrow = "ThinkSync",
  title,
  intro,
  body,
  footer,
}) {
  return `<!DOCTYPE html>
<html lang="en">
  <body style="margin:0;background:#edf4ff;font-family:Arial,Helvetica,sans-serif;color:#0f172a;">
    <div style="padding:32px 16px;background:
      radial-gradient(circle at top left, rgba(14,165,233,0.12), transparent 32%),
      radial-gradient(circle at top right, rgba(249,115,22,0.12), transparent 28%),
      linear-gradient(180deg, #eff6ff 0%, #f8fafc 100%);
    ">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;margin:0 auto;border-collapse:collapse;">
        <tr>
          <td style="padding-bottom:18px;">
            <p style="margin:0 0 10px;font-size:11px;font-weight:700;letter-spacing:0.28em;text-transform:uppercase;color:#0369a1;">${eyebrow}</p>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border-radius:28px;overflow:hidden;background:#ffffff;box-shadow:0 18px 40px rgba(15,23,42,0.10);">
              <tr>
                <td style="padding:32px 32px 12px;background:linear-gradient(135deg, ${accent} 0%, #1d4ed8 100%);color:#ffffff;">
                  <h1 style="margin:0;font-size:30px;line-height:1.2;font-weight:800;">${title}</h1>
                </td>
              </tr>
              <tr>
                <td style="padding:28px 32px 8px;">
                  <p style="margin:0 0 18px;font-size:16px;line-height:1.7;color:#334155;">${intro}</p>
                  ${body}
                </td>
              </tr>
              <tr>
                <td style="padding:0 32px 32px;">
                  <div style="border-top:1px solid #e2e8f0;padding-top:18px;">
                    <p style="margin:0;font-size:12px;line-height:1.7;color:#64748b;">${footer}</p>
                  </div>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </div>
  </body>
</html>`;
}

function normalizeTemplateName(name = "") {
  return String(name)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function humanizeName(name = "") {
  return String(name)
    .split("_")
    .filter(Boolean)
    .map((chunk) => chunk.charAt(0).toUpperCase() + chunk.slice(1))
    .join(" ");
}

export const EMAIL_TEMPLATE_VARIABLES = {
  userName: {
    label: "User name",
    description: "Recipient display name.",
    sample: "Aarav Sharma",
  },
  workspaceName: {
    label: "Workspace name",
    description: "Booked workspace display name.",
    sample: "Harbor Meeting Loft",
  },
  workspaceAddress: {
    label: "Workspace address",
    description: "Readable workspace address for visits and booking access.",
    sample: "Gate A, Harbor Business Park, Mumbai",
  },
  workspaceType: {
    label: "Workspace type",
    description: "Meeting room, private cabin, shared desk, event space, or day pass.",
    sample: "Meeting room",
  },
  bookingId: {
    label: "Booking ID",
    description: "Internal booking reference.",
    sample: "BK-4721",
  },
  bookingDate: {
    label: "Booking date",
    description: "Formatted booking date.",
    sample: "26 May 2026",
  },
  startTime: {
    label: "Start time",
    description: "Formatted booking start time.",
    sample: "10:00 AM",
  },
  endTime: {
    label: "End time",
    description: "Formatted booking end time.",
    sample: "01:00 PM",
  },
  duration: {
    label: "Duration",
    description: "Readable booking duration.",
    sample: "3 hours",
  },
  bookingStart: {
    label: "Booking start",
    description: "Formatted start date and time.",
    sample: "26 May 2026, 10:00 AM",
  },
  bookingEnd: {
    label: "Booking end",
    description: "Formatted end date and time.",
    sample: "26 May 2026, 01:00 PM",
  },
  paymentAmount: {
    label: "Payment amount",
    description: "Formatted booking amount.",
    sample: "INR 2,499",
  },
  accessCode: {
    label: "Access code",
    description: "Booking-linked access code shown with the QR pass.",
    sample: "ACC-3F81A2",
  },
  accessValidity: {
    label: "Access validity",
    description: "Readable access timing window.",
    sample: "26 May 2026, 09:45 AM to 26 May 2026, 06:15 PM",
  },
  accessLocation: {
    label: "Access location",
    description: "Assigned entry gate or access-enabled location.",
    sample: "Gate A • Floor 3 • Meeting Room",
  },
  accessQrImage: {
    label: "Access QR image",
    description: "QR image data URI for booking access.",
    sample: "data:image/png;base64,...",
  },
  accessInstructions: {
    label: "Access instructions",
    description: "Short access instructions for the booking pass.",
    sample: "Show this QR at the assigned gate during your booking window.",
  },
  platformName: {
    label: "Platform name",
    description: "Marketplace brand name.",
    sample: "ThinkSync",
  },
  supportEmail: {
    label: "Support email",
    description: "Customer support mailbox.",
    sample: "support@thinksyncspace.com",
  },
  city: {
    label: "City",
    description: "Workspace or enquiry city.",
    sample: "Mumbai",
  },
  enquiryId: {
    label: "Enquiry ID",
    description: "Marketplace enquiry reference.",
    sample: "ENQ-4721",
  },
  enquiryService: {
    label: "Enquiry service",
    description: "Requested workspace product or service.",
    sample: "Private Office",
  },
  reviewLink: {
    label: "Review link",
    description: "Direct link to submit a review.",
    sample: "https://app.example.com/bookings/123/review",
  },
  manageBookingLink: {
    label: "Manage booking link",
    description: "Direct link to booking details.",
    sample: "https://app.example.com/bookings/123",
  },
  dashboardLink: {
    label: "Dashboard link",
    description: "Dashboard landing URL.",
    sample: "https://app.example.com/dashboard",
  },
  resetLink: {
    label: "Reset link",
    description: "Password reset URL.",
    sample: "https://app.example.com/reset-password/token-123",
  },
  secureAccountLink: {
    label: "Secure account link",
    description: "Security settings URL.",
    sample: "https://app.example.com/security",
  },
  otp: {
    label: "OTP",
    description: "One-time password or verification code.",
    sample: "482913",
  },
  otpExpiryMinutes: {
    label: "OTP expiry",
    description: "OTP validity in minutes.",
    sample: "10",
  },
  loginIp: {
    label: "Login IP",
    description: "IP address for security alert emails.",
    sample: "203.0.113.8",
  },
  deviceInfo: {
    label: "Device info",
    description: "Browser or device string.",
    sample: "Chrome on Windows 11",
  },
  loginTime: {
    label: "Login time",
    description: "Formatted login timestamp.",
    sample: "26 May 2026, 08:34 PM UTC",
  },
  year: {
    label: "Year",
    description: "Current year.",
    sample: "2026",
  },
};

export const SYSTEM_EMAIL_TEMPLATE_DEFINITIONS = [
  {
    name: "send_otp",
    displayName: "Send OTP",
    description: "Login and signup OTP delivery template.",
    category: "authentication",
    isActive: true,
    isSystem: true,
    subject: "Your {{platformName}} verification code",
    html: createEmailShell({
      accent: "#0f172a",
      eyebrow: "Authentication",
      title: "Your one-time passcode",
      intro:
        "Use the code below to continue securely in {{platformName}}. This code is time-sensitive and should not be shared.",
      body: `
        <div style="margin:24px 0;text-align:center;">
          <div style="display:inline-block;border-radius:20px;background:#e0f2fe;padding:18px 28px;font-size:34px;font-weight:800;letter-spacing:0.32em;color:#0f172a;">
            {{otp}}
          </div>
        </div>
        <p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:#334155;">
          This code expires in <strong>{{otpExpiryMinutes}} minutes</strong>.
        </p>
        <p style="margin:0;font-size:15px;line-height:1.7;color:#334155;">
          If you didn’t request this code, you can safely ignore this email.
        </p>
      `,
      footer:
        "Need help? Reply to {{supportEmail}} and our team will take it from there. Copyright {{year}} {{platformName}}.",
    }),
    allowedVariables: [
      "otp",
      "otpExpiryMinutes",
      "platformName",
      "supportEmail",
      "year",
    ],
  },
  {
    name: "verify_otp",
    displayName: "Verify OTP",
    description: "Profile email verification OTP template.",
    category: "authentication",
    isActive: true,
    isSystem: true,
    subject: "Verify your email for {{platformName}}",
    html: createEmailShell({
      accent: "#ea580c",
      eyebrow: "Verification",
      title: "Confirm your email address",
      intro:
        "You’re one quick step away from finishing your email verification for {{platformName}}.",
      body: `
        <p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:#334155;">
          Hi {{userName}}, use this code to confirm your email address:
        </p>
        <div style="margin:24px 0;text-align:center;">
          <div style="display:inline-block;border-radius:20px;background:#fff7ed;padding:18px 28px;font-size:34px;font-weight:800;letter-spacing:0.32em;color:#9a3412;">
            {{otp}}
          </div>
        </div>
        <p style="margin:0;font-size:15px;line-height:1.7;color:#334155;">
          The code expires in <strong>{{otpExpiryMinutes}} minutes</strong>.
        </p>
      `,
      footer:
        "For verification support, reach out at {{supportEmail}}. Copyright {{year}} {{platformName}}.",
    }),
    allowedVariables: [
      "userName",
      "otp",
      "otpExpiryMinutes",
      "platformName",
      "supportEmail",
      "year",
    ],
  },
  {
    name: "welcome_email",
    displayName: "Welcome Email",
    description: "First-login welcome template.",
    category: "marketing",
    isActive: true,
    isSystem: true,
    subject: "Welcome to {{platformName}}, {{userName}}",
    html: createEmailShell({
      accent: "#0f766e",
      eyebrow: "Welcome",
      title: "Your workspace journey starts now",
      intro:
        "Thanks for joining {{platformName}}. You can now explore meeting rooms, private cabins, shared desks, event spaces, and day passes in one place.",
      body: `
        <p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:#334155;">
          We’re excited to help you discover flexible workspaces that match your day, your team, and your pace.
        </p>
        <div style="margin:24px 0;">
          <a href="{{dashboardLink}}" target="_blank" rel="noreferrer" style="display:inline-block;border-radius:999px;background:#0f766e;padding:14px 22px;font-size:14px;font-weight:700;color:#ffffff;text-decoration:none;">
            Open dashboard
          </a>
        </div>
        <p style="margin:0;font-size:15px;line-height:1.7;color:#334155;">
          Need a hand? Our team is here at {{supportEmail}}.
        </p>
      `,
      footer:
        "Welcome aboard. Copyright {{year}} {{platformName}}.",
    }),
    allowedVariables: [
      "userName",
      "dashboardLink",
      "platformName",
      "supportEmail",
      "year",
    ],
  },
  {
    name: "booking_confirmation",
    displayName: "Booking Confirmation",
    description: "Workspace booking confirmation email.",
    category: "booking",
    isActive: true,
    isSystem: true,
    subject: "Your booking at {{workspaceName}} is confirmed",
    html: createEmailShell({
      accent: "#1d4ed8",
      eyebrow: "Booking Confirmed",
      title: "Your workspace is reserved",
      intro:
        "Everything is set for your upcoming {{workspaceType}} booking. Here’s a quick snapshot of what’s locked in.",
      body: `
        <p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:#334155;">
          Hi {{userName}}, thanks for booking with {{platformName}}.
        </p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0;border-collapse:collapse;border-radius:18px;overflow:hidden;background:#f8fafc;">
          <tr>
            <td style="padding:16px 18px;border-bottom:1px solid #e2e8f0;">
              <strong style="display:block;margin-bottom:6px;font-size:13px;color:#64748b;">Workspace</strong>
              <span style="font-size:16px;color:#0f172a;">{{workspaceName}}</span>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 18px;border-bottom:1px solid #e2e8f0;">
              <strong style="display:block;margin-bottom:6px;font-size:13px;color:#64748b;">Start</strong>
              <span style="font-size:16px;color:#0f172a;">{{bookingStart}}</span>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 18px;border-bottom:1px solid #e2e8f0;">
              <strong style="display:block;margin-bottom:6px;font-size:13px;color:#64748b;">End</strong>
              <span style="font-size:16px;color:#0f172a;">{{bookingEnd}}</span>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 18px;">
              <strong style="display:block;margin-bottom:6px;font-size:13px;color:#64748b;">Amount paid</strong>
              <span style="font-size:16px;color:#0f172a;">{{paymentAmount}}</span>
            </td>
          </tr>
        </table>
        <div style="margin:20px 0;border-radius:18px;background:#eff6ff;padding:18px;">
          <p style="margin:0 0 10px;font-size:13px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#1d4ed8;">Access Space</p>
          <p style="margin:0 0 10px;font-size:15px;line-height:1.7;color:#0f172a;">
            <strong>Access code:</strong> {{accessCode}}<br />
            <strong>Validity:</strong> {{accessValidity}}<br />
            <strong>Entry details:</strong> {{accessLocation}}
          </p>
          <div style="margin:14px 0;text-align:center;">
            <img src="{{accessQrImage}}" alt="Booking access QR" width="180" height="180" style="max-width:180px;width:100%;height:auto;border-radius:18px;background:#ffffff;padding:12px;" />
          </div>
          <p style="margin:0;font-size:14px;line-height:1.7;color:#334155;">
            {{accessInstructions}}
          </p>
        </div>
        <div style="margin:24px 0;">
          <a href="{{manageBookingLink}}" target="_blank" rel="noreferrer" style="display:inline-block;border-radius:999px;background:#1d4ed8;padding:14px 22px;font-size:14px;font-weight:700;color:#ffffff;text-decoration:none;">
            View booking
          </a>
        </div>
      `,
      footer:
        "Questions about your booking? Reach us at {{supportEmail}}. Copyright {{year}} {{platformName}}.",
    }),
    allowedVariables: [
      "userName",
      "workspaceName",
      "workspaceType",
      "bookingStart",
      "bookingEnd",
      "paymentAmount",
      "accessCode",
      "accessValidity",
      "accessLocation",
      "accessQrImage",
      "accessInstructions",
      "manageBookingLink",
      "platformName",
      "supportEmail",
      "year",
    ],
  },
  {
    name: "booking_confirmed",
    displayName: "Booking Confirmed",
    description: "Production booking confirmation sent after successful payment.",
    category: "booking",
    isActive: true,
    isSystem: true,
    subject: "Booking confirmed: {{workspaceName}}",
    html: createEmailShell({
      accent: "#1d4ed8",
      eyebrow: "Booking Confirmed",
      title: "Your workspace is reserved",
      intro:
        "Hi {{userName}}, your booking has been confirmed successfully. Keep this summary handy for your visit.",
      body: `
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0;border-collapse:collapse;border-radius:18px;overflow:hidden;background:#f8fafc;">
          <tr><td style="padding:14px 18px;border-bottom:1px solid #e2e8f0;"><strong>Booking ID:</strong> {{bookingId}}</td></tr>
          <tr><td style="padding:14px 18px;border-bottom:1px solid #e2e8f0;"><strong>Workspace:</strong> {{workspaceName}}</td></tr>
          <tr><td style="padding:14px 18px;border-bottom:1px solid #e2e8f0;"><strong>Date:</strong> {{bookingDate}}</td></tr>
          <tr><td style="padding:14px 18px;border-bottom:1px solid #e2e8f0;"><strong>Time:</strong> {{startTime}} to {{endTime}}</td></tr>
          <tr><td style="padding:14px 18px;"><strong>Duration:</strong> {{duration}}</td></tr>
        </table>
        <div style="margin:24px 0;">
          <a href="{{manageBookingLink}}" target="_blank" rel="noreferrer" style="display:inline-block;border-radius:999px;background:#1d4ed8;padding:14px 22px;font-size:14px;font-weight:700;color:#ffffff;text-decoration:none;">View booking</a>
        </div>
      `,
      footer:
        "Questions about your booking? Reach us at {{supportEmail}}. Copyright {{year}} {{platformName}}.",
    }),
    allowedVariables: [
      "userName",
      "bookingId",
      "workspaceName",
      "bookingDate",
      "startTime",
      "endTime",
      "duration",
      "manageBookingLink",
      "supportEmail",
      "platformName",
      "year",
    ],
  },
  {
    name: "short_term_booking_access",
    displayName: "Short Term Booking Access",
    description: "Existing security-access QR pass for short-term workspace bookings.",
    category: "booking",
    isActive: true,
    isSystem: true,
    subject: "Your access pass for {{workspaceName}}",
    html: createEmailShell({
      accent: "#0f766e",
      eyebrow: "Workspace Access",
      title: "Your booking access pass",
      intro:
        "Present this QR code at the workspace entrance. This is the same pass linked to your confirmed booking.",
      body: `
        <div style="margin:18px 0;text-align:center;">
          <img src="{{accessQrImage}}" alt="Booking access QR" width="220" height="220" style="max-width:220px;width:100%;height:auto;border-radius:18px;background:#ffffff;padding:12px;border:1px solid #e2e8f0;" />
        </div>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0;border-collapse:collapse;border-radius:18px;overflow:hidden;background:#f8fafc;">
          <tr><td style="padding:14px 18px;border-bottom:1px solid #e2e8f0;"><strong>Booking ID:</strong> {{bookingId}}</td></tr>
          <tr><td style="padding:14px 18px;border-bottom:1px solid #e2e8f0;"><strong>Workspace:</strong> {{workspaceName}}</td></tr>
          <tr><td style="padding:14px 18px;border-bottom:1px solid #e2e8f0;"><strong>Address:</strong> {{workspaceAddress}}</td></tr>
          <tr><td style="padding:14px 18px;border-bottom:1px solid #e2e8f0;"><strong>Access code:</strong> {{accessCode}}</td></tr>
          <tr><td style="padding:14px 18px;"><strong>Validity:</strong> {{accessValidity}}</td></tr>
        </table>
        <p style="margin:0 0 18px;font-size:15px;line-height:1.7;color:#334155;">{{accessInstructions}}</p>
      `,
      footer:
        "For access support, contact {{supportEmail}}. Copyright {{year}} {{platformName}}.",
    }),
    allowedVariables: [
      "bookingId",
      "workspaceName",
      "workspaceAddress",
      "accessQrImage",
      "accessCode",
      "accessValidity",
      "accessInstructions",
      "supportEmail",
      "platformName",
      "year",
    ],
  },
  {
    name: "password_reset",
    displayName: "Password Reset",
    description: "Password reset email template.",
    category: "authentication",
    isActive: true,
    isSystem: true,
    subject: "Reset your {{platformName}} password",
    html: createEmailShell({
      accent: "#7c3aed",
      eyebrow: "Account Security",
      title: "Reset your password",
      intro:
        "We received a request to reset your {{platformName}} password. If that was you, continue below.",
      body: `
        <p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:#334155;">
          Hi {{userName}}, click the secure link below to choose a new password.
        </p>
        <div style="margin:24px 0;">
          <a href="{{resetLink}}" target="_blank" rel="noreferrer" style="display:inline-block;border-radius:999px;background:#7c3aed;padding:14px 22px;font-size:14px;font-weight:700;color:#ffffff;text-decoration:none;">
            Reset password
          </a>
        </div>
        <p style="margin:0;font-size:15px;line-height:1.7;color:#334155;">
          If you didn’t request this, ignore the email and consider updating your security settings.
        </p>
      `,
      footer:
        "Security questions? Contact {{supportEmail}}. Copyright {{year}} {{platformName}}.",
    }),
    allowedVariables: [
      "userName",
      "resetLink",
      "platformName",
      "supportEmail",
      "year",
    ],
  },
  {
    name: "booking_review",
    displayName: "Review Reminder",
    description: "Workspace review request after booking completion.",
    category: "review",
    isActive: true,
    isSystem: true,
    subject: "How was your workspace experience?",
    html: createEmailShell({
      accent: "#0f766e",
      eyebrow: "Review Request",
      title: "Tell us how it went",
      intro:
        "Your booking has wrapped up and we’d love to hear how your workspace experience felt from start to finish.",
      body: `
        <p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:#334155;">
          Hi {{userName}}, thanks for spending time at <strong>{{workspaceName}}</strong>.
        </p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0;border-collapse:collapse;border-radius:18px;overflow:hidden;background:#f8fafc;">
          <tr>
            <td style="padding:16px 18px;border-bottom:1px solid #e2e8f0;">
              <strong style="display:block;margin-bottom:6px;font-size:13px;color:#64748b;">Workspace</strong>
              <span style="font-size:16px;color:#0f172a;">{{workspaceName}}</span>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 18px;border-bottom:1px solid #e2e8f0;">
              <strong style="display:block;margin-bottom:6px;font-size:13px;color:#64748b;">Booking date</strong>
              <span style="font-size:16px;color:#0f172a;">{{bookingDate}}</span>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 18px;">
              <strong style="display:block;margin-bottom:6px;font-size:13px;color:#64748b;">Booking reference</strong>
              <span style="font-size:16px;color:#0f172a;">{{bookingId}}</span>
            </td>
          </tr>
        </table>
        <div style="margin:24px 0;">
          <a href="{{reviewLink}}" target="_blank" rel="noreferrer" style="display:inline-block;border-radius:999px;background:#0f766e;padding:14px 22px;font-size:14px;font-weight:700;color:#ffffff;text-decoration:none;">
            Leave a review
          </a>
        </div>
        <p style="margin:0;font-size:15px;line-height:1.7;color:#334155;">
          Your feedback helps other teams choose better workspaces and helps us keep quality high.
        </p>
      `,
      footer:
        "Need assistance instead? Reach us at {{supportEmail}}. Copyright {{year}} {{platformName}}.",
    }),
    allowedVariables: [
      "userName",
      "workspaceName",
      "bookingDate",
      "bookingId",
      "reviewLink",
      "supportEmail",
      "platformName",
      "year",
    ],
  },
  {
    name: "booking_completed_review_request",
    displayName: "Booking Completed Review Request",
    description: "Initial workspace review request sent after booking completion.",
    category: "review",
    isActive: true,
    isSystem: true,
    subject: "How was your workspace experience?",
    html: createEmailShell({
      accent: "#0f766e",
      eyebrow: "Review Request",
      title: "How was your workspace experience?",
      intro:
        "Thank you for using {{platformName}}. We hope you enjoyed your workspace experience at {{workspaceName}}.",
      body: `
        <p style="margin:0 0 18px;font-size:15px;line-height:1.7;color:#334155;">
          Your feedback helps other teams choose confidently and helps us maintain quality.
        </p>
        <div style="margin:24px 0;">
          <a href="{{reviewLink}}" target="_blank" rel="noreferrer" style="display:inline-block;border-radius:999px;background:#0f766e;padding:14px 22px;font-size:14px;font-weight:700;color:#ffffff;text-decoration:none;">Leave review</a>
        </div>
      `,
      footer:
        "Need assistance instead? Reach us at {{supportEmail}}. Copyright {{year}} {{platformName}}.",
    }),
    allowedVariables: [
      "workspaceName",
      "reviewLink",
      "supportEmail",
      "platformName",
      "year",
    ],
  },
  {
    name: "booking_review_reminder_24h",
    displayName: "Booking Review Reminder - 24 Hours",
    description: "First review reminder, sent once 24 hours after completion.",
    category: "review",
    isActive: true,
    isSystem: true,
    subject: "A quick reminder to review {{workspaceName}}",
    html: createEmailShell({
      accent: "#0369a1",
      eyebrow: "Review Reminder",
      title: "Your feedback would help",
      intro:
        "If you have a moment, tell us how your recent experience at {{workspaceName}} went.",
      body: `
        <div style="margin:24px 0;">
          <a href="{{reviewLink}}" target="_blank" rel="noreferrer" style="display:inline-block;border-radius:999px;background:#0369a1;padding:14px 22px;font-size:14px;font-weight:700;color:#ffffff;text-decoration:none;">Leave review</a>
        </div>
      `,
      footer:
        "This is a one-time reminder. For help, email {{supportEmail}}. Copyright {{year}} {{platformName}}.",
    }),
    allowedVariables: [
      "workspaceName",
      "reviewLink",
      "supportEmail",
      "platformName",
      "year",
    ],
  },
  {
    name: "booking_review_reminder_3d",
    displayName: "Booking Review Reminder - 3 Days",
    description: "Final review reminder, sent once three days after completion.",
    category: "review",
    isActive: true,
    isSystem: true,
    subject: "Final reminder: review {{workspaceName}}",
    html: createEmailShell({
      accent: "#7c3aed",
      eyebrow: "Final Review Reminder",
      title: "Share your workspace experience",
      intro:
        "This is the final reminder for your recent booking at {{workspaceName}}. A short rating is enough.",
      body: `
        <div style="margin:24px 0;">
          <a href="{{reviewLink}}" target="_blank" rel="noreferrer" style="display:inline-block;border-radius:999px;background:#7c3aed;padding:14px 22px;font-size:14px;font-weight:700;color:#ffffff;text-decoration:none;">Leave review</a>
        </div>
      `,
      footer:
        "No more review reminders will be sent for this booking. Copyright {{year}} {{platformName}}.",
    }),
    allowedVariables: [
      "workspaceName",
      "reviewLink",
      "platformName",
      "year",
    ],
  },
  {
    name: "private_office_enquiry_confirmation",
    displayName: "Private Office Enquiry Confirmation",
    description: "Confirmation sent when a private office enquiry is received.",
    category: "enquiry",
    isActive: true,
    isSystem: true,
    subject: "We received your private office enquiry",
    html: createEmailShell({
      accent: "#1d4ed8",
      eyebrow: "Private Office Enquiry",
      title: "Your enquiry has been received",
      intro:
        "Congratulations, {{userName}}. Our workspace team will review your private office requirements and contact you shortly.",
      body: `
        <p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:#334155;"><strong>Workspace:</strong> {{workspaceName}}<br /><strong>City:</strong> {{city}}<br /><strong>Enquiry ID:</strong> {{enquiryId}}</p>
      `,
      footer:
        "Need assistance? Reach us at {{supportEmail}}. Copyright {{year}} {{platformName}}.",
    }),
    allowedVariables: ["userName", "workspaceName", "city", "enquiryId", "supportEmail", "platformName", "year"],
  },
  {
    name: "virtual_office_enquiry_confirmation",
    displayName: "Virtual Office Enquiry Confirmation",
    description: "Confirmation sent for business-address and virtual-office enquiries.",
    category: "enquiry",
    isActive: true,
    isSystem: true,
    subject: "We received your virtual office enquiry",
    html: createEmailShell({
      accent: "#7c3aed",
      eyebrow: "Virtual Office Enquiry",
      title: "Your virtual office request is in",
      intro:
        "Hi {{userName}}, our team will guide you through business-address options, the documentation process, and the expected activation timeline.",
      body: `
        <p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:#334155;"><strong>Workspace:</strong> {{workspaceName}}<br /><strong>City:</strong> {{city}}<br /><strong>Enquiry ID:</strong> {{enquiryId}}</p>
      `,
      footer:
        "For documentation support, contact {{supportEmail}}. Copyright {{year}} {{platformName}}.",
    }),
    allowedVariables: ["userName", "workspaceName", "city", "enquiryId", "supportEmail", "platformName", "year"],
  },
  {
    name: "meeting_room_enquiry_confirmation",
    displayName: "Meeting Room Enquiry Confirmation",
    description: "Confirmation sent for meeting-room enquiries.",
    category: "enquiry",
    isActive: true,
    isSystem: true,
    subject: "We received your meeting room enquiry",
    html: createEmailShell({
      accent: "#0f766e",
      eyebrow: "Meeting Room Enquiry",
      title: "We are checking the right meeting space",
      intro:
        "Hi {{userName}}, our team will review meeting-room availability and contact you shortly.",
      body: `<p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:#334155;"><strong>Workspace:</strong> {{workspaceName}}<br /><strong>City:</strong> {{city}}<br /><strong>Enquiry ID:</strong> {{enquiryId}}</p>`,
      footer: "Questions? Reach us at {{supportEmail}}. Copyright {{year}} {{platformName}}.",
    }),
    allowedVariables: ["userName", "workspaceName", "city", "enquiryId", "supportEmail", "platformName", "year"],
  },
  {
    name: "coworking_enquiry_confirmation",
    displayName: "Coworking Enquiry Confirmation",
    description: "Confirmation sent for coworking enquiries.",
    category: "enquiry",
    isActive: true,
    isSystem: true,
    subject: "We received your coworking enquiry",
    html: createEmailShell({
      accent: "#ea580c",
      eyebrow: "Coworking Enquiry",
      title: "We are finding the right workspace",
      intro:
        "Hi {{userName}}, our team will review coworking options for your requirement and contact you shortly.",
      body: `<p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:#334155;"><strong>Workspace:</strong> {{workspaceName}}<br /><strong>City:</strong> {{city}}<br /><strong>Enquiry ID:</strong> {{enquiryId}}</p>`,
      footer: "Questions? Reach us at {{supportEmail}}. Copyright {{year}} {{platformName}}.",
    }),
    allowedVariables: ["userName", "workspaceName", "city", "enquiryId", "supportEmail", "platformName", "year"],
  },
  {
    name: "hot_desk_enquiry_confirmation",
    displayName: "Hot Desk Enquiry Confirmation",
    description: "Confirmation sent for hot-desk enquiries.",
    category: "enquiry",
    isActive: true,
    isSystem: true,
    subject: "We received your hot desk enquiry",
    html: createEmailShell({
      accent: "#be123c",
      eyebrow: "Hot Desk Enquiry",
      title: "Your hot desk enquiry is in",
      intro:
        "Hi {{userName}}, our team will review available flexible seating options and contact you shortly.",
      body: `<p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:#334155;"><strong>Workspace:</strong> {{workspaceName}}<br /><strong>City:</strong> {{city}}<br /><strong>Enquiry ID:</strong> {{enquiryId}}</p>`,
      footer: "Questions? Reach us at {{supportEmail}}. Copyright {{year}} {{platformName}}.",
    }),
    allowedVariables: ["userName", "workspaceName", "city", "enquiryId", "supportEmail", "platformName", "year"],
  },
  {
    name: "workspace_enquiry_confirmation",
    displayName: "Workspace Enquiry Confirmation",
    description: "Fallback confirmation for marketplace enquiries.",
    category: "enquiry",
    isActive: true,
    isSystem: true,
    subject: "We received your {{enquiryService}} enquiry",
    html: createEmailShell({
      accent: "#0f172a",
      eyebrow: "Workspace Enquiry",
      title: "Your enquiry has been received",
      intro:
        "Hi {{userName}}, our workspace team will review your requirements and contact you shortly.",
      body: `<p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:#334155;"><strong>Service:</strong> {{enquiryService}}<br /><strong>Workspace:</strong> {{workspaceName}}<br /><strong>City:</strong> {{city}}<br /><strong>Enquiry ID:</strong> {{enquiryId}}</p>`,
      footer: "Questions? Reach us at {{supportEmail}}. Copyright {{year}} {{platformName}}.",
    }),
    allowedVariables: ["userName", "enquiryService", "workspaceName", "city", "enquiryId", "supportEmail", "platformName", "year"],
  },
  {
    name: "new_device_login_alert",
    displayName: "New Device Login Alert",
    description: "Security alert email for unfamiliar device logins.",
    category: "security",
    isActive: true,
    isSystem: true,
    subject: "New device login detected on {{platformName}}",
    html: createEmailShell({
      accent: "#be123c",
      eyebrow: "Security Alert",
      title: "We noticed a new sign-in",
      intro:
        "A sign-in to your {{platformName}} account came from a device or location we haven’t seen recently.",
      body: `
        <p style="margin:0 0 18px;font-size:15px;line-height:1.7;color:#334155;">
          Hi {{userName}}, here are the details:
        </p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0;border-collapse:collapse;border-radius:18px;overflow:hidden;background:#fff1f2;">
          <tr>
            <td style="padding:16px 18px;border-bottom:1px solid #fecdd3;">
              <strong style="display:block;margin-bottom:6px;font-size:13px;color:#9f1239;">IP address</strong>
              <span style="font-size:16px;color:#0f172a;">{{loginIp}}</span>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 18px;border-bottom:1px solid #fecdd3;">
              <strong style="display:block;margin-bottom:6px;font-size:13px;color:#9f1239;">Device</strong>
              <span style="font-size:16px;color:#0f172a;">{{deviceInfo}}</span>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 18px;">
              <strong style="display:block;margin-bottom:6px;font-size:13px;color:#9f1239;">Time</strong>
              <span style="font-size:16px;color:#0f172a;">{{loginTime}}</span>
            </td>
          </tr>
        </table>
        <div style="margin:24px 0;">
          <a href="{{secureAccountLink}}" target="_blank" rel="noreferrer" style="display:inline-block;border-radius:999px;background:#be123c;padding:14px 22px;font-size:14px;font-weight:700;color:#ffffff;text-decoration:none;">
            Secure my account
          </a>
        </div>
      `,
      footer:
        "If this was you, no action is needed. For help, email {{supportEmail}}. Copyright {{year}} {{platformName}}.",
    }),
    allowedVariables: [
      "userName",
      "loginIp",
      "deviceInfo",
      "loginTime",
      "secureAccountLink",
      "platformName",
      "supportEmail",
      "year",
    ],
  },
];

export function sanitizeTemplateHtml(html = "") {
  return sanitizeHtml(String(html || ""), EMAIL_SANITIZE_OPTIONS).trim();
}

export function extractTemplateVariables(...contentParts) {
  const joined = contentParts.filter(Boolean).join(" ");
  const matches = joined.match(/{{\s*([a-zA-Z0-9_]+)\s*}}/g) || [];

  return [...new Set(
    matches
      .map((match) => match.replace(/[{}]/g, "").trim())
      .filter(Boolean),
  )];
}

export function getEmailVariableCatalog() {
  return Object.entries(EMAIL_TEMPLATE_VARIABLES)
    .map(([key, value]) => ({
      key,
      ...value,
    }))
    .sort((left, right) => left.label.localeCompare(right.label));
}

export function buildSampleVariables(variableKeys = []) {
  const keys = variableKeys.length
    ? variableKeys
    : Object.keys(EMAIL_TEMPLATE_VARIABLES);

  return keys.reduce((accumulator, key) => {
    accumulator[key] =
      EMAIL_TEMPLATE_VARIABLES[key]?.sample || `[${key}]`;
    return accumulator;
  }, {});
}

export function validateTemplateVariables(variableKeys = []) {
  const invalidVariables = [...new Set(variableKeys)].filter(
    (key) => !EMAIL_TEMPLATE_VARIABLES[key],
  );

  return {
    valid: invalidVariables.length === 0,
    invalidVariables,
  };
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderTemplateString(content = "", variables = {}) {
  return String(content || "").replace(
    /{{\s*([a-zA-Z0-9_]+)\s*}}/g,
    (_, rawKey) => escapeHtml(variables[rawKey] ?? ""),
  );
}

export function renderEmailTemplate({
  subject = "",
  html = "",
  variables = {},
}) {
  const usedVariables = extractTemplateVariables(subject, html);
  const validation = validateTemplateVariables(usedVariables);

  if (!validation.valid) {
    throw new Error(
      `Unsupported template variables: ${validation.invalidVariables.join(", ")}`,
    );
  }

  return {
    variablesUsed: usedVariables,
    subject: renderTemplateString(subject, variables)
      .replace(/\s+/g, " ")
      .trim(),
    html: sanitizeTemplateHtml(
      renderTemplateString(html, variables),
    ),
  };
}

export function validateAndNormalizeTemplatePayload(payload = {}) {
  const normalizedName = normalizeTemplateName(payload.name);
  const subject = String(payload.subject || "").trim();
  const html = sanitizeTemplateHtml(payload.html || "");

  if (!normalizedName) {
    throw new Error("Template name is required");
  }

  if (!subject) {
    throw new Error("Template subject is required");
  }

  if (!html) {
    throw new Error("Template HTML is required");
  }

  const extractedVariables = extractTemplateVariables(subject, html);
  const validation = validateTemplateVariables(extractedVariables);

  if (!validation.valid) {
    throw new Error(
      `Unsupported template variables: ${validation.invalidVariables.join(", ")}`,
    );
  }

  const declaredVariables = Array.isArray(payload.allowedVariables)
    ? payload.allowedVariables.map((item) => String(item || "").trim()).filter(Boolean)
    : [];

  const declaredValidation = validateTemplateVariables(declaredVariables);
  if (!declaredValidation.valid) {
    throw new Error(
      `Unsupported declared variables: ${declaredValidation.invalidVariables.join(", ")}`,
    );
  }

  return {
    name: normalizedName,
    displayName:
      String(payload.displayName || "").trim() || humanizeName(normalizedName),
    description: String(payload.description || "").trim(),
    category: payload.category || "system",
    subject,
    html,
    isActive:
      typeof payload.isActive === "boolean" ? payload.isActive : true,
    allowedVariables: [...new Set([
      ...declaredVariables,
      ...extractedVariables,
    ])],
  };
}

export async function ensureDefaultEmailTemplates() {
  await Promise.all(
    SYSTEM_EMAIL_TEMPLATE_DEFINITIONS.map((definition) =>
      EmailTemplate.updateOne(
        { name: definition.name },
        {
          $setOnInsert: {
            ...definition,
            html: sanitizeTemplateHtml(definition.html),
          },
        },
        { upsert: true },
      ),
    ),
  );
}

export async function getTemplateMetaPayload() {
  await ensureDefaultEmailTemplates();

  return {
    variables: getEmailVariableCatalog(),
    defaultTemplates: SYSTEM_EMAIL_TEMPLATE_DEFINITIONS.map((template) => ({
      name: template.name,
      displayName: template.displayName,
      description: template.description,
      category: template.category,
      allowedVariables: template.allowedVariables,
      isSystem: template.isSystem,
    })),
  };
}
