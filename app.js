const STORAGE_KEY = "tripior-draft-v2";
const MAPS_KEY_STORAGE = "tripior-google-maps-key";
const MAPS_SCRIPT_ID = "tripior-google-maps-script";

const form = document.getElementById("planner-form");
const summary = document.getElementById("summary");
const itinerary = document.getElementById("itinerary");
const template = document.getElementById("day-card-template");
const mapCanvas = document.getElementById("map-canvas");
const hotelSuggestions = document.getElementById("hotel-suggestions");

const stats = {
  days: document.getElementById("days-count"),
  stops: document.getElementById("stops-count"),
  drive: document.getElementById("drive-count"),
  routeTotal: document.getElementById("route-total"),
};

const routeStats = {
  distance: document.getElementById("route-distance"),
  duration: document.getElementById("route-duration"),
  stops: document.getElementById("route-stops"),
  openRoute: document.getElementById("open-route"),
};

const statusNodes = {
  mapsText: document.getElementById("maps-status-text"),
  mapsPill: document.getElementById("maps-status-pill"),
  network: document.getElementById("network-status"),
};

const fields = {
  destination: document.getElementById("destination"),
  startPoint: document.getElementById("startPoint"),
  tripLength: document.getElementById("tripLength"),
  travelers: document.getElementById("travelers"),
  maxDrive: document.getElementById("maxDrive"),
  pace: document.getElementById("pace"),
  budget: document.getElementById("budget"),
  hotelStyle: document.getElementById("hotelStyle"),
  mustVisits: document.getElementById("mustVisits"),
  avoidPlaces: document.getElementById("avoidPlaces"),
  notes: document.getElementById("notes"),
  placeSearch: document.getElementById("placeSearch"),
  mapsApiKey: document.getElementById("mapsApiKey"),
};

const buttons = {
  planNow: document.getElementById("plan-now"),
  loadDemo: document.getElementById("load-demo"),
  resetForm: document.getElementById("reset-form"),
  saveDraft: document.getElementById("save-draft"),
  regenerate: document.getElementById("regenerate-plan"),
  copyPlan: document.getElementById("copy-plan"),
  saveMapsKey: document.getElementById("save-maps-key"),
  clearMapsKey: document.getElementById("clear-maps-key"),
  addPlaceToMust: document.getElementById("add-place-to-must"),
  focusPlaceOnMap: document.getElementById("focus-place-on-map"),
  installApp: document.getElementById("install-app"),
};

let state = {
  form: null,
  itinerary: [],
  routeContext: null,
  mapsKey: "",
  googleMapsLoaded: false,
  lastSearchedPlace: "",
  installPromptEvent: null,
};

let mapObjects = {
  map: null,
  directionsService: null,
  directionsRenderer: null,
  geocoder: null,
  placesService: null,
  markers: [],
  autocomplete: [],
};

