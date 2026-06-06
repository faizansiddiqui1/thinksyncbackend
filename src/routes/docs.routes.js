import express from "express";

import {
  createAdminDocCategory,
  createAdminDocument,
  createDocFeedback,
  createDocsUpload,
  deleteAdminDocCategory,
  deleteAdminDocument,
  deleteDocsUpload,
  getAdminDocument,
  getPublicDoc,
  listAdminDocCategories,
  listAdminDocFeedback,
  listAdminDocumentVersions,
  listAdminDocuments,
  listPublicDocsNavigation,
  restoreAdminDocumentVersion,
  searchPublicDocs,
  updateAdminDocCategory,
  updateAdminDocFeedback,
  updateAdminDocument,
} from "../controllers/super_admin_controllers/docs.controller.js";
import { requireAuth } from "../middlewares/auth.js";
import { requireSuperAdmin } from "../middlewares/superadmin.js";

const router = express.Router();

router.get("/docs/navigation", listPublicDocsNavigation);
router.get("/docs/search", searchPublicDocs);
router.get("/docs/:slug", getPublicDoc);
router.post("/docs/:slug/feedback", createDocFeedback);

router.get("/admin/docs/categories", requireAuth, requireSuperAdmin, listAdminDocCategories);
router.post("/admin/docs/categories", requireAuth, requireSuperAdmin, createAdminDocCategory);
router.patch("/admin/docs/categories/:id", requireAuth, requireSuperAdmin, updateAdminDocCategory);
router.delete("/admin/docs/categories/:id", requireAuth, requireSuperAdmin, deleteAdminDocCategory);

router.post("/admin/docs/uploads/presign", requireAuth, requireSuperAdmin, createDocsUpload);
router.delete("/admin/docs/uploads", requireAuth, requireSuperAdmin, deleteDocsUpload);

router.get("/admin/docs/documents", requireAuth, requireSuperAdmin, listAdminDocuments);
router.post("/admin/docs/documents", requireAuth, requireSuperAdmin, createAdminDocument);
router.get("/admin/docs/documents/:id", requireAuth, requireSuperAdmin, getAdminDocument);
router.patch("/admin/docs/documents/:id", requireAuth, requireSuperAdmin, updateAdminDocument);
router.delete("/admin/docs/documents/:id", requireAuth, requireSuperAdmin, deleteAdminDocument);
router.get("/admin/docs/documents/:id/versions", requireAuth, requireSuperAdmin, listAdminDocumentVersions);
router.post(
  "/admin/docs/documents/:id/versions/:versionId/restore",
  requireAuth,
  requireSuperAdmin,
  restoreAdminDocumentVersion,
);

router.get("/admin/docs/feedback", requireAuth, requireSuperAdmin, listAdminDocFeedback);
router.patch("/admin/docs/feedback/:id", requireAuth, requireSuperAdmin, updateAdminDocFeedback);

export default router;
