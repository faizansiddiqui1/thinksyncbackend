import crypto from "crypto";
import mongoose from "mongoose";

import Space from "../../models/admin_models/Space.js";
import Booking from "../../models/user_models/Booking.js";
import Enquiry from "../../models/user_models/Enquiry.js";
import User from "../../models/user_models/User.js";
import EmailTemplate from "../../models/super_admin_models/EmailTemplate.js";
import EmailCampaign from "../../models/super_admin_models/EmailCampaign.js";
import EmailDelivery from "../../models/super_admin_models/EmailDelivery.js";
import EmailSuppression from "../../models/super_admin_models/EmailSuppression.js";
import sendEmailWithFallback from "../../utils/sendEmailWithFallback.js";
import { previewEmailTemplate } from "../../services/mail.service.js";
import {
  getCompanySpaceIds,
  getScopeOwnerId,
  isSuperAdminUser,
} from "../../services/spaceAccess.service.js";
import { getConsultantForUser } from "../../services/consultantRouting.service.js";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PIXEL = Buffer.from(
  "R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=",
  "base64",
);

function cleanEmail(value = "") {
  const email = String(value || "").trim().toLowerCase();
  return EMAIL_PATTERN.test(email) ? email : "";
}

function formatDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
  }).format(date);
}

function formatDateTime(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function addWorkspace(record, space) {
  if (!space?._id && !space?.name) return;
  const key = String(space?._id || space?.name);
  record.workspaceMap.set(key, {
    _id: space?._id || null,
    name: space?.name || "",
    slug: space?.slug || "",
  });
}

function createCrmRecord(key) {
  return {
    key,
    userId: null,
    name: "",
    email: "",
    phone: "",
    company: "",
    isActive: true,
    bookingCount: 0,
    lastBookingDate: null,
    latestBookingStatus: "",
    leadCount: 0,
    lastLeadDate: null,
    createdAt: null,
    workspaceMap: new Map(),
  };
}

function getRecordKey({ userId, email, phone }) {
  if (userId) return `user:${userId}`;
  if (email) return `email:${email}`;
  if (phone) return `phone:${phone}`;
  return "";
}

async function getScopedSpaceIds(user) {
  if (isSuperAdminUser(user)) return null;

  const companySpaceIds = await getCompanySpaceIds(user);
  const ownerId = await getScopeOwnerId(user);
  const ownedSpaceIds = ownerId
    ? await Space.find({ owner: ownerId }).distinct("_id")
    : [];

  return [...new Set([...companySpaceIds, ...ownedSpaceIds].map(String))].map(
    (id) => new mongoose.Types.ObjectId(id),
  );
}

function buildEnquiryScope(user, spaceIds) {
  if (isSuperAdminUser(user)) return {};
  const clauses = [{ recipientUserIds: user?._id }];
  if (spaceIds?.length) clauses.push({ spaceId: { $in: spaceIds } });
  return { $or: clauses };
}

async function buildCrmRecords(req) {
  const isConsultant = req.user?.role === "consultant";
  const consultant = isConsultant
    ? await getConsultantForUser(req.user?._id)
    : null;
  const spaceIds = isConsultant ? [] : await getScopedSpaceIds(req.user);
  const bookingFilter = isConsultant
    ? { _id: null }
    : spaceIds
      ? { space: { $in: spaceIds } }
      : {};
  const enquiryFilter = isConsultant
    ? { consultantId: consultant?._id || null }
    : buildEnquiryScope(req.user, spaceIds);

  const [bookings, enquiries, platformUsers] = await Promise.all([
    Booking.find(bookingFilter)
      .populate({
        path: "user.userId",
        select: "username displayName email phoneNumber isActive companyId createdAt",
        populate: { path: "companyId", select: "legalName displayName" },
      })
      .populate("space", "name slug")
      .sort({ createdAt: -1 })
      .limit(5000)
      .lean(),
    Enquiry.find(enquiryFilter)
      .populate(
        "submittedByUser",
        "username displayName email phoneNumber isActive companyId createdAt",
      )
      .populate("spaceId", "name slug")
      .sort({ createdAt: -1 })
      .limit(5000)
      .lean(),
    isSuperAdminUser(req.user)
      ? User.find({})
          .select("username displayName email phoneNumber isActive companyId createdAt")
          .populate("companyId", "legalName displayName")
          .limit(5000)
          .lean()
      : [],
  ]);

  const records = new Map();
  const ensureRecord = (identity) => {
    const email = cleanEmail(identity.email);
    const phone = String(identity.phone || "").trim();
    const key = getRecordKey({
      userId: identity.userId,
      email,
      phone,
    });
    if (!key) return null;
    if (!records.has(key)) records.set(key, createCrmRecord(key));
    const record = records.get(key);

    record.userId = identity.userId || record.userId;
    record.name = identity.name || record.name;
    record.email = email || record.email;
    record.phone = phone || record.phone;
    record.company = identity.company || record.company;
    if (identity.isActive !== undefined) record.isActive = identity.isActive !== false;
    if (
      identity.createdAt &&
      (!record.createdAt || new Date(identity.createdAt) < new Date(record.createdAt))
    ) {
      record.createdAt = identity.createdAt;
    }
    return record;
  };

  platformUsers.forEach((user) => {
    ensureRecord({
      userId: user._id,
      name: user.displayName || user.username || "",
      email: user.email,
      phone: user.phoneNumber,
      company: user.companyId?.displayName || user.companyId?.legalName || "",
      isActive: user.isActive,
      createdAt: user.createdAt,
    });
  });

  bookings.forEach((booking) => {
    const user = booking.user?.userId || {};
    const record = ensureRecord({
      userId: user?._id || booking.user?.userId || null,
      name: user?.displayName || user?.username || booking.user?.name || "",
      email: user?.email || booking.user?.email,
      phone: user?.phoneNumber || booking.user?.phone,
      company: user?.companyId?.displayName || user?.companyId?.legalName || "",
      isActive: user?.isActive,
      createdAt: user?.createdAt || booking.createdAt,
    });
    if (!record) return;

    record.bookingCount += 1;
    if (
      booking.createdAt &&
      (!record.lastBookingDate ||
        new Date(booking.createdAt) > new Date(record.lastBookingDate))
    ) {
      record.lastBookingDate = booking.createdAt;
      record.latestBookingStatus = booking.status || "";
    }
    addWorkspace(record, booking.space);
  });

  enquiries.forEach((lead) => {
    const user = lead.submittedByUser || {};
    const record = ensureRecord({
      userId: user?._id || null,
      name: user?.displayName || user?.username || lead.name || "",
      email: user?.email || lead.email,
      phone: user?.phoneNumber || lead.phoneNumber,
      company: lead.companyName || "",
      isActive: user?.isActive,
      createdAt: user?.createdAt || lead.createdAt,
    });
    if (!record) return;

    record.leadCount += 1;
    if (
      lead.createdAt &&
      (!record.lastLeadDate || new Date(lead.createdAt) > new Date(record.lastLeadDate))
    ) {
      record.lastLeadDate = lead.createdAt;
      record.latestLead = {
        name: lead.name || "",
        city: lead.city || "",
        product: lead.product || "",
        listingMode: lead.listingMode || "",
        serviceName: lead.serviceName || "",
        enquiryId: lead._id,
      };
    }
    addWorkspace(record, lead.spaceId || {
      _id: lead.spaceId,
      name: lead.listingName,
      slug: lead.listingSlug,
    });
  });

  return [...records.values()].map((record) => ({
    ...record,
    id: record.userId ? String(record.userId) : record.key,
    workspaces: [...record.workspaceMap.values()],
    workspaceMap: undefined,
  }));
}

function applyCrmFilters(records, query = {}) {
  const search = String(query.q || query.search || "").trim().toLowerCase();
  const status = String(query.status || "all").toLowerCase();

  return records.filter((record) => {
    if (
      search &&
      ![
        record.name,
        record.email,
        record.phone,
        record.company,
        ...record.workspaces.map((space) => space.name),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(search)
    ) {
      return false;
    }

    if (status === "active" && !record.isActive) return false;
    if (status === "inactive" && record.isActive) return false;
    if (status === "booked" && !record.bookingCount) return false;
    if (status === "leads" && !record.leadCount) return false;
    return true;
  });
}

function getTemplateAccessFilter(req) {
  if (isSuperAdminUser(req.user)) {
    return {
      $or: [
        { isSystem: true },
        { createdBy: req.user?._id || null },
      ],
    };
  }

  return {
    isSystem: { $ne: true },
    createdBy: req.user?._id || null,
  };
}

function buildRecipientVariables(record, tracking = {}) {
  const workspace = record.workspaces?.[0] || {};
  return {
    userName: record.name || "there",
    companyName: record.company || "",
    workspaceName: workspace.name || "",
    bookingDate: formatDate(record.lastBookingDate),
    bookingStatus: record.latestBookingStatus || "",
    bookingStart: formatDateTime(record.lastBookingDate),
    leadName: record.latestLead?.name || record.name || "",
    leadCity: record.latestLead?.city || "",
    leadProduct: record.latestLead?.product || "",
    leadListingMode: record.latestLead?.listingMode || "",
    enquiryId: record.latestLead?.enquiryId
      ? String(record.latestLead.enquiryId)
      : "",
    enquiryService: record.latestLead?.serviceName || record.latestLead?.product || "",
    platformName: process.env.PLATFORM_NAME || "ThinkSync",
    supportEmail: process.env.SUPPORT_EMAIL || "",
    dashboardLink: process.env.FRONTEND_URL || "",
    unsubscribeLink: tracking.unsubscribeLink || "",
    year: String(new Date().getFullYear()),
  };
}

function parseRecipientInput(body = {}, crmRecords = []) {
  const recordByEmail = new Map(
    crmRecords
      .filter((record) => record.email)
      .map((record) => [record.email, record]),
  );
  const requested = [];

  const selectedEmails = Array.isArray(body.emails) ? body.emails : [];
  selectedEmails.forEach((value) => {
    const email = cleanEmail(value);
    if (!email) return;
    requested.push(recordByEmail.get(email) || {
      id: `manual:${email}`,
      name: "",
      email,
      phone: "",
      company: "",
      workspaces: [],
    });
  });

  const manualValues = Array.isArray(body.manualEmails)
    ? body.manualEmails
    : String(body.manualEmails || "").split(/[\s,;]+/);
  manualValues.forEach((value) => {
    const email = cleanEmail(value);
    if (!email) return;
    requested.push(recordByEmail.get(email) || {
      id: `manual:${email}`,
      name: "",
      email,
      phone: "",
      company: "",
      workspaces: [],
    });
  });

  if (body.audienceType === "all") {
    requested.push(...crmRecords);
  }

  if (body.audienceType === "filtered") {
    requested.push(...applyCrmFilters(crmRecords, body.filters || {}));
  }

  return [...new Map(
    requested
      .filter((record) => record.email)
      .map((record) => [record.email, record]),
  ).values()];
}

function addTracking(html, token) {
  const baseUrl = String(
    process.env.BACKEND_URL || "http://localhost:5000",
  ).replace(/\/+$/, "");
  const openUrl = `${baseUrl}/api/email-tracking/open/${token}`;
  const unsubscribeUrl = `${baseUrl}/api/email-tracking/unsubscribe/${token}`;
  const trackedLinks = String(html || "").replace(
    /href="(https?:\/\/[^"]+)"/gi,
    (_, target) =>
      `href="${baseUrl}/api/email-tracking/click/${token}?url=${encodeURIComponent(target)}"`,
  );

  return `${trackedLinks}
    <p style="margin-top:24px;font-size:12px;color:#64748b">
      <a href="${unsubscribeUrl}">Unsubscribe from marketing emails</a>
    </p>
    <img src="${openUrl}" width="1" height="1" alt="" style="display:none" />`;
}

