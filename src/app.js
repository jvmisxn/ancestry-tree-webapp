const STORAGE_KEY = "jmo-ancestry-family-data";

const state = {
  data: null,
  hasStoredData: false,
  selectedId: null,
  rootId: null,
  collapseCollateral: true,
  expandedAncestors: new Set(),
  scale: 1,
  offsetX: 0,
  offsetY: 0,
  peopleCollapsed: false,
  profileCollapsed: false,
  sourcesExpanded: false,
};

const NODE = {
  width: 214,
  height: 76,
  photoSize: 44,
  portraitX: -72,
  textX: 28,
};

const NODE_HALF_WIDTH = NODE.width / 2;
const NODE_HALF_HEIGHT = NODE.height / 2;

const els = {
  search: document.querySelector("#person-search"),
  list: document.querySelector("#person-list"),
  loadJson: document.querySelector("#load-json"),
  clearData: document.querySelector("#clear-data"),
  importJson: document.querySelector("#import-json"),
  focusDirect: document.querySelector("#focus-direct"),
  fit: document.querySelector("#fit-tree"),
  exportJson: document.querySelector("#export-json"),
  title: document.querySelector("#tree-title"),
  count: document.querySelector("#tree-count"),
  viewport: document.querySelector("#tree-viewport"),
  svg: document.querySelector("#tree-svg"),
  detailName: document.querySelector("#detail-name"),
  detailPhoto: document.querySelector("#detail-photo"),
  detailStory: document.querySelector("#detail-story"),
  detailFacts: document.querySelector("#detail-facts"),
  detailNotes: document.querySelector("#detail-notes"),
  detailRelations: document.querySelector("#detail-relations"),
  detailSources: document.querySelector("#detail-sources"),
  sourcesPanel: document.querySelector("#sources-panel"),
  toggleSources: document.querySelector("#toggle-sources"),
  dataStatus: document.querySelector("#data-status"),
  centerPerson: document.querySelector("#center-person"),
  homePerson: document.querySelector("#home-person"),
  togglePeople: document.querySelector("#toggle-people"),
  toggleProfile: document.querySelector("#toggle-profile"),
  closeProfile: document.querySelector("#close-profile"),
};

async function init() {
  const stored = loadStoredData();
  if (stored) {
    state.data = stored;
    state.hasStoredData = true;
  } else {
    state.data = await fetchSampleData();
  }
  state.selectedId = state.data.meta?.defaultPersonId || state.data.people[0]?.id;
  state.rootId = state.selectedId;

  els.search.addEventListener("input", renderPeople);
  els.loadJson.addEventListener("click", () => els.importJson.click());
  els.importJson.addEventListener("change", importData);
  els.clearData.addEventListener("click", forgetStoredData);
  els.focusDirect.addEventListener("click", () => {
    state.collapseCollateral = !state.collapseCollateral;
    if (state.collapseCollateral) {
      state.rootId = state.selectedId;
      resetExpandedAncestors();
    }
    fitTree();
    render();
  });
  els.fit.addEventListener("click", fitTree);
  els.exportJson.addEventListener("click", exportData);
  els.centerPerson.addEventListener("click", () => {
    state.rootId = state.selectedId;
    resetExpandedAncestors();
    fitTree();
    render();
  });
  els.homePerson.addEventListener("click", () => {
    state.selectedId = state.data.meta.defaultPersonId || state.data.people[0]?.id;
    state.rootId = state.selectedId;
    resetExpandedAncestors();
    fitTree();
    render();
  });
  els.togglePeople.addEventListener("click", () => {
    state.peopleCollapsed = !state.peopleCollapsed;
    syncPanelState();
    fitTreeAfterLayout();
  });
  els.toggleProfile.addEventListener("click", () => {
    state.profileCollapsed = !state.profileCollapsed;
    syncPanelState();
    fitTreeAfterLayout();
  });
  els.closeProfile.addEventListener("click", () => {
    state.profileCollapsed = true;
    syncPanelState();
  });
  els.toggleSources.addEventListener("click", () => {
    state.sourcesExpanded = !state.sourcesExpanded;
    renderDetails();
  });
  els.viewport.addEventListener("wheel", onZoom, { passive: false });
  enableDrag();

  state.profileCollapsed = true;
  syncPanelState();
  render();
  fitTreeAfterLayout();
}

async function fetchSampleData() {
  const response = await fetch("./data/sample-family.json");
  return response.json();
}

function loadStoredData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    validateData(data);
    return data;
  } catch {
    return null;
  }
}

function storeData(data) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

async function forgetStoredData() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Storage may be unavailable; still fall back to sample data.
  }
  state.hasStoredData = false;
  adoptData(await fetchSampleData());
  renderDataStatus("Saved family data removed from this browser. Sample data loaded.", "success");
}

function adoptData(data) {
  state.data = data;
  state.selectedId = data.meta?.defaultPersonId || data.people[0]?.id;
  state.rootId = state.selectedId;
  state.collapseCollateral = true;
  resetExpandedAncestors();
  state.peopleCollapsed = true;
  state.profileCollapsed = true;
  syncPanelState();
  els.search.value = "";
  fitTree();
  render();
  fitTreeAfterLayout();
}

function people() {
  return state.data.people;
}

function personById(id) {
  return people().find((person) => person.id === id);
}

function relationshipIndex() {
  const index = new Map(people().map((person) => [
    person.id,
    {
      parents: new Set(person.parents || []),
      spouses: new Set(person.spouses || []),
      children: new Set(person.children || []),
    },
  ]));

  for (const person of people()) {
    for (const parentId of person.parents || []) {
      index.get(parentId)?.children.add(person.id);
    }
    for (const spouseId of person.spouses || []) {
      index.get(spouseId)?.spouses.add(person.id);
    }
    for (const childId of person.children || []) {
      index.get(childId)?.parents.add(person.id);
    }
  }

  return index;
}

function render() {
  syncPanelState();
  renderPeople();
  renderDetails();
  renderTree();
  renderDataStatus();
}

