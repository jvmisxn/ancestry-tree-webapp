const state = {
  data: null,
  selectedId: null,
  rootId: null,
  focusDirect: false,
  scale: 1,
  offsetX: 0,
  offsetY: 0,
};

const els = {
  search: document.querySelector("#person-search"),
  list: document.querySelector("#person-list"),
  loadJson: document.querySelector("#load-json"),
  importJson: document.querySelector("#import-json"),
  focusDirect: document.querySelector("#focus-direct"),
  fit: document.querySelector("#fit-tree"),
  exportJson: document.querySelector("#export-json"),
  title: document.querySelector("#tree-title"),
  count: document.querySelector("#tree-count"),
  viewport: document.querySelector("#tree-viewport"),
  svg: document.querySelector("#tree-svg"),
  detailName: document.querySelector("#detail-name"),
  detailFacts: document.querySelector("#detail-facts"),
  detailNotes: document.querySelector("#detail-notes"),
  detailRelations: document.querySelector("#detail-relations"),
  detailSources: document.querySelector("#detail-sources"),
};

async function init() {
  const response = await fetch("./data/sample-family.json");
  state.data = await response.json();
  state.selectedId = state.data.meta.defaultPersonId;
  state.rootId = state.selectedId;

  els.search.addEventListener("input", renderPeople);
  els.loadJson.addEventListener("click", () => els.importJson.click());
  els.importJson.addEventListener("change", importData);
  els.focusDirect.addEventListener("click", () => {
    state.focusDirect = !state.focusDirect;
    renderTree();
  });
  els.fit.addEventListener("click", fitTree);
  els.exportJson.addEventListener("click", exportData);
  els.viewport.addEventListener("wheel", onZoom, { passive: false });
  enableDrag();

  render();
}

function people() {
  return state.data.people;
}

function personById(id) {
  return people().find((person) => person.id === id);
}

function render() {
  renderPeople();
  renderDetails();
  renderTree();
}

function renderPeople() {
  const term = els.search.value.trim().toLowerCase();
  const matches = people()
    .filter((person) => {
      const haystack = [
        person.name,
        person.birth?.place,
        person.death?.place,
        person.notes,
        ...(person.tags || []),
      ].join(" ").toLowerCase();
      return !term || haystack.includes(term);
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  els.list.replaceChildren(
    ...matches.map((person) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = person.id === state.selectedId ? "person-row active" : "person-row";
      button.innerHTML = `
        <span>${escapeHtml(person.name)}</span>
        <small>${formatYears(person)}</small>
      `;
      button.addEventListener("click", () => {
        state.selectedId = person.id;
        state.rootId = person.id;
        fitTree();
        render();
      });
      return button;
    }),
  );
}

function renderDetails() {
  const person = personById(state.selectedId);
  if (!person) return;

  els.detailName.textContent = person.name;
  els.detailFacts.replaceChildren(
    fact("Born", formatEvent(person.birth)),
    fact("Died", formatEvent(person.death)),
    fact("Known as", person.aliases?.join(", ")),
    fact("Tags", person.tags?.join(", ")),
  );
  els.detailNotes.textContent = person.notes || "No notes yet.";

  const relations = [
    ...linkGroup("Parents", person.parents),
    ...linkGroup("Spouses", person.spouses),
    ...linkGroup("Children", person.children),
  ];
  els.detailRelations.replaceChildren(...relations);

  const sourceItems = (person.sources || []).map((source) => {
    const item = document.createElement(source.url ? "a" : "div");
    item.className = "source-item";
    item.textContent = source.label;
    if (source.url) {
      item.href = source.url;
      item.target = "_blank";
      item.rel = "noreferrer";
    }
    return item;
  });
  els.detailSources.replaceChildren(...sourceItems.length ? sourceItems : [empty("No sources attached yet.")]);
}

function renderTree() {
  const root = personById(state.rootId);
  if (!root) return;

  const graph = buildBranch(root.id);
  const directIds = directRelatives(root.id);
  const nodes = layoutNodes(graph);
  const links = layoutLinks(nodes);
  const width = Math.max(els.viewport.clientWidth, 900);
  const height = Math.max(els.viewport.clientHeight, 640);

  els.title.textContent = root.name;
  els.count.textContent = `${nodes.length} people`;
  els.focusDirect.classList.toggle("active", state.focusDirect);
  els.focusDirect.setAttribute("aria-pressed", String(state.focusDirect));
  els.svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  els.svg.replaceChildren();

  const g = svgEl("g", { transform: `translate(${state.offsetX} ${state.offsetY}) scale(${state.scale})` });
  els.svg.append(g);

  for (const link of links) {
    g.append(svgEl("path", {
      class: "tree-link",
      d: `M ${link.x1} ${link.y1} C ${link.x1} ${(link.y1 + link.y2) / 2}, ${link.x2} ${(link.y1 + link.y2) / 2}, ${link.x2} ${link.y2}`,
    }));
  }

  for (const node of nodes) {
    const isCollateral = state.focusDirect && !directIds.has(node.person.id);
    const group = svgEl("g", {
      class: `tree-node ${node.person.id === state.selectedId ? "selected" : ""} ${isCollateral ? "dimmed" : ""}`,
      transform: `translate(${node.x} ${node.y})`,
      tabindex: "0",
      role: "button",
      "aria-label": node.person.name,
    });
    group.addEventListener("click", () => selectPerson(node.person.id, false));
    group.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") selectPerson(node.person.id, false);
    });

    group.append(svgEl("rect", { x: -96, y: -30, width: 192, height: 60, rx: 8 }));
    group.append(svgText(node.person.name, 0, -4, "node-name"));
    group.append(svgText(formatYears(node.person), 0, 17, "node-years"));
    g.append(group);
  }
}

