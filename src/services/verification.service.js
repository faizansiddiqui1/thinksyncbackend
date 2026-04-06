import {
  cfPost,
  cfGetFull,
  payoutBankSyncUrl,
  cfMultipartPost,
} from "../utils/cashfreeClient.js";
import { ApiError } from "../utils/apiResponse.js";
import fs from "fs";
import FormDataPkg from "form-data";

// For images save
import { createPresignedUpload, publicUrlForKey, s3 } from "../config/s3.js";
import mime from "mime-types";
import User from "../models/user_models/User.js";
import { GetObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import axios from "axios";
import {
  ensureField,
  getOrCreate,
} from "../controllers/admin_controllers/verification.controller.js";
import AdminProfile from "../models/admin_models/AdminProfile.js";
import CompanyVerification from "../models/admin_models/CompanyVerification.js";

const FormDataNode =
  FormDataPkg && FormDataPkg.default ? FormDataPkg.default : FormDataPkg;

async function isFaceMatchRequired(userId) {
  const admin = await AdminProfile.findOne({ owner: userId }).lean();
  return admin?.kyc?.config?.requireFaceMatch === true;
}

// helper to decide verified flag from provider response
function isVerified(raw) {
  return !!(
    raw?.valid === true ||
    raw?.status === "SUCCESS" ||
    raw?.status === "VALID" || // 👈 ADD THIS
    raw?.verification_status === "VERIFIED" ||
    raw?.isValid === true ||
    raw?.account_exists === true ||
    raw?.account_status === "VALID" || // 👈 ADD THIS
    raw?.account_status_code === "ACCOUNT_IS_VALID" // 👈 optional safety
  );
}

//  Download file from S3 using signed GET url
async function getBufferFromS3(key) {
  const bucket = process.env.AWS_BUCKET_NAME;

  const obj = await s3.send(
    new GetObjectCommand({
      Bucket: bucket,
      Key: key,
    }),
  );

  const stream = obj.Body;

  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(chunk);
  }

  const buffer = Buffer.concat(chunks);

  console.log("Downloaded bytes:", buffer.length);

  return buffer;
}

// FINAL KYC DECISION
export async function getFinalKycStatus(user) {
  const requireFace = await isFaceMatchRequired(user._id);

  const aadhaarOk = user?.kyc?.aadhaar?.ocr?.verified === true;
  const panOk = user?.kyc?.pan?.status === "verified";
  const faceOk = user?.kyc?.faceMatch?.matched === true;

  if (!aadhaarOk && !panOk) return "not_submitted";
  if (!aadhaarOk || !panOk) return "pending";
  if (requireFace && !faceOk) return "pending";

  return "approved";
}

// export async function getFinalKycStatus(user) {
//   const requireFace = await isFaceMatchRequired(user._id);

//   const aadhaarOk = user?.kyc?.aadhaar?.ocr?.verified === true;
//   const panOk = user?.kyc?.pan?.status === "verified";
//   const faceOk = user?.kyc?.faceMatch?.matched === true;

//   // Aadhaar not uploaded
//   if (!user?.kyc?.aadhaar) return "not_submitted";

//   // Aadhaar uploaded but OCR not verified
//   if (!aadhaarOk) return "pending";

//   // Aadhaar verified and selfie required
//   if (requireFace && !faceOk) return "awaiting_selfie";

//   // If PAN required in future, check here
//   // if (requirePan && !panOk) return "awaiting_pan";

//   // All required steps complete
//   return "approved";
// }

export function getUserKycDecision(user) {
  const aadhaarOk = user?.kyc?.aadhaar?.ocr?.verified === true;
  const panOk = user?.kyc?.pan?.status === "verified";

  if (!user?.kyc?.aadhaar) return "not_submitted";

  if (!aadhaarOk) return "pending";

  if (!panOk) return "pending"; // agar PAN required hai

  return "approved";
}