function syncPanelState() {
  document.body.classList.toggle("people-collapsed", state.peopleCollapsed);
  document.body.classList.toggle("profile-collapsed", state.profileCollapsed);
  els.togglePeople.textContent = "People";
  els.toggleProfile.textContent = "Profile";
  els.togglePeople.setAttribute("aria-pressed", String(!state.peopleCollapsed));
  els.toggleProfile.setAttribute("aria-pressed", String(!state.profileCollapsed));
}

function renderDataStatus(message, tone = "neutral") {
  const isSample = people().some((person) => (person.tags || []).includes("sample"));
  const summary = message || (isSample
    ? "Sample data loaded. Load your private family.json to view the real tree."
    : `${people().length} people loaded${state.hasStoredData ? " from this browser's saved copy" : ""}. Nothing is uploaded.`);
  els.dataStatus.className = `data-status ${tone}`;
  els.dataStatus.textContent = summary;
  els.clearData.hidden = !state.hasStoredData;
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
        selectPerson(person.id, state.collapseCollateral, true);
      });
      return button;
    }),
  );
}

function renderDetails() {
  const person = personById(state.selectedId);
  if (!person) return;

  els.detailName.textContent = person.name;
  renderProfilePhoto(person);
  renderLifeStory(person);
  els.detailFacts.replaceChildren(
    fact("Born", formatEvent(person.birth)),
    fact("Died", formatEvent(person.death)),
    fact("Known as", person.aliases?.join(", ")),
    fact("Tags", person.tags?.join(", ")),
  );
  els.detailNotes.textContent = person.notes || "";
  els.detailNotes.hidden = !person.notes;

  const relations = [
    ...linkGroup("Parents", person.parents),
    ...linkGroup("Spouses", person.spouses),
    ...linkGroup("Children", person.children),
  ];
  els.detailRelations.replaceChildren(...relations);

  const sourceItems = profileSources(person).map(renderSourceItem);
  els.toggleSources.hidden = sourceItems.length === 0;
  els.toggleSources.textContent = `Sources${sourceItems.length ? ` (${sourceItems.length})` : ""}`;
  els.toggleSources.setAttribute("aria-expanded", String(state.sourcesExpanded));
  els.sourcesPanel.hidden = !state.sourcesExpanded;
  els.detailSources.replaceChildren(...sourceItems.length ? sourceItems : [empty("No sources attached yet.")]);
}

function renderProfilePhoto(person) {
  const [photo] = profilePhotos(person);
  els.detailPhoto.replaceChildren();
  els.detailPhoto.hidden = !photo;
  if (!photo) return;

  const image = document.createElement("img");
  image.src = photo.url;
  image.alt = photo.alt || `Photo of ${person.name}`;
  image.loading = "lazy";
  els.detailPhoto.append(image);

  const captionText = [photo.caption, photo.credit].filter(Boolean).join(" - ");
  if (captionText) {
    const caption = document.createElement("p");
    caption.textContent = captionText;
    els.detailPhoto.append(caption);
  }
}

function renderLifeStory(person) {
  const obituary = primaryObituary(person);
  const story = person.profile?.article || person.lifeStory || person.profile?.summary || generatedLifeStory(person);
  const paragraphs = Array.isArray(story) ? story : splitParagraphs(story);

  els.detailStory.replaceChildren();
  if (obituary) {
    const badge = document.createElement("p");
    badge.className = "story-kicker";
    badge.textContent = obituary.publication
      ? `Obituary available from ${obituary.publication}`
      : "Obituary available";
    els.detailStory.append(badge);
  }

  for (const paragraphText of paragraphs) {
    const paragraph = document.createElement("p");
    paragraph.textContent = paragraphText;
    els.detailStory.append(paragraph);
  }
}

function generatedLifeStory(person) {
  const index = relationshipIndex();
  const years = formatYears(person);
  const birth = formatEvent(person.birth);
  const death = formatEvent(person.death);
  const parents = namesForIds(index.get(person.id)?.parents);
  const spouses = namesForIds(index.get(person.id)?.spouses);
  const children = namesForIds(index.get(person.id)?.children);
  const lead = `${person.name}${years ? ` (${years})` : ""} is part of the working JMO family tree.`;
  const parts = [lead];

  if (birth) parts.push(`${givenName(person.name)} was born ${birth}.`);
  if (parents.length) parts.push(`${givenName(person.name)} was recorded as the child of ${formatNameList(parents)}.`);
  if (spouses.length) parts.push(`${givenName(person.name)} was connected in the tree with ${formatNameList(spouses)}.`);
  if (children.length) parts.push(`Known children in this research set include ${formatNameList(children)}.`);
  if (death) parts.push(`${givenName(person.name)} died ${death}.`);

  return parts.join(" ");
}

function profilePhotos(person) {
  return [
    ...(person.profile?.photos || []),
    ...(person.photos || []),
  ].filter((photo) => photo?.url);
}