function buildBranch(rootId) {
  const ids = connectedRelatives(rootId);
  return ids.map((id) => personById(id)).filter(Boolean);
}

function connectedRelatives(rootId) {
  const queue = [rootId];
  const seen = new Set();
  const ordered = [];
  while (queue.length) {
    const id = queue.shift();
    if (seen.has(id)) continue;
    const person = personById(id);
    if (!person) continue;
    seen.add(id);
    ordered.push(id);
    queue.push(...relationshipIds(person));
  }
  return ordered;
}

function directRelatives(rootId) {
  return new Set([rootId, ...walkLine(rootId, "parents"), ...walkLine(rootId, "children")]);
}

function walkLine(rootId, key) {
  const queue = [...(personById(rootId)?.[key] || [])];
  const seen = new Set();
  const ordered = [];
  while (queue.length) {
    const id = queue.shift();
    if (seen.has(id)) continue;
    const person = personById(id);
    if (!person) continue;
    seen.add(id);
    ordered.push(id);
    queue.push(...(person[key] || []));
  }
  return ordered;
}

function layoutNodes(branch) {
  const root = personById(state.rootId);
  const rows = new Map();
  for (const person of branch) {
    const generation = generationOffset(root.id, person.id);
    if (!rows.has(generation)) rows.set(generation, []);
    rows.get(generation).push(person);
  }

  const sortedRows = [...rows.entries()].sort(([a], [b]) => a - b);
  const nodes = [];
  for (const [generation, rowPeople] of sortedRows) {
    const y = 290 + generation * 130;
    const totalWidth = (rowPeople.length - 1) * 230;
    rowPeople.forEach((person, index) => {
      nodes.push({ person, x: 450 - totalWidth / 2 + index * 230, y });
    });
  }
  return nodes;
}

function layoutLinks(nodes) {
  const nodeById = new Map(nodes.map((node) => [node.person.id, node]));
  const links = [];
  for (const node of nodes) {
    for (const childId of node.person.children || []) {
      const child = nodeById.get(childId);
      if (child) links.push({ x1: node.x, y1: node.y + 30, x2: child.x, y2: child.y - 30 });
    }
  }
  return links;
}

function generationOffset(rootId, targetId) {
  if (rootId === targetId) return 0;
  const weighted = weightedDistance(rootId, targetId);
  if (weighted !== null) return weighted;
  return 1;
}

function weightedDistance(startId, targetId) {
  const queue = [{ id: startId, generation: 0 }];
  const seen = new Set();
  while (queue.length) {
    const current = queue.shift();
    if (current.id === targetId) return current.generation;
    if (seen.has(current.id)) continue;
    seen.add(current.id);
    const person = personById(current.id);
    for (const parentId of person?.parents || []) queue.push({ id: parentId, generation: current.generation - 1 });
    for (const spouseId of person?.spouses || []) queue.push({ id: spouseId, generation: current.generation });
    for (const childId of person?.children || []) queue.push({ id: childId, generation: current.generation + 1 });
  }
  return null;
}

