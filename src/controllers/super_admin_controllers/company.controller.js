import Company from "../../models/super_admin_models/Company.model.js";
import Space from "../../models/admin_models/Space.js";
import User from "../../models/user_models/User.js";

export const createCompany = async (req, res) => {
  try {
    const {
      legalName,
      displayName,
      email,
      phoneNumber,
      whatsappNumber,
      assignedSpaceId,
      address,
      city,
      state,
      country,
      gstNumber,
      cinNumber,
      panNumber,
    } = req.body;

    // 🔥 VALIDATION
    if (!legalName || !email || !phoneNumber || !assignedSpaceId) {
      return res.status(400).json({
        success: false,
        message: "Required fields missing",
      });
    }

    // 🔍 Check space exists
    const space = await Space.findById(assignedSpaceId);
    if (!space) {
      return res.status(404).json({
        success: false,
        message: "Space not found",
      });
    }

    if (space.spaceType !== "private_office") {
      return res.status(400).json({
        success: false,
        message: "Only private office can be assigned",
      });
    }

    // 🔍 Check if user exists
    let user = await User.findOne({ email });

    // 🔥 STEP 1: create/update user (NO companyId here)
    if (!user) {
      user = await User.create({
        email,
        phoneNumber,
        role: "pending_admin", // ✅ KYC required
      });
    } else {
      user.role = "pending_admin";
      user.phoneNumber = phoneNumber || user.phoneNumber;
      await user.save();
    }

    // 🔥 STEP 2: create company
    const company = await Company.create({
      legalName,
      displayName,
      email,
      phoneNumber,
      whatsappNumber,
      assignedSpaceId,
      address,
      city,
      state,
      country,
      gstNumber,
      cinNumber,
      panNumber,
      owner: user._id, // ✅ link user
      createdBy: req.user?._id,
      spaces: [assignedSpaceId],
    });

    // 🔥 STEP 3: link user → company
    user.companyId = company._id;
    await user.save();

    // 🔥 RESPONSE
    return res.status(201).json({
      success: true,
      data: company,
      ownerUserId: user._id,
      loginEmail: email,
      message: "Company created. Complete KYC to activate admin access.",
    });

  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};


export const addEmployee = async (req, res) => {
  try {
    const { email, phoneNumber, role = "employee", spaceIds = [] } = req.body;

    // 🔥 ALWAYS FETCH FRESH USER (JWT stale fix)
    const adminUser = await User.findById(req.user._id);

    if (!adminUser) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    // 🔒 only company admin
    if (!adminUser.companyId) {
      return res.status(403).json({
        success: false,
        message: "Not a company admin",
      });
    }

    // 🔍 get company
    const company = await Company.findById(adminUser.companyId);

    if (!company) {
      return res.status(404).json({
        success: false,
        message: "Company not found",
      });
    }

    // 🔥 VALIDATE SPACE ACCESS
    const allowedSpaces = (company.spaces || []).map((s) => s.toString());

    const invalidSpaces = spaceIds.filter(
      (id) => !allowedSpaces.includes(id)
    );

    if (invalidSpaces.length > 0) {
      return res.status(400).json({
        success: false,
        message: "You can only assign your company spaces",
      });
    }

    // 🔥 VALIDATE INPUT
    const normalizedEmail = email?.trim().toLowerCase() || "";
    const normalizedPhone = phoneNumber?.trim() || "";

    if (!normalizedEmail && !normalizedPhone) {
      return res.status(400).json({
        success: false,
        message: "Email or phone number required",
      });
    }

    // 🔍 FIND USER (email → phone fallback)
    let user = null;

    if (normalizedEmail) {
      user = await User.findOne({ email: normalizedEmail });
    }

    if (!user && normalizedPhone) {
      user = await User.findOne({ phoneNumber: normalizedPhone });
    }

    // 🔥 CREATE USER IF NOT EXISTS
    if (!user) {
      user = await User.create({
        email: normalizedEmail || undefined,
        phoneNumber: normalizedPhone || undefined,
        role: "user", // 🔥 NEVER admin
        companyId: company._id,
      });
    } else {
      // 🔥 LINK USER TO COMPANY
      user.companyId = company._id;
      await user.save();
    }

    // 🚫 DUPLICATE CHECK
    const exists = company.employees.some(
      (e) => e.user.toString() === user._id.toString()
    );

    if (exists) {
      return res.status(400).json({
        success: false,
        message: "Employee already exists",
      });
    }

    // 🔥 ADD EMPLOYEE WITH SPACE ACCESS
    company.employees.push({
      user: user._id,
      role,
      spaces: spaceIds,
    });

    await company.save();

    // 🔥 RESPONSE (clean)
    return res.status(200).json({
      success: true,
      message: "Employee added successfully",
      employee: {
        _id: user._id,
        email: user.email,
        phoneNumber: user.phoneNumber,
        role,
        spaces: spaceIds,
      },
    });

  } catch (err) {
    console.error("addEmployee error:", err);

    return res.status(500).json({
      success: false,
      message: err.message || "Internal server error",
    });
  }
};