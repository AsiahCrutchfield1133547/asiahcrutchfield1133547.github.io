// People First Cities — main script
// Leaflet map + route summary + community suggestions + rule-based "AI" coach (no API key)

let ALL_PLACES = [];

// Approximate coordinates for places (edit to be more accurate if you want)
const PLACE_COORDS = {
  yzu: { lat: 24.9896, lng: 121.2688 }, // Yuan Ze University
  ty_station: { lat: 24.9890, lng: 121.3115 }, // Taoyuan Station (approx)
  ty_night_market: { lat: 24.9939, lng: 121.3105 }, // Taoyuan Night Market (approx)
};


// ------------------------------
// Theme (Dark mode)
// ------------------------------
function applyTheme(theme) {
  const root = document.documentElement;
  const isDark = theme === "dark";
  root.setAttribute("data-theme", isDark ? "dark" : "light");

  const btn = document.getElementById("theme-toggle");
  if (btn) {
    btn.setAttribute("aria-pressed", isDark ? "true" : "false");
    btn.textContent = isDark ? "☀️ Light" : "🌙 Dark";
  }
}

function initTheme() {
  const stored = localStorage.getItem("pfc-theme");
  if (stored === "dark" || stored === "light") {
    applyTheme(stored);
    return;
  }

  // Default to system preference
  const prefersDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
  applyTheme(prefersDark ? "dark" : "light");
}

function wireThemeToggle() {
  const btn = document.getElementById("theme-toggle");
  if (!btn) return;

  btn.addEventListener("click", () => {
    const current = document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
    const next = current === "dark" ? "light" : "dark";
    localStorage.setItem("pfc-theme", next);
    applyTheme(next);
  });
}

let map;        // Leaflet map instance
let routeLayer; // Layer group for markers

// ------------------------------
// Init
// ------------------------------
document.addEventListener("DOMContentLoaded", async () => {
  initTheme();
  wireThemeToggle();
  // Footer year
  const yearEl = document.getElementById("footer-date");
  if (yearEl) yearEl.textContent = String(new Date().getFullYear());

  await loadLocations();
  initMap();
  wireUI();
  wireReportAlertModal();

  updateButtons();
});

// ------------------------------
// Report Alert Modal (prototype)
// ------------------------------
function wireReportAlertModal() {
  const reportBtn = document.getElementById("report-alert-btn");
  const modal = document.getElementById("alert-modal");
  const closeBtn = document.getElementById("close-alert-modal");
  const form = document.getElementById("alert-form");

  // If the modal isn't in the page (or IDs don't match), fail loudly in devtools.
  if (!reportBtn || !modal || !closeBtn || !form) {
    console.warn("Report Alert modal wiring skipped: missing elements");
    return;
  }

  const open = () => {
    modal.classList.remove("hidden");
    modal.setAttribute("aria-hidden", "false");
  };

  const close = () => {
    modal.classList.add("hidden");
    modal.setAttribute("aria-hidden", "true");
    form.reset();
  };

  reportBtn.addEventListener("click", open);
  closeBtn.addEventListener("click", close);

  // Click outside modal content closes it
  modal.addEventListener("click", (e) => {
    if (e.target === modal) close();
  });

  // Esc closes
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !modal.classList.contains("hidden")) close();
  });

  form.addEventListener("submit", (e) => {
    e.preventDefault();

    const type = document.getElementById("alert-type").value;
    const description = document.getElementById("alert-description").value.trim();

    // Prototype behavior: log + lightweight confirmation
    console.log("Alert submission (prototype):", {
      type,
      description,
      timestamp: new Date().toISOString(),
    });

    alert("Thanks! Alert submitted (prototype — not saved yet).");
    close();
  });
}

function wireUI() {
  const startInput = document.getElementById("start");
  const destInput = document.getElementById("destination");
  const routeBtn = document.getElementById("route-btn");
  const aiBtn = document.getElementById("ai-btn");
  const swapBtn = document.getElementById("swap-btn");

  startInput.addEventListener("input", updateButtons);
  destInput.addEventListener("input", updateButtons);

  document.querySelectorAll('input[name="priority"]').forEach((r) => {
    r.addEventListener("change", updateButtons);
  });

  routeBtn.addEventListener("click", planRoute);
  aiBtn.addEventListener("click", generateAITips);
  swapBtn.addEventListener("click", swapLocations);
}

