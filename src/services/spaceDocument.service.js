import mongoose from "mongoose";
import Space from "../models/admin_models/Space.js";
import SpaceDocument from "../models/admin_models/SpaceDocument.js";
import City from "../models/super_admin_models/City.model.js";
import {
  deleteFromStorage,
  publicUrlForKey,
  resolveAwsConfig,
} from "../config/s3.js";

const ensureSpaceExists = async (spaceId) => {
  if (!mongoose.Types.ObjectId.isValid(spaceId)) {
    throw new Error("Invalid space id");
  }

  const space = await Space.findById(spaceId).select("_id address.city");
  if (!space) throw new Error("Space not found");
  return space;
};

const ensureCityExists = async (cityId) => {
  if (!mongoose.Types.ObjectId.isValid(cityId)) {
    throw new Error("Invalid city id");
  }

  const city = await City.findById(cityId).select("_id");
  if (!city) throw new Error("City not found");
  return city;
};

const getDocumentKey = ({ documentType, customType }) => {
  if (documentType) return String(documentType).toLowerCase();

  if (customType) {
    return String(customType).trim().toLowerCase().replace(/\s+/g, "_");
  }

  throw new Error("documentType or customType required");
};

const getFileUrl = async (tenant, key) => {
  const aws = await resolveAwsConfig(tenant);
  return publicUrlForKey({
    bucketName: aws.bucketName,
    region: aws.region,
    key,
  });
};

/* =========================
   ADD / REPLACE
========================= */
export const addDocument = async (
  scopeType,
  scopeId,
  body,
  userId = null,
  tenant = null,
) => {
  if (!scopeType || !scopeId) {
    throw new Error("scopeType and scopeId are required");
  }

  if (!body?.label) {
    throw new Error("label is required");
  }

  if (scopeType === "CITY") {
    await ensureCityExists(scopeId);
  } else if (scopeType === "SPACE") {
    await ensureSpaceExists(scopeId);
  } else {
    throw new Error("Invalid scopeType");
  }

  const documentKey = getDocumentKey({
    documentType: body.documentType || null,
    customType: body.customType || "",
  });

  const query =
    scopeType === "CITY"
      ? { scopeType: "CITY", city: scopeId, documentKey, isActive: true }
      : { scopeType: "SPACE", space: scopeId, documentKey, isActive: true };

  const existingDoc = await SpaceDocument.findOne(query);

  const incomingStatus = body.status || "AVAILABLE";
  const incomingKey = body.key || null;

  if (incomingStatus === "AVAILABLE" && !incomingKey) {
    throw new Error("key is required when status is AVAILABLE");
  }

  const file =
    incomingStatus === "AVAILABLE"
      ? {
          s3Key: incomingKey,
          url: await getFileUrl(tenant, incomingKey),
          originalName: body.originalName || "",
          mimeType: body.mimeType || "",
          size: body.size ? Number(body.size) : undefined,
        }
      : null;

  const payload = {
    scopeType,
    city: scopeType === "CITY" ? scopeId : undefined,
    space: scopeType === "SPACE" ? scopeId : undefined,
    documentType: body.documentType || null,
    customType: body.customType || "",
    documentKey,
    label: body.label,
    status: incomingStatus,
    file,
    note: body.note || "",
    isPlatformSample:
      typeof body.isPlatformSample === "boolean"
        ? body.isPlatformSample
        : scopeType === "CITY",
    isWorkspaceSample:
      typeof body.isWorkspaceSample === "boolean"
        ? body.isWorkspaceSample
        : scopeType === "SPACE",
    uploadedBy: userId || undefined,
    updatedBy: userId || undefined,
    isActive: true,
  };

  if (existingDoc) {
    const oldKey = existingDoc.file?.s3Key || null;

    if (oldKey && oldKey !== incomingKey) {
      await deleteFromStorage({ tenant, key: oldKey });
    }

    Object.assign(existingDoc, payload);
    existingDoc.version = (existingDoc.version || 1) + 1;
    await existingDoc.save();
    return existingDoc;
  }

  const doc = new SpaceDocument(payload);
  await doc.save();
  return doc;
};

/* =========================
   DELETE
========================= */
export const deleteDocument = async (documentId, userId = null, tenant = null) => {
  if (!mongoose.Types.ObjectId.isValid(documentId)) {
    throw new Error("Invalid document id");
  }

  const doc = await SpaceDocument.findById(documentId);
  if (!doc) throw new Error("Document not found");

  if (doc.file?.s3Key) {
    await deleteFromStorage({ tenant, key: doc.file.s3Key });
  }

  await SpaceDocument.deleteOne({ _id: documentId });
  return true;
};

/* =========================
   GET BY SCOPE
========================= */
export const getDocumentsByScope = async (scopeType, scopeId) => {
  if (!scopeType || !scopeId) {
    throw new Error("scopeType and scopeId are required");
  }

  const query =
    scopeType === "CITY"
      ? { scopeType: "CITY", city: scopeId, isActive: true }
      : scopeType === "SPACE"
        ? { scopeType: "SPACE", space: scopeId, isActive: true }
        : null;

  if (!query) throw new Error("Invalid scopeType");

  return await SpaceDocument.find(query).sort({ createdAt: -1 }).lean().exec();
};

/* =========================
   EFFECTIVE WORKSPACE DOCS
   workspace overrides city
========================= */
export const getEffectiveDocumentsBySpace = async (spaceId) => {
  const space = await ensureSpaceExists(spaceId);
  const cityId = space.address.city;

  const docs = await SpaceDocument.find({
    isActive: true,
    scopeType: { $in: ["CITY", "SPACE"] },
    $or: [{ space: spaceId }, { city: cityId }],
  })
    .sort({ createdAt: -1 })
    .lean()
    .exec();

  const map = new Map();

  for (const doc of docs) {
    if (!map.has(doc.documentKey)) {
      map.set(doc.documentKey, doc);
    }
  }

  return Array.from(map.values());
};