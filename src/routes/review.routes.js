import express from 'express';

import {
  createReview,
  getReview,
  getSpaceReviews,
  getUserReviews,
  updateReview,
  deleteReview,
  addResponse,
  markHelpful,
  flagReview,
  togglePublish
} from '../controllers/review.controller.js';

import { reviewValidation } from '../middleware/validation.js';

const router = express.Router();

/* =========================
   Review Routes
========================= */

router.post('/', reviewValidation.create, createReview);

router.get('/:id', getReview);

router.get('/space/:spaceId', getSpaceReviews);

router.get('/user/:userId', getUserReviews);

router.put('/:id', updateReview);

router.delete('/:id', deleteReview);

router.post('/:id/response', addResponse);

router.post('/:id/helpful', markHelpful);

router.post('/:id/flag', flagReview);

router.put('/:id/publish', togglePublish);

export default router;