function updateButtons() {
  const start = getPlaceIdFromLabel(document.getElementById("start").value);
  const destination = getPlaceIdFromLabel(document.getElementById("destination").value);
  const ready = Boolean(start && destination && start !== destination);

  const routeBtn = document.getElementById("route-btn");
  const aiBtn = document.getElementById("ai-btn");
  const swapBtn = document.getElementById("swap-btn");

  routeBtn.disabled = !ready;
  aiBtn.disabled = !ready;
  swapBtn.disabled = !ready;
}

// ------------------------------
// Locations
// ------------------------------
async function loadLocations() {
  const response = await fetch("locations.json");
  const locations = await response.json();
  const places = locations.places;

  ALL_PLACES = places;
  populateDatalist(document.getElementById("places"), places);
}

function getPlaceIdFromLabel(label) {
  const clean = String(label || "").trim().toLowerCase();
  if (!clean) return null;

  const exact = ALL_PLACES.find((p) => p.label.toLowerCase() === clean);
  if (exact) return exact.id;

  const idMatch = ALL_PLACES.find((p) => p.id.toLowerCase() === clean);
  return idMatch ? idMatch.id : null;
}

function setupAutocomplete(fieldId) {
  const input = document.getElementById(fieldId);
  const list = document.getElementById(`${fieldId}-suggestions`);
  if (!input || !list) return;

  // Clear any previous selection when user edits
  const clearSelection = () => { delete input.dataset.placeId; };

  function renderSuggestions(query) {
    const q = String(query || "").trim().toLowerCase();
    const matches = ALL_PLACES
      .filter((p) => (q ? p.label.toLowerCase().includes(q) : true))
      .slice(0, 8);

    list.innerHTML = "";

    if (matches.length === 0) {
      const li = document.createElement("li");
      li.textContent = "No matches";
      li.className = "suggestion muted";
      li.setAttribute("aria-disabled", "true");
      list.appendChild(li);
      list.classList.remove("hidden");
      return;
    }

    matches.forEach((p) => {
      const li = document.createElement("li");
      li.className = "suggestion";
      li.setAttribute("role", "option");
      li.textContent = p.label;
      li.addEventListener("mousedown", (e) => {
        // mousedown fires before blur; prevents the list from closing too early
        e.preventDefault();
        input.value = p.label;
        input.dataset.placeId = p.id;
        list.classList.add("hidden");
        updateButtons();
      });
      list.appendChild(li);
    });

    list.classList.remove("hidden");
  }

  input.addEventListener("focus", () => renderSuggestions(input.value));
  input.addEventListener("input", () => { clearSelection(); renderSuggestions(input.value); updateButtons(); });
  input.addEventListener("blur", () => {
    // let click happen before hiding
    setTimeout(() => list.classList.add("hidden"), 120);
  });
}

function populateDatalist(datalistEl, places) {
  // Datalist options are the visible labels the user can type/select
  datalistEl.innerHTML = "";
  places.forEach((place) => {
    const option = document.createElement("option");
    option.value = place.label;
    datalistEl.appendChild(option);
  });
}


function swapLocations() {
  const startEl = document.getElementById("start");
  const destEl = document.getElementById("destination");

  const a = startEl.value.trim();
  const b = destEl.value.trim();
  if (!a || !b) return;

  const aId = startEl.dataset.placeId || "";
  const bId = destEl.dataset.placeId || "";

  startEl.value = b;
  destEl.value = a;

  if (bId) startEl.dataset.placeId = bId; else delete startEl.dataset.placeId;
  if (aId) destEl.dataset.placeId = aId; else delete destEl.dataset.placeId;

  updateButtons();
}

function getPlaceLabel(id) {
  const place = ALL_PLACES.find((p) => p.id === id);
  return place ? place.label : id;
}

function getPlaceIdFromLabel(label) {
  const clean = String(label || "").trim().toLowerCase();
  if (!clean) return null;

  // Exact match (case-insensitive)
  const exact = ALL_PLACES.find((p) => p.label.toLowerCase() === clean);
  if (exact) return exact.id;

  // Fallback: allow users to type an ID directly (e.g., "yzu")
  const idMatch = ALL_PLACES.find((p) => p.id.toLowerCase() === clean);
  return idMatch ? idMatch.id : null;
}


