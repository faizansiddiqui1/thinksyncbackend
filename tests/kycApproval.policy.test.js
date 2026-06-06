import test from "node:test";
import assert from "node:assert/strict";
import { evaluateKycRequirements } from "../src/services/kycApproval.service.js";

const verified = { status: "verified" };

test("approves when only enabled PAN and Aadhaar checks are verified", () => {
  const result = evaluateKycRequirements({
    config: {
      requirePan: true,
      requireAadhaar: true,
      requireGstin: false,
    },
    companyVerification: {
      pan: verified,
      aadhaar: verified,
    },
  });

  assert.equal(result.status, "approved");
  assert.deepEqual(result.requiredChecks, ["pan", "aadhaar"]);
  assert.deepEqual(result.pendingChecks, []);
});

test("keeps KYC pending when any enabled check is incomplete", () => {
  const result = evaluateKycRequirements({
    config: {
      requirePan: true,
      requireAadhaar: true,
      requireGstin: true,
    },
    companyVerification: {
      pan: verified,
      aadhaar: verified,
      gst: { status: "pending" },
    },
  });

  assert.equal(result.status, "pending");
  assert.deepEqual(result.pendingChecks, ["gstin"]);
});

test("requires every enabled business, bank, and face check", () => {
  const config = {
    requirePan: true,
    requireAadhaar: true,
    requireCompanyPan: true,
    requireGstin: true,
    requireCin: true,
    requireBankCheack: true,
    requireFaceMatch: true,
  };
  const companyVerification = {
    pan: verified,
    aadhaar: verified,
    companyPan: verified,
    gst: verified,
    cin: verified,
    bank: verified,
  };

  const pending = evaluateKycRequirements({
    config,
    companyVerification,
    user: { kyc: { faceMatch: { matched: false } } },
  });
  assert.equal(pending.status, "pending");
  assert.deepEqual(pending.pendingChecks, ["faceMatch"]);

  const approved = evaluateKycRequirements({
    config,
    companyVerification,
    user: { kyc: { faceMatch: { matched: true } } },
  });
  assert.equal(approved.status, "approved");
});

test("disabled checks never block approval", () => {
  const result = evaluateKycRequirements({
    config: {
      requirePan: true,
      requireAadhaar: false,
      requireCompanyPan: false,
      requireGstin: false,
      requireCin: false,
      requireBankCheack: false,
      requireFaceMatch: false,
    },
    companyVerification: {
      pan: verified,
      aadhaar: { status: "rejected" },
      gst: { status: "pending" },
    },
  });

  assert.equal(result.status, "approved");
  assert.deepEqual(result.requiredChecks, ["pan"]);
});
