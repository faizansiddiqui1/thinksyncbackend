import {
  createBookingDraftForActor,
  claimGuestBookingDraftsForUser,
  checkoutBookingDraftForUser,
  createGuestBookingDraftToken,
  getBookingDraftById,
  getMostRecentActiveBookingDraft,
  listBookingDraftsForActor,
  updateBookingDraftForActor,
  cancelBookingDraftForActor,
} from "../../services/bookingDraft.service.js";
import {
  BOOKING_DRAFT_GUEST_COOKIE,
  getGuestDraftCookieOptions,
} from "../../utils/cookieUtils.js";

function resolveDraftActor(req, res, { ensureGuestToken = false } = {}) {
  if (req.user?._id) {
    return {
      userId: req.user._id,
      guestToken: req.cookies?.[BOOKING_DRAFT_GUEST_COOKIE] || null,
    };
  }

  let guestToken = req.cookies?.[BOOKING_DRAFT_GUEST_COOKIE] || null;
  if (!guestToken && ensureGuestToken) {
    guestToken = createGuestBookingDraftToken();
    res.cookie(
      BOOKING_DRAFT_GUEST_COOKIE,
      guestToken,
      getGuestDraftCookieOptions(),
    );
  }

  return {
    userId: null,
    guestToken,
  };
}

export async function attachGuestBookingDraftsToUser(req, userId) {
  const guestToken = req.cookies?.[BOOKING_DRAFT_GUEST_COOKIE] || null;
  if (!guestToken || !userId) {
    return { updatedCount: 0 };
  }

  return claimGuestBookingDraftsForUser({
    guestToken,
    userId,
  });
}

export const listBookingDrafts = async (req, res) => {
  try {
    const actor = resolveDraftActor(req, res);
    const result = await listBookingDraftsForActor(actor, {
      status: req.query.status || "active",
      limit: req.query.limit || 10,
      page: req.query.page || 1,
      draftStage: req.query.draftStage || "",
      focusId: req.query.focusId || "",
    });

    return res.json(result);
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

export const getActiveBookingDraft = async (req, res) => {
  try {
    const actor = resolveDraftActor(req, res);
    const result = await getMostRecentActiveBookingDraft(actor, {
      draftStage: req.query.draftStage || "checkout",
    });
    return res.json(result);
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

export const createBookingDraft = async (req, res) => {
  try {
    const actor = resolveDraftActor(req, res, { ensureGuestToken: true });
    const result = await createBookingDraftForActor(actor, req.body || {});
    return res.status(result.success ? 201 : 400).json(result);
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

export const getBookingDraft = async (req, res) => {
  try {
    const actor = resolveDraftActor(req, res);
    const result = await getBookingDraftById(req.params.id, actor);
    return res.status(result.success ? 200 : 404).json(result);
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

export const updateBookingDraft = async (req, res) => {
  try {
    const actor = resolveDraftActor(req, res);
    const result = await updateBookingDraftForActor(
      req.params.id,
      actor,
      req.body || {},
    );

    const statusCode =
      result.success ? 200 : result.code === "DRAFT_VERSION_CONFLICT" ? 409 : 404;

    return res.status(statusCode).json(result);
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

export const cancelBookingDraft = async (req, res) => {
  try {
    const actor = resolveDraftActor(req, res);
    const result = await cancelBookingDraftForActor(
      req.params.id,
      actor,
      req.body?.reason,
    );
    return res.status(result.success ? 200 : 404).json(result);
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

export const checkoutBookingDraft = async (req, res) => {
  try {
    if (!req.user?._id) {
      return res.status(401).json({
        success: false,
        error: "Authentication required",
      });
    }

    const result = await checkoutBookingDraftForUser(
      req.params.id,
      req.user._id,
      req.body || {},
    );

    const statusCode =
      result.success
        ? 200
        : result.code === "DRAFT_VALIDATION_FAILED"
        ? 409
        : 400;

    return res.status(statusCode).json(result);
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
};