function profileSources(person) {
  const sourceLike = [
    ...(person.sources || []),
    ...(person.profile?.sources || []),
    ...profilePhotos(person).map((photo) => ({
      label: photo.caption || `Photo of ${person.name}`,
      title: photo.caption,
      url: photo.sourceUrl || photo.url,
      repository: photo.credit,
      type: "photo",
    })),
    ...(person.profile?.obituaries || []),
    ...(person.obituaries || []),
  ];
  const seen = new Set();
  return sourceLike.filter((source) => {
    if (!source?.label && !source?.title && !source?.url) return false;
    const key = source.url || source.label || source.title;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function primaryObituary(person) {
  return [...(person.profile?.obituaries || []), ...(person.obituaries || [])]
    .find((item) => item?.url || item?.title || item?.publication);
}

function renderSourceItem(source) {
  const item = document.createElement(source.url ? "a" : "div");
  item.className = `source-item ${source.type ? `source-${source.type}` : ""}`;
  if (source.url) {
    item.href = source.url;
    item.target = "_blank";
    item.rel = "noreferrer";
  }

  const title = document.createElement("span");
  title.textContent = source.label || source.title || source.url;
  item.append(title);

  const meta = [source.date, source.publication, source.repository, source.confidence].filter(Boolean).join(" - ");
  if (meta) {
    const small = document.createElement("small");
    small.textContent = meta;
    item.append(small);
  }

  if (source.excerpt) {
    const excerpt = document.createElement("p");
    excerpt.textContent = source.excerpt;
    item.append(excerpt);
  }

  return item;
}

function renderTree() {
  const root = personById(state.rootId);
  if (!root) return;

  const index = relationshipIndex();
  const directIds = directRelatives(root.id, index);
  const visibleIds = state.collapseCollateral ? expandedTreeIds(root.id, index) : null;
  const graph = buildBranch(root.id, index, visibleIds);
  const nodes = layoutNodes(graph, index);
  const familyUnits = layoutFamilyUnits(nodes, index, directIds);
  const links = layoutLinks(nodes, index, directIds);
  const width = Math.max(els.viewport.clientWidth, 360);
  const height = Math.max(els.viewport.clientHeight, 520);
  const visibleParents = nodes.filter((node) => generationOffset(root.id, node.person.id, index) < 0).length;
  const hiddenParentCount = state.collapseCollateral ? hiddenExpandableParentCount(nodes, index) : 0;
  const directCount = nodes.filter((node) => directIds.has(node.person.id)).length;
  const collateralCount = nodes.length - directCount;

  els.title.textContent = root.name;
  els.count.textContent = state.collapseCollateral
    ? `${nodes.length} visible, ${visibleParents} ancestors, ${hiddenParentCount} hidden`
    : `${directCount} direct, ${collateralCount} collateral`;
  els.focusDirect.textContent = state.collapseCollateral ? "Show full tree" : "Minimal tree";
  els.focusDirect.title = state.collapseCollateral
    ? "Show every connected relative around this family"
    : "Start small and reveal ancestors manually";
  els.focusDirect.classList.toggle("active", state.collapseCollateral);
  els.focusDirect.setAttribute("aria-pressed", String(state.collapseCollateral));
  els.svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  els.svg.replaceChildren();

  const g = svgEl("g", { transform: `translate(${state.offsetX} ${state.offsetY}) scale(${state.scale})` });
  if (state.scale < 0.5) g.classList.add("overview-scale");
  els.svg.append(g);

  for (const link of links) {
    g.append(svgEl("path", {
      class: `tree-link ${link.kind || ""} ${!state.collapseCollateral && !link.direct ? "dimmed" : ""}`,
      d: link.d,
    }));
  }

  for (const unit of familyUnits) {
    g.append(svgEl("rect", {
      class: `family-unit ${!state.collapseCollateral && !unit.direct ? "dimmed" : ""}`,
      x: unit.x,
      y: unit.y,
      width: unit.width,
      height: unit.height,
      rx: 10,
    }));
    if (unit.label) {
      g.append(svgText(unit.label, unit.x + 14, unit.y + 18, "family-label", "start"));
    }
  }

  for (const node of nodes) {
    const isCollateral = !state.collapseCollateral && !directIds.has(node.person.id);
    const parentIds = [...(index.get(node.person.id)?.parents || [])];
    const visibleParentIds = parentIds.filter((id) => nodes.some((candidate) => candidate.person.id === id));
    const hiddenParents = parentIds.length - visibleParentIds.length;
    if (state.collapseCollateral && hiddenParents > 0) {
      const expand = svgEl("g", {
        class: "ancestor-expander",
        transform: `translate(${node.x} ${node.y - NODE_HALF_HEIGHT - 28})`,
        tabindex: "0",
        role: "button",
        "aria-label": `Show parents of ${node.person.name}`,
      });
      expand.append(svgEl("rect", { x: -58, y: -14, width: 116, height: 26, rx: 13 }));
      expand.append(svgText(`Show parent${hiddenParents === 1 ? "" : "s"}`, 0, 4, "ancestor-expander-text"));
      expand.addEventListener("pointerdown", (event) => event.stopPropagation());
      expand.addEventListener("click", (event) => {
        event.stopPropagation();
        expandParents(node.person.id);
      });
      expand.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          expandParents(node.person.id);
        }
      });
      g.append(expand);
    }

    const group = svgEl("g", {
      class: `tree-node ${node.person.id === state.rootId ? "root" : ""} ${node.person.id === state.selectedId ? "selected" : ""} ${isCollateral ? "dimmed" : ""}`,
      transform: `translate(${node.x} ${node.y})`,
      tabindex: "0",
      role: "button",
      "aria-label": node.person.name,
    });
    group.addEventListener("pointerdown", (event) => {
      event.stopPropagation();
    });
    group.addEventListener("click", () => selectPerson(node.person.id, state.collapseCollateral, true));
    group.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        selectPerson(node.person.id, state.collapseCollateral, true);
      }
    });

    group.append(svgEl("rect", { x: -NODE_HALF_WIDTH, y: -NODE_HALF_HEIGHT, width: NODE.width, height: NODE.height, rx: 8 }));
    renderTreePortrait(group, node.person);
    const name = svgText(shortNodeName(node.person.name), NODE.textX, -7, "node-name");
    if (node.person.name.length > shortNodeName(node.person.name).length) {
      const title = svgEl("title", {});
      title.textContent = node.person.name;
      name.append(title);
    }
    group.append(name);
    group.append(svgText(formatYears(node.person), NODE.textX, 16, "node-years"));
    g.append(group);
  }
}

function renderTreePortrait(group, person) {
  const [photo] = profilePhotos(person);
  const initials = person.name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
  const radius = NODE.photoSize / 2;
  const x = NODE.portraitX - radius;
  const y = -radius;
  const clipId = `portrait-${cssSafeId(person.id)}`;

  group.append(svgEl("circle", {
    class: "node-photo-placeholder",
    cx: NODE.portraitX,
    cy: 0,
    r: radius,
  }));
  group.append(svgText(initials || "?", NODE.portraitX, 5, "node-photo-initials"));

  if (!photo) return;

  const defs = svgEl("defs", {});
  const clip = svgEl("clipPath", { id: clipId });
  clip.append(svgEl("circle", { cx: NODE.portraitX, cy: 0, r: radius }));
  defs.append(clip);
  group.append(defs);

  const image = svgEl("image", {
    class: "node-photo",
    href: photo.url,
    x,
    y,
    width: NODE.photoSize,
    height: NODE.photoSize,
    "clip-path": `url(#${clipId})`,
    preserveAspectRatio: "xMidYMid slice",
  });
  image.addEventListener("error", () => {
    image.remove();
  });
  group.append(image);
}

