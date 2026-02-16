import { ApiError } from "../utils/apiResponse.js";

export const errorHandler = (err, req, res, next) => {
  let error = err;

  if (!(error instanceof ApiError)) {
    const statusCode = error.statusCode || error.status || 500;
    const message =
      error.message || "Something went wrong. Please try again later";
    error = new ApiError(statusCode, message);
  }

  if (error.name === "ValidationError") {
    const errors = Object.values(error.errors).map((err) => ({
      field: err.path,
      message: err.message,
    }));
    error = new ApiError(400, "Validation failed", errors);
  }

  if (error.code === 11000) {
    const field = Object.keys(error.keyPattern)[0];
    const message = `An account with this ${field} already exists`;
    error = new ApiError(409, message);
  }

  if (error.name === "CastError") {
    error = new ApiError(400, "Invalid ID format");
  }

  if (error.name === "JsonWebTokenError") {
    error = new ApiError(401, "Invalid token. Please login again");
  }

  if (error.name === "TokenExpiredError") {
    error = new ApiError(401, "Your session has expired. Please login again");
  }

  const response = {
    success: false,
    message: error.message,
    ...(error.errors && { errors: error.errors }),
    ...(process.env.NODE_ENV === "development" && { stack: error.stack }),
  };

  if (process.env.NODE_ENV === "development") {
    console.error("Error:", error);
  }

  res.status(error.statusCode).json(response);
};

export const notFound = (req, res, next) => {
  const error = new ApiError(404, `Route ${req.originalUrl} not found`);
  next(error);
};