export async function buildUserKycPayload(userId) {
  const [user, admin, cvRaw] = await Promise.all([
    User.findById(userId).lean(),
    AdminProfile.findOne({ owner: userId }).lean(),
    CompanyVerification.findOne({ userId }).lean(),
  ]);

  const cv = cvRaw || {}; // ✅ VERY IMPORTANT

  if (!user) throw new Error("User not found");

  const requireFaceMatch = admin?.kyc?.config?.requireFaceMatch === true;

  const aadhaarVerified = user?.kyc?.aadhaar?.ocr?.verified === true;

  const panVerified =
    (cv?.pan && cv.pan.status === "verified") ||
    (user?.kyc?.pan && user.kyc.pan.status === "verified");

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
export async function verifyPan(pan, name) {
  try {
    const res = await cfPost("/pan", { pan, name });

    //  const type = (res?.type || "").toLowerCase();

    // // ✔ Accept both Company + Business (future safe)
    // const isIndividual =
    // type === "Individual"

    // if (!isIndividual) {
    //   throw new ApiError(400, "Please enter Valid Individual PAN number");
    // }

    return { raw: res, verified: isVerified(res) };
  } catch (err) {
    const msg = err?.response?.data?.message || err?.message || String(err);
    throw new ApiError(err?.response?.status || 500, msg);
  }
}

export async function verifyCompanyPan(pan, name) {
  try {
    const res = await cfPost("/pan", { pan, name });

    console.log("PAN RESPONSE:", res);

    const type = (res?.type || "").toLowerCase();

    // ✅ STRICT COMPANY CHECK
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
    throw new ApiError(err?.statusCode || 500, msg);
  }
}

// GSTIN verify
export async function verifyGstin(gstin) {
  try {
    const res = await cfPost("/gstin", { GSTIN: gstin }); // ✅ FIX

    return {
      raw: res,
      verified: res?.valid === true,
    };
  } catch (err) {
    const msg =
      err?.response?.data?.message || err?.message || "GST verification failed";

    throw new ApiError(400, msg);
  }
}

// CIN verify
export async function verifyCin(cin) {
  try {
    const res = await cfPost("/cin", {
      verification_id: `cin_${Date.now()}`,
      cin: cin,
    });

    console.log("RAW CIN RESPONSE:", res);

    return {
      raw: res,

      // ✅ FINAL FIX
      verified: res?.status === "VALID",
    };
  } catch (err) {
    const msg =
      err?.response?.data?.message ||
      err?.response?.data?.error ||
      err?.message ||
      "CIN verification failed";

    throw new ApiError(400, msg);
  }
}

// Bank sync (payout API GET)
export async function verifyBankSync(account, ifsc) {
  try {
    const url = payoutBankSyncUrl();
    const res = await cfPost("/bank-account/sync", {
      bank_account: account,
      ifsc: ifsc,
    });
    return { raw: res, verified: isVerified(res) };
  } catch (err) {
    const msg = err?.response?.data?.message || err?.message || String(err);
    throw new ApiError(err?.response?.status || 500, msg);
  }
}

// Aadhaar OCR
export async function verifyAadhaarOCR(input, opts = {}) {
  const payload = {
    verification_id: opts.verification_id || `aadhaar_${Date.now()}`,
    document_type: opts.document_type || "AADHAAR",
    do_verification:
      opts.do_verification === true || opts.do_verification === "true",
  };

  // URL case -> JSON POST
  if (typeof input === "string") {
    const body = { ...payload, file_url: input };
    const response = await cfPost("/bharat-ocr", body);
    return { raw: response, verified: isVerified(response) };
  }

  // multer memoryStorage provides req.file.buffer
  const hasBufferProp = input && input.buffer;
  const isBufferDirect = Buffer.isBuffer(input);

  if (isBufferDirect || hasBufferProp) {
    const form = new FormDataNode();
    form.append("verification_id", payload.verification_id);
    form.append("document_type", payload.document_type);
    form.append("do_verification", payload.do_verification ? "true" : "false");

    // Determine file buffer and filename/mimetype
    const fileBuffer = isBufferDirect ? input : input.buffer;
    const filename =
      (input && (input.originalname || input.filename)) || "aadhaar.jpg";
    const contentType = (input && input.mimetype) || "image/jpeg";

    // Append file as Buffer with filename and contentType
    form.append("file", Buffer.from(fileBuffer), { filename, contentType });

    // pass form-data instance to cfMultipartPost which will use form.getHeaders()
    const response = await cfMultipartPost("/bharat-ocr", form);
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
    const response = await cfMultipartPost("/bharat-ocr", form);
    return { raw: response, verified: isVerified(response) };
  }

  throw new Error(
    "Invalid input: pass a file buffer/object (multer) or a file URL string",
  );
}

// KYC IMAGES SAVE IN DB services
export const getPresignForKycImage = async (userId, body) => {
  const { filename, contentType, type } = body;

  if (!filename || !contentType || !type)
    throw new Error("filename, contentType and type required");

  if (!["aadhaar", "selfie", "pan"].includes(type))
    throw new Error("Invalid image type");

  const ext = filename.includes(".")
    ? filename.substring(filename.lastIndexOf("."))
    : "." + (mime.extension(contentType) || "jpg");

  const key = `kyc/${userId}/${type}_${Date.now()}${ext}`;

  const { uploadUrl, expiresIn } = await createPresignedUpload({
    key,
    contentType,
    expiresSeconds: 900,
  });

  const url = publicUrlForKey({ key });

  return { uploadUrl, key, url, expiresIn };
};

// Face match selfie vs Aadhaar
export async function faceMatchS3(selfieKey, aadhaarKey) {
  if (!selfieKey || !aadhaarKey) {
    throw new Error("selfieKey and aadhaarKey required");
  }

  const selfieBuffer = await getBufferFromS3(selfieKey);
  const aadhaarBuffer = await getBufferFromS3(aadhaarKey);

  console.log("Selfie bytes:", selfieBuffer.length);
  console.log("Aadhaar bytes:", aadhaarBuffer.length);

  const form = new FormDataNode();

  form.append("verification_id", `face_${Date.now()}`);

  // IMPORTANT: pass Buffer directly
  form.append("first_image", selfieBuffer, {
    filename: "selfie.jpg",
    contentType: "image/jpeg",
  });

  form.append("second_image", aadhaarBuffer, {
    filename: "aadhaar.jpg",
    contentType: "image/jpeg",
  });

  // IMPORTANT: pass FormData instance directly
  return cfMultipartPost("/face-match", form);
}

// Saved kyc images with all verification
export const saveKycImage = async (userId, body) => {
  const { key, type } = body;

  if (!key || !type) {
    throw new Error("key and type required");
  }

  const bucket = process.env.AWS_BUCKET_NAME;
  const region = process.env.AWS_REGION;

  // 🔐 VERIFY FILE EXISTS IN S3
  await s3.send(
    new HeadObjectCommand({
      Bucket: bucket,
      Key: key,
    }),
  );

  // build url on backend (never trust client)
  const url = `https://${bucket}.s3.${region}.amazonaws.com/${key}`;

  const user = await User.findById(userId);
  if (!user) throw new Error("User not found");

  if (!user.kyc) user.kyc = {};

  user.kyc[type] = {
    
    s3Key: key,
    url,
    uploadedAt: new Date(),
  };

  // after user.kyc[type] = { ... }

  if (type === "selfie") {
    try {
      console.log("Running Face Match...");

      const aadhaarKey = user.kyc?.aadhaar?.s3Key;
      if (!aadhaarKey) throw new Error("Upload Aadhaar first");

      const matchRaw = await faceMatchS3(key, aadhaarKey);

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

  // AUTO AADHAR OCR SCANNING
  if (type === "aadhaar") {
    try {
      console.log("Running Aadhar OCR...");

      // download from S3
      const response = await axios.get(url, {
        responseType: "arraybuffer",
      });

      const buffer = Buffer.from(response.data);

      // send buffer to verifyAadhaarOCR -> now returns { raw, verified }
      const { raw: ocrRaw, verified } = await verifyAadhaarOCR(buffer);

      // save in user's kyc object (full response + verified flag)
      user.kyc.aadhaar.ocr = {
        raw: ocrRaw,
        verified,
        processedAt: new Date(),
      };

      user.kyc.aadhaar.status = verified ? "verified" : "rejected";
      user.kyc.status = await getFinalKycStatus(user);

      await user.save();

      // ALSO save same full response into CompanyVerification (exactly like CIN/PAN)
      try {
        const cv = await getOrCreate(userId);
        ensureField(cv, "aadhaar");
        cv.aadhaar.status = verified ? "verified" : "rejected";
        // Save full API response under data (same pattern as other docs)
        cv.aadhaar.data = ocrRaw;
        cv.aadhaar.savedAt = new Date();
        await cv.save();
      } catch (adminErr) {
        // don't break user flow if admin save fails; log for debugging
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

  user.kyc.status = await getFinalKycStatus(user); // admin logic (same)

  await user.save();

  return user.kyc[type];
};

