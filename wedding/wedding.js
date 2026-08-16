"use strict";

const SVG_NAMESPACE = "http://www.w3.org/2000/svg";
const MOTION_REDUCED = window.matchMedia("(prefers-reduced-motion: reduce)");
const BEE_CRUISING_SPEED = 0.165;

document.addEventListener("DOMContentLoaded", () => {
  void growWeddingGarden();
});

async function growWeddingGarden() {
  const [frameSource, dividerSource] = await Promise.all([
    fetchSvg("./assets/botanical-frame.svg?v=20260816b"),
    fetchSvg("./assets/botanical-divider.svg?v=20260816b"),
  ]);

  document.querySelectorAll(".ornate-panel").forEach((panel, index) => {
    const stage = document.createElement("div");
    const frame = prepareBotanicalSvg(frameSource, `frame-${index}`, "frame");
    stage.className = "botanical-frame-stage";
    stage.setAttribute("aria-hidden", "true");
    stage.append(frame);
    panel.prepend(stage);
  });

  const dividers = [...document.querySelectorAll("img.botanical-divider")];
  dividers.forEach((image, index) => {
    const divider = prepareBotanicalSvg(dividerSource, `divider-${index}`, "divider");
    divider.classList.add("botanical-divider");
    image.replaceWith(divider);
  });

  if (!MOTION_REDUCED.matches) {
    window.setTimeout(launchBee, 5100);
  }
}

async function fetchSvg(url) {
  const response = await fetch(url, { credentials: "same-origin" });
  if (!response.ok) {
    throw new Error(`Unable to load botanical artwork: ${response.status} ${response.statusText}`);
  }

  const documentNode = new DOMParser().parseFromString(await response.text(), "image/svg+xml");
  const error = documentNode.querySelector("parsererror");
  if (error) {
    throw new Error(`Invalid botanical SVG: ${error.textContent.trim()}`);
  }
  return documentNode.documentElement;
}

function prepareBotanicalSvg(source, namespace, kind) {
  const svg = source.cloneNode(true);
  namespaceSvg(svg, namespace);
  svg.querySelectorAll("style").forEach((style) => style.remove());
  svg.classList.add("botanical-art", `botanical-art--${kind}`);
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");

  const visiblePaths = [...svg.querySelectorAll("path, rect")].filter(
    (element) => !element.closest("defs") && element.getAttribute("fill") === "none",
  );
  visiblePaths.forEach((path, index) => {
    path.setAttribute("pathLength", "1");
    path.classList.add(index < 3 && kind === "frame" ? "botanical-outline" : "botanical-stem");
    const delay = index < 3 && kind === "frame" ? 80 + index * 45 : 300 + index * 55;
    path.style.setProperty("--growth-delay", `${delay}ms`);
  });

  const visibleUses = [...svg.querySelectorAll("use")].filter((element) => !element.closest("defs"));
  visibleUses.forEach((element, index) => {
    const reference = element.getAttribute("href") || "";
    let part = "leaf";
    if (reference.includes("rose") || reference.includes("blossom")) {
      part = "flower";
    } else if (reference.includes("bud")) {
      part = "bud";
    } else if (reference.includes("berry")) {
      part = "berry";
    }
    wrapGrowthPart(element, part, growthOrder(element, index, part, kind));
  });

  const visibleCircles = [...svg.querySelectorAll("circle")].filter((element) => !element.closest("defs"));
  visibleCircles.forEach((element, index) => {
    wrapGrowthPart(element, "berry", 9 + (index % 7));
  });

  return svg;
}

function namespaceSvg(svg, namespace) {
  const identifiers = new Map();
  svg.querySelectorAll("[id]").forEach((element) => {
    const original = element.id;
    const replacement = `${namespace}-${original}`;
    identifiers.set(original, replacement);
    element.id = replacement;
  });

  svg.querySelectorAll("*").forEach((element) => {
    [...element.attributes].forEach((attribute) => {
      let value = attribute.value;
      if ((attribute.name === "href" || attribute.name.endsWith(":href")) && value.startsWith("#")) {
        value = `#${identifiers.get(value.slice(1))}`;
      }
      value = value.replace(/url\(\s*['"]?#([^)'"\s]+)['"]?\s*\)/g, (match, id) => {
        const replacement = identifiers.get(id);
        return replacement ? `url(#${replacement})` : match;
      });
      if (value !== attribute.value) {
        element.setAttribute(attribute.name, value);
      }
    });
  });
}

