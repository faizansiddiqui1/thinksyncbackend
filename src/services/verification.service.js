import { cfPost, cfMultipartPost } from "../utils/cashfreeClient.js";
import { ApiError } from "../utils/apiResponse.js";
import fs from "fs";
import FormDataPkg from "form-data";
import mime from "mime-types";
import User from "../models/user_models/User.js";
import {
  GetObjectCommand,
  HeadObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import {
  createPresignedUpload,
  publicUrlForKey,
  resolveAwsConfig,
} from "../config/s3.js";
import {
  ensureField,
  getOrCreate,
} from "../controllers/admin_controllers/verification.controller.js";
import AdminProfile from "../models/admin_models/AdminProfile.js";
import CompanyVerification from "../models/admin_models/CompanyVerification.js";
import { getGlobalKycConfig } from "./globalKycConfig.service.js";

const FormDataNode =
  FormDataPkg && FormDataPkg.default ? FormDataPkg.default : FormDataPkg;

const s3ClientCache = new Map();

function getS3Client(aws) {
  const cacheKey = `${aws.accessKeyId}_${aws.region}`;

  if (s3ClientCache.has(cacheKey)) {
    return s3ClientCache.get(cacheKey);
  }

  const client = new S3Client({
    region: aws.region,
    credentials: {
      accessKeyId: aws.accessKeyId,
      secretAccessKey: aws.secretAccessKey,
    },
  });

  s3ClientCache.set(cacheKey, client);
  return client;
}

async function isFaceMatchRequired() {
  const config = await getGlobalKycConfig();
  return config.requireFaceMatch === true;
}

// helper to decide verified flag from provider response
function isVerified(raw) {
  return !!(
    raw?.valid === true ||
    raw?.status === "SUCCESS" ||
    raw?.status === "VALID" ||
    raw?.verification_status === "VERIFIED" ||
    raw?.isValid === true ||
    raw?.account_exists === true ||
    raw?.account_status === "VALID" ||
    raw?.account_status_code === "ACCOUNT_IS_VALID"
  );
}

// Download file from S3 using tenant-aware client
async function getFileFromS3(key, tenant) {
  const aws = await resolveAwsConfig(tenant);
  const client = getS3Client(aws);

  const obj = await client.send(
    new GetObjectCommand({
      Bucket: aws.bucketName,
      Key: key,
    }),
  );

  const stream = obj.Body;
  if (!stream) {
    throw new Error("S3 object body missing");
  }

  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(chunk);
  }

  return {
    buffer: Buffer.concat(chunks),
    contentType: obj.ContentType || mime.lookup(key) || "application/octet-stream",
    filename: key.split("/").pop() || "document",
  };
}

async function getBufferFromS3(key, tenant) {
  const file = await getFileFromS3(key, tenant);
  return file.buffer;
}

function isPanDocumentVerified(pan) {
  return Boolean(
    pan?.status === "verified" ||
      pan?.data?.valid === true ||
      String(pan?.data?.pan_status || "").toUpperCase() === "VALID",
  );
}

// User KYC approval requires Aadhaar and PAN. Face matching is an optional
// workflow step and is evaluated separately where it is explicitly enabled.
export async function getFinalKycStatus(user) {
  const aadhaarOk = user?.kyc?.aadhaar?.ocr?.verified === true;
  const panOk = isPanDocumentVerified(user?.kyc?.pan);

  if (!aadhaarOk && !panOk) return "not_submitted";
  if (!aadhaarOk || !panOk) return "pending";

  return "approved";
}

export function getUserKycDecision(user) {
  const aadhaarOk = user?.kyc?.aadhaar?.ocr?.verified === true;
  const panOk = isPanDocumentVerified(user?.kyc?.pan);

  if (!user?.kyc?.aadhaar) return "not_submitted";
  if (!aadhaarOk || !panOk) return "pending";

  return "approved";
}