export async function listCrmUsers(req, res) {
  try {
    const page = Math.max(1, Number(req.query.page || 1));
    const limit = Math.min(Math.max(1, Number(req.query.limit || 25)), 100);
    const allRecords = await buildCrmRecords(req);
    const filtered = applyCrmFilters(allRecords, req.query);
    const start = (page - 1) * limit;

    const stats = {
      total: allRecords.length,
      active: allRecords.filter((record) => record.isActive).length,
      inactive: allRecords.filter((record) => !record.isActive).length,
      booked: allRecords.filter((record) => record.bookingCount > 0).length,
      leads: allRecords.filter((record) => record.leadCount > 0).length,
    };

    return res.json({
      success: true,
      data: filtered.slice(start, start + limit),
      total: filtered.length,
      page,
      limit,
      pages: Math.max(1, Math.ceil(filtered.length / limit)),
      stats,
    });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
}

export async function sendCrmCampaign(req, res) {
  try {
    if (!mongoose.Types.ObjectId.isValid(String(req.body.templateId || ""))) {
      return res.status(400).json({ success: false, message: "Valid templateId required" });
    }

    const template = await EmailTemplate.findOne({
      _id: req.body.templateId,
      isActive: true,
      ...getTemplateAccessFilter(req),
    }).lean();

    if (!template) {
      return res.status(404).json({ success: false, message: "Active email template not found" });
    }

    const crmRecords = await buildCrmRecords(req);
    const recipients = parseRecipientInput(req.body, crmRecords);
    if (!recipients.length) {
      return res.status(400).json({ success: false, message: "No valid recipients selected" });
    }
    if (recipients.length > 1000) {
      return res.status(400).json({ success: false, message: "Campaign limit is 1000 recipients" });
    }

    const suppressedEmails = new Set(
      await EmailSuppression.find({
        email: { $in: recipients.map((record) => record.email) },
      }).distinct("email"),
    );
    const sendable = recipients.filter((record) => !suppressedEmails.has(record.email));

    const campaign = await EmailCampaign.create({
      name: String(req.body.name || template.displayName || template.name).trim(),
      template: template._id,
      createdBy: req.user._id,
      createdByRole: req.user.role,
      audienceType: req.body.audienceType || "selected",
      filters: req.body.filters || {},
      subject: template.subject,
      html: template.html,
      status: "processing",
      totals: {
        recipients: recipients.length,
        failed: recipients.length - sendable.length,
      },
      startedAt: new Date(),
    });

    let sent = 0;
    let failed = recipients.length - sendable.length;

    for (const record of sendable) {
      const trackingToken = crypto.randomBytes(24).toString("hex");
      const baseUrl = String(
        process.env.BACKEND_URL || "http://localhost:5000",
      ).replace(/\/+$/, "");
      const variables = buildRecipientVariables(record, {
        unsubscribeLink: `${baseUrl}/api/email-tracking/unsubscribe/${trackingToken}`,
      });
      const rendered = await previewEmailTemplate({
        subject: template.subject,
        html: template.html,
        variables,
      });
      const delivery = await EmailDelivery.create({
        campaign: campaign._id,
        recipientUser: mongoose.Types.ObjectId.isValid(String(record.userId || ""))
          ? record.userId
          : null,
        email: record.email,
        recipientName: record.name || "",
        trackingToken,
        variables,
      });

      try {
        await sendEmailWithFallback({
          to: record.email,
          subject: rendered.subject,
          html: addTracking(rendered.html, trackingToken),
        });
        delivery.status = "sent";
        delivery.sentAt = new Date();
        sent += 1;
      } catch (error) {
        delivery.status = "failed";
        delivery.failedAt = new Date();
        delivery.error = error.message;
        failed += 1;
      }
      await delivery.save();
    }

    campaign.status = failed ? "completed_with_errors" : "completed";
    campaign.totals.sent = sent;
    campaign.totals.failed = failed;
    campaign.completedAt = new Date();
    await campaign.save();

    return res.status(201).json({
      success: true,
      message: "Campaign completed",
      data: campaign,
    });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
}

export async function listCrmCampaigns(req, res) {
  try {
    const filter = isSuperAdminUser(req.user)
      ? {}
      : { createdBy: req.user._id };

    const page = Math.max(Number(req.query.page || 1), 1);
    const limit = Math.min(Math.max(Number(req.query.limit || 20), 1), 100);
    const status = String(req.query.status || "all").trim();
    const q = String(req.query.q || "").trim();

    if (status && status !== "all") {
      filter.status = status;
    }

    if (q) {
      filter.$or = [
        { name: { $regex: q, $options: "i" } },
        { subject: { $regex: q, $options: "i" } },
      ];
    }

    const [campaigns, total] = await Promise.all([
      EmailCampaign.find(filter)
        .populate("template", "displayName name")
        .populate("createdBy", "displayName username email")
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      EmailCampaign.countDocuments(filter),
    ]);

    return res.json({
      success: true,
      data: campaigns,
      total,
      page,
      limit,
      pages: Math.max(1, Math.ceil(total / limit)),
    });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
}

export async function listEmailActivity(req, res) {
  try {
    const campaignFilter = isSuperAdminUser(req.user)
      ? {}
      : { createdBy: req.user._id };
    const campaignIds = await EmailCampaign.find(campaignFilter).distinct("_id");
    const filter = { campaign: { $in: campaignIds } };
    const page = Math.max(Number(req.query.page || 1), 1);
    const limit = Math.min(Math.max(Number(req.query.limit || 25), 1), 100);
    const status = String(req.query.status || "all").trim();
    const q = String(req.query.q || "").trim();

    if (status && status !== "all") {
      filter.status = status;
    }

    if (q) {
      filter.$or = [
        { email: { $regex: q, $options: "i" } },
        { recipientName: { $regex: q, $options: "i" } },
      ];
    }

    const [items, total, statsRows] = await Promise.all([
      EmailDelivery.find(filter)
        .populate("campaign", "name subject status totals createdAt")
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      EmailDelivery.countDocuments(filter),
      EmailDelivery.aggregate([
        { $match: { campaign: { $in: campaignIds } } },
        { $group: { _id: "$status", count: { $sum: 1 } } },
      ]),
    ]);

    const stats = statsRows.reduce(
      (acc, row) => {
        acc[row._id || "unknown"] = row.count;
        acc.total += row.count;
        return acc;
      },
      { total: 0 },
    );

    return res.json({
      success: true,
      data: items,
      total,
      page,
      limit,
      pages: Math.max(1, Math.ceil(total / limit)),
      stats,
    });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
}

async function incrementCampaignMetric(campaignId, metric) {
  await EmailCampaign.findByIdAndUpdate(campaignId, {
    $inc: { [`totals.${metric}`]: 1 },
  });
}

export async function trackEmailOpen(req, res) {
  try {
    const delivery = await EmailDelivery.findOne({ trackingToken: req.params.token });
    if (delivery) {
      if (!delivery.deliveredAt) {
        delivery.deliveredAt = new Date();
        await incrementCampaignMetric(delivery.campaign, "delivered");
      }
      if (!delivery.openedAt) {
        delivery.openedAt = new Date();
        await incrementCampaignMetric(delivery.campaign, "opened");
      }
      if (!["clicked", "unsubscribed"].includes(delivery.status)) {
        delivery.status = "opened";
      }
      await delivery.save();
    }
  } catch {
    // Tracking must never break image responses.
  }

  res.set("Content-Type", "image/gif");
  res.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  return res.status(200).send(PIXEL);
}

export async function trackEmailClick(req, res) {
  const target = String(req.query.url || "");
  try {
    const parsed = new URL(target);
    if (!["http:", "https:"].includes(parsed.protocol)) throw new Error("Invalid URL");

    const delivery = await EmailDelivery.findOne({ trackingToken: req.params.token });
    if (delivery) {
      if (!delivery.deliveredAt) {
        delivery.deliveredAt = new Date();
        await incrementCampaignMetric(delivery.campaign, "delivered");
      }
      if (!delivery.clickedAt) {
        delivery.clickedAt = new Date();
        await incrementCampaignMetric(delivery.campaign, "clicked");
      }
      delivery.status = "clicked";
      await delivery.save();
    }

    return res.redirect(parsed.toString());
  } catch {
    return res.status(400).send("Invalid tracking link");
  }
}

export async function trackProviderDelivery(req, res) {
  try {
    const configuredSecret = process.env.EMAIL_WEBHOOK_SECRET || "";
    if (!configuredSecret) {
      return res.status(503).json({
        success: false,
        message: "Email delivery webhook is not configured",
      });
    }
    if (req.headers["x-email-webhook-secret"] !== configuredSecret) {
      return res.status(401).json({ success: false, message: "Invalid webhook secret" });
    }

    const status = String(req.body.status || "").toLowerCase();
    if (!["delivered", "failed"].includes(status)) {
      return res.status(400).json({ success: false, message: "Unsupported delivery status" });
    }

    const delivery = await EmailDelivery.findOne({
      $or: [
        { trackingToken: req.body.trackingToken },
        {
          campaign: req.body.campaignId,
          email: cleanEmail(req.body.email),
        },
      ],
    });
    if (!delivery) {
      return res.status(404).json({ success: false, message: "Delivery not found" });
    }

    if (status === "delivered" && !delivery.deliveredAt) {
      delivery.deliveredAt = new Date();
      if (!["opened", "clicked", "unsubscribed"].includes(delivery.status)) {
        delivery.status = "delivered";
      }
      await incrementCampaignMetric(delivery.campaign, "delivered");
    }

    if (status === "failed" && !delivery.failedAt) {
      delivery.failedAt = new Date();
      delivery.status = "failed";
      delivery.error = String(req.body.error || "Provider delivery failed");
      await incrementCampaignMetric(delivery.campaign, "failed");
    }

    await delivery.save();
    return res.json({ success: true });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
}

export async function unsubscribeEmail(req, res) {
  try {
    const delivery = await EmailDelivery.findOne({ trackingToken: req.params.token });
    if (!delivery) return res.status(404).send("Email record not found");

    await EmailSuppression.findOneAndUpdate(
      { email: delivery.email },
      {
        email: delivery.email,
        reason: "unsubscribed",
        sourceCampaign: delivery.campaign,
      },
      { upsert: true, new: true },
    );

    if (!delivery.unsubscribedAt) {
      delivery.unsubscribedAt = new Date();
      delivery.status = "unsubscribed";
      await delivery.save();
      await incrementCampaignMetric(delivery.campaign, "unsubscribed");
    }

    return res.status(200).send("You have been unsubscribed.");
  } catch (error) {
    return res.status(400).send(error.message);
  }
}
