const CATEGORY_KEYWORDS = new Map([
  ["Beauty", ["beauty", "makeup", "skincare", "skin care", "cosmetic"]],
  ["Fashion", ["fashion", "style", "outfit", "ootd", "clothing"]],
  ["Lifestyle", ["lifestyle", "life style", "daily life", "vlog"]],
  ["Food", ["food", "foodie", "coffee", "cafe", "recipe", "cooking", "baking"]],
  ["Travel", ["travel", "traveler", "tour", "wander", "trip"]],
  ["Fitness", ["fitness", "gym", "workout", "yoga", "pilates", "coach"]],
  ["Gaming", ["gaming", "gamer", "streamer", "esports"]],
  ["Tech", ["tech", "gadgets", "software", "ai", "coding"]],
  ["Business", ["business", "entrepreneur", "founder", "startup", "marketing"]],
  ["Education", ["education", "teacher", "student", "learn", "school", "tips"]],
  ["Parenting", ["mom", "mama", "mother", "dad", "parent", "parenting", "family"]],
  ["Pets", ["pet", "dog", "cat", "fur", "animal"]],
  ["Music", ["music", "singer", "song", "artist", "dj"]],
  ["Entertainment", ["entertainment", "actor", "host", "showbiz"]],
  ["Comedy", ["comedy", "comedian", "funny", "humor"]],
  ["Automotive", ["auto", "car", "cars", "motor", "motorcycle", "bike"]]
]);

const LOCATION_ALIASES = new Map([
  ["qc", "Quezon City"],
  ["quezon city", "Quezon City"],
  ["manila", "Manila"],
  ["makati", "Makati"],
  ["taguig", "Taguig"],
  ["pasig", "Pasig"],
  ["cebu", "Cebu"],
  ["cebu city", "Cebu"],
  ["davao", "Davao"],
  ["davao city", "Davao"],
  ["laguna", "Laguna"],
  ["batangas", "Batangas"],
  ["cavite", "Cavite"],
  ["bulacan", "Bulacan"],
  ["pampanga", "Pampanga"],
  ["iloilo", "Iloilo"],
  ["bacolod", "Bacolod"],
  ["philippines", "Philippines"],
  ["ph", "Philippines"],
  ["pinoy", "Philippines"],
  ["filipino", "Philippines"]
]);

export function parseBio(bio = "") {
  const text = String(bio || "");
  const lower = text.toLowerCase();

  const email = extractEmail(text);
  const instagram = extractSocial(text, [
    /(?:ig|instagram)\s*[:\-]?\s*@?([a-z0-9._]{2,30})/i,
    /instagram\.com\/([a-z0-9._]{2,30})/i
  ]);
  const facebook = extractSocial(text, [
    /(?:fb|facebook)\s*[:\-]?\s*@?([a-z0-9._]{2,50})/i,
    /facebook\.com\/([a-z0-9._-]{2,80})/i
  ]);
  const youtube = extractSocial(text, [
    /(?:yt|youtube)\s*[:\-]?\s*@?([a-z0-9._-]{2,80})/i,
    /youtube\.com\/(?:c\/|channel\/|@)?([a-z0-9._-]{2,80})/i
  ]);

  const category = [];
  for (const [name, keywords] of CATEGORY_KEYWORDS.entries()) {
    if (keywords.some((keyword) => hasKeyword(lower, keyword))) {
      category.push(name);
    }
  }

  const location = detectLocation(lower);
  const confidence = calculateConfidence({ email, instagram, facebook, youtube, location, category });

  return {
    email,
    instagram,
    facebook,
    youtube,
    location,
    category,
    confidence
  };
}

export function calculateLeadScore(parsed, followersQualified) {
  let score = 0;
  if (parsed.email) score += 30;
  if (parsed.instagram) score += 20;
  if (parsed.location) score += 10;
  if (parsed.category?.length) score += 20;
  if (followersQualified) score += 20;
  return Math.min(score, 100);
}

function extractEmail(text) {
  const match = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return match ? match[0].toLowerCase() : "";
}

function extractSocial(text, patterns) {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return sanitizeHandle(match[1]);
  }
  return "";
}

function sanitizeHandle(value) {
  return value.replace(/^@/, "").replace(/[),.;\s]+$/g, "");
}

function detectLocation(lowerText) {
  for (const [alias, normalized] of LOCATION_ALIASES.entries()) {
    const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (new RegExp(`(^|[^a-z])${escaped}([^a-z]|$)`, "i").test(lowerText)) {
      return normalized;
    }
  }
  return "";
}

function hasKeyword(lowerText, keyword) {
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, "i").test(lowerText);
}

function calculateConfidence(parsed) {
  let confidence = 0;
  if (parsed.email) confidence += 0.3;
  if (parsed.instagram || parsed.facebook || parsed.youtube) confidence += 0.2;
  if (parsed.location) confidence += 0.2;
  if (parsed.category?.length) confidence += 0.3;
  return Number(confidence.toFixed(2));
}
