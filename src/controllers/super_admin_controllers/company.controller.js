import Company from "../../models/super_admin_models/Company.model.js";
import Space from "../../models/admin_models/Space.js";
import User from "../../models/user_models/User.js";
import AdminProfile from "../../models/admin_models/AdminProfile.js";
import City from "../../models/super_admin_models/City.model.js";
import mongoose from "mongoose";

const ASSIGNABLE_SPACE_TYPES = ["private_office", "cowork_space", "coworking_space"];
const ASSIGNABLE_SPACE_BASE_FILTER = {
  spaceType: { $in: ASSIGNABLE_SPACE_TYPES },
};

function normalizeSpaceType(spaceType = "") {
  const normalized = String(spaceType || "").trim().toLowerCase();
  if (normalized === "coworking_space") return "cowork_space";
  return normalized;
}

function getSpaceTypeLabel(spaceType = "") {
  const normalized = normalizeSpaceType(spaceType);
  if (normalized === "private_office") return "Private Office";
  if (normalized === "cowork_space") return "Coworking Space";
  return "Workspace";
}

function isAssignableSpaceRecord(space = null) {
  const normalizedType = normalizeSpaceType(space?.spaceType);
  if (!ASSIGNABLE_SPACE_TYPES.map(normalizeSpaceType).includes(normalizedType)) {
    return false;
  }

  const listingLongTerm = space?.listingModes?.longTerm === true;
  const listingShortTerm = space?.listingModes?.shortTerm === true;
  const leasingType = String(space?.leasingType || "")
    .trim()
    .toLowerCase();
  const listingType = String(space?.listingType || "")
    .trim()
    .toLowerCase();

  if (listingLongTerm || leasingType === "long_term" || listingType === "long_term") {
    return true;
  }

  if (listingShortTerm || leasingType === "short_term" || listingType === "short_term") {
    return false;
  }

  // Backward compatibility for older private-office records that predate listingModes.
  return normalizedType === "private_office";
}

function normalizeAvailability(space = null) {
  const status = String(space?.privateOfficeDetails?.availabilityStatus || "")
    .trim()
    .toLowerCase();

  if (status === "available") return "available";
  if (status) return status;
  return "unknown";
}

function mapAssignableSpace(space = {}) {
  const city = space?.address?.city;
  const cityName =
    city?.name ||
    city?.slug ||
    (typeof city === "string" ? city : "") ||
    "";
  const totalSeats = Number(space?.centerDetails?.totalSeats);
  const occupancy =
    Number.isFinite(totalSeats) && totalSeats > 0
      ? `${totalSeats} seats`
      : "Not specified";

  return {
    _id: space._id,
    name: space.name || "Untitled space",
    slug: space.slug || "",
    spaceType: normalizeSpaceType(space.spaceType || "private_office"),
    spaceTypeLabel: getSpaceTypeLabel(space.spaceType),
    spaceCategory: normalizeSpaceType(space.spaceType || "private_office"),
    leasingType: "long_term",
    leasingTypeLabel: "Long Term",
    cityId: city?._id || city || null,
    cityName,
    occupancy,
    status: normalizeAvailability(space),
    availabilityStatus: space?.privateOfficeDetails?.availabilityStatus || null,
    centerDetails: {
      totalSeats: Number.isFinite(totalSeats) ? totalSeats : null,
    },
  };
}

