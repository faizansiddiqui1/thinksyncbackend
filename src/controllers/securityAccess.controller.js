import {
  getCompanySecurityLogs,
  getCompanySecurityOverview,
  getMyBookingAccess,
  getSuperAdminSecurityOverview,
  regenerateMyBookingAccess,
  retestCompanySecurityDevice,
  saveCompanySecurityDevice,
  syncCompanySecurityDevice,
  updateSuperAdminSecurityDeviceStatus,
  validateSecurityAccessAttempt,
} from "../services/securityAccess/securityAccess.service.js";
import { getSecurityProviderCatalog } from "../services/securityAccess/catalog.service.js";

function getErrorMessage(error, fallback = "Something went wrong") {
  return error?.message || fallback;
}

export async function getSecurityProvidersHandler(req, res) {
  try {
    return res.json({
      success: true,
      data: {
        providers: getSecurityProviderCatalog(),
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: getErrorMessage(error),
    });
  }
}

export async function getCompanySecurityOverviewHandler(req, res) {
  try {
    const data = await getCompanySecurityOverview(req.user);
    return res.json({
      success: true,
      data,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: getErrorMessage(error),
    });
  }
}

export async function saveCompanySecurityDeviceHandler(req, res) {
  try {
    const result = await saveCompanySecurityDevice(
      req.user,
      req.body || {},
      req.params.id || null,
    );

    return res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: getErrorMessage(error),
    });
  }
}

export async function retestCompanySecurityDeviceHandler(req, res) {
  try {
    const result = await retestCompanySecurityDevice(req.user, req.params.id);
    return res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: getErrorMessage(error),
    });
  }
}

export async function syncCompanySecurityDeviceHandler(req, res) {
  try {
    const result = await syncCompanySecurityDevice(req.user, req.params.id);
    return res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: getErrorMessage(error),
    });
  }
}

export async function getCompanySecurityLogsHandler(req, res) {
  try {
    const logs = await getCompanySecurityLogs(req.user, req.query || {});
    return res.json({
      success: true,
      data: {
        logs,
      },
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: getErrorMessage(error),
    });
  }
}

export async function getMyBookingAccessHandler(req, res) {
  try {
    const access = await getMyBookingAccess(req.user._id, req.params.bookingId);
    return res.json({
      success: true,
      data: {
        access,
      },
    });
  } catch (error) {
    return res.status(404).json({
      success: false,
      message: getErrorMessage(error, "Booking access not found"),
    });
  }
}

export async function regenerateMyBookingAccessHandler(req, res) {
  try {
    const access = await regenerateMyBookingAccess(
      req.user._id,
      req.params.bookingId,
    );
    return res.json({
      success: true,
      data: {
        access,
      },
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: getErrorMessage(error),
    });
  }
}

export async function validateSecurityAccessAttemptHandler(req, res) {
  try {
    const result = await validateSecurityAccessAttempt(req.body || {});
    return res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: getErrorMessage(error),
    });
  }
}

export async function getSuperAdminSecurityOverviewHandler(req, res) {
  try {
    const data = await getSuperAdminSecurityOverview(req.query || {});
    return res.json({
      success: true,
      data,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: getErrorMessage(error),
    });
  }
}

export async function updateSuperAdminSecurityDeviceStatusHandler(req, res) {
  try {
    const device = await updateSuperAdminSecurityDeviceStatus(
      req.params.id,
      req.body?.approvalStatus,
      req.user,
      req.body?.reason || "",
    );

    return res.json({
      success: true,
      data: {
        device,
      },
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: getErrorMessage(error),
    });
  }
}