function buildBranch(rootId, index, visibleIds = null) {
  const ids = connectedRelatives(rootId, index).filter((id) => !visibleIds || visibleIds.has(id));
  return ids.map((id) => personById(id)).filter(Boolean);
}

function expandedTreeIds(rootId, index) {
  const visible = new Set([rootId]);
  for (const spouseId of index.get(rootId)?.spouses || []) visible.add(spouseId);
  for (const childId of index.get(rootId)?.children || []) {
    visible.add(childId);
    for (const childSpouseId of index.get(childId)?.spouses || []) visible.add(childSpouseId);
  }

  const queue = [rootId, ...state.expandedAncestors].filter((id) => visible.has(id));
  const seen = new Set();
  while (queue.length) {
    const id = queue.shift();
    if (seen.has(id)) continue;
    seen.add(id);
    if (!state.expandedAncestors.has(id)) continue;
    for (const parentId of index.get(id)?.parents || []) {
      visible.add(parentId);
      for (const spouseId of index.get(parentId)?.spouses || []) visible.add(spouseId);
      queue.push(parentId);
    }
  }
  return visible;
}

function hiddenExpandableParentCount(nodes, index) {
  const visible = new Set(nodes.map((node) => node.person.id));
  return nodes.reduce((total, node) => {
    const hiddenParents = [...(index.get(node.person.id)?.parents || [])].filter((id) => !visible.has(id));
    return total + hiddenParents.length;
  }, 0);
}

function expandParents(personId) {
  state.expandedAncestors.add(personId);
  fitTree();
  render();
}

function resetExpandedAncestors() {
  state.expandedAncestors = new Set();
}

function connectedRelatives(rootId, index) {
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
    queue.push(...relationshipIds(id, index));
  }
  return ordered;
}

function directRelatives(rootId, index) {
  return new Set([rootId, ...walkLine(rootId, "parents", index), ...walkLine(rootId, "children", index)]);
}

function walkLine(rootId, key, index) {
  const queue = [...(index.get(rootId)?.[key] || [])];
  const seen = new Set();
  const ordered = [];
  while (queue.length) {
    const id = queue.shift();
    if (seen.has(id)) continue;
    const person = personById(id);
    if (!person) continue;
    seen.add(id);
    ordered.push(id);
    queue.push(...(index.get(id)?.[key] || []));
  }
  return ordered;
}

function layoutNodes(branch, index) {
  const nodeGap = state.collapseCollateral ? 226 : 228;
  const groupGap = state.collapseCollateral ? 84 : 68;
  const ancestorSideGap = state.collapseCollateral ? 168 : 140;
  const laneGap = 86;
  const generationGap = 164;
  const maxGroupColumns = state.collapseCollateral ? 5 : 3;
  const root = personById(state.rootId);
  const rows = new Map();
  const directOrder = directAncestorOrder(root.id, index);

  for (const person of branch) {
    const generation = generationOffset(root.id, person.id, index);
    if (!rows.has(generation)) rows.set(generation, []);
    rows.get(generation).push(person);
  }

  const sortedRows = [...rows.entries()].sort(([a], [b]) => a - b);
  const nodes = [];
  let y = 120;
  for (const [generation, rowPeople] of sortedRows) {
    const groups = familyGroups(rowPeople, index, directOrder);
    const widths = groups.map((group) => Math.min(maxGroupColumns, Math.max(1, group.people.length)) * nodeGap);
    const groupSides = groups.map((group) => ancestorSideForGroup(root.id, group, index));
    const sideBreaks = groupSides.reduce((total, side, index) => {
      if (index === 0) return total;
      return total + (isSideBreak(groupSides[index - 1], side) ? 1 : 0);
    }, 0);
    const maxRows = Math.max(...groups.map((group) => Math.ceil(group.people.length / maxGroupColumns)), 1);
    const rowWidth = widths.reduce((total, width) => total + width, 0)
      + Math.max(0, groups.length - 1) * groupGap
      + (generation < 0 ? sideBreaks * ancestorSideGap : 0);
    let x = 450 - rowWidth / 2;

    groups.forEach((group, groupIndex) => {
      if (groupIndex > 0 && generation < 0 && isSideBreak(groupSides[groupIndex - 1], groupSides[groupIndex])) {
        x += ancestorSideGap;
      }
      const groupWidth = widths[groupIndex];
      const groupDrift = ancestorBranchDrift(root.id, group, generation, index);
      group.people.forEach((person, index) => {
        const lane = Math.floor(index / maxGroupColumns);
        const column = index % maxGroupColumns;
        const laneLength = Math.min(maxGroupColumns, group.people.length - lane * maxGroupColumns);
        const laneWidth = laneLength * nodeGap;
        nodes.push({
          person,
          x: x + groupDrift + (groupWidth - laneWidth) / 2 + nodeGap / 2 + column * nodeGap,
          y: y + lane * laneGap,
          familyKey: group.key,
        });
      });
      x += groupWidth + groupGap;
    });
    y += generationGap + (maxRows - 1) * laneGap;
  }
  applyProgressiveAncestorLanes(nodes, index);
  return nodes;
}