function parseList(value) {
  return value
    .split(/\n|,/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function capitalize(text) {
  if (!text) {
    return "";
  }
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function safeQueryValue(value) {
  return value.replace(/\s+/g, " ").trim();
}

function createBaseFormData(overrides = {}) {
  return {
    destination: "",
    startPoint: "",
    tripLength: 7,
    travelers: "",
    maxDrive: 180,
    pace: "balanced",
    budget: "midrange",
    hotelStyle: "boutique",
    mustVisits: "",
    avoidPlaces: "",
    notes: "",
    ...overrides,
  };
}

function readFormData() {
  return {
    destination: fields.destination.value.trim(),
    startPoint: fields.startPoint.value.trim(),
    tripLength: clamp(Number(fields.tripLength.value) || 7, 2, 21),
    travelers: fields.travelers.value.trim(),
    maxDrive: clamp(Number(fields.maxDrive.value) || 180, 25, 600),
    pace: fields.pace.value,
    budget: fields.budget.value,
    hotelStyle: fields.hotelStyle.value,
    mustVisits: fields.mustVisits.value.trim(),
    avoidPlaces: fields.avoidPlaces.value.trim(),
    notes: fields.notes.value.trim(),
  };
}

function writeFormData(data) {
  const merged = createBaseFormData(data);
  Object.keys(merged).forEach((key) => {
    if (fields[key]) {
      fields[key].value = merged[key];
    }
  });
}

function appendToTextarea(textarea, value) {
  const trimmed = safeQueryValue(value);
  if (!trimmed) {
    return;
  }

  const current = textarea.value.trim();
  textarea.value = current ? `${current}\n${trimmed}` : trimmed;
}

function getPaceProfile(pace) {
  return {
    easy: { stopsPerDay: 1, buffer: "Leave a flexible window for a scenic break, rest, or slow meal." },
    balanced: { stopsPerDay: 2, buffer: "Keep one flexible slot open for weather, traffic, or a surprise stop." },
    packed: { stopsPerDay: 3, buffer: "Book timed entries early and keep parking decisions simple to stay on schedule." },
  }[pace];
}

function getBudgetNotes(budget) {
  return {
    value: "Keep paid attractions selective and favor easy parking plus casual meals.",
    midrange: "Mix one standout activity or dinner with lighter-cost stops each day.",
    premium: "Use premium stays, reservations, and scenic dining as anchor experiences.",
  }[budget];
}

function getHotelNote(hotelStyle) {
  return {
    boutique: "Favor boutique properties near walkable evening areas.",
    chain: "Favor dependable chain hotels with parking and breakfast.",
    luxury: "Favor luxury hotels with views, spa options, and concierge support.",
    local: "Favor inns, guesthouses, or design-forward local stays.",
  }[hotelStyle];
}

function getTravelMode(maxDrive) {
  if (maxDrive <= 90) {
    return "short-hop scenic trip";
  }
  if (maxDrive <= 180) {
    return "balanced road trip";
  }
  return "wide-range road trip";
}

function getStoredMapsKey() {
  return (
    localStorage.getItem(MAPS_KEY_STORAGE) ||
    window.TRIPIOR_CONFIG.googleMapsApiKey ||
    ""
  ).trim();
}

function setMapsStatus(text, pillText) {
  statusNodes.mapsText.textContent = text;
  statusNodes.mapsPill.textContent = pillText;
}

function updateNetworkStatus() {
  statusNodes.network.textContent = navigator.onLine ? "Online" : "Offline";
}

function updateEmptyMap(message) {
  mapCanvas.classList.add("empty-map");
  mapCanvas.textContent = message;
}

function normalizeLabel(value) {
  return safeQueryValue(value).toLowerCase();
}

function buildFallbackStops(destination, avoidList) {
  const genericStops = [
    `Old Town ${destination}`,
    `${destination} scenic overlook`,
    `${destination} waterfront walk`,
    `${destination} local market`,
    `${destination} nature trail`,
    `${destination} sunset viewpoint`,
  ];

  return genericStops.filter((stop) => {
    const lower = normalizeLabel(stop);
    return !avoidList.some((avoid) => lower.includes(normalizeLabel(avoid)));
  });
}

function buildStopPool(formData) {
  const mustVisits = parseList(formData.mustVisits);
  const avoidList = parseList(formData.avoidPlaces);
  const stopPool = [];

  [formData.startPoint, ...mustVisits, formData.destination].forEach((stop) => {
    if (!stop) {
      return;
    }
    const normalized = normalizeLabel(stop);
    if (!normalized) {
      return;
    }
    if (avoidList.some((avoid) => normalized.includes(normalizeLabel(avoid)))) {
      return;
    }
    if (!stopPool.some((existing) => normalizeLabel(existing) === normalized)) {
      stopPool.push(safeQueryValue(stop));
    }
  });

  if (stopPool.length < 2 && formData.destination) {
    buildFallbackStops(formData.destination, avoidList).forEach((stop) => {
      if (!stopPool.some((existing) => normalizeLabel(existing) === normalizeLabel(stop))) {
        stopPool.push(stop);
      }
    });
  }

  return { mustVisits, avoidList, stopPool };
}

function createMapsLink(origin, destination, waypoints = []) {
  const params = new URLSearchParams({
    api: "1",
    travelmode: "driving",
    origin: origin || destination,
    destination: destination || origin,
  });

  if (waypoints.length > 0) {
    params.set("waypoints", waypoints.join("|"));
  }

  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

function persistDraft() {
  const payload = {
    form: state.form || readFormData(),
    itinerary: state.itinerary,
    routeContext: state.routeContext,
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
}

function showToast(message) {
  const existing = document.querySelector(".toast");
  if (existing) {
    existing.remove();
  }

  const toast = document.createElement("div");
  toast.className = "toast";
  toast.textContent = message;
  document.body.appendChild(toast);

  window.setTimeout(() => {
    toast.remove();
  }, 2400);
}

function clearMarkers() {
  mapObjects.markers.forEach((marker) => marker.setMap(null));
  mapObjects.markers = [];
}

function clearDirections() {
  if (mapObjects.directionsRenderer) {
    mapObjects.directionsRenderer.setDirections({ routes: [] });
  }
}

function initializeMapShell() {
  if (mapObjects.map || !window.google || !window.google.maps) {
    return;
  }

  mapCanvas.classList.remove("empty-map");
  mapCanvas.textContent = "";

  mapObjects.map = new window.google.maps.Map(mapCanvas, {
    center: { lat: 37.7749, lng: -122.4194 },
    zoom: 5,
    mapTypeControl: false,
    streetViewControl: false,
    fullscreenControl: false,
  });

  mapObjects.directionsService = new window.google.maps.DirectionsService();
  mapObjects.directionsRenderer = new window.google.maps.DirectionsRenderer({
    map: mapObjects.map,
    suppressMarkers: false,
    preserveViewport: false,
    polylineOptions: {
      strokeColor: "#70a7ff",
      strokeWeight: 6,
      strokeOpacity: 0.82,
    },
  });
  mapObjects.geocoder = new window.google.maps.Geocoder();
  mapObjects.placesService = new window.google.maps.places.PlacesService(mapObjects.map);
  wireAutocomplete();
}

function wireAutocomplete() {
  if (!window.google || !window.google.maps || mapObjects.autocomplete.length > 0) {
    return;
  }

  [fields.destination, fields.startPoint, fields.placeSearch].forEach((input) => {
    const autocomplete = new window.google.maps.places.Autocomplete(input, {
      fields: ["formatted_address", "geometry", "name"],
    });

    autocomplete.addListener("place_changed", () => {
      const place = autocomplete.getPlace();
      const label = place.formatted_address || place.name || input.value.trim();
      if (input === fields.placeSearch) {
        state.lastSearchedPlace = label;
      }
      if (input === fields.placeSearch && place.geometry && mapObjects.map) {
        mapObjects.map.panTo(place.geometry.location);
        mapObjects.map.setZoom(10);
      }
    });

    mapObjects.autocomplete.push(autocomplete);
  });
}

function loadGoogleMapsApi() {
  const mapsKey = getStoredMapsKey();
  state.mapsKey = mapsKey;
  fields.mapsApiKey.value = mapsKey;

  if (!mapsKey) {
    setMapsStatus(
      "Add a Google Maps JavaScript API key with Places enabled to unlock autocomplete, route calculations, and hotel suggestions.",
      "Maps setup needed",
    );
    updateEmptyMap("Add a Google Maps API key to turn on the live route map.");
    return Promise.resolve(false);
  }

  if (window.google && window.google.maps) {
    state.googleMapsLoaded = true;
    initializeMapShell();
    setMapsStatus(
      "Google Maps is connected. Autocomplete, routes, and nearby lodging search are ready.",
      "Maps connected",
    );
    return Promise.resolve(true);
  }

  const existingScript = document.getElementById(MAPS_SCRIPT_ID);
  if (existingScript) {
    return new Promise((resolve, reject) => {
      existingScript.addEventListener("load", () => {
        state.googleMapsLoaded = true;
        initializeMapShell();
        setMapsStatus(
          "Google Maps is connected. Autocomplete, routes, and nearby lodging search are ready.",
          "Maps connected",
        );
        resolve(true);
      }, { once: true });
      existingScript.addEventListener("error", reject, { once: true });
    });
  }

  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.id = MAPS_SCRIPT_ID;
    script.async = true;
    script.defer = true;
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(mapsKey)}&libraries=places&v=weekly`;
    script.onload = () => {
      state.googleMapsLoaded = true;
      initializeMapShell();
      setMapsStatus(
        "Google Maps is connected. Autocomplete, routes, and nearby lodging search are ready.",
        "Maps connected",
      );
      resolve(true);
    };
    script.onerror = () => {
      setMapsStatus(
        "Google Maps could not load. Check that the key is valid and that Maps JavaScript API plus Places are enabled.",
        "Maps failed",
      );
      updateEmptyMap("Google Maps failed to load. Verify your API key and enabled APIs.");
      reject(new Error("Google Maps failed to load"));
    };
    document.head.appendChild(script);
  });
}

function geocodePlace(query) {
  return new Promise((resolve, reject) => {
    if (!mapObjects.geocoder) {
      reject(new Error("Geocoder unavailable"));
      return;
    }

    mapObjects.geocoder.geocode({ address: query }, (results, status) => {
      if (status === "OK" && results[0]) {
        resolve({
          label: query,
          formattedAddress: results[0].formatted_address,
          location: results[0].geometry.location,
        });
        return;
      }
      reject(new Error(`Geocode failed: ${status}`));
    });
  });
}

function routePlaces(origin, destination, waypoints) {
  return new Promise((resolve, reject) => {
    if (!mapObjects.directionsService) {
      reject(new Error("Directions service unavailable"));
      return;
    }

    mapObjects.directionsService.route(
      {
        origin,
        destination,
        waypoints,
        optimizeWaypoints: false,
        travelMode: window.google.maps.TravelMode.DRIVING,
        unitSystem: window.google.maps.UnitSystem.IMPERIAL,
      },
      (result, status) => {
        if (status === "OK" && result) {
          resolve(result);
          return;
        }
        reject(new Error(`Directions failed: ${status}`));
      },
    );
  });
}

function nearbyHotels(location, hotelStyle) {
  return new Promise((resolve) => {
    if (!mapObjects.placesService) {
      resolve([]);
      return;
    }

    mapObjects.placesService.nearbySearch(
      {
        location,
        radius: 12000,
        keyword: hotelStyle === "chain" ? "hotel chain" : hotelStyle,
        type: "lodging",
      },
      (results, status) => {
        if (status !== window.google.maps.places.PlacesServiceStatus.OK || !results) {
          resolve([]);
          return;
        }

        resolve(results.slice(0, 4).map((result) => ({
          name: result.name,
          vicinity: result.vicinity || "Area not available",
          rating: result.rating ? `${result.rating} rating` : "No rating yet",
        })));
      },
    );
  });
}

function fitMapToPlaces(places) {
  if (!mapObjects.map || !window.google || places.length === 0) {
    return;
  }

  const bounds = new window.google.maps.LatLngBounds();
  places.forEach((place) => bounds.extend(place.location));
  mapObjects.map.fitBounds(bounds);
}

async function buildRouteContext(formData, baseStops) {
  if (!state.googleMapsLoaded || !window.google || !window.google.maps) {
    return null;
  }

  const candidateLabels = baseStops.stopPool.slice(0, 10);
  if (candidateLabels.length === 0) {
    return null;
  }

  const geocoded = [];
  for (const label of candidateLabels) {
    try {
      geocoded.push(await geocodePlace(label));
    } catch (error) {
      console.warn(error);
    }
  }

  clearMarkers();
  clearDirections();

  if (geocoded.length === 0) {
    return null;
  }

  let routeResult = null;
  const routeStops = geocoded;

  if (geocoded.length >= 2) {
    const origin = geocoded[0].formattedAddress;
    const destination = geocoded[geocoded.length - 1].formattedAddress;
    const waypoints = geocoded.slice(1, -1).map((place) => ({
      location: place.formattedAddress,
      stopover: true,
    }));

    try {
      routeResult = await routePlaces(origin, destination, waypoints);
      mapObjects.directionsRenderer.setDirections(routeResult);
    } catch (error) {
      console.warn(error);
      fitMapToPlaces(geocoded);
      geocoded.forEach((place) => {
        mapObjects.markers.push(
          new window.google.maps.Marker({
            map: mapObjects.map,
            position: place.location,
            title: place.label,
          }),
        );
      });
    }
  } else {
    fitMapToPlaces(geocoded);
    mapObjects.markers.push(
      new window.google.maps.Marker({
        map: mapObjects.map,
        position: geocoded[0].location,
        title: geocoded[0].label,
      }),
    );
  }

  const legs = [];
  let totalMiles = 0;
  let totalSeconds = 0;

  if (routeResult && routeResult.routes[0]) {
    routeResult.routes[0].legs.forEach((leg) => {
      const distanceMiles = Math.round((leg.distance.value / 1609.344) * 10) / 10;
      totalMiles += distanceMiles;
      totalSeconds += leg.duration.value;
      legs.push({
        start: leg.start_address,
        end: leg.end_address,
        distanceMiles,
        distanceText: leg.distance.text,
        durationText: leg.duration.text,
        durationSeconds: leg.duration.value,
      });
    });
  }

  const finalLocation = geocoded[geocoded.length - 1].location;
  const hotels = await nearbyHotels(finalLocation, formData.hotelStyle);
  const mapsLink = createMapsLink(
    geocoded[0].formattedAddress,
    geocoded[geocoded.length - 1].formattedAddress,
    geocoded.slice(1, -1).map((place) => place.formattedAddress),
  );

  return {
    orderedStops: geocoded.map((place) => place.formattedAddress),
    legs,
    totalMiles: Math.round(totalMiles * 10) / 10,
    totalDurationText: totalSeconds > 0 ? `${Math.round(totalSeconds / 3600)} hr` : "Not calculated",
    totalSeconds,
    mapsLink,
    hotels,
  };
}

function chunkLegsIntoDays(legs, tripLength, maxDrive) {
  if (legs.length === 0) {
    return Array.from({ length: tripLength }, () => []);
  }

  const days = [];
  let current = [];
  let currentMiles = 0;

  legs.forEach((leg, index) => {
    const remainingLegs = legs.length - index;
    const remainingDays = tripLength - days.length;
    const shouldSplit =
      current.length > 0 &&
      currentMiles + leg.distanceMiles > maxDrive &&
      remainingDays > 1 &&
      remainingLegs >= remainingDays - 1;

    if (shouldSplit) {
      days.push(current);
      current = [];
      currentMiles = 0;
    }

    current.push(leg);
    currentMiles += leg.distanceMiles;
  });

  if (current.length > 0) {
    days.push(current);
  }

  while (days.length < tripLength) {
    const duplicateIndex = Math.max(0, days.length - 1);
    days.push(days[duplicateIndex] ? [] : []);
  }

  return days.slice(0, tripLength);
}

function buildRouteAwareItinerary(formData, baseStops, routeContext) {
  const profile = getPaceProfile(formData.pace);
  const fallbackStops = baseStops.stopPool.length > 0 ? baseStops.stopPool : [formData.destination];
  const dailyLegs = chunkLegsIntoDays(routeContext.legs, formData.tripLength, formData.maxDrive);
  let anchorStop = routeContext.orderedStops[0] || formData.destination;

  return dailyLegs.map((legs, dayIndex) => {
    const dayNumber = dayIndex + 1;
    const hasRoute = legs.length > 0;
    const startStop = hasRoute ? legs[0].start : anchorStop;
    const endStop = hasRoute ? legs[legs.length - 1].end : anchorStop;
    const midStops = hasRoute ? legs.slice(0, -1).map((leg) => leg.end) : [];
    const dailyMiles = hasRoute
      ? Math.round(legs.reduce((sum, leg) => sum + leg.distanceMiles, 0) * 10) / 10
      : 18;
    const durationHours = hasRoute
      ? Math.max(1, Math.round(legs.reduce((sum, leg) => sum + leg.durationSeconds, 0) / 3600))
      : 1;

    anchorStop = endStop;

    const mustVisit = baseStops.mustVisits[dayIndex] || midStops[0] || fallbackStops[dayIndex % fallbackStops.length];
    const title = hasRoute
      ? dayIndex === 0
        ? `Arrive via ${endStop}`
        : `Drive ${startStop} to ${endStop}`
      : `Explore ${endStop}`;
    const morning = hasRoute
      ? `Start from ${startStop} and keep the first block focused on ${mustVisit}. Use the live map route to keep departure timing realistic.`
      : `Stay local around ${endStop}. Use the map to pick one anchor experience and keep the morning light.`;
    const afternoon = hasRoute
      ? `Cover ${midStops.length > 0 ? midStops.join(", ") : mustVisit} before reaching ${endStop}. Keep the running total near ${dailyMiles} miles to stay under your target.`
      : `Spend the afternoon on ${mustVisit} plus one nearby stop. ${profile.buffer}`;
    const evening = `Settle in around ${endStop} with a calmer evening plan, parking check, and tomorrow route review.`;
    const hotelLead = routeContext.hotels[dayIndex % Math.max(routeContext.hotels.length, 1)];
    const hotel = hotelLead
      ? `${hotelLead.name}, ${hotelLead.vicinity}. ${getHotelNote(formData.hotelStyle)}`
      : `${capitalize(formData.hotelStyle)} stay near ${endStop}. ${getHotelNote(formData.hotelStyle)}`;
    const food = `Book dinner near ${endStop} and keep lunch close to ${mustVisit}. ${getBudgetNotes(formData.budget)}`;
    const notes = `${profile.buffer} ${formData.notes ? `Personal notes: ${formData.notes}` : ""}`.trim();
    const mapsLink = createMapsLink(startStop, endStop, midStops);

    return {
      title,
      driveMiles: dailyMiles,
      driveTime: `${durationHours} hr drive`,
      morning,
      afternoon,
      evening,
      hotel,
      food,
      notes,
      mapsLink,
    };
  });
}

function buildFallbackItinerary(formData, baseStops) {
  const resolvedStops = baseStops.stopPool.length > 0 ? baseStops.stopPool : [formData.destination];
  const profile = getPaceProfile(formData.pace);

  return Array.from({ length: formData.tripLength }, (_, dayIndex) => {
    const primaryStop = resolvedStops[dayIndex % resolvedStops.length];
    const secondaryStop = resolvedStops[(dayIndex + 1) % resolvedStops.length];
    const driveMiles = clamp(Math.round(formData.maxDrive * 0.58 + dayIndex * 6), 15, formData.maxDrive);
    const mapsLink = createMapsLink(formData.startPoint || formData.destination || primaryStop, primaryStop);

    return {
      title: dayIndex === 0 ? `Arrive in ${primaryStop}` : `Explore ${primaryStop}`,
      driveMiles,
      driveTime: `${Math.max(1, Math.round(driveMiles / 45))} hr drive`,
      morning: `Start around ${primaryStop} and keep the first activity anchored on ${baseStops.mustVisits[dayIndex] || primaryStop}.`,
      afternoon: `Move into ${secondaryStop} for the main sightseeing block. ${profile.buffer}`,
      evening: `Stay relaxed around ${primaryStop} and line up the next day's parking, fuel, and reservations.`,
      hotel: `${capitalize(formData.hotelStyle)} stay near ${primaryStop}. ${getHotelNote(formData.hotelStyle)}`,
      food: `Book one solid dinner around ${secondaryStop} and keep lunch easy.`,
      notes: `${getBudgetNotes(formData.budget)} ${formData.notes ? `Personal notes: ${formData.notes}` : ""}`.trim(),
      mapsLink,
    };
  });
}

async function generateTripPlan(formData) {
  const baseStops = buildStopPool(formData);
  const routeContext = await buildRouteContext(formData, baseStops).catch((error) => {
    console.warn(error);
    return null;
  });
  const itineraryItems = routeContext
    ? buildRouteAwareItinerary(formData, baseStops, routeContext)
    : buildFallbackItinerary(formData, baseStops);

  return {
    itineraryItems,
    mustVisits: baseStops.mustVisits,
    avoidList: baseStops.avoidList,
    highlightCount: routeContext ? routeContext.orderedStops.length : Math.max(baseStops.stopPool.length, 1),
    routeContext,
  };
}

function renderHotelSuggestions(routeContext) {
  hotelSuggestions.innerHTML = "";

  if (!routeContext || !routeContext.hotels || routeContext.hotels.length === 0) {
    hotelSuggestions.classList.add("empty-state");
    hotelSuggestions.textContent = "Generate a mapped route to see nearby lodging suggestions.";
    return;
  }

  hotelSuggestions.classList.remove("empty-state");
  routeContext.hotels.forEach((hotel) => {
    const item = document.createElement("article");
    item.className = "hotel-item";

    const title = document.createElement("h4");
    title.textContent = hotel.name;

    const text = document.createElement("p");
    text.textContent = `${hotel.vicinity}. ${hotel.rating}.`;

    item.appendChild(title);
    item.appendChild(text);
    hotelSuggestions.appendChild(item);
  });
}

function renderSummary(formData, meta) {
  summary.classList.remove("empty-state");
  summary.innerHTML = "";

  const title = document.createElement("h3");
  title.textContent = `${formData.tripLength}-day ${getTravelMode(formData.maxDrive)} through ${formData.destination}`;

  const body = document.createElement("p");
  body.textContent = meta.routeContext
    ? `Built for ${formData.travelers || "your group"} with real mapped stops, ${meta.routeContext.totalMiles} total miles, and ${meta.routeContext.totalDurationText} of estimated drive time. Must-visits are woven into the mapped route first, then padded with changeable local time.`
    : `Built for ${formData.travelers || "your group"} with a ${formData.pace} pace, ${formData.budget} budget, and ${formData.hotelStyle} stay preference. Add a Google Maps key to replace fallback estimates with live route calculations.`;

  const pills = document.createElement("div");
  pills.className = "summary-metadata";

  [
    `${formData.tripLength} days`,
    `${meta.highlightCount} highlights`,
    `${formData.maxDrive} mi max/day`,
    `${capitalize(formData.hotelStyle)} hotels`,
    meta.routeContext ? "Live route" : "Fallback route",
  ].forEach((text) => {
    const pill = document.createElement("span");
    pill.className = "summary-pill";
    pill.textContent = text;
    pills.appendChild(pill);
  });

  summary.appendChild(title);
  summary.appendChild(body);
  summary.appendChild(pills);
}

function updateStats(formData, meta) {
  stats.days.textContent = `${formData.tripLength} days`;
  stats.stops.textContent = `${meta.highlightCount} highlights`;
  stats.drive.textContent = `${formData.maxDrive} mi / day`;
  stats.routeTotal.textContent = meta.routeContext
    ? `${meta.routeContext.totalMiles} mi total`
    : "Estimate only";

  routeStats.distance.textContent = meta.routeContext
    ? `${meta.routeContext.totalMiles} miles`
    : "Not calculated";
  routeStats.duration.textContent = meta.routeContext
    ? meta.routeContext.totalDurationText
    : "Not calculated";
  routeStats.stops.textContent = `${meta.highlightCount}`;
  routeStats.openRoute.href = meta.routeContext?.mapsLink || "#";
}

function syncDayValue(dayIndex, key, value) {
  if (!state.itinerary[dayIndex]) {
    return;
  }
  state.itinerary[dayIndex][key] = value;
  persistDraft();
}

function renderItinerary() {
  itinerary.innerHTML = "";

  state.itinerary.forEach((day, index) => {
    const fragment = template.content.cloneNode(true);
    const card = fragment.querySelector(".day-card");
    const label = fragment.querySelector(".day-label");
    const titleInput = fragment.querySelector(".day-title");
    const morning = fragment.querySelector(".day-morning");
    const afternoon = fragment.querySelector(".day-afternoon");
    const evening = fragment.querySelector(".day-evening");
    const hotel = fragment.querySelector(".day-hotel");
    const food = fragment.querySelector(".day-food");
    const notes = fragment.querySelector(".day-notes");
    const metrics = fragment.querySelector(".day-metrics");
    const mapsLink = fragment.querySelector(".day-maps-link");

    label.textContent = `Day ${index + 1}`;
    titleInput.value = day.title;
    morning.value = day.morning;
    afternoon.value = day.afternoon;
    evening.value = day.evening;
    hotel.value = day.hotel;
    food.value = day.food;
    notes.value = day.notes;
    mapsLink.href = day.mapsLink || "#";

    [
      `${day.driveMiles} miles`,
      day.driveTime,
      day.driveMiles > 0 ? "route day" : "local day",
    ].forEach((metricText) => {
      const metric = document.createElement("span");
      metric.className = "metric-pill";
      metric.textContent = metricText;
      metrics.appendChild(metric);
    });

    titleInput.addEventListener("input", (event) => syncDayValue(index, "title", event.target.value));
    morning.addEventListener("input", (event) => syncDayValue(index, "morning", event.target.value));
    afternoon.addEventListener("input", (event) => syncDayValue(index, "afternoon", event.target.value));
    evening.addEventListener("input", (event) => syncDayValue(index, "evening", event.target.value));
    hotel.addEventListener("input", (event) => syncDayValue(index, "hotel", event.target.value));
    food.addEventListener("input", (event) => syncDayValue(index, "food", event.target.value));
    notes.addEventListener("input", (event) => syncDayValue(index, "notes", event.target.value));

    fragment.querySelector(".move-up").addEventListener("click", () => moveDay(index, -1));
    fragment.querySelector(".move-down").addEventListener("click", () => moveDay(index, 1));
    fragment.querySelector(".regenerate-day").addEventListener("click", () => regenerateDay(index));

    itinerary.appendChild(card);
  });
}

async function buildPlan() {
  const formData = readFormData();
  if (!formData.destination) {
    showToast("Add a destination first.");
    fields.destination.focus();
    return;
  }

  const meta = await generateTripPlan(formData);
  state.form = formData;
  state.itinerary = meta.itineraryItems;
  state.routeContext = meta.routeContext;

  renderSummary(formData, meta);
  renderItinerary();
  updateStats(formData, meta);
  renderHotelSuggestions(meta.routeContext);
  persistDraft();
}

async function regenerateDay(index) {
  if (!state.form) {
    return;
  }

  const meta = await generateTripPlan(state.form);
  if (!meta.itineraryItems[index]) {
    return;
  }
  state.itinerary[index] = meta.itineraryItems[index];
  state.routeContext = meta.routeContext;
  renderItinerary();
  renderHotelSuggestions(meta.routeContext);
  persistDraft();
}

function moveDay(index, direction) {
  const targetIndex = index + direction;
  if (targetIndex < 0 || targetIndex >= state.itinerary.length) {
    return;
  }

  const [day] = state.itinerary.splice(index, 1);
  state.itinerary.splice(targetIndex, 0, day);
  renderItinerary();
  persistDraft();
}

function loadDemoTrip() {
  writeFormData(
    createBaseFormData({
      destination: "California Coast",
      startPoint: "San Francisco",
      tripLength: 8,
      travelers: "2 adults",
      maxDrive: 170,
      pace: "balanced",
      budget: "midrange",
      hotelStyle: "boutique",
      mustVisits: "Monterey\nBig Sur\nSan Luis Obispo\nSanta Barbara\nMalibu",
      avoidPlaces: "Theme parks\nCrowded nightlife districts",
      notes: "Ocean views, seafood, easy parking, scenic pull-offs, and relaxed mornings.",
    }),
  );

  buildPlan();
}

function resetPlanner() {
  writeFormData(createBaseFormData());
  fields.placeSearch.value = "";
  state = {
    ...state,
    form: null,
    itinerary: [],
    routeContext: null,
    lastSearchedPlace: "",
  };
  localStorage.removeItem(STORAGE_KEY);
  itinerary.innerHTML = "";
  summary.className = "summary-card empty-state";
  summary.textContent = "Fill out the trip details and generate a plan to see your trip summary, routing logic, hotel picks, and daily schedule.";
  hotelSuggestions.className = "hotel-list empty-state";
  hotelSuggestions.textContent = "Connect Maps and generate a route to see nearby lodging suggestions.";
  stats.days.textContent = "0 days";
  stats.stops.textContent = "0 highlights";
  stats.drive.textContent = "0 mi / day";
  stats.routeTotal.textContent = "No route yet";
  routeStats.distance.textContent = "Not calculated";
  routeStats.duration.textContent = "Not calculated";
  routeStats.stops.textContent = "0";
  routeStats.openRoute.href = "#";
  clearMarkers();
  clearDirections();
  if (!state.googleMapsLoaded) {
    updateEmptyMap("Add a Google Maps API key to turn on the live route map.");
  }
}

function copyPlan() {
  if (!state.form || state.itinerary.length === 0) {
    showToast("Generate a plan first.");
    return;
  }

  const lines = [
    `${state.form.tripLength}-Day Trip Through ${state.form.destination}`,
    "",
    `Starting point: ${state.form.startPoint || "Flexible"}`,
    `Travelers: ${state.form.travelers || "Not specified"}`,
    `Max daily driving: ${state.form.maxDrive} miles`,
    `Pace: ${capitalize(state.form.pace)}`,
    `Budget: ${capitalize(state.form.budget)}`,
    `Hotel style: ${capitalize(state.form.hotelStyle)}`,
    `Route: ${state.routeContext ? `${state.routeContext.totalMiles} miles total` : "Fallback estimates"}`,
    "",
  ];

  state.itinerary.forEach((day, index) => {
    lines.push(`Day ${index + 1}: ${day.title}`);
    lines.push(`Morning: ${day.morning}`);
    lines.push(`Afternoon: ${day.afternoon}`);
    lines.push(`Evening: ${day.evening}`);
    lines.push(`Hotel: ${day.hotel}`);
    lines.push(`Food: ${day.food}`);
    lines.push(`Notes: ${day.notes}`);
    lines.push(`Driving: ${day.driveMiles} miles (${day.driveTime})`);
    lines.push(`Maps: ${day.mapsLink}`);
    lines.push("");
  });

  navigator.clipboard
    .writeText(lines.join("\n"))
    .then(() => showToast("Trip copied to clipboard."))
    .catch(() => showToast("Clipboard copy failed in this browser."));
}

function saveDraft() {
  state.form = readFormData();
  persistDraft();
  showToast("Draft saved locally.");
}

function restoreDraft() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (!saved) {
    loadDemoTrip();
    return;
  }

  try {
    const parsed = JSON.parse(saved);
    writeFormData(parsed.form || createBaseFormData());
    state.form = parsed.form || null;
    state.itinerary = Array.isArray(parsed.itinerary) ? parsed.itinerary : [];
    state.routeContext = parsed.routeContext || null;

    if (state.form && state.itinerary.length > 0) {
      const meta = {
        itineraryItems: state.itinerary,
        mustVisits: parseList(state.form.mustVisits),
        avoidList: parseList(state.form.avoidPlaces),
        highlightCount: state.routeContext ? state.routeContext.orderedStops.length : Math.max(parseList(state.form.mustVisits).length, 1),
        routeContext: state.routeContext,
      };
      renderSummary(state.form, meta);
      renderItinerary();
      updateStats(state.form, meta);
      renderHotelSuggestions(state.routeContext);
      return;
    }
  } catch (error) {
    console.error("Failed to restore draft", error);
  }

  loadDemoTrip();
}

