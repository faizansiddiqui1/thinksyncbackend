// controllers/admin_controllers/spaceMedia.controller.js
import * as service from "../../services/spaceMedia.service.js";

/* PRESIGN */
export const getPresignForImage = async (req, res) => {
  try {
    const { filename, contentType } = req.body;
    if (!filename || !contentType) {
      return res.status(400).json({ message: "filename and contentType required" });
    }
    const data = await service.getPresignForImage(req.params.spaceId, filename, contentType, req.user?.id);
    return res.status(200).json({ message: "Presign generated", data });
  } catch (err) {
    return res.status(400).json({ message: err.message });
  }
};


/* IMAGES */
export const addSpaceImage = async (req, res) => {
  try {
    const img = await service.addImage(req.params.spaceId, req.body, req.user?.id);
    return res.status(201).json({ message: "Image added", data: img });
  } catch (err) {
    return res.status(400).json({ message: err.message });
  }
};
  
export const updateSpaceImage = async (req, res) => {
  try {
    const img = await service.updateImage(
      req.params.spaceId,
      req.params.imageId,
      req.body,
      req.user?.id
    );
    return res.status(200).json({ message: "Image updated", data: img });
  } catch (err) {
    return res.status(400).json({ message: err.message });
  }
};

export const deleteSpaceImage = async (req, res) => {
  try {
    await service.deleteImage(req.params.spaceId, req.params.imageId, req.user?.id);
    return res.status(200).json({ message: "Image deleted" });
  } catch (err) {
    return res.status(400).json({ message: err.message });
  }
};


// get Presign for video

export const getPresignForVideo = async (req, res) => {
  try {
    const { filename, contentType } = req.body;

    if (!filename || !contentType) {
      return res.status(400).json({ message: "filename and contentType required" });
    }

    const data = await service.getPresignForVideo(
      req.params.spaceId,
      filename,
      contentType
    );

    return res.status(200).json({ message: "Video presign generated", data });
  } catch (err) {
    return res.status(400).json({ message: err.message });
  }
};



/* VIDEO */
export const addSpaceVideo = async (req, res) => {
  try {
    const video = await service.addVideo(req.params.spaceId, req.body, req.user?.id);
    return res.status(201).json({ message: "Video added", data: video });
  } catch (err) {
    return res.status(400).json({ message: err.message });
  }
};

export const updateSpaceVideo = async (req, res) => {
  try {
    const video = await service.updateVideo(req.params.spaceId, req.body, req.user?.id);
    return res.status(200).json({ message: "Video updated", data: video });
  } catch (err) {
    return res.status(400).json({ message: err.message });
  }
};

export const deleteSpaceVideo = async (req, res) => {
  try {
    await service.deleteVideo(req.params.spaceId, req.user?.id);
    return res.status(200).json({ message: "Video deleted" });
  } catch (err) {
    return res.status(400).json({ message: err.message });
  }
};

/* GET media (optional) */
export const getSpaceMedia = async (req, res) => {
  try {
    const media = await service.getMediaBySpace(req.params.spaceId);
    return res.status(200).json({ message: "Media retrieved", data: media || {} });
  } catch (err) {
    return res.status(400).json({ message: err.message });
  }
};