export async function buildUserKycPayload(userId) {
  const [user, admin, cvRaw] = await Promise.all([
    User.findById(userId).lean(),
    AdminProfile.findOne({ owner: userId }).lean(),
    CompanyVerification.findOne({ userId }).lean(),
  ]);

  const cv = cvRaw || {};

  if (!user) throw new Error("User not found");

  const requireFaceMatch = admin?.kyc?.config?.requireFaceMatch === true;
  const aadhaarVerified = user?.kyc?.aadhaar?.ocr?.verified === true;

  const panVerified =
    isPanDocumentVerified(cv?.pan) || isPanDocumentVerified(user?.kyc?.pan);

  const persistedUserStatus =
    aadhaarVerified && panVerified ? "approved" : aadhaarVerified || panVerified ? "pending" : "not_submitted";
  const repair = {};
  if (panVerified && user?.kyc?.pan?.status !== "verified") {
    repair["kyc.pan.status"] = "verified";
  }
  if (user?.kyc?.status !== persistedUserStatus) {
    repair["kyc.status"] = persistedUserStatus;
  }
  if (Object.keys(repair).length) {
    await User.updateOne({ _id: userId }, { $set: repair });
  }

  const faceVerified =
    !requireFaceMatch || user?.kyc?.faceMatch?.matched === true;

  let status = "not_submitted";
  if (!user?.kyc?.aadhaar && !panVerified) status = "not_submitted";
  else if (!aadhaarVerified || !panVerified) status = "pending";
  else if (requireFaceMatch && !faceVerified) status = "awaiting_selfie";
  else status = "verified";

  return {
    status,
    config: {
      requireAadhaar: true,
      requirePan: true,
      requireFaceMatch,
    },
    details: {
      aadhaar: user?.kyc?.aadhaar ?? {},
      selfie: user?.kyc?.selfie || {},
      faceMatch: user?.kyc?.faceMatch || {},
      pan: cv?.pan ?? user?.kyc?.pan ?? {},
    },
    checks: {
      aadhaarVerified,
      panVerified,
      faceVerified,
    },
  };
}

// PAN verify
export async function verifyPan({ tenant, pan, name }) {
  try {
    const res = await cfPost(tenant, "/pan", { pan, name });
    return { raw: res, verified: isVerified(res) };
  } catch (err) {
    const msg = err?.response?.data?.message || err?.message || String(err);
    throw new ApiError(err?.response?.status || 500, msg);
  }
}

export async function verifyCompanyPan({ tenant, pan, name }) {
  try {
    const res = await cfPost(tenant, "/pan", { pan, name });

    console.log("PAN RESPONSE:", res);

    const type = (res?.type || "").toLowerCase();

    const isCompany =
      type === "company" ||
      type === "business" ||
      type === "firm" ||
      type === "llp";

    if (!isCompany) {
      throw new ApiError(
        400,
        `This is ${res?.type} PAN. Please enter Company PAN`,
      );
    }

    return { raw: res, verified: true };
  } catch (err) {
    const msg = err?.response?.data?.message || err?.message || String(err);
    throw new ApiError(err?.response?.status || err?.statusCode || 500, msg);
  }
}

// GSTIN verify
export async function verifyGstin({ tenant, gstin }) {
  try {
    const res = await cfPost(tenant, "/gstin", { GSTIN: gstin });

    return {
      raw: res,
      verified: res?.valid === true,
    };
  } catch (err) {
    const msg =
      err?.response?.data?.message || err?.message || "GST verification failed";

    throw new ApiError(err?.response?.status || 400, msg);
  }
}

// CIN verify
export async function verifyCin({ tenant, cin }) {
  try {
    const res = await cfPost(tenant, "/cin", {
      verification_id: `cin_${Date.now()}`,
      cin,
    });

    console.log("RAW CIN RESPONSE:", res);

    return {
      raw: res,
      verified: res?.status === "VALID",
    };
  } catch (err) {
    const msg =
      err?.response?.data?.message ||
      err?.response?.data?.error ||
      err?.message ||
      "CIN verification failed";

    throw new ApiError(err?.response?.status || 400, msg);
  }
}

// Bank sync (payout API)
export async function verifyBankSync({ tenant, account, ifsc }) {
  try {
    const res = await cfPost(tenant, "/bank-account/sync", {
      bank_account: account,
      ifsc,
    });

    return { raw: res, verified: isVerified(res) };
  } catch (err) {
    const msg = err?.response?.data?.message || err?.message || String(err);
    throw new ApiError(err?.response?.status || 500, msg);
  }
}