function growthOrder(element, index, part, kind) {
  const corner = element.closest("svg:not(.botanical-art)");
  const siblings = corner ? [...corner.querySelectorAll("use")].filter((item) => !item.closest("defs")) : [];
  const localIndex = corner ? siblings.indexOf(element) : index;
  const cornerIndex = corner ? [...corner.parentElement.children].filter((item) => item.localName === "svg").indexOf(corner) : 0;
  const partOffset = { leaf: 0, berry: 4, bud: 7, flower: 10 }[part];
  return localIndex + partOffset + cornerIndex * 2 + (kind === "divider" ? 3 : 0);
}

function wrapGrowthPart(element, part, order) {
  const wrapper = document.createElementNS(SVG_NAMESPACE, "g");
  element.before(wrapper);
  wrapper.append(element);
  wrapper.classList.add("botanical-growth-part", `botanical-growth-part--${part}`);
  if (part === "flower") {
    wrapper.classList.add("bee-flower");
  }
  const delay = {
    leaf: 620 + order * 70,
    berry: 1150 + order * 65,
    bud: 1450 + order * 68,
    flower: 1820 + order * 70,
  }[part];
  wrapper.style.setProperty("--growth-delay", `${delay}ms`);
}

function launchBee() {
  const bee = document.createElement("div");
  bee.className = "wedding-bee";
  bee.setAttribute("aria-hidden", "true");
  bee.innerHTML = `
    <div class="wedding-bee__hover">
      <div class="wedding-bee__direction">
        <svg viewBox="0 0 72 52" role="presentation">
          <defs>
            <linearGradient id="bee-gold" x1="0" y1="0" x2="1" y2="1">
              <stop stop-color="#f7d66f"/><stop offset="1" stop-color="#d79b28"/>
            </linearGradient>
            <radialGradient id="bee-wing" cx="35%" cy="30%" r="75%">
              <stop stop-color="#fff" stop-opacity=".92"/><stop offset="1" stop-color="#d7e7df" stop-opacity=".28"/>
            </radialGradient>
          </defs>
          <g class="wedding-bee__wings" fill="url(#bee-wing)" stroke="#8b7252" stroke-width="1.2">
            <ellipse cx="32" cy="14" rx="17" ry="8" transform="rotate(-24 32 14)"/>
            <ellipse cx="42" cy="13" rx="16" ry="7" transform="rotate(24 42 13)"/>
          </g>
          <path d="M20 34c-8 4-10 9-11 13M43 39c6 4 8 7 9 11" fill="none" stroke="#4c3824" stroke-width="2" stroke-linecap="round"/>
          <ellipse cx="37" cy="31" rx="21" ry="14" fill="url(#bee-gold)" stroke="#4c3824" stroke-width="2"/>
          <path d="M25 20c-3 7-3 15 0 22M37 17c-3 9-2 20 2 28M49 20c-2 8-1 15 2 20" fill="none" stroke="#4c3824" stroke-width="6"/>
          <ellipse cx="55" cy="30" rx="9" ry="10" fill="#4c3824"/>
          <circle cx="59" cy="27" r="1.6" fill="#fff8e9"/>
          <path d="M59 22c3-7 7-8 10-8M55 21c1-7-2-9-5-11" fill="none" stroke="#4c3824" stroke-width="1.6" stroke-linecap="round"/>
          <path d="M16 31 8 28l8-3" fill="#4c3824"/>
        </svg>
      </div>
    </div>`;
  document.body.append(bee);

  const start = {
    x: window.scrollX + window.innerWidth + 55,
    y: window.scrollY + Math.min(180, window.innerHeight * 0.28),
  };
  bee.style.transform = translate(start);
  bee.classList.add("wedding-bee--visible");

  const journey = {
    bee,
    current: start,
    routeIndex: 0,
    animation: null,
    routeTimer: null,
    scrollTimer: null,
    flightToken: 0,
    following: false,
    homing: false,
    homed: false,
  };
  journey.onScroll = () => {
    window.clearTimeout(journey.scrollTimer);
    journey.scrollTimer = window.setTimeout(() => respondToScroll(journey), 140);
  };
  window.addEventListener("scroll", journey.onScroll, { passive: true });

  if (pageIsAtBottom()) {
    sendBeeHome(journey);
  } else {
    routeBee(journey);
  }
}