function relationshipIds(person) {
  return [...(person.parents || []), ...(person.spouses || []), ...(person.children || [])];
}

function selectPerson(id, reroot = true) {
  state.selectedId = id;
  if (reroot) state.rootId = id;
  render();
}

function fitTree() {
  state.scale = 1;
  state.offsetX = Math.max(0, (els.viewport.clientWidth - 900) / 2);
  state.offsetY = 0;
  renderTree();
}

function onZoom(event) {
  event.preventDefault();
  const direction = event.deltaY > 0 ? -0.08 : 0.08;
  state.scale = Math.min(1.8, Math.max(0.55, state.scale + direction));
  renderTree();
}

function enableDrag() {
  let start = null;
  els.viewport.addEventListener("pointerdown", (event) => {
    start = { x: event.clientX, y: event.clientY, ox: state.offsetX, oy: state.offsetY };
    els.viewport.setPointerCapture(event.pointerId);
  });
  els.viewport.addEventListener("pointermove", (event) => {
    if (!start) return;
    state.offsetX = start.ox + event.clientX - start.x;
    state.offsetY = start.oy + event.clientY - start.y;
    renderTree();
  });
  els.viewport.addEventListener("pointerup", () => {
    start = null;
  });
}

function exportData() {
  const blob = new Blob([JSON.stringify(state.data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "family.json";
  anchor.click();
  URL.revokeObjectURL(url);
}

async function importData(event) {
  const [file] = event.target.files;
  if (!file) return;
  const text = await file.text();
  const data = JSON.parse(text);
  validateData(data);
  state.data = data;
  state.selectedId = data.meta.defaultPersonId || data.people[0]?.id;
  state.rootId = state.selectedId;
  els.search.value = "";
  fitTree();
  render();
  event.target.value = "";
}

function validateData(data) {
  if (!data || !Array.isArray(data.people) || data.people.length === 0) {
    throw new Error("Family JSON must include a non-empty people array.");
  }
  const ids = new Set(data.people.map((person) => person.id));
  for (const person of data.people) {
    if (!person.id || !person.name) throw new Error("Each person needs an id and name.");
    for (const key of ["parents", "spouses", "children"]) {
      for (const id of person[key] || []) {
        if (!ids.has(id)) throw new Error(`${person.name} references missing ${key} id: ${id}`);
      }
    }
  }
}

function fact(label, value) {
  const fragment = document.createDocumentFragment();
  if (!value) return fragment;
  const dt = document.createElement("dt");
  const dd = document.createElement("dd");
  dt.textContent = label;
  dd.textContent = value;
  fragment.append(dt, dd);
  return fragment;
}

function linkGroup(label, ids = []) {
  if (!ids.length) return [empty(`No ${label.toLowerCase()} recorded.`)];
  const heading = document.createElement("h3");
  heading.textContent = label;
  return [
    heading,
    ...ids.map((id) => {
      const person = personById(id);
      const button = document.createElement("button");
      button.type = "button";
      button.className = "relation-item";
      button.textContent = person?.name || id;
      button.addEventListener("click", () => {
        state.selectedId = id;
        state.rootId = id;
        fitTree();
        render();
      });
      return button;
    }),
  ];
}

function empty(message) {
  const item = document.createElement("p");
  item.className = "empty";
  item.textContent = message;
  return item;
}

function formatYears(person) {
  const born = person.birth?.date ? person.birth.date.slice(0, 4) : "?";
  const died = person.death?.date ? person.death.date.slice(0, 4) : "";
  return died ? `${born}-${died}` : `b. ${born}`;
}

function formatEvent(event) {
  if (!event) return "";
  return [event.date, event.place].filter(Boolean).join(" - ");
}

function svgEl(name, attrs) {
  const el = document.createElementNS("http://www.w3.org/2000/svg", name);
  for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, value);
  return el;
}

function svgText(value, x, y, className) {
  const text = svgEl("text", { x, y, class: className, "text-anchor": "middle" });
  text.textContent = value;
  return text;
}

function escapeHtml(value) {
  const div = document.createElement("div");
  div.textContent = value;
  return div.innerHTML;
}

init().catch((error) => {
  els.title.textContent = "Could not load family tree";
  console.error(error);
});