function saveMapsKey() {
  const key = fields.mapsApiKey.value.trim();
  if (!key) {
    showToast("Add a Google Maps API key first.");
    return;
  }

  localStorage.setItem(MAPS_KEY_STORAGE, key);
  state.mapsKey = key;
  showToast("Google Maps key saved. Reloading Maps...");
  loadGoogleMapsApi().then(() => {
    if (state.form) {
      buildPlan();
    }
  }).catch(() => {
    showToast("Google Maps could not load. Verify the key and enabled APIs.");
  });
}

function clearMapsKey() {
  localStorage.removeItem(MAPS_KEY_STORAGE);
  state.mapsKey = "";
  fields.mapsApiKey.value = "";
  setMapsStatus(
    "Add a Google Maps JavaScript API key with Places enabled to unlock autocomplete, route calculations, and hotel suggestions.",
    "Maps setup needed",
  );
  updateEmptyMap("Add a Google Maps API key to turn on the live route map.");
  showToast("Saved Google Maps key cleared.");
}

function addSearchedPlaceToMustVisits() {
  const place = fields.placeSearch.value.trim() || state.lastSearchedPlace;
  if (!place) {
    showToast("Search for a place first.");
    return;
  }

  appendToTextarea(fields.mustVisits, place);
  showToast("Added place to must-visits.");
}

