import mongoose from "mongoose";
import slugify from "slugify";

const citySchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  slug: { type: String, unique: true },

  state: { type: String, required: true },
  country: { type: String, default: "India" },

  isPopular: { type: Boolean, default: false },
  isActive: { type: Boolean, default: true },

  coordinates: {
    type: { type: String, default: "Point" },
    coordinates: [Number], // [lng, lat]
  },

  image: String // frontend ke liye (Delhi icon etc)
}, { timestamps: true });

citySchema.pre("save", function(next) {
  if (!this.slug) {
    this.slug = slugify(this.name, { lower: true });
  }
  next();
});

const City = mongoose.model("City", citySchema);

export default City;