function routeBee(journey) {
  if (journey.homing || journey.homed) {
    return;
  }
  if (pageIsAtBottom()) {
    sendBeeHome(journey);
    return;
  }

  const flowers = visibleFlowers();
  if (flowers.length === 0) {
    scheduleRoute(journey, 500);
    return;
  }

  const distantFlowers = flowers.filter((flower) => distance(journey.current, flower) > 80);
  const choices = distantFlowers.length > 0 ? distantFlowers : flowers;
  const target = choices[(journey.routeIndex * 3) % choices.length];
  journey.routeIndex += 1;
  flyBee(journey, target, () => {
    releasePollen(target);
    scheduleRoute(journey, 1050);
  });
}

function respondToScroll(journey) {
  if (journey.homing || journey.homed) {
    return;
  }
  if (pageIsAtBottom()) {
    sendBeeHome(journey);
    return;
  }
  if (!beeIsInViewport(journey.bee)) {
    catchUpBee(journey);
  }
}

function catchUpBee(journey) {
  journey.following = true;
  const current = currentBeePosition(journey.bee);
  const flowers = visibleFlowers();
  const target = flowers.sort((first, second) => distance(current, first) - distance(current, second))[0] || {
    x: window.scrollX + window.innerWidth * 0.72,
    y: window.scrollY + window.innerHeight * 0.3,
    isFlower: false,
  };

  flyBee(journey, target, () => {
    journey.following = false;
    if (target.isFlower) {
      releasePollen(target);
    }
    scheduleRoute(journey, 1050);
  });
}

function sendBeeHome(journey) {
  if (journey.homing || journey.homed) {
    return;
  }
  journey.homing = true;
  const target = hiveEntrance();
  flyBee(journey, target, () => enterHive(journey, target));
}

function flyBee(journey, target, onArrival) {
  cancelCurrentFlight(journey);
  const current = journey.current;
  const route = meanderingRoute(current, target, journey.flightToken);
  const duration = route.length / BEE_CRUISING_SPEED;
  const direction = journey.bee.querySelector(".wedding-bee__direction");
  direction.classList.toggle("wedding-bee__direction--left", target.x < current.x);

  const token = journey.flightToken;
  const animation = journey.bee.animate(route.keyframes, {
    duration,
    easing: "linear",
    fill: "forwards",
  });
  journey.animation = animation;

  animation.addEventListener("finish", () => {
    if (token !== journey.flightToken) {
      return;
    }
    journey.current = target;
    journey.bee.style.transform = translate(target);
    journey.animation = null;
    animation.cancel();
    onArrival();
  }, { once: true });
}

function meanderingRoute(start, finish, phase) {
  const directDistance = distance(start, finish);
  const segments = Math.max(5, Math.min(28, Math.ceil(directDistance / 105)));
  const deltaX = finish.x - start.x;
  const deltaY = finish.y - start.y;
  const normalX = directDistance === 0 ? 0 : -deltaY / directDistance;
  const normalY = directDistance === 0 ? 0 : deltaX / directDistance;
  const amplitude = Math.min(72, Math.max(20, directDistance * 0.085));
  const waves = Math.max(1.5, Math.min(5.5, directDistance / 420));
  const phaseOffset = (phase % 5) * 0.37;
  const points = [];

  for (let index = 0; index <= segments; index += 1) {
    const progress = index / segments;
    const envelope = Math.sin(Math.PI * progress);
    const meander = Math.sin(progress * Math.PI * 2 * waves + phaseOffset) * amplitude * envelope;
    const buoyancy = Math.sin(Math.PI * progress) * Math.min(38, directDistance * 0.055);
    points.push({
      x: start.x + deltaX * progress + normalX * meander,
      y: start.y + deltaY * progress + normalY * meander - buoyancy,
    });
  }
  points[0] = start;
  points[points.length - 1] = finish;

  const cumulative = [0];
  for (let index = 1; index < points.length; index += 1) {
    cumulative.push(cumulative[index - 1] + distance(points[index - 1], points[index]));
  }
  const routeLength = cumulative[cumulative.length - 1];
  return {
    length: routeLength,
    keyframes: points.map((point, index) => ({
      transform: translate(point),
      offset: routeLength === 0 ? 1 : cumulative[index] / routeLength,
    })),
  };
}

