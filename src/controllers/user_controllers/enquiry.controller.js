// controllers/enquiry.controller.js
import Enquiry from "../../models/user_models/Enquiry.js";
import AdminProfile from "../../models/admin_models/AdminProfile.js";

const cleanOptional = (value) => {
  if (value === undefined || value === null) return "";
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  return trimmed;
};

// Public create enquiry
export const createEnquiry = async (req, res) => {
  try {
    const authUser = req.user || null;

    let {
      name,
      email,
      phoneNumber,
      companyName,
      budget,
      details,
      spaceId,
    } = req.body;

    // If logged in, prefer stored user/admin details
    if (authUser) {
      email = authUser.email || email;
      phoneNumber = authUser.phoneNumber || phoneNumber;

      const adminProfile = await AdminProfile.findOne({ owner: authUser._id }).select(
        "company.name"
      );

      const isAdminLike = ["pending_admin", "admin", "super_admin"].includes(
        authUser.role
      );

      if (!name) {
        name =
          authUser.username ||
          authUser.name ||
          (adminProfile?.company?.name ? adminProfile.company.name : "");
      }

      if (!companyName && adminProfile?.company?.name) {
        companyName = adminProfile.company.name;
      }

      const enquiry = await Enquiry.create({
        name: cleanOptional(name),
        email: cleanOptional(email).toLowerCase(),
        phoneNumber: cleanOptional(phoneNumber),
        companyName: cleanOptional(companyName),
        budget: cleanOptional(budget),
        details: cleanOptional(details),
        spaceId: spaceId || null,
        submittedByUser: isAdminLike ? authUser._id : authUser._id,
        submittedByAdminProfile: adminProfile?._id || null,
        submittedByRole: authUser.role || "user",
        source: isAdminLike ? "logged_in_admin" : "logged_in_user",
        status: "new",
      });

      return res.status(201).json({
        success: true,
        message: "Enquiry created successfully",
        data: enquiry,
      });
    }

    // Public user
    if (!name || !email || !phoneNumber) {
      return res.status(400).json({
        success: false,
        message: "name, email and phoneNumber are required",
      });
    }

    const enquiry = await Enquiry.create({
      name: cleanOptional(name),
      email: cleanOptional(email).toLowerCase(),
      phoneNumber: cleanOptional(phoneNumber),
      companyName: cleanOptional(companyName),
      budget: cleanOptional(budget),
      details: cleanOptional(details),
      spaceId: spaceId || null,
      source: "public_form",
      submittedByRole: "public",
      status: "new",
    });

    return res.status(201).json({
      success: true,
      message: "Enquiry created successfully",
      data: enquiry,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

// Super admin only: list enquiries
export const getAllEnquiries = async (req, res) => {
  try {
    const {
      status,
      q,
      page = 1,
      limit = 20,
    } = req.query;

    const filter = {};

    if (status) filter.status = status;

    if (q) {
      filter.$or = [
        { name: { $regex: q, $options: "i" } },
        { email: { $regex: q, $options: "i" } },
        { phoneNumber: { $regex: q, $options: "i" } },
        { companyName: { $regex: q, $options: "i" } },
      ];
    }

    const skip = (Number(page) - 1) * Number(limit);

    const [items, total] = await Promise.all([
      Enquiry.find(filter)
        .populate("submittedByUser", "email username phoneNumber role isActive")
        .populate("submittedByAdminProfile", "company.name company.address whiteLabel.status")
        .populate("spaceId", "title name spaceType location")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit)),
      Enquiry.countDocuments(filter),
    ]);

    return res.json({
      success: true,
      total,
      page: Number(page),
      limit: Number(limit),
      data: items,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

// Super admin only: get single enquiry
export const getEnquiryById = async (req, res) => {
  try {
    const enquiry = await Enquiry.findById(req.params.id)
      .populate("submittedByUser", "email username phoneNumber role isActive")
      .populate("submittedByAdminProfile", "company.name company.address whiteLabel.status")
      .populate("spaceId", "title name spaceType location")
      .populate("assignedSpaceId", "title name spaceType location")
      .populate("convertedCompanyId", "name type status");

    if (!enquiry) {
      return res.status(404).json({
        success: false,
        message: "Enquiry not found",
      });
    }

    return res.json({
      success: true,
      data: enquiry,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

// Super admin only: update status
export const updateEnquiryStatus = async (req, res) => {
  try {
    const { status, notes } = req.body;

    const allowed = ["new", "contacted", "converted", "rejected"];
    if (!allowed.includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Invalid status",
      });
    }

    const update = { status };

    if (typeof notes === "string") update.notes = notes.trim();

    if (status === "contacted") update.contactedAt = new Date();
    if (status === "converted") update.convertedAt = new Date();

    const enquiry = await Enquiry.findByIdAndUpdate(req.params.id, update, {
      new: true,
    });

    if (!enquiry) {
      return res.status(404).json({
        success: false,
        message: "Enquiry not found",
      });
    }

    return res.json({
      success: true,
      message: "Enquiry updated successfully",
      data: enquiry,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

// Super admin only: delete enquiry
export const deleteEnquiry = async (req, res) => {
  try {
    const enquiry = await Enquiry.findByIdAndDelete(req.params.id);

    if (!enquiry) {
      return res.status(404).json({
        success: false,
        message: "Enquiry not found",
      });
    }

    return res.json({
      success: true,
      message: "Enquiry deleted successfully",
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};