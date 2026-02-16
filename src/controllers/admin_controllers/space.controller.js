// /controllers/space.controller.js

import {
  createSpace as serviceCreateSpace,
  getAllSpaces as serviceGetAllSpaces,
  getSpaceById as serviceGetSpaceById,
  updateSpace as serviceUpdateSpace,
  deleteSpace as serviceDeleteSpace,
} from "../../services/space.service.js";

import { getSpaceBySlug as serviceGetSpaceBySlug } from "../../services/space.service.js";

/**
 * POST /spaces - Create a new space.
 */
// controllers/spaceController.js
export const createSpace = async (req, res) => {
  try {
    const space = await serviceCreateSpace(req.body, req.user?.id || null);
    if (!space) {
      // service did not return object (likely failed)
      return res
        .status(500)
        .json({ error: "Space creation failed (service returned empty)." });
    }
    return res.status(201).json({
      message: "Space created successfully!",
      data: space,
    });
  } catch (err) {
    console.error("[createSpace] error:", err);
    return res
      .status(500)
      .json({ error: err instanceof Error ? err.message : String(err) });
  }
};

/**
 * GET /spaces - Get all spaces with optional query params.
 */
export const getAllSpaces = async (req, res) => {
  try {
    const spaces = await serviceGetAllSpaces(req.query, {
      limit: parseInt(req.query.limit),
      page: parseInt(req.query.page),
      sort: req.query.sort ? JSON.parse(req.query.sort) : undefined,
    });
    return res.status(200).json({
      message: "Spaces retrieved successfully!",
      data: spaces,
    });
  } catch (error) {
    return res.status(404).json({
      message: error.message || "An error occurred while retrieving spaces.",
    });
  }
};

export const getSpaceBySlug = async (req, res) => {
  try {
    const space = await serviceGetSpaceBySlug(req.params.slug);
    return res.status(200).json({
      message: "Space retrieved successfully!",
      data: space,
    });
  } catch (error) {
    return res.status(404).json({
      message: error.message,
    });
  }
};

/**
 * GET /spaces/:identifier - Get a space by ID or slug.
 */
export const getSpaceById = async (req, res) => {
  try {
    const space = await serviceGetSpaceById(req.params.id);
    return res.status(200).json({
      message: "Space retrieved successfully!",
      data: space,
    });
  } catch (error) {
    return res.status(404).json({
      message: error.message || "An error occurred while retrieving the space.",
    });
  }
};

/**
 * PUT /spaces/:id - Update a space by ID.
 */
export const updateSpace = async (req, res) => {
  try {
    const space = await serviceUpdateSpace(
      req.params.id,
      req.body,
      req.user?.id,
    );
    return res.status(200).json({
      message: "Space updated successfully!",
      data: space,
    });
  } catch (error) {
    return res.status(400).json({
      message: error.message || "An error occurred while updating the space.",
    });
  }
};

/**
 * DELETE /spaces/:id - Delete a space by ID.
 */
export const deleteSpace = async (req, res) => {
  try {
    const space = await serviceDeleteSpace(req.params.id);
    return res.status(200).json({
      message: "Space deleted successfully!",
      data: space,
    });
  } catch (error) {
    return res.status(404).json({
      message: error.message || "An error occurred while deleting the space.",
    });
  }
};