function applyProgressiveAncestorLanes(nodes, index) {
  if (!state.collapseCollateral) return;

  const rootNode = nodes.find((node) => node.person.id === state.rootId);
  if (!rootNode) return;

  const rows = new Map();
  for (const node of nodes) {
    const generation = generationOffset(state.rootId, node.person.id, index);
    if (generation >= 0) continue;
    if (!rows.has(generation)) rows.set(generation, []);
    rows.get(generation).push(node);
  }

  const rootParents = orderedParentIds(state.rootId, index);
  const minGap = NODE.width + 22;
  const centerGap = NODE_HALF_WIDTH + 112;

  for (const rowNodes of rows.values()) {
    for (const node of rowNodes) {
      const path = ancestorPathFromRoot(state.rootId, node.person.id, index);
      if (!path.length) continue;
      node.ancestorPath = path;
      node.x = rootNode.x + ancestorPathOffset(path, rootParents.length);
    }
  }

  for (const rowNodes of rows.values()) {
    const left = rowNodes
      .filter((node) => ancestorLaneDirection(node.ancestorPath, rootParents.length) < 0)
      .sort((a, b) => b.x - a.x);
    const right = rowNodes
      .filter((node) => ancestorLaneDirection(node.ancestorPath, rootParents.length) > 0)
      .sort((a, b) => a.x - b.x);
    const middle = rowNodes
      .filter((node) => ancestorLaneDirection(node.ancestorPath, rootParents.length) === 0)
      .sort((a, b) => a.x - b.x);

    pushBranchAwayFromCenter(left, rootNode.x - centerGap, -1, minGap);
    pushBranchAwayFromCenter(right, rootNode.x + centerGap, 1, minGap);

    for (let index = 1; index < middle.length; index += 1) {
      const previous = middle[index - 1];
      const current = middle[index];
      const overlap = previous.x + minGap - current.x;
      if (overlap > 0) current.x += overlap;
    }
  }
}

function ancestorPathFromRoot(rootId, targetId, index) {
  const queue = [{ id: rootId, path: [] }];
  const seen = new Set();

  while (queue.length) {
    const current = queue.shift();
    if (current.id === targetId) return current.path;
    if (seen.has(current.id)) continue;
    seen.add(current.id);

    const parents = orderedParentIds(current.id, index);
    parents.forEach((parentId, order) => {
      queue.push({ id: parentId, path: [...current.path, order] });
    });
  }

  return [];
}

function ancestorPathOffset(path, rootParentCount) {
  const direction = ancestorLaneDirection(path, rootParentCount);
  if (!direction) return 0;

  const sideStep = 188;
  const generationStep = 122;
  const branchStep = 58;
  let offset = direction * (sideStep + Math.max(0, path.length - 1) * generationStep);

  for (let index = 1; index < path.length; index += 1) {
    const parentDirection = parentLaneDirection(path[index], 2);
    offset += parentDirection * (branchStep / index);
  }

  return offset;
}

function ancestorLaneDirection(path, rootParentCount) {
  if (!path?.length) return 0;
  return parentLaneDirection(path[0], rootParentCount);
}

function pushBranchAwayFromCenter(nodes, centerLimit, direction, minGap) {
  nodes.forEach((node, index) => {
    if (index === 0) {
      node.x = direction < 0 ? Math.min(node.x, centerLimit) : Math.max(node.x, centerLimit);
      return;
    }

    const previous = nodes[index - 1];
    const nextLimit = previous.x + direction * minGap;
    node.x = direction < 0 ? Math.min(node.x, nextLimit) : Math.max(node.x, nextLimit);
  });
}

function orderedParentIds(childId, index) {
  const person = personById(childId);
  const recorded = person?.parents || [];
  const relationParents = [...(index.get(childId)?.parents || [])];
  return [
    ...recorded.filter((id) => relationParents.includes(id)),
    ...relationParents.filter((id) => !recorded.includes(id)),
  ];
}

function parentLaneDirection(order, count) {
  if (count === 1) return -1;
  if (order === 0) return -1;
  if (order === 1) return 1;
  return order % 2 === 0 ? -1 : 1;
}

