const STORAGE_KEY = "tripior-draft-v1";

const form = document.getElementById("planner-form");
const summary = document.getElementById("summary");
const itinerary = document.getElementById("itinerary");
const template = document.getElementById("day-card-template");

const stats = {
  days: document.getElementById("days-count"),
  stops: document.getElementById("stops-count"),
  drive: document.getElementById("drive-count"),
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
};

const buttons = {
  planNow: document.getElementById("plan-now"),
  loadDemo: document.getElementById("load-demo"),
  resetForm: document.getElementById("reset-form"),
  saveDraft: document.getElementById("save-draft"),
  regenerate: document.getElementById("regenerate-plan"),
  copyPlan: document.getElementById("copy-plan"),
};

let state = {
  form: null,
  itinerary: [],
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

function getPaceProfile(pace) {
  return {
    easy: { stopsPerDay: 1, buffer: "Leave a flexible buffer for coffee, viewpoints, or extra rest." },
    balanced: { stopsPerDay: 2, buffer: "Keep one flexible slot open for weather, traffic, or spontaneous stops." },
    packed: { stopsPerDay: 3, buffer: "Use timed entry tickets and reserve meals early to keep the schedule moving." },
  }[pace];
}

function getBudgetNotes(budget) {
  return {
    value: "Prioritize free sights, simple lunches, and parking-friendly hotels.",
    midrange: "Mix signature experiences with one anchor dinner or activity every day.",
    premium: "Build around standout stays, premium dining, and concierge-friendly booking windows.",
  }[budget];
}

function getHotelNote(hotelStyle) {
  return {
    boutique: "Choose a well-reviewed boutique stay near the evening walk zone.",
    chain: "Choose a dependable branded hotel with parking and breakfast.",
    luxury: "Choose a top-rated luxury property with spa or view upgrades.",
    local: "Choose a local inn, guesthouse, or design-forward rental stay.",
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

function buildFallbackStops(destination, avoidList) {
  const genericStops = [
    `Old Town ${destination}`,
    `${destination} scenic overlook`,
    `${destination} signature museum`,
    `${destination} waterfront walk`,
    `${destination} local market`,
    `${destination} sunset viewpoint`,
    `${destination} food district`,
    `${destination} nature trail`,
  ];

  return genericStops.filter((stop) => {
    const lower = stop.toLowerCase();
    return !avoidList.some((avoid) => lower.includes(avoid.toLowerCase()));
  });
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
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
  Object.keys(fields).forEach((key) => {
    fields[key].value = merged[key];
  });
}

function buildStopPool(formData) {
  const mustVisits = parseList(formData.mustVisits);
  const avoidList = parseList(formData.avoidPlaces);
  const fallbackStops = buildFallbackStops(formData.destination, avoidList);
  const stopPool = [...mustVisits];

  fallbackStops.forEach((stop) => {
    if (!stopPool.includes(stop)) {
      stopPool.push(stop);
    }
  });

  return { mustVisits, avoidList, stopPool };
}

function estimateDriveMiles(dayIndex, tripLength, maxDrive, pace) {
  const middleTrip = dayIndex > 0 && dayIndex < tripLength - 1;
  const baseline = middleTrip ? 0.66 : 0.52;
  const paceAdjust = pace === "easy" ? -18 : pace === "packed" ? 22 : 0;
  return clamp(Math.round(maxDrive * baseline + dayIndex * 7 + paceAdjust), 20, maxDrive);
}

function buildDayActivities(formData, stopPool, mustVisits, dayIndex) {
  const totalDays = formData.tripLength;
  const profile = getPaceProfile(formData.pace);
  const primaryStop = stopPool[dayIndex % stopPool.length];
  const secondaryStop = stopPool[(dayIndex + 1) % stopPool.length];
  const tertiaryStop = stopPool[(dayIndex + 2) % stopPool.length];

  const mustVisitToday = mustVisits[dayIndex];
  const destination = formData.destination;
  const startArea = formData.startPoint || destination;
  const arrivalDay = dayIndex === 0;
  const departureDay = dayIndex === totalDays - 1;

  const title = arrivalDay
    ? `Arrival and settle into ${destination}`
    : departureDay
      ? `Wrap up ${destination} and return smoothly`
      : `Explore ${primaryStop}`;

  let morning = arrivalDay
    ? `Depart from ${startArea} with a light first-day agenda. Aim for an early coffee stop, grocery run, and hotel check-in window confirmation before heading toward ${destination}.`
    : `Start with ${primaryStop}. Keep the morning focused on one anchor experience so the day does not feel rushed.`;

  let afternoon = `Spend the afternoon around ${secondaryStop}. Add ${
    profile.stopsPerDay >= 2 ? "one main stop and one shorter scenic detour" : "one strong main experience"
  } while staying under the daily drive target.`;

  let evening = departureDay
    ? `Use the evening for a calm final meal, packing, fuel top-off, and an early rest so departure day stays easy.`
    : `Slow down around ${tertiaryStop} with a sunset walk, relaxed dinner, and short planning check for tomorrow.`;

  if (mustVisitToday) {
    afternoon = `Lock in ${mustVisitToday} as the non-negotiable visit today, then place any optional stop around it instead of overloading the route.`;
  }

  if (profile.stopsPerDay === 3 && !arrivalDay && !departureDay) {
    morning += ` Add a quick second stop near ${secondaryStop} only if parking and timing are easy.`;
    evening += ` If energy is still high, add one low-commitment neighborhood stroll instead of another ticketed activity.`;
  }

  if (profile.stopsPerDay === 1) {
    afternoon += ` Leave space for a nap, spa, beach time, or simply enjoying the hotel.`;
  }

  const driveMiles = estimateDriveMiles(dayIndex, totalDays, formData.maxDrive, formData.pace);
  const driveTime = `${Math.max(1, Math.round(driveMiles / 45))} hr ${driveMiles > 70 ? "drive" : "light drive"}`;

  return {
    title,
    driveMiles,
    driveTime,
    morning,
    afternoon,
    evening,
    hotel: `${capitalize(formData.hotelStyle)} stay near ${departureDay ? startArea : primaryStop}. ${getHotelNote(formData.hotelStyle)}`,
    food: `Book one ${formData.budget === "premium" ? "high-end" : "well-rated"} dinner near ${
      departureDay ? destination : tertiaryStop
    }. Keep lunch casual near the main stop to save time.`,
    notes: `${profile.buffer} ${getBudgetNotes(formData.budget)} ${
      formData.notes ? `Personal notes: ${formData.notes}` : ""
    }`.trim(),
  };
}

function generateItinerary(formData) {
  const { mustVisits, avoidList, stopPool } = buildStopPool(formData);
  const resolvedStops = stopPool.length > 0 ? stopPool : [formData.destination];
  const itineraryItems = [];

  for (let dayIndex = 0; dayIndex < formData.tripLength; dayIndex += 1) {
    itineraryItems.push(
      buildDayActivities(formData, resolvedStops, mustVisits, dayIndex),
    );
  }

  return {
    itineraryItems,
    mustVisits,
    avoidList,
    highlightCount: resolvedStops.length,
  };
}

function renderSummary(formData, meta) {
  summary.classList.remove("empty-state");
  summary.innerHTML = "";

  const title = document.createElement("h3");
  title.textContent = `${formData.tripLength}-day ${getTravelMode(formData.maxDrive)} through ${formData.destination}`;

  const body = document.createElement("p");
  body.textContent = `Built for ${formData.travelers || "your group"} with a ${
    formData.pace
  } pace, ${formData.budget} budget, ${formData.hotelStyle} hotel preference, and a max of ${
    formData.maxDrive
  } miles of driving per day. ${meta.mustVisits.length > 0 ? `Must-visits are prioritized first: ${meta.mustVisits.join(", ")}.` : "Add must-visits to anchor the route more tightly."} ${
    meta.avoidList.length > 0 ? `Avoid list respected: ${meta.avoidList.join(", ")}.` : ""
  }`;

  const pills = document.createElement("div");
  pills.className = "summary-metadata";

  [
    `${formData.tripLength} days`,
    `${meta.highlightCount} highlights`,
    `${formData.maxDrive} mi max/day`,
    `${capitalize(formData.hotelStyle)} hotels`,
    capitalize(formData.pace),
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

    label.textContent = `Day ${index + 1}`;
    titleInput.value = day.title;
    morning.value = day.morning;
    afternoon.value = day.afternoon;
    evening.value = day.evening;
    hotel.value = day.hotel;
    food.value = day.food;
    notes.value = day.notes;

    [
      `${day.driveMiles} miles`,
      day.driveTime,
      day.title.toLowerCase().includes("arrival") ? "settle-in day" : "route day",
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

function persistDraft() {
  const payload = {
    form: state.form || readFormData(),
    itinerary: state.itinerary,
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
}

function buildPlan() {
  const formData = readFormData();

  if (!formData.destination) {
    showToast("Add a destination first.");
    fields.destination.focus();
    return;
  }

  const meta = generateItinerary(formData);
  state = {
    form: formData,
    itinerary: meta.itineraryItems,
  };

  renderSummary(formData, meta);
  renderItinerary();
  updateStats(formData, meta);
  persistDraft();
}

function regenerateDay(index) {
  if (!state.form) {
    return;
  }

  const { mustVisits, stopPool } = buildStopPool(state.form);
  const refreshed = buildDayActivities(state.form, stopPool.length ? stopPool : [state.form.destination], mustVisits, index);
  state.itinerary[index] = refreshed;
  renderItinerary();
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
      mustVisits: "Big Sur\nMonterey Bay Aquarium\nPaso Robles\nSanta Barbara\nMalibu",
      avoidPlaces: "Crowded club districts\nTheme parks",
      notes: "Ocean views, seafood, local coffee, scenic pull-offs, and no rushed mornings.",
    }),
  );

  buildPlan();
}

function resetPlanner() {
  writeFormData(createBaseFormData());
  state = {
    form: null,
    itinerary: [],
  };
  localStorage.removeItem(STORAGE_KEY);
  itinerary.innerHTML = "";
  summary.className = "summary-card empty-state";
  summary.textContent =
    "Fill out the trip details and generate a plan to see your trip summary, routing logic, hotel picks, and daily schedule.";
  stats.days.textContent = "0 days";
  stats.stops.textContent = "0 highlights";
  stats.drive.textContent = "0 mi / day";
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
    lines.push("");
  });

  navigator.clipboard.writeText(lines.join("\n")).then(() => {
    showToast("Trip copied to clipboard.");
  }).catch(() => {
    showToast("Clipboard copy failed in this browser.");
  });
}

function saveDraft() {
  state.form = readFormData();
  persistDraft();
  showToast("Draft saved locally.");
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
  }, 2200);
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

    if (Array.isArray(parsed.itinerary) && parsed.itinerary.length > 0) {
      state = {
        form: parsed.form,
        itinerary: parsed.itinerary,
      };

      const meta = generateItinerary(parsed.form);
      renderSummary(parsed.form, meta);
      renderItinerary();
      updateStats(parsed.form, meta);
    }
  } catch (error) {
    console.error("Failed to restore draft", error);
    loadDemoTrip();
  }
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  buildPlan();
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

restoreDraft();
