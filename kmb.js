const KMB_STOPS = [
  {
    id: "46D1A9FD1F84CA5C",
    title: "往青衣／西九龍",
    dir: "O",
    routes: ["68A", "63X"],
  },
  {
    id: "7FE552E3792C9047",
    title: "往朗屏／洪水橋",
    dir: "I",
    routes: ["68A", "63X"],
  },
];

const KMB_URL = "https://data.etabus.gov.hk/v1/transport/kmb/stop-eta/";

const NLB_ROUTES = [
  {
    title: "嶼巴 · 往深圳灣",
    route: "B2",
    routeId: 37,
    stopId: 151,
    dest: "深圳灣口岸",
    column: 0,
  },
];

const NLB_URL = "https://rt.data.gov.hk/v2/transport/nlb/stop.php?action=estimatedArrivals";

const LRT_URL = "https://rt.data.gov.hk/v1/transport/mtr/lrt/getSchedule?station_id=350&with_special=1";

let kmbCache = null;
let kmbError = "";
let nlbCache = null;
let nlbError = "";
let lrtCache = null;
let lrtError = "";

function kmbClock(date) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Hong_Kong",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const pick = (type) => parts.find((part) => part.type === type).value;
  let hour = pick("hour");
  if (hour === "24") hour = "00";
  return `${hour}:${pick("minute")}`;
}

function kmbWait(eta, now) {
  const seconds = Math.round((eta.getTime() - now.getTime()) / 1000);
  if (seconds <= 60) return "即將到站";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} 分鐘`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} 小時 ${rest} 分鐘` : `${hours} 小時`;
}

function arrivalsFor(stop, rows, now) {
  return stop.routes.map((route) => {
    const matches = rows
      .filter((row) => row.route === route && row.dir === stop.dir && row.service_type === 1 && row.eta)
      .map((row) => ({ ...row, when: new Date(row.eta) }))
      .filter((row) => row.when.getTime() - now.getTime() > -2 * 60 * 1000)
      .sort((a, b) => a.when - b.when)
      .slice(0, 3);
    return {
      route,
      dest: matches[0]?.dest_tc || "",
      etas: matches,
    };
  });
}

function nlbWhen(value) {
  return new Date(String(value).replace(" ", "T") + "+08:00");
}

function arrivalsForNlb(route, now) {
  const rows = nlbCache?.byRoute?.[route.routeId] || [];
  const etas = rows
    .map((row) => ({
      when: nlbWhen(row.estimatedArrivalTime),
      rmk_tc: Number(row.departed) === 0 ? "原定班次" : "",
    }))
    .filter((row) => !Number.isNaN(row.when.getTime()))
    .filter((row) => row.when.getTime() - now.getTime() > -2 * 60 * 1000)
    .sort((a, b) => a.when - b.when)
    .slice(0, 3);
  return {
    route: route.route,
    dest: route.dest,
    etas,
  };
}

function lrtRouteNo(train) {
  if (Number(train.special) === 1 && train.additionalInfo1) return train.additionalInfo1;
  return train.route_no;
}

function lrtMinutes(train) {
  const text = String(train.time_ch || "").trim();
  if (text === "-" || text === "即將抵達" || text === "正在離開") return 0;
  const match = text.match(/(\d+)/);
  return match ? Number(match[1]) : 999;
}

function lrtWait(train) {
  const text = String(train.time_ch || "").trim();
  if (text === "-" || text === "即將抵達") return "即將到站";
  if (text === "正在離開") return "正在離開";
  return text;
}

function arrivalsForLrt(platforms) {
  return (platforms || []).map((platform) => {
    const groups = new Map();
    (platform.route_list || []).forEach((train) => {
      const route = lrtRouteNo(train);
      const dest = train.dest_ch || "";
      const key = `${route}|${dest}`;
      if (!groups.has(key)) groups.set(key, { route, dest, trains: [] });
      groups.get(key).trains.push(train);
    });

    const items = [...groups.values()].map((group) => {
      const trains = group.trains.slice().sort((a, b) => lrtMinutes(a) - lrtMinutes(b));
      const stopped = trains.length > 0 && trains.every((train) => Number(train.stop) === 1);
      return {
        route: group.route,
        dest: group.dest,
        emptyText: stopped ? "暫停服務" : "",
        etas: stopped
          ? []
          : trains.slice(0, 3).map((train) => ({
              label: lrtWait(train),
              rmk_tc: train.routeRemarkChi2 || "",
              minutes: lrtMinutes(train),
            })),
      };
    });

    items.sort((a, b) => (a.etas[0]?.minutes ?? 999) - (b.etas[0]?.minutes ?? 999));

    const dests = [];
    items.forEach((item) => {
      if (item.dest && !dests.includes(item.dest)) dests.push(item.dest);
    });
    dests.sort((a, b) => {
      const count = (dest) => items.filter((item) => item.dest === dest).length;
      return count(b) - count(a) || a.localeCompare(b, "zh");
    });

    return {
      title: dests.length ? `往${dests.join("／")}` : "藍地站",
      items,
    };
  }).filter((section) => section.items.length);
}