function layoutFamilyUnits(nodes, index, directIds) {
  const groups = new Map();
  for (const node of nodes) {
    const key = node.familyKey || `single:${node.person.id}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(node);
  }

  return [...groups.entries()]
    .filter(([, groupNodes]) => groupNodes.length > 1 || siblingParentIds(groupNodes[0].person.id, index).length)
    .map(([key, groupNodes]) => {
      const minX = Math.min(...groupNodes.map((node) => node.x)) - NODE_HALF_WIDTH - 16;
      const maxX = Math.max(...groupNodes.map((node) => node.x)) + NODE_HALF_WIDTH + 16;
      const minY = Math.min(...groupNodes.map((node) => node.y)) - NODE_HALF_HEIGHT - 76;
      const maxY = Math.max(...groupNodes.map((node) => node.y)) + NODE_HALF_HEIGHT + 12;
      return {
        key,
        x: minX,
        y: minY,
        width: maxX - minX,
        height: maxY - minY,
        label: familyUnitLabel(key, groupNodes, index),
        direct: groupNodes.some((node) => directIds.has(node.person.id)),
      };
    });
}

function siblingParentIds(personId, index) {
  return [...(index.get(personId)?.parents || [])];
}

function familyUnitLabel(key, groupNodes, index) {
  if (key.startsWith("parents:")) {
    const surnames = siblingParentIds(groupNodes[0].person.id, index)
      .map((id) => personById(id)?.name)
      .map(surnameFromName)
      .filter(Boolean);
    const uniqueSurnames = [...new Set(surnames)].slice(0, 2);
    return uniqueSurnames.length ? `Children of ${uniqueSurnames.join(" + ")}` : "Children";
  }
  if (key.startsWith("spouses:")) return "Couple";
  return "";
}

function surnameFromName(name = "") {
  const clean = name.replace(/".*?"/g, "").trim();
  const parts = clean.split(/\s+/).filter(Boolean);
  return parts.length ? parts[parts.length - 1] : "";
}

function familyGroups(rowPeople, index, directOrder) {
  const generation = generationOffset(state.rootId, rowPeople[0].id, index);
  const rowOrder = directOrder.get(generation) || new Map();
  const peopleById = new Map(rowPeople.map((person) => [person.id, person]));
  const groupMap = new Map();

  for (const person of rowPeople) {
    const parents = [...(index.get(person.id)?.parents || [])];
    const key = parents.length ? `parents:${parents.join("+")}` : familyFallbackKey(person, rowPeople, index);
    if (!groupMap.has(key)) groupMap.set(key, { key, people: [], parents });
    groupMap.get(key).people.push(person);
  }

  const groups = [...groupMap.values()];
  for (const group of groups) {
    const childOrder = orderedChildren(group.parents, index).filter((id) => peopleById.has(id));
    group.people.sort((a, b) => {
      const aDirect = rowOrder.has(a.id);
      const bDirect = rowOrder.has(b.id);
      const aChildOrder = childOrder.indexOf(a.id);
      const bChildOrder = childOrder.indexOf(b.id);
      const aRank = aChildOrder === -1 ? Number.MAX_SAFE_INTEGER : aChildOrder;
      const bRank = bChildOrder === -1 ? Number.MAX_SAFE_INTEGER : bChildOrder;

      if (aDirect || bDirect) {
        return centeredFamilyRank(a.id, childOrder, rowOrder) - centeredFamilyRank(b.id, childOrder, rowOrder);
      }
      if (aRank !== bRank) return aRank - bRank;
      return a.name.localeCompare(b.name);
    });
    group.anchor = groupAnchor(group, index, directOrder, generation);
  }

  return groups.sort((a, b) => a.anchor - b.anchor || a.key.localeCompare(b.key));
}

function ancestorBranchDrift(rootId, group, generation, index) {
  if (generation >= 0) return 0;

  const side = ancestorSideForGroup(rootId, group, index);
  if (side === null) return 0;

  const rootParents = [...(index.get(rootId)?.parents || [])];
  const middle = (rootParents.length - 1) / 2;
  const direction = Math.sign(side - middle);
  if (!direction) return 0;

  const depthPastParents = Math.max(0, Math.abs(generation) - 1);
  const diagonalStep = state.collapseCollateral ? 92 : 76;
  return direction * depthPastParents * diagonalStep;
}

function ancestorSideForGroup(rootId, group, index) {
  const rootParents = [...(index.get(rootId)?.parents || [])];
  if (rootParents.length < 2) return null;
  const candidates = [...group.parents, ...group.people.map((person) => person.id)];
  const sides = candidates
    .map((id) => ancestorSide(rootParents, id, index))
    .filter((side) => side !== null);
  return sides.length ? Math.min(...sides) : null;
}

function ancestorSide(rootParents, targetId, index) {
  const directSide = rootParents.indexOf(targetId);
  if (directSide !== -1) return directSide;

  for (let side = 0; side < rootParents.length; side += 1) {
    if (isAncestorOf(targetId, rootParents[side], index)) return side;
  }
  return null;
}

function isAncestorOf(ancestorId, descendantId, index) {
  const queue = [...(index.get(descendantId)?.parents || [])];
  const seen = new Set();
  while (queue.length) {
    const id = queue.shift();
    if (id === ancestorId) return true;
    if (seen.has(id)) continue;
    seen.add(id);
    queue.push(...(index.get(id)?.parents || []));
  }
  return false;
}

function isSideBreak(left, right) {
  return left !== null && right !== null && left !== right;
}

function familyFallbackKey(person, rowPeople, index) {
  const spouse = [...(index.get(person.id)?.spouses || [])].find((id) => rowPeople.some((candidate) => candidate.id === id));
  if (!spouse) return `single:${person.id}`;
  return `spouses:${[person.id, spouse].sort().join("+")}`;
}

function orderedChildren(parentIds, index) {
  const seen = new Set();
  const children = [];
  for (const parentId of parentIds) {
    for (const childId of index.get(parentId)?.children || []) {
      if (!seen.has(childId)) {
        seen.add(childId);
        children.push(childId);
      }
    }
  }
  return children;
}

function centeredFamilyRank(id, childOrder, rowOrder) {
  const directChildren = childOrder.filter((childId) => rowOrder.has(childId));
  const directId = directChildren[0];
  const directIndex = directId ? childOrder.indexOf(directId) : -1;
  const ownIndex = childOrder.indexOf(id);
  if (ownIndex === -1 || directIndex === -1) return rowOrder.get(id) ?? Number.MAX_SAFE_INTEGER;
  if (id === directId) return 0;
  const side = ownIndex < directIndex ? -1 : 1;
  const distance = Math.abs(ownIndex - directIndex);
  return side * Math.ceil(distance / 2) + (side > 0 ? 0.25 : -0.25);
}

function groupAnchor(group, index, directOrder, generation) {
  const rowOrder = directOrder.get(generation) || new Map();
  const ownOrders = group.people.map((person) => rowOrder.get(person.id)).filter((order) => order !== undefined);
  if (ownOrders.length) return Math.min(...ownOrders);

  const directRows = [...directOrder.values()];
  const parentOrders = group.parents
    .map((id) => directRows.map((row) => row.get(id)).find((order) => order !== undefined))
    .filter((order) => order !== undefined);
  if (parentOrders.length) return parentOrders.reduce((total, order) => total + order, 0) / parentOrders.length;

  const spouseOrders = group.people
    .flatMap((person) => [...(index.get(person.id)?.spouses || [])])
    .map((id) => {
      const directSpouseOrder = rowOrder.get(id);
      if (directSpouseOrder === undefined) return undefined;

      const directSpouseSide = directLineSpouseSide(id, generation, index, directOrder);
      if (directSpouseSide === 0) return directSpouseOrder + 0.35;
      return directSpouseOrder - directSpouseSide * 0.35;
    })
    .filter((order) => order !== undefined);
  if (spouseOrders.length) return Math.min(...spouseOrders);

  return Math.min(...group.people.map((person) => weightedDistance(state.rootId, person.id, index) ?? 999));
}

function directLineSpouseSide(personId, generation, index, directOrder) {
  const rowOrder = directOrder.get(generation) || new Map();
  const childOrder = directOrder.get(generation + 1) || new Map();
  const personOrder = rowOrder.get(personId);
  if (personOrder === undefined || !childOrder.size) return 0;

  for (const spouseId of index.get(personId)?.spouses || []) {
    const spouseOrder = rowOrder.get(spouseId);
    if (spouseOrder === undefined) continue;

    const hasDirectChild = [...(index.get(personId)?.children || [])].some((childId) => {
      const childParents = index.get(childId)?.parents || new Set();
      return childOrder.has(childId) && childParents.has(spouseId);
    });
    if (hasDirectChild) return Math.sign(spouseOrder - personOrder);
  }

  return 0;
}

function directAncestorOrder(rootId, index) {
  const orderByGeneration = new Map([[0, new Map([[rootId, 0]])]]);
  let current = [rootId];
  let generation = -1;
  const seen = new Set([rootId]);

  while (current.length) {
    const parents = [];
    for (const id of current) {
      for (const parentId of index.get(id)?.parents || []) {
        if (!seen.has(parentId)) {
          seen.add(parentId);
          parents.push(parentId);
        }
      }
    }
    if (!parents.length) break;
    orderByGeneration.set(generation, new Map(parents.map((id, order) => [id, order])));
    current = parents;
    generation -= 1;
  }

  current = [rootId];
  generation = 1;
  while (current.length) {
    const children = [];
    for (const id of current) {
      for (const childId of index.get(id)?.children || []) {
        if (!seen.has(childId)) {
          seen.add(childId);
          children.push(childId);
        }
      }
    }
    if (!children.length) break;
    orderByGeneration.set(generation, new Map(children.map((id, order) => [id, order])));
    current = children;
    generation += 1;
  }

  return orderByGeneration;
}

function layoutLinks(nodes, index, directIds) {
  const nodeById = new Map(nodes.map((node) => [node.person.id, node]));
  const links = [];
  const seenSpouses = new Set();
  const familyMap = new Map();

  for (const childNode of nodes) {
    const parentIds = [...(index.get(childNode.person.id)?.parents || [])].filter((id) => nodeById.has(id));
    if (!parentIds.length) continue;
    const key = parentIds.slice().sort().join("+");
    if (!familyMap.has(key)) familyMap.set(key, { parentIds, children: [] });
    familyMap.get(key).children.push(childNode);
  }

  for (const { parentIds, children } of familyMap.values()) {
    const parents = parentIds.map((id) => nodeById.get(id));
    const parentBottomY = Math.max(...parents.map((parent) => parent.y)) + NODE_HALF_HEIGHT;
    const parentCenter = parents.reduce((total, parent) => total + parent.x, 0) / parents.length;
    const direct = children.some((child) => directIds.has(child.person.id)) && parentIds.some((id) => directIds.has(id));

    if (parents.length > 1) {
      const [left, right] = [...parents].sort((a, b) => a.x - b.x);
      const spouseKey = [left.person.id, right.person.id].sort().join("+");
      if (!seenSpouses.has(spouseKey)) {
        seenSpouses.add(spouseKey);
        links.push({
          kind: "spouse-link",
          direct: directIds.has(left.person.id) && directIds.has(right.person.id),
          d: `M ${left.x + NODE_HALF_WIDTH} ${left.y} L ${right.x - NODE_HALF_WIDTH} ${right.y}`,
        });
      }
    }

    if (children.length === 1) {
      const childNode = children[0];
      const directChild = directIds.has(childNode.person.id) && parentIds.some((id) => directIds.has(id));
      const linkStartX = directChild && state.collapseCollateral
        ? directParentAnchorX(parentIds, childNode.person.id, nodeById, index, directIds, parentCenter)
        : parentCenter;
      links.push({
        kind: "family-link",
        direct: directChild,
        d: directChild && state.collapseCollateral
          ? directAncestorPath(linkStartX, parentBottomY, childNode.x, childNode.y - NODE_HALF_HEIGHT)
          : familyCurvePath(linkStartX, parentBottomY, childNode.x, childNode.y - NODE_HALF_HEIGHT),
      });
      continue;
    }

    const childrenByX = [...children].sort((a, b) => a.x - b.x);
    const childTopY = Math.min(...childrenByX.map((child) => child.y)) - NODE_HALF_HEIGHT;
    const busY = childTopY - 26;
    const minChildX = Math.min(...childrenByX.map((child) => child.x));
    const maxChildX = Math.max(...childrenByX.map((child) => child.x));

    links.push({
      kind: "family-link",
      direct,
      d: `M ${parentCenter} ${parentBottomY} L ${parentCenter} ${busY}`,
    });
    links.push({
      kind: "family-link",
      direct,
      d: `M ${minChildX} ${busY} L ${maxChildX} ${busY}`,
    });

    for (const childNode of childrenByX) {
      links.push({
        kind: "family-link",
        direct: directIds.has(childNode.person.id) && parentIds.some((id) => directIds.has(id)),
        d: `M ${childNode.x} ${busY} L ${childNode.x} ${childNode.y - NODE_HALF_HEIGHT}`,
      });
    }
  }

  for (const node of nodes) {
    for (const spouseId of index.get(node.person.id)?.spouses || []) {
      const spouse = nodeById.get(spouseId);
      if (!spouse || spouse.y !== node.y) continue;
      const spouseKey = [node.person.id, spouseId].sort().join("+");
      if (seenSpouses.has(spouseKey)) continue;
      seenSpouses.add(spouseKey);
      const [left, right] = [node, spouse].sort((a, b) => a.x - b.x);
      links.push({
        kind: "spouse-link",
        direct: directIds.has(left.person.id) && directIds.has(right.person.id),
        d: `M ${left.x + NODE_HALF_WIDTH} ${left.y} L ${right.x - NODE_HALF_WIDTH} ${right.y}`,
      });
    }
  }
  return links;
}

function directParentAnchorX(parentIds, childId, nodeById, index, directIds, fallbackX) {
  const directParentId = orderedParentIds(childId, index)
    .find((id) => parentIds.includes(id) && directIds.has(id) && nodeById.has(id));
  return directParentId ? nodeById.get(directParentId).x : fallbackX;
}

function directAncestorPath(startX, startY, endX, endY) {
  return `M ${startX} ${startY} L ${endX} ${endY}`;
}

function familyCurvePath(startX, startY, endX, endY) {
  const midY = (startY + endY) / 2;
  return `M ${startX} ${startY} C ${startX} ${midY}, ${endX} ${midY}, ${endX} ${endY}`;
}

function treeBounds(nodes) {
  if (!nodes.length) return { minX: 0, maxX: 0, minY: 0, maxY: 0, width: 0, height: 0 };
  const xs = nodes.map((node) => node.x);
  const ys = nodes.map((node) => node.y);
  const minX = Math.min(...xs) - NODE_HALF_WIDTH - 20;
  const maxX = Math.max(...xs) + NODE_HALF_WIDTH + 20;
  const minY = Math.min(...ys) - NODE_HALF_HEIGHT - 86;
  const maxY = Math.max(...ys) + NODE_HALF_HEIGHT + 20;
  return {
    minX,
    maxX,
    minY,
    maxY,
    width: maxX - minX,
    height: maxY - minY,
  };
}

function generationOffset(rootId, targetId, index) {
  if (rootId === targetId) return 0;
  const weighted = weightedDistance(rootId, targetId, index);
  if (weighted !== null) return weighted;
  return 1;
}

function weightedDistance(startId, targetId, index) {
  const queue = [{ id: startId, generation: 0 }];
  const seen = new Set();
  while (queue.length) {
    const current = queue.shift();
    if (current.id === targetId) return current.generation;
    if (seen.has(current.id)) continue;
    seen.add(current.id);
    const relations = index.get(current.id);
    for (const parentId of relations?.parents || []) queue.push({ id: parentId, generation: current.generation - 1 });
    for (const spouseId of relations?.spouses || []) queue.push({ id: spouseId, generation: current.generation });
    for (const childId of relations?.children || []) queue.push({ id: childId, generation: current.generation + 1 });
  }
  return null;
}

function relationshipIds(id, index) {
  const relations = index.get(id);
  return [...(relations?.parents || []), ...(relations?.spouses || []), ...(relations?.children || [])];
}

function selectPerson(id, reroot = true, openProfile = true) {
  state.selectedId = id;
  state.sourcesExpanded = false;
  if (openProfile) state.profileCollapsed = false;
  if (reroot) {
    state.rootId = id;
    resetExpandedAncestors();
    fitTree();
  }
  render();
}

function fitTree() {
  const index = relationshipIndex();
  const root = personById(state.rootId);
  const visibleIds = root && state.collapseCollateral ? expandedTreeIds(root.id, index) : null;
  const graph = root ? buildBranch(root.id, index, visibleIds) : [];
  const nodes = layoutNodes(graph, index);
  const bounds = treeBounds(nodes);
  const width = Math.max(els.viewport.clientWidth, 360);
  const height = Math.max(els.viewport.clientHeight, 520);
  const scaleX = width / Math.max(bounds.width + 48, 1);
  const scaleY = height / Math.max(bounds.height + 48, 1);
  state.scale = Math.min(1, Math.max(0.34, Math.min(scaleX, scaleY)));
  state.offsetX = (width - bounds.width * state.scale) / 2 - bounds.minX * state.scale;
  state.offsetY = (height - bounds.height * state.scale) / 2 - bounds.minY * state.scale;
  renderTree();
}

function fitTreeAfterLayout() {
  requestAnimationFrame(() => {
    requestAnimationFrame(fitTree);
  });
}

function onZoom(event) {
  event.preventDefault();
  const direction = event.deltaY > 0 ? -0.08 : 0.08;
  const nextScale = Math.min(1.8, Math.max(0.34, state.scale + direction));
  if (nextScale === state.scale) return;

  // Anchor the zoom to the cursor so the point under it stays put.
  const rect = els.viewport.getBoundingClientRect();
  const pointerX = event.clientX - rect.left;
  const pointerY = event.clientY - rect.top;
  const ratio = nextScale / state.scale;
  state.offsetX = pointerX - (pointerX - state.offsetX) * ratio;
  state.offsetY = pointerY - (pointerY - state.offsetY) * ratio;
  state.scale = nextScale;
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
  try {
    const text = await file.text();
    const data = JSON.parse(text);
    validateData(data);
    state.hasStoredData = storeData(data);
    adoptData(data);
    renderDataStatus(
      state.hasStoredData
        ? `Loaded ${data.people.length} people from ${file.name}. Saved in this browser only - nothing is uploaded.`
        : `Loaded ${data.people.length} people from ${file.name}. Could not save in this browser, so re-import next visit. Nothing was uploaded.`,
      "success",
    );
  } catch (error) {
    renderDataStatus(`Could not load ${file.name}: ${error.message}`, "error");
  } finally {
    event.target.value = "";
  }
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
        selectPerson(id, state.collapseCollateral, true);
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
  const born = person.birth?.date ? person.birth.date.slice(0, 4) : "";
  const died = person.death?.date ? person.death.date.slice(0, 4) : "";
  if (!born && !died) return "";
  return died ? `${born}-${died}` : `b. ${born}`;
}

function formatEvent(event) {
  if (!event) return "";
  return [event.date, event.place].filter(Boolean).join(" - ");
}

function namesForIds(ids = []) {
  return [...ids]
    .map((id) => personById(id)?.name)
    .filter(Boolean);
}

function formatNameList(names) {
  if (names.length <= 1) return names[0] || "";
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]}`;
}

function givenName(name = "") {
  return name.split(/\s+/).find(Boolean) || "They";
}

function splitParagraphs(value = "") {
  return String(value)
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
}

function shortNodeName(name = "") {
  const clean = String(name).replace(/\s+/g, " ").trim();
  return clean.length > 25 ? `${clean.slice(0, 24)}...` : clean;
}

function cssSafeId(value = "") {
  return String(value).replace(/[^a-zA-Z0-9_-]/g, "-");
}

function svgEl(name, attrs) {
  const el = document.createElementNS("http://www.w3.org/2000/svg", name);
  for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, value);
  return el;
}

function svgText(value, x, y, className, anchor = "middle") {
  const text = svgEl("text", { x, y, class: className, "text-anchor": anchor });
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