// ------------------------------
// Leaflet map
// ------------------------------
function initMap() {
  map = L.map("map-view").setView([24.9896, 121.2688], 13);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "&copy; OpenStreetMap contributors",
  }).addTo(map);

  routeLayer = L.layerGroup().addTo(map);
}

// ------------------------------
// Route planning + Community
// ------------------------------
function haversineKm(a, b) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const R = 6371; // km
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
  return R * c;
}

function recommendModeByDistance(km) {
  if (km <= 2) return "Walking";
  if (km <= 6) return "Biking";
  return "Transit";
}

function getRecommendedModeText(preferredMode, km) {
  // If we know distance, give a people-first recommendation based on distance
  if (typeof km === "number") {
    const reco = recommendModeByDistance(km);
    // If user's preference matches reco, reinforce it
    if (capitalize(preferredMode) === reco) {
      return `${reco} (matches your preference)`;
    }
    return `${reco} (based on distance)`;
  }

  // fallback if distance unknown
  if (preferredMode === "walking") return "Walking (best for short trips)";
  if (preferredMode === "biking") return "Biking (great for medium trips)";
  if (preferredMode === "transit") return "Transit (best for longer trips)";
  return "Choose the most sustainable option that fits your trip";
}

function showDisplay(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.remove("hidden");
}

function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

async function planRoute() {
  const startInput = document.getElementById("start").value;
  const destinationInput = document.getElementById("destination").value;
  const start = getPlaceIdFromLabel(startInput);
  const destination = getPlaceIdFromLabel(destinationInput);

  if (!start || !destination) {
    alert("Choose valid locations first (pick from suggestions or type an exact label).");
    return;
  }
  if (start === destination) {
    alert("Start and destination can’t be the same.");
    return;
  }
  if (start === destination) {
    alert("Start and destination can’t be the same.");
    return;
  }

  // Clear community lists
  const tipsList = document.getElementById("tips-list");
  const scenicList = document.getElementById("scenic-list");
  const alertsList = document.getElementById("alerts-list");
  tipsList.innerHTML = "";
  scenicList.innerHTML = "";
  alertsList.innerHTML = "";

  // Read selected mode (walking / biking / transit)
  const modeInput = document.querySelector('input[name="priority"]:checked');
  const preferred = modeInput ? modeInput.value : "walking";

  // Labels
  const startLabel = getPlaceLabel(start);
  const destLabel = getPlaceLabel(destination);

  // Distance (if coords exist)
  const startCoord = PLACE_COORDS[start];
  const destCoord = PLACE_COORDS[destination];
  const km = startCoord && destCoord ? haversineKm(startCoord, destCoord) : null;

  // Fill summary
  document.getElementById("route-start").textContent = startLabel;
  document.getElementById("route-destination").textContent = destLabel;
  document.getElementById("preferred-mode").textContent = capitalize(preferred);
  document.getElementById("recommended-mode").textContent = getRecommendedModeText(preferred, km ?? undefined);
  document.getElementById("route-distance").textContent = km === null ? "Unknown" : `~${km.toFixed(1)} km`;

  // Show map section
  showDisplay("map");

  // Update map markers
  if (!map || !routeLayer) return;
  routeLayer.clearLayers();

  const points = [];
  if (startCoord) {
    routeLayer.addLayer(L.marker([startCoord.lat, startCoord.lng]).bindPopup(`Start: ${startLabel}`));
    points.push([startCoord.lat, startCoord.lng]);
  }
  if (destCoord) {
    routeLayer.addLayer(L.marker([destCoord.lat, destCoord.lng]).bindPopup(`Destination: ${destLabel}`));
    points.push([destCoord.lat, destCoord.lng]);
  }

  if (points.length === 2) {
    map.fitBounds(L.latLngBounds(points), { padding: [30, 30] });
  } else if (points.length === 1) {
    map.setView(points[0], 15);
  }

  // Load community suggestions for the selected route
  const response = await fetch("locations.json");
  const data = await response.json();
  const routes = data.routes;

  const forwardKey = `${start}-${destination}`;
  const reverseKey = `${destination}-${start}`;
  const routeInfo = routes[forwardKey] || routes[reverseKey];

  if (!routeInfo) {
    scenicList.appendChild(li("No community suggestions yet for this route. Try another pair or submit your own in the future.", true));
    alertsList.appendChild(li("No alerts reported for this route yet.", true));
    tipsList.appendChild(li("General tip: choose well-lit streets, sidewalks, and bike lanes where possible.", true));
    return;
  }

  scenicList.appendChild(li(routeInfo.scenic));
  alertsList.appendChild(li(routeInfo.alerts, false, "alert"));
  tipsList.appendChild(li(routeInfo.tips, true));
}

