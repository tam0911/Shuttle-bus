const ROUTES = [
  {
    id: "nr762-out",
    code: "NR762",
    short: "往兆康站",
    from: "豫豐花園",
    to: "港鐵兆康站",
    fromEn: "The Sherwood",
    toEn: "Siu Hong Station",
    leavingEstate: true,
    times: [
      "06:15", "06:30", "06:45", "07:00", "07:15", "07:30", "07:45",
      "08:00", "08:15", "08:30", "08:45", "09:00",
      "10:05", "10:20", "10:40", "11:00", "11:20", "11:40", "12:00",
      "14:05", "14:20", "14:40", "15:00", "15:20", "15:40", "16:00",
      "18:15", "18:30", "18:45", "19:00", "19:15", "19:30", "19:45",
      "21:15", "21:45", "22:00",
    ],
  },
  {
    id: "nr762-in",
    code: "NR762",
    short: "兆康開出",
    from: "港鐵兆康站",
    to: "豫豐花園",
    fromEn: "Siu Hong Station",
    toEn: "The Sherwood",
    leavingEstate: false,
    times: [
      "06:20", "06:35", "06:50", "07:05", "07:20", "07:35", "07:50",
      "08:05", "08:20", "08:35", "08:50", "09:05",
      "10:10", "10:25", "10:45", "11:05", "11:25", "11:45", "12:05",
      "14:10", "14:25", "14:45", "15:05", "15:25", "15:45", "16:05",
      "18:20", "18:35", "18:50", "19:05", "19:20", "19:35", "19:50",
      "21:20", "21:50", "22:05",
    ],
  },
  {
    id: "nr762a-out",
    code: "NR762A",
    short: "往市中心",
    from: "豫豐花園",
    to: "屯門市中心",
    fromEn: "The Sherwood",
    toEn: "Tuen Mun Town Centre",
    leavingEstate: true,
    times: [
      "07:30", "08:00", "08:30", "09:00", "09:15", "09:30", "09:45",
      "10:00", "10:30", "11:00", "11:30",
      "12:00", "12:15", "12:30", "12:45", "13:00", "13:15", "13:30", "13:45",
      "14:00", "14:30", "15:00", "15:30",
      "16:00", "16:15", "16:30", "16:45", "17:00", "17:15", "17:30", "17:45", "18:00",
      "19:30", "20:00", "20:15", "20:30", "20:45",
      "21:00", "21:30",
      "22:00", "22:15", "22:30", "22:45", "23:00", "23:15",
    ],
  },
  {
    id: "nr762a-in",
    code: "NR762A",
    short: "市中心開出",
    from: "屯門市中心",
    to: "豫豐花園",
    fromEn: "Tuen Mun Town Centre",
    toEn: "The Sherwood",
    leavingEstate: false,
    times: [
      "07:40", "08:10", "08:40", "09:10", "09:25", "09:40", "09:55",
      "10:10", "10:40", "11:10", "11:40",
      "12:10", "12:25", "12:40", "12:55", "13:10", "13:25", "13:40", "13:55",
      "14:10", "14:40", "15:10", "15:40",
      "16:10", "16:25", "16:40", "16:55", "17:10", "17:25", "17:40", "17:55", "18:10",
      "19:40", "20:10", "20:25", "20:40", "20:55",
      "21:10", "21:40",
      "22:10", "22:25", "22:40", "22:55", "23:10", "23:30",
    ],
  },
];

const $ = (id) => document.getElementById(id);

const state = {
  routeId: "nr762-out",
};