function cancelCurrentFlight(journey) {
  window.clearTimeout(journey.routeTimer);
  journey.routeTimer = null;
  journey.flightToken += 1;
  if (!journey.animation) {
    return;
  }

  journey.current = currentBeePosition(journey.bee);
  journey.bee.style.transform = translate(journey.current);
  journey.animation.cancel();
  journey.animation = null;
}

function scheduleRoute(journey, delay) {
  window.clearTimeout(journey.routeTimer);
  journey.routeTimer = window.setTimeout(() => routeBee(journey), delay);
}

function enterHive(journey, entrance) {
  journey.homed = true;
  window.clearTimeout(journey.routeTimer);
  window.clearTimeout(journey.scrollTimer);
  window.removeEventListener("scroll", journey.onScroll);
  journey.bee.classList.add("wedding-bee--entering-hive");

  const animation = journey.bee.animate([
    { opacity: 1, transform: `${translate(entrance)} scale(1)` },
    { opacity: 0.8, transform: `${translate(entrance)} scale(0.55)`, offset: 0.55 },
    { opacity: 0, transform: `${translate(entrance)} scale(0.08)` },
  ], {
    duration: 680,
    easing: "cubic-bezier(.5,0,.8,.35)",
    fill: "forwards",
  });
  animation.addEventListener("finish", () => journey.bee.remove(), { once: true });
}

function visibleFlowers() {
  return [...document.querySelectorAll(".bee-flower")]
    .map((flower) => {
      const bounds = flower.getBoundingClientRect();
      return {
        viewportX: bounds.left + bounds.width / 2,
        viewportY: bounds.top + bounds.height / 2,
        x: window.scrollX + bounds.left + bounds.width / 2,
        y: window.scrollY + bounds.top + bounds.height / 2,
        isFlower: true,
      };
    })
    .filter((point) => (
      point.viewportX > 18
      && point.viewportX < window.innerWidth - 18
      && point.viewportY > 18
      && point.viewportY < window.innerHeight - 18
    ));
}

function beeIsInViewport(bee) {
  const bounds = bee.getBoundingClientRect();
  return bounds.right > 12
    && bounds.left < window.innerWidth - 12
    && bounds.bottom > 12
    && bounds.top < window.innerHeight - 12;
}

function currentBeePosition(bee) {
  const bounds = bee.getBoundingClientRect();
  return {
    x: window.scrollX + bounds.left + bounds.width / 2,
    y: window.scrollY + bounds.top + bounds.height / 2,
  };
}

function pageIsAtBottom() {
  return window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 4;
}

function hiveEntrance() {
  const hive = document.querySelector(".beehive-home__image");
  const bounds = hive.getBoundingClientRect();
  return {
    x: window.scrollX + bounds.left + bounds.width * 0.5,
    y: window.scrollY + bounds.top + bounds.height * 0.54,
  };
}

function releasePollen(point) {
  for (let index = 0; index < 7; index += 1) {
    const pollen = document.createElement("i");
    const angle = (Math.PI * 2 * index) / 7;
    const radius = 15 + (index % 3) * 7;
    pollen.className = "pollen-mote";
    pollen.style.left = `${point.x}px`;
    pollen.style.top = `${point.y}px`;
    pollen.style.setProperty("--pollen-x", `${Math.cos(angle) * radius}px`);
    pollen.style.setProperty("--pollen-y", `${Math.sin(angle) * radius - 8}px`);
    document.body.append(pollen);
    pollen.addEventListener("animationend", () => pollen.remove(), { once: true });
  }
}

function translate(point) {
  return `translate3d(${point.x - 25}px, ${point.y - 20}px, 0)`;
}

function distance(first, second) {
  return Math.hypot(second.x - first.x, second.y - first.y);
}