async function buildAssignableSpaceSearchFilter({ q = "", city = "", spaceType = "" } = {}) {
  const filter = { ...ASSIGNABLE_SPACE_BASE_FILTER };

  if (city && city !== "all" && mongoose.Types.ObjectId.isValid(String(city))) {
    filter["address.city"] = new mongoose.Types.ObjectId(String(city));
  }

  const normalizedSpaceType = normalizeSpaceType(spaceType);
  if (normalizedSpaceType) {
    if (normalizedSpaceType === "cowork_space") {
      filter.spaceType = { $in: ["cowork_space", "coworking_space"] };
    } else if (normalizedSpaceType === "private_office") {
      filter.spaceType = "private_office";
    }
  }

  const search = String(q || "").trim();
  if (!search) {
    return filter;
  }

  const searchConditions = [
    { name: { $regex: search, $options: "i" } },
    { slug: { $regex: search, $options: "i" } },
  ];

  if (mongoose.Types.ObjectId.isValid(search)) {
    searchConditions.push({ _id: new mongoose.Types.ObjectId(search) });
  }

  const matchingCities = await City.find({
    isActive: true,
    $or: [
      { name: { $regex: search, $options: "i" } },
      { slug: { $regex: search, $options: "i" } },
    ],
  })
    .select("_id")
    .lean()
    .exec();

  if (matchingCities.length) {
    searchConditions.push({
      "address.city": {
        $in: matchingCities.map((item) => item._id),
      },
    });
  }

  filter.$and = [{ $or: searchConditions }];
  return filter;
}

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
      notes,
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
    if (!space || !isAssignableSpaceRecord(space)) {
      return res.status(404).json({
        success: false,
        message: "Only long-term private offices and long-term coworking spaces can be assigned",
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
      notes,
      owner: user._id, // ✅ link user
      createdBy: req.user?._id,
      spaces: [assignedSpaceId],
    });

    // 🔥 STEP 3: link user → company
    user.companyId = company._id;
    await user.save();
    await AdminProfile.findOneAndUpdate(
      { owner: user._id },
      {
        $setOnInsert: {
          owner: user._id,
          "kyc.status": "not_submitted",
        },
      },
      { upsert: true, new: true },
    );

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

export const listAssignableOnboardingSpaces = async (req, res) => {
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 24, 1), 100);
    const filter = await buildAssignableSpaceSearchFilter({
      q: req.query.q,
      city: req.query.city,
      spaceType: req.query.spaceType,
    });

    const spaces = await Space.find(filter)
      .select(
        [
          "name",
          "slug",
          "spaceType",
          "address.city",
          "listingModes",
          "leasingType",
          "listingType",
          "privateOfficeDetails.availabilityStatus",
          "centerDetails.totalSeats",
        ].join(" "),
      )
      .populate("address.city", "name slug")
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean()
      .exec();

    return res.json({
      success: true,
      items: spaces.filter(isAssignableSpaceRecord).map(mapAssignableSpace),
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

export const listAssignableOnboardingCities = async (req, res) => {
  try {
    const spaces = await Space.find(ASSIGNABLE_SPACE_BASE_FILTER)
      .select("address.city listingModes leasingType listingType")
      .lean()
      .exec();
    const assignableCityIds = [
      ...new Set(
        spaces
          .filter(isAssignableSpaceRecord)
          .map((space) => space?.address?.city)
          .filter(Boolean)
          .map((cityId) => String(cityId)),
      ),
    ];

    const cityQuery = {
      isActive: true,
    };

    if (assignableCityIds.length) {
      cityQuery._id = { $in: assignableCityIds };
    }

    const cities = await City.find(cityQuery)
      .select("_id name slug")
      .sort({ name: 1, slug: 1 })
      .lean()
      .exec();

    return res.json({
      success: true,
      items: cities.map((city) => ({
        value: String(city._id),
        label: city.name || city.slug || "Unknown city",
      })),
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

export const listOnboardedCompanies = async (req, res) => {
  try {
    const companies = await Company.find({})
      .select(
        [
          "legalName",
          "displayName",
          "email",
          "phoneNumber",
          "whatsappNumber",
          "city",
          "state",
          "country",
          "status",
          "assignedSpaceId",
          "createdAt",
        ].join(" "),
      )
      .populate("assignedSpaceId", "name slug spaceType")
      .sort({ createdAt: -1 })
      .lean()
      .exec();

    return res.json({
      success: true,
      items: companies.map((company) => ({
        _id: company._id,
        legalName: company.legalName || "",
        displayName: company.displayName || "",
        email: company.email || "",
        phoneNumber: company.phoneNumber || "",
        whatsappNumber: company.whatsappNumber || "",
        city: company.city || "",
        state: company.state || "",
        country: company.country || "",
        status: company.status || "active",
        createdAt: company.createdAt || null,
        assignedSpace: company.assignedSpaceId
          ? {
              _id: company.assignedSpaceId._id,
              name: company.assignedSpaceId.name || "",
              slug: company.assignedSpaceId.slug || "",
              spaceType: company.assignedSpaceId.spaceType || "",
            }
          : null,
      })),
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
