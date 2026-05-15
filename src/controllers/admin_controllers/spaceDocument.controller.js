import * as service from "../../services/spaceDocument.service.js";

/* ADD / REPLACE */
export const addDocument = async (req, res) => {
  try {
    const tenant = req.context?.tenant || req.tenant || null;

    const doc = await service.addDocument(
      req.body.scopeType,
      req.body.scopeId,
      req.body,
      req.user?.id,
      tenant,
    );

    return res.status(201).json({
      message: "Document saved",
      data: doc,
    });
  } catch (err) {
    return res.status(400).json({ message: err.message });
  }
};

/* DELETE */
export const deleteDocument = async (req, res) => {
  try {
    const tenant = req.context?.tenant || req.tenant || null;

    await service.deleteDocument(req.params.documentId, req.user?.id, tenant);

    return res.status(200).json({ message: "Document deleted" });
  } catch (err) {
    return res.status(400).json({ message: err.message });
  }
};

/* GET BY SCOPE */
export const getDocumentsByScope = async (req, res) => {
  try {
    const docs = await service.getDocumentsByScope(
      req.params.scopeType,
      req.params.scopeId,
    );

    return res.status(200).json({
      message: "Documents retrieved",
      data: docs,
    });
  } catch (err) {
    return res.status(400).json({ message: err.message });
  }
};

/* GET EFFECTIVE WORKSPACE DOCS */
export const getEffectiveDocumentsBySpace = async (req, res) => {
  try {
    const docs = await service.getEffectiveDocumentsBySpace(req.params.spaceId);

    return res.status(200).json({
      message: "Effective documents retrieved",
      data: docs,
    });
  } catch (err) {
    return res.status(400).json({ message: err.message });
  }
};