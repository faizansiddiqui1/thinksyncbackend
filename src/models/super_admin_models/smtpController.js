import SMTP from "../../models/super_admin_models/SMTP.model.js";

/**
 * ➕ Create SMTP (unique by host + username)
 */
export const createSmtp = async (req, res) => {
  try {
    const { host, username } = req.body;

    if (!host || !username) {
      return res.status(400).json({
        message: "host and username (email) are required",
      });
    }

    // 🔍 Duplicate check (same provider + same email)
    const exists = await SMTP.findOne({ host, username });
    if (exists) {
      return res.status(409).json({
        message:
          "SMTP with same host and email already exists. Use another email.",
      });
    }

    const smtp = new SMTP(req.body);
    await smtp.save();

    res.status(201).json({
      message: "SMTP created",
      smtp,
    });
  } catch (err) {
    // 🔐 DB-level safety
    if (err.code === 11000) {
      return res.status(409).json({
        message: "Duplicate SMTP not allowed (same host + email)",
      });
    }

    res.status(400).json({ message: err.message });
  }
};


/**
 * 📄 Get all SMTPs (sorted by priority)
 */
export const listSmtps = async (req, res) => {
  try {
    const smtps = await SMTP.find().sort({ priority: 1 }).lean();

    res.json(smtps);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/**
 * 🔍 Get single SMTP by ID
 */
export const getSmtp = async (req, res) => {
  try {
    const smtp = await SMTP.findById(req.params.id).lean();

    if (!smtp) {
      return res.status(404).json({ message: "SMTP not found" });
    }

    res.json(smtp);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

/**
 * ✏️ Update SMTP
 */
export const updateSmtp = async (req, res) => {
  try {
    const smtp = await SMTP.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });

    if (!smtp) {
      return res.status(404).json({ message: "SMTP not found" });
    }

    res.json({
      message: "SMTP updated",
      smtp,
    });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

/**
 * 🔄 Enable / Disable SMTP
 */
export const toggleSmtpStatus = async (req, res) => {
  try {
    const { isActive } = req.body;

    if (typeof isActive !== "boolean") {
      return res.status(400).json({ message: "isActive must be boolean" });
    }

    const smtp = await SMTP.findByIdAndUpdate(
      req.params.id,
      { isActive },
      { new: true },
    );

    if (!smtp) {
      return res.status(404).json({ message: "SMTP not found" });
    }

    res.json({
      message: "SMTP status updated",
      smtp,
    });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

/**
 * 🗑️ Delete SMTP
 */
export const deleteSmtp = async (req, res) => {
  try {
    const smtp = await SMTP.findByIdAndDelete(req.params.id);

    if (!smtp) {
      return res.status(404).json({ message: "SMTP not found" });
    }

    res.json({ message: "SMTP deleted" });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};
