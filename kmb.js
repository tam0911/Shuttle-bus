const KMB_STOPS = [
  {
    id: "46D1A9FD1F84CA5C",
    title: "藍地站 · 往青衣／西九龍",
    dir: "O",
    routes: ["68A", "63X"],
  },
  {
    id: "7FE552E3792C9047",
    title: "藍地站 · 往朗屏／洪水橋",
    dir: "I",
    routes: ["68A", "63X"],
  },
];

const KMB_URL = "https://data.etabus.gov.hk/v1/transport/kmb/stop-eta/";

const NLB_ROUTES = [
  {
    title: "藍地站 · 往深圳灣",
    route: "B2",
    routeId: 37,
    stopId: 151,
    dest: "深圳灣口岸",
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
      title: dests.length ? `輕鐵藍地站 · 往${dests.join("／")}` : "輕鐵藍地站",
      items,
    };
  }).filter((section) => section.items.length);
}

function renderRoute(item, now) {
  const row = document.createElement("div");
  row.className = "kmb-route";
  const name = document.createElement("div");
  const code = document.createElement("span");
  code.className = "kmb-code";
  code.textContent = item.route;
  name.append(code);
  if (item.dest) {
    const dest = document.createElement("span");
    dest.className = "kmb-dest";
    dest.textContent = item.dest;
    name.append(dest);
  }

  const times = document.createElement("div");
  times.className = "kmb-etas";
  if (!item.etas.length) {
    const empty = document.createElement("p");
    empty.className = "kmb-empty";
        empty.textContent = item.emptyText || "暫無班次";
    times.append(empty);
  } else {
    item.etas.forEach((eta) => {
      const line = document.createElement("p");
      const wait = document.createElement("strong");
      wait.className = "wait";
          wait.textContent = eta.label || kmbWait(eta.when, now);
      line.append(wait);
      if (eta.rmk_tc) {
        const remark = document.createElement("span");
        remark.className = "rmk";
        remark.textContent = ` ${eta.rmk_tc}`;
        line.append(remark);
      }
      times.append(line);
    });
  }

  row.append(name, times);
  return row;
}

function renderSection(title, items, now) {
  const section = document.createElement("article");
  section.className = "kmb-stop";
  const heading = document.createElement("h3");
  heading.textContent = title;
  section.append(heading);
  items.forEach((item) => section.append(renderRoute(item, now)));
  return section;
}

function renderKmb() {
  const board = document.getElementById("kmb-board");
  const status = document.getElementById("kmb-status");
  if (!board || !status) return;

  if (!kmbCache && !nlbCache && !lrtCache) {
    status.textContent = kmbError || nlbError || lrtError ? "藍地站" : "讀取中";
    board.replaceChildren();
    if (kmbError || nlbError || lrtError) {
      const message = document.createElement("p");
      message.className = "kmb-empty";
      message.textContent = kmbError || nlbError || lrtError;
      board.append(message);
    }
    return;
  }

  const now = new Date();
  const updated = [kmbCache?.updated, nlbCache?.updated, lrtCache?.updated]
    .filter(Boolean)
    .sort((a, b) => b - a)[0];
  status.textContent = `${kmbClock(updated)} 更新`;
  board.replaceChildren();

  if (kmbCache) {
    KMB_STOPS.forEach((stop) => {
      board.append(renderSection(stop.title, arrivalsFor(stop, kmbCache.rows, now), now));
    });
  } else if (kmbError) {
    const message = document.createElement("p");
    message.className = "kmb-empty";
    message.textContent = kmbError;
    board.append(message);
  }

  NLB_ROUTES.forEach((route) => {
    const item = nlbCache
      ? arrivalsForNlb(route, now)
      : { route: route.route, dest: route.dest, etas: [] };
    if (!nlbCache && !nlbError) return;
    board.append(renderSection(route.title, [item], now));
  });

  if (lrtCache) {
    const sections = arrivalsForLrt(lrtCache.platforms);
    if (sections.length) {
      sections.forEach((section) => {
        board.append(renderSection(section.title, section.items, now));
      });
    } else {
      board.append(renderMessage("輕鐵藍地站", "暫無班次"));
    }
  } else if (lrtError) {
    board.append(renderMessage("輕鐵藍地站", lrtError));
  }
}

function renderMessage(title, text) {
  const section = document.createElement("article");
  section.className = "kmb-stop";
  const heading = document.createElement("h3");
  heading.textContent = title;
  const message = document.createElement("p");
  message.className = "kmb-empty";
  message.textContent = text;
  section.append(heading, message);
  return section;
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