function buttonDest(dest) {
  return String(dest || "")
    .replace("高鐵(西九龍站)", "西九龍")
    .replace("洪水橋(洪福邨)", "洪福")
    .replace("深圳灣口岸", "深圳灣")
    .replace("屯門碼頭", "屯門")
    .replace(/站$/, "")
    .replace(/邨$/, "");
}

function busMinutes(eta, now) {
  if (eta.when instanceof Date && !Number.isNaN(eta.when.getTime())) {
    return Math.max(0, Math.round((eta.when.getTime() - now.getTime()) / 60000));
  }
  return 9999;
}

function busRank(route) {
  const order = ["68A", "63X", "B2"];
  const index = order.indexOf(route);
  return index === -1 ? order.length : index;
}

function renderBus(board, now) {
  const sections = KMB_STOPS.map((stop) => ({
    title: stop.title,
    items: kmbCache
      ? arrivalsFor(stop, kmbCache.rows, now).map((item) => ({
          route: item.route,
          dest: item.dest,
          etas: item.etas,
          emptyText: "暫無",
        }))
      : [],
  }));

  if (nlbCache || nlbError) {
    NLB_ROUTES.forEach((route) => {
      const item = nlbCache ? arrivalsForNlb(route, now) : { dest: route.dest, etas: [] };
      sections[route.column].items.push({
        route: route.route,
        dest: item.dest || route.dest,
        etas: item.etas,
        emptyText: "暫無",
      });
    });
  }

  sections.forEach((section) => {
    section.items.sort((a, b) => busRank(a.route) - busRank(b.route) || a.route.localeCompare(b.route));
  });

  const routes = [];
  sections.forEach((section) => {
    section.items.forEach((item) => {
      if (!routes.includes(item.route)) routes.push(item.route);
    });
  });
  routes.sort((a, b) => busRank(a) - busRank(b) || a.localeCompare(b));
  if (!routes.length) return;

  const grid = document.createElement("div");
  grid.className = "lrt-grid";
  grid.style.setProperty("--lrt-cols", "2");

  sections.forEach((section) => {
    const heading = document.createElement("h3");
    heading.textContent = section.title;
    grid.append(heading);
  });

  routes.forEach((route) => {
    sections.forEach((section) => {
      const item = section.items.find((entry) => entry.route === route);
      const cell = document.createElement("div");
      cell.className = "lrt-cell";
      if (!item) {
        grid.append(cell);
        return;
      }
      const code = document.createElement("span");
      code.className = "lrt-code";
      code.textContent = item.route;
      const dest = document.createElement("span");
      dest.className = "lrt-dest";
      dest.textContent = buttonDest(item.dest);
      const wait = document.createElement("span");
      wait.className = "lrt-wait";
      const first = item.etas[0];
      const label = first ? kmbWait(first.when, now) : item.emptyText || "暫無";
      wait.textContent = label;
      const minutes = first ? busMinutes(first, now) : null;
      if (label === "即將到站" || (Number.isFinite(minutes) && minutes <= 2)) wait.classList.add("is-due");
      if (first?.rmk_tc) {
        const note = document.createElement("span");
        note.className = "lrt-note";
        note.textContent = "原定";
        wait.append(note);
      }
      cell.append(code, dest, wait);
      grid.append(cell);
    });
  });

  board.replaceChildren(grid);
}

function lrtRank(route) {
  const order = ["610", "614", "615", "751"];
  const index = order.indexOf(route);
  return index === -1 ? order.length : index;
}

function lrtHeading(title) {
  if (title.includes("元朗")) return "往元朗";
  if (title.includes("屯門")) return "往屯門";
  return title;
}

function lrtSide(title) {
  if (title.includes("元朗")) return 0;
  if (title.includes("屯門")) return 1;
  return 2;
}