function li(text, muted = false, type = "") {
  const el = document.createElement("li");
  el.textContent = text;
  if (muted) el.classList.add("muted");
  if (type) el.classList.add(type);
  return el;
}

// ------------------------------
// AI Commuter Coach (no external API)
// ------------------------------
function getTimeSafetyNote() {
  const hour = new Date().getHours();
  if (hour >= 22 || hour < 6) return "It’s late—prefer well-lit roads, avoid isolated areas, and consider transit for safety.";
  if (hour >= 18) return "Evening traffic is heavier—watch for scooters at intersections and use bright/reflective gear if biking.";
  return "Daytime is generally safer—still prioritize sidewalks, crossings, and protected bike lanes where available.";
}

async function generateAITips() {
  const startInput = document.getElementById("start").value;
  const destinationInput = document.getElementById("destination").value;
  const start = getPlaceIdFromLabel(startInput);
  const destination = getPlaceIdFromLabel(destinationInput);
  if (!start || !destination) {
    alert("Choose valid locations first (pick from suggestions or type an exact label).");
    return;
  }
  if (start === destination) {
    alert("Start and destination can’t be the same.");
    return;
  }
  if (start === destination) {
    alert("Start and destination can’t be the same.");
    return;
  }

  const modeInput = document.querySelector('input[name="priority"]:checked');
  const preferred = modeInput ? modeInput.value : "walking";

  const startLabel = getPlaceLabel(start);
  const destLabel = getPlaceLabel(destination);
  const startCoord = PLACE_COORDS[start];
  const destCoord = PLACE_COORDS[destination];

  // Community route context
  const response = await fetch("locations.json");
  const data = await response.json();
  const routes = data.routes;
  const forwardKey = `${start}-${destination}`;
  const reverseKey = `${destination}-${start}`;
  const routeInfo = routes[forwardKey] || routes[reverseKey];

  const km = startCoord && destCoord ? haversineKm(startCoord, destCoord) : null;
  const recoMode = km === null ? "Transit" : recommendModeByDistance(km);
  const kmText = km === null ? "(distance unknown)" : `(~${km.toFixed(1)} km)`;

  const reco =
    `From ${startLabel} to ${destLabel} ${kmText}, a people-first choice is: ${recoMode}. ` +
    `You selected ${capitalize(preferred)}; if conditions are safe, that’s great—otherwise switch to the closest sustainable option.`;

  const safety =
    (routeInfo && routeInfo.alerts ? `${routeInfo.alerts} ` : "") + getTimeSafetyNote();

  const tips = [];
  if (routeInfo && routeInfo.tips) tips.push(routeInfo.tips);
  if (routeInfo && routeInfo.scenic) tips.push(`Scenic idea: ${routeInfo.scenic}`);

  if (km !== null) {
    if (km <= 2) tips.push("If walking, prioritize crossings and sidewalks; avoid cutting through parking lots.");
    else if (km <= 6) tips.push("If biking, use protected bike lanes when possible and take a slightly longer route if it’s safer.");
    else tips.push("For longer trips, consider transit + a short walk/bike segment to keep it sustainable and less stressful.");
  } else {
    tips.push("General tip: choose sidewalks, protected lanes, and well-lit routes when possible.");
  }

  // Write to UI
  document.getElementById("ai-recommendation").textContent = reco;
  document.getElementById("ai-safety").textContent = safety;

  const ul = document.getElementById("ai-tips");
  ul.innerHTML = "";
  tips.forEach((t) => ul.appendChild(li(t, true)));

  document.getElementById("ai-output").classList.remove("hidden");
}