const KYC_UPLOAD_RULES = {
  aadhaar: {
    extensions: new Set([".jpg", ".jpeg", ".png", ".webp", ".pdf"]),
    contentTypes: new Set([
      "image/jpeg",
      "image/png",
      "image/webp",
      "application/pdf",
    ]),
  },
  selfie: {
    extensions: new Set([".jpg", ".jpeg", ".png", ".webp"]),
    contentTypes: new Set(["image/jpeg", "image/png", "image/webp"]),
  },
  pan: {
    extensions: new Set([".jpg", ".jpeg", ".png", ".webp", ".pdf"]),
    contentTypes: new Set([
      "image/jpeg",
      "image/png",
      "image/webp",
      "application/pdf",
    ]),
  },
};
const MAX_KYC_FILE_BYTES = 10 * 1024 * 1024;

export function validateKycUpload({ filename, contentType, size, type }) {
  const rule = KYC_UPLOAD_RULES[type];
  if (!rule) throw new Error("Invalid image type");

  const normalizedType = String(contentType || "").toLowerCase();
  const extension = String(filename || "")
    .slice(String(filename || "").lastIndexOf("."))
    .toLowerCase();

  if (!rule.contentTypes.has(normalizedType) || !rule.extensions.has(extension)) {
    throw new Error(
      type === "aadhaar"
        ? "Aadhaar document must be JPG, JPEG, PNG, WEBP, or PDF"
        : "Document format is not supported",
    );
  }

  if (Number(size || 0) > MAX_KYC_FILE_BYTES) {
    throw new Error("KYC document must be 10 MB or smaller");
  }
}

// Aadhaar OCR
export async function verifyAadhaarOCR({ tenant, input, opts = {} }) {
  const payload = {
    verification_id: opts.verification_id || `aadhaar_${Date.now()}`,
    document_type: opts.document_type || "AADHAAR",
    do_verification:
      opts.do_verification === true || opts.do_verification === "true",
  };

  // URL case -> JSON POST
  if (typeof input === "string") {
    const body = { ...payload, file_url: input };
    const response = await cfPost(tenant, "/bharat-ocr", body);
    return { raw: response, verified: isVerified(response) };
  }

  // multer memoryStorage provides req.file.buffer
  if (input?.originalname && input?.mimetype) {
    validateKycUpload({
      filename: input.originalname,
      contentType: input.mimetype,
      size: input.size || input.buffer?.length,
      type: "aadhaar",
    });
  }

  const hasBufferProp = input && input.buffer;
  const isBufferDirect = Buffer.isBuffer(input);

  if (isBufferDirect || hasBufferProp) {
    const form = new FormDataNode();
    form.append("verification_id", payload.verification_id);
    form.append("document_type", payload.document_type);
    form.append("do_verification", payload.do_verification ? "true" : "false");

    const fileBuffer = isBufferDirect ? input : input.buffer;
    const filename =
      (input && (input.originalname || input.filename)) || "aadhaar.jpg";
    const contentType = (input && input.mimetype) || "image/jpeg";

    form.append("file", Buffer.from(fileBuffer), { filename, contentType });

    const response = await cfMultipartPost(tenant, "/bharat-ocr", form);
    return { raw: response, verified: isVerified(response) };
  }

  // disk path case
  if (input && input.path && fs.existsSync(input.path)) {
    const form = new FormDataNode();
    form.append("verification_id", payload.verification_id);
    form.append("document_type", payload.document_type);
    form.append("do_verification", payload.do_verification ? "true" : "false");

    const stream = fs.createReadStream(input.path);
    const filename =
      input.originalname || input.filename || input.path.split("/").pop();

    form.append("file", stream, { filename });

    const response = await cfMultipartPost(tenant, "/bharat-ocr", form);
    return { raw: response, verified: isVerified(response) };
  }

  throw new Error(
    "Invalid input: pass a file buffer/object (multer) or a file URL string",
  );
}

// KYC image presign
export const getPresignForKycImage = async (userId, body, tenant) => {
  const { filename, contentType, type } = body;

  if (!filename || !contentType || !type) {
    throw new Error("filename, contentType and type required");
  }

  validateKycUpload({ filename, contentType, type });

  const ext = filename.includes(".")
    ? filename.substring(filename.lastIndexOf("."))
    : "." + (mime.extension(contentType) || "jpg");

  const key = `kyc/${userId}/${type}_${Date.now()}${ext}`;

  const { uploadUrl, expiresIn, bucketName, region } =
    await createPresignedUpload({
      tenant,
      key,
      contentType,
      expiresSeconds: 900,
    });

  const url = publicUrlForKey({ bucketName, region, key });

  return { uploadUrl, key, url, expiresIn };
};