function renderLrt(board) {
  const sections = arrivalsForLrt(lrtCache.platforms).sort((a, b) => lrtSide(a.title) - lrtSide(b.title));
  sections.forEach((section) => {
    section.items.sort((a, b) => lrtRank(a.route) - lrtRank(b.route) || a.route.localeCompare(b.route));
  });
  const routes = [];
  sections.forEach((section) => {
    section.items.forEach((item) => {
      if (!routes.includes(item.route)) routes.push(item.route);
    });
  });
  routes.sort((a, b) => lrtRank(a) - lrtRank(b) || a.localeCompare(b));

  const grid = document.createElement("div");
  grid.className = "lrt-grid";
  grid.style.setProperty("--lrt-cols", String(Math.max(sections.length, 1)));

  sections.forEach((section) => {
    const heading = document.createElement("h3");
    heading.textContent = lrtHeading(section.title);
    grid.append(heading);
  });

  routes.forEach((route) => {
    sections.forEach((section) => {
      const item = section.items.find((entry) => entry.route === route);
      const cell = document.createElement("div");
      cell.className = "lrt-cell";
      if (!item) {
        grid.append(cell);
        return;
      }
      const code = document.createElement("span");
      code.className = "lrt-code";
      code.textContent = item.route;
      const dest = document.createElement("span");
      dest.className = "lrt-dest";
      dest.textContent = buttonDest(item.dest);
      const wait = document.createElement("span");
      wait.className = "lrt-wait";
      const label = item.etas[0] ? item.etas[0].label : item.emptyText || "暫無";
      wait.textContent = label;
      const minutes = item.etas[0]?.minutes;
      if (label === "即將到站" || label === "正在離開" || (Number.isFinite(minutes) && minutes <= 2)) {
        wait.classList.add("is-due");
      }
      cell.append(code, dest, wait);
      grid.append(cell);
    });
  });

  board.replaceChildren(grid);
}

function setStatus(id, updated, fallback) {
  const status = document.getElementById(id);
  if (!status) return;
  status.textContent = updated ? `${kmbClock(updated)} 更新` : fallback;
  status.classList.toggle("is-live", Boolean(updated));
}

function renderKmb() {
  const busBoard = document.getElementById("kmb-board");
  const lrtBoard = document.getElementById("lrt-board");
  if (!busBoard || !lrtBoard) return;

  const now = new Date();
  setStatus("kmb-status", kmbCache?.updated || nlbCache?.updated, kmbError || nlbError ? "藍地站" : "讀取中");
  setStatus("lrt-status", lrtCache?.updated, lrtError ? "藍地站" : "讀取中");

  if (kmbCache || nlbCache) {
    renderBus(busBoard, now);
  } else if (kmbError || nlbError) {
    busBoard.replaceChildren(renderMessage(kmbError || nlbError));
  }

  if (lrtCache && arrivalsForLrt(lrtCache.platforms).length) {
    renderLrt(lrtBoard);
  } else if (lrtError) {
    lrtBoard.replaceChildren(renderMessage(lrtError));
  } else if (lrtCache) {
    lrtBoard.replaceChildren(renderMessage("暫無班次"));
  }
}

function renderMessage(text) {
  const message = document.createElement("p");
  message.className = "kmb-empty";
  message.textContent = text;
  return message;
}

async function loadKmb() {
  try {
    const payloads = await Promise.all(
      KMB_STOPS.map(async (stop) => {
        const response = await fetch(`${KMB_URL}${stop.id}`);
        if (!response.ok) throw new Error(String(response.status));
        return response.json();
      })
    );
    kmbCache = {
      updated: new Date(),
      rows: payloads.flatMap((payload) => payload.data || []),
    };
    kmbError = "";
  } catch {
    kmbError = "暫時未能取得到站時間";
  }
  renderKmb();
}

async function loadNlb() {
  try {
    const payloads = await Promise.all(
      NLB_ROUTES.map(async (route) => {
        const response = await fetch(
          `${NLB_URL}&routeId=${route.routeId}&stopId=${route.stopId}&language=zh`
        );
        if (!response.ok) throw new Error(String(response.status));
        const payload = await response.json();
        return [route.routeId, payload.estimatedArrivals || []];
      })
    );
    nlbCache = {
      updated: new Date(),
      byRoute: Object.fromEntries(payloads),
    };
    nlbError = "";
  } catch {
    nlbError = "暫時未能取得到站時間";
  }
  renderKmb();
}

async function loadLrt() {
  try {
    const response = await fetch(LRT_URL);
    if (!response.ok) throw new Error(String(response.status));
    const payload = await response.json();
    if (Number(payload.status) !== 1) throw new Error("status");
    lrtCache = {
      updated: new Date(),
      platforms: payload.platform_list || [],
    };
    lrtError = "";
  } catch {
    lrtError = "暫時未能取得到站時間";
  }
  renderKmb();
}

function loadNearby() {
  loadKmb();
  loadNlb();
  loadLrt();
}

loadNearby();
setInterval(() => {
  loadKmb();
  loadNlb();
}, 60 * 1000);
setInterval(loadLrt, 20 * 1000);
setInterval(renderKmb, 15 * 1000);
