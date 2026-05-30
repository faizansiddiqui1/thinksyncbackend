const VIRTUAL_TYPES = new Set(["virtual_office", "vertual_office"]);
const MANAGED_TYPES = new Set(["managed_office"]);
const PRIVATE_TYPES = new Set(["private_office"]);
const EVENT_TYPES = new Set(["event_space"]);

function normalizeText(value = "") {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
}

export function getInventoryCategory(space = {}) {
  const cardVariant = normalizeText(space.cardVariant);
  const spaceType = normalizeText(space.normalizedSpaceType || space.spaceType);
  const categories = Array.isArray(space.categories)
    ? space.categories.map(normalizeText)
    : [];
  const listingModes = space.listingModes || {};

  if (
    cardVariant.includes("virtual") ||
    VIRTUAL_TYPES.has(spaceType) ||
    categories.includes("virtual_office")
  ) {
    return "virtual_office";
  }

  if (
    cardVariant.includes("managed") ||
    MANAGED_TYPES.has(spaceType) ||
    categories.includes("managed_office")
  ) {
    return "managed_office";
  }

  if (
    cardVariant.includes("private") ||
    PRIVATE_TYPES.has(spaceType) ||
    categories.includes("private_office")
  ) {
    return "private_office";
  }

  if (
    cardVariant.includes("event") ||
    EVENT_TYPES.has(spaceType) ||
    categories.includes("event_space")
  ) {
    return "event_space";
  }

  if (
    cardVariant.includes("short") ||
    categories.includes("short_term_leasing") ||
    categories.includes("short_term") ||
    listingModes.shortTerm === true
  ) {
    return "short_term_leasing";
  }

  if (
    cardVariant.includes("long") ||
    categories.includes("long_term_leasing") ||
    categories.includes("long_term") ||
    listingModes.longTerm === true
  ) {
    return "long_term_leasing";
  }

  return spaceType || "workspace";
}

export function getInventoryCategoryLabel(category = "") {
  const labels = {
    short_term_leasing: "Short-term leasing",
    long_term_leasing: "Long-term leasing",
    private_office: "Private office",
    managed_office: "Managed office",
    virtual_office: "Virtual office",
    event_space: "Event space",
    workspace: "Workspace",
  };

  const normalized = normalizeText(category);
  return (
    labels[normalized] ||
    normalized
      .replace(/_/g, " ")
      .replace(/\b\w/g, (char) => char.toUpperCase())
  );
}

export function isPhysicalVisitCategory(category = "") {
  const normalized = normalizeText(category);
  return normalized !== "virtual_office";
}

export function areComparableCategories(categories = []) {
  const unique = [
    ...new Set(categories.map((category) => normalizeText(category)).filter(Boolean)),
  ];

  return unique.length <= 1;
}
