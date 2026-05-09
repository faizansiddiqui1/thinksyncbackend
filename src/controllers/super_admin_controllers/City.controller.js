import City from "../../models/super_admin_models/City.model.js";

export const createCity = async (req, res) => {
  try {
    const city = await City.create(req.body);

    res.status(201).json({
      success: true,
      data: city
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

export const getCities = async (req, res) => {
  const cities = await City.find({ isActive: true });

  const popular = cities.filter(c => c.isPopular);
  const others = cities.filter(c => !c.isPopular);

  res.json({
    success: true,
    data: {
      popular,
      others
    }
  });
};