function toMin(hhmm) {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

function pad(n) {
  return String(n).padStart(2, "0");
}

function clock(totalMinutes) {
  const mins = ((totalMinutes % (24 * 60)) + 24 * 60) % (24 * 60);
  return `${pad(Math.floor(mins / 60))}:${pad(mins % 60)}`;
}

ROUTES.forEach((route) => {
  route.minutes = route.times.map(toMin);
  for (let i = 1; i < route.minutes.length; i += 1) {
    if (route.minutes[i] <= route.minutes[i - 1]) {
      console.error("班次未按時間排序", route.id, route.times[i]);
    }
  }
});

function hongKongNow(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Hong_Kong",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const pick = (type) => Number(parts.find((part) => part.type === type).value);
  let h = pick("hour");
  if (h === 24) h = 0;
  return {
    h,
    m: pick("minute"),
    s: pick("second"),
    label: new Intl.DateTimeFormat("zh-HK", {
      timeZone: "Asia/Hong_Kong",
      month: "long",
      day: "numeric",
      weekday: "long",
    }).format(date),
  };
}

function reference(now) {
  return { minutes: now.h * 60 + now.m, seconds: now.s };
}

function formatAway(totalSeconds, { tomorrow = false, withSeconds = false } = {}) {
  if (totalSeconds <= 0) return "正在開出";
  const prefix = tomorrow ? "明日 " : "";
  const hours = Math.floor(totalSeconds / 3600);
  const mins = Math.floor((totalSeconds % 3600) / 60);
  const secs = totalSeconds % 60;
  if (withSeconds && hours === 0 && mins < 10) {
    if (mins >= 1) return `${prefix}${mins} 分 ${pad(secs)} 秒後`;
    return `${prefix}${secs} 秒後`;
  }
  if (!withSeconds && hours === 0 && mins === 0) return `${prefix}即將開出`;
  if (hours > 0) {
    return mins > 0 ? `${prefix}${hours} 小時 ${mins} 分鐘後` : `${prefix}${hours} 小時後`;
  }
  return `${prefix}${mins} 分鐘後`;
}

function waitSeconds(depMin, ref, tomorrow) {
  if (tomorrow) {
    return (24 * 60 - ref.minutes) * 60 - ref.seconds + depMin * 60;
  }
  return (depMin - ref.minutes) * 60 - ref.seconds;
}

function currentRoute() {
  return ROUTES.find((route) => route.id === state.routeId) || ROUTES[0];
}

function plan(route, ref) {
  const upcoming = route.minutes.filter((min) => min >= ref.minutes);
  const past = route.minutes.filter((min) => min < ref.minutes);
  if (upcoming.length === 0) {
    return {
      tomorrow: true,
      next: route.minutes[0],
      previous: route.minutes[route.minutes.length - 1],
      later: route.minutes.slice(1, 4),
    };
  }
  return {
    tomorrow: false,
    next: upcoming[0],
    previous: past.length ? past[past.length - 1] : null,
    later: upcoming.slice(1, 4),
  };
}

function render() {
  const now = hongKongNow();
  const route = currentRoute();
  const ref = reference(now);
  const result = plan(route, ref);
  const wait = waitSeconds(result.next, ref, result.tomorrow);
  const soon = !result.tomorrow && wait > 0 && wait <= 10 * 60;
  const departing = !result.tomorrow && wait <= 0;

  $("now-date").textContent = now.label;
  $("now-clock").textContent = `${pad(now.h)}:${pad(now.m)}:${pad(now.s)}`;

  document.querySelectorAll(".dir").forEach((button) => {
    const on = button.dataset.id === route.id;
    button.setAttribute("aria-checked", on ? "true" : "false");
  });

  $("last-bus-time").textContent = route.times[route.times.length - 1];
  $("route-code").textContent = route.code;
  $("route-name").textContent = `${route.from} → ${route.to}`;
  $("route-en").textContent = `${route.fromEn} → ${route.toEn}`;

  const card = $("next");
  card.classList.toggle("is-soon", soon);
  card.classList.toggle("is-now", departing);

  const away = formatAway(wait, { tomorrow: result.tomorrow, withSeconds: true });
  if (result.tomorrow) {
    $("kicker").textContent = "今日班次已結束";
    $("delta").textContent = away;
  } else if (departing) {
    $("kicker").textContent = "正在開出";
    $("delta").textContent = "請上車";
  } else {
    $("kicker").textContent = "下一班";
    $("delta").textContent = away;
  }

  $("big-time").textContent = clock(result.next);

  const missed = $("missed");
  if (!result.tomorrow && result.previous != null && !departing) {
    const ago = ref.minutes - result.previous;
    missed.hidden = false;
    missed.textContent = `上一班 ${clock(result.previous)}，${ago === 0 ? "剛開出" : `${ago} 分鐘前開出`}`;
  } else if (result.tomorrow) {
    missed.hidden = false;
    missed.textContent = `尾班 ${clock(result.previous)} 已開出`;
  } else {
    missed.hidden = true;
  }

  const follow = $("follow");
  const followKey = `${result.tomorrow ? "t" : "d"}:${result.later.join(",")}`;
  if (follow.dataset.key !== followKey) {
    follow.dataset.key = followKey;
    follow.replaceChildren();
    result.later.forEach(() => {
      const article = document.createElement("article");
      const time = document.createElement("div");
      time.className = "t";
      const detail = document.createElement("div");
      detail.className = "d";
      article.append(time, detail);
      follow.append(article);
    });
  }
  follow.querySelectorAll("article").forEach((article, index) => {
    const min = result.later[index];
    article.querySelector(".t").textContent = clock(min);
    article.querySelector(".d").textContent = formatAway(waitSeconds(min, ref, result.tomorrow), {
      tomorrow: result.tomorrow,
      withSeconds: true,
    });
  });

  const hint = $("hint");
  if (hint.dataset.route !== route.id) {
    hint.dataset.route = route.id;
    hint.replaceChildren();
    if (route.leavingEstate) {
      hint.append("在", emphasis("屋苑內"), "上車。請出示有效住戶證，並以八達通繳付車資。");
    } else {
      hint.append(emphasis(route.from), "不會停車等候，請在開出時間前到站。");
    }
  }

  $("floater").textContent = `${$("big-time").textContent} · ${$("delta").textContent}`;
}

function emphasis(text) {
  const strong = document.createElement("strong");
  strong.textContent = text;
  return strong;
}

function selectRoute(id) {
  state.routeId = id;
  history.replaceState(null, "", `#${id}`);
  try {
    localStorage.setItem("sherwood-route", id);
  } catch {
    /* private mode */
  }
  render();
}

function init() {
  const fromHash = location.hash.replace("#", "");
  let stored = "";
  try {
    stored = localStorage.getItem("sherwood-route") || "";
  } catch {
    stored = "";
  }
  const initial = ROUTES.some((route) => route.id === fromHash)
    ? fromHash
    : ROUTES.some((route) => route.id === stored)
      ? stored
      : "nr762-out";
  state.routeId = initial;

  document.querySelectorAll(".dir").forEach((button) => {
    button.addEventListener("click", () => selectRoute(button.dataset.id));
  });

  $("floater").addEventListener("click", () => {
    $("next").scrollIntoView({ behavior: "smooth", block: "start" });
  });

  const observer = new IntersectionObserver(
    ([entry]) => {
      $("floater").hidden = entry.isIntersecting;
    },
    { threshold: 0.15 }
  );
  observer.observe($("next"));

  render();
  setInterval(render, 1000);
}

init();