// Face match selfie vs Aadhaar
export async function faceMatchS3(selfieKey, aadhaarKey, tenant) {
  if (!selfieKey || !aadhaarKey) {
    throw new Error("selfieKey and aadhaarKey required");
  }

  const selfieBuffer = await getBufferFromS3(selfieKey, tenant);
  const aadhaarBuffer = await getBufferFromS3(aadhaarKey, tenant);

  console.log("Selfie bytes:", selfieBuffer.length);
  console.log("Aadhaar bytes:", aadhaarBuffer.length);

  const form = new FormDataNode();
  form.append("verification_id", `face_${Date.now()}`);

  form.append("first_image", selfieBuffer, {
    filename: "selfie.jpg",
    contentType: "image/jpeg",
  });

  form.append("second_image", aadhaarBuffer, {
    filename: "aadhaar.jpg",
    contentType: "image/jpeg",
  });

  return cfMultipartPost(tenant, "/face-match", form);
}

// Save KYC images in DB
export const saveKycImage = async (userId, body, tenant) => {
  const { key, type } = body;

  if (!key || !type) {
    throw new Error("key and type required");
  }

  const aws = await resolveAwsConfig(tenant);
  const client = getS3Client(aws);

  await client.send(
    new HeadObjectCommand({
      Bucket: aws.bucketName,
      Key: key,
    }),
  );

  const url = publicUrlForKey({
    bucketName: aws.bucketName,
    region: aws.region,
    key,
  });

  const user = await User.findById(userId);
  if (!user) throw new Error("User not found");

  if (!user.kyc) user.kyc = {};

  user.kyc[type] = {
    s3Key: key,
    url,
    uploadedAt: new Date(),
  };

  if (type === "selfie") {
    try {
      console.log("Running Face Match...");

      const aadhaarKey = user.kyc?.aadhaar?.s3Key;
      if (!aadhaarKey) throw new Error("Upload Aadhaar first");

      const matchRaw = await faceMatchS3(key, aadhaarKey, tenant);
      const matched = matchRaw?.face_match_result === "YES";

      user.kyc.faceMatch = {
        raw: matchRaw,
        matched,
        score: matchRaw?.face_match_score || 0,
        processedAt: new Date(),
      };

      console.log("Face Match completed");
    } catch (err) {
      console.log("Face Match failed:", err.message);
      user.kyc.faceMatch = {
        error: err.message,
        processedAt: new Date(),
      };
    }
  }

  if (type === "aadhaar") {
    try {
      console.log("Running Aadhar OCR...");

      const file = await getFileFromS3(key, tenant);

      const { raw: ocrRaw, verified } = await verifyAadhaarOCR({
        tenant,
        input: {
          buffer: file.buffer,
          originalname: file.filename,
          mimetype: file.contentType,
          size: file.buffer.length,
        },
      });

      user.kyc.aadhaar.ocr = {
        raw: ocrRaw,
        verified,
        processedAt: new Date(),
      };

      user.kyc.aadhaar.status = verified ? "verified" : "rejected";
      user.kyc.status = await getFinalKycStatus(user);

      await user.save();

      try {
        const cv = await getOrCreate(userId);
        ensureField(cv, "aadhaar");
        cv.aadhaar.status = verified ? "verified" : "rejected";
        cv.aadhaar.data = ocrRaw;
        cv.aadhaar.savedAt = new Date();
        await cv.save();
      } catch (adminErr) {
        console.error(
          "Failed to save Aadhaar to CompanyVerification:",
          adminErr,
        );
      }

      console.log("OCR completed");
    } catch (err) {
      console.error("OCR ERROR:", err.message);
      user.kyc.aadhaar.ocr = {
        error: err.message,
        processedAt: new Date(),
      };
    }
  }

  user.kyc.status = await getFinalKycStatus(user);
  await user.save();

  return user.kyc[type];
};