async function focusPlaceOnMap() {
  const place = fields.placeSearch.value.trim() || state.lastSearchedPlace;
  if (!place) {
    showToast("Search for a place first.");
    return;
  }

  if (!state.googleMapsLoaded) {
    showToast("Connect Google Maps first.");
    return;
  }

  try {
    const result = await geocodePlace(place);
    mapObjects.map.panTo(result.location);
    mapObjects.map.setZoom(11);
  } catch (error) {
    showToast("That place could not be focused on the map.");
  }
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) {
    return;
  }

  navigator.serviceWorker.register("./sw.js").catch((error) => {
    console.warn("Service worker registration failed", error);
  });
}

function setupInstallPrompt() {
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    state.installPromptEvent = event;
    buttons.installApp.classList.remove("hidden");
  });

  buttons.installApp.addEventListener("click", async () => {
    if (!state.installPromptEvent) {
      showToast("Install is not available yet in this browser.");
      return;
    }

    state.installPromptEvent.prompt();
    const choice = await state.installPromptEvent.userChoice;
    if (choice.outcome === "accepted") {
      buttons.installApp.classList.add("hidden");
    }
    state.installPromptEvent = null;
  });
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  await buildPlan();
});

buttons.planNow.addEventListener("click", () => {
  document.querySelector(".planner-panel").scrollIntoView({ behavior: "smooth", block: "start" });
  fields.destination.focus();
});
buttons.loadDemo.addEventListener("click", loadDemoTrip);
buttons.resetForm.addEventListener("click", resetPlanner);
buttons.saveDraft.addEventListener("click", saveDraft);
buttons.regenerate.addEventListener("click", buildPlan);
buttons.copyPlan.addEventListener("click", copyPlan);
buttons.saveMapsKey.addEventListener("click", saveMapsKey);
buttons.clearMapsKey.addEventListener("click", clearMapsKey);
buttons.addPlaceToMust.addEventListener("click", addSearchedPlaceToMustVisits);
buttons.focusPlaceOnMap.addEventListener("click", focusPlaceOnMap);

window.addEventListener("online", updateNetworkStatus);
window.addEventListener("offline", updateNetworkStatus);

updateNetworkStatus();
setupInstallPrompt();
registerServiceWorker();
loadGoogleMapsApi().catch(() => {});
restoreDraft();
