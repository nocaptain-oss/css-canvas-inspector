import { encodeAnimatedWebp } from "./webp-anim.js?v=0.3.3";

const byId = (id) => document.getElementById(id);

function splitList(value) {
  return (value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function readUrlConfig() {
  const params = new URLSearchParams(location.search);
  return {
    src: params.get("src") || "",
    name: params.get("name") || "CSS Canvas Inspector",
    width: Number(params.get("width")) || 1280,
    height: Number(params.get("height")) || 1707,
    exportWidth: Number(params.get("exportWidth")) || 1280,
    dual: params.get("dual") === "1",
    variants: splitList(params.get("variants")),
    variantLabels: (params.get("variantLabels") || "")
      .split("|")
      .map((label) => label.trim()),
    variantParam: params.get("variantParam") || "variant",
    frameParam: params.get("frameParam") || "frame",
    frames: Number(params.get("frames")) || 0,
    rebuildSelectors: splitList(params.get("rebuild")),
    canvases: params.get("canvases") || "",
    storage: params.get("storage") || `css-canvas-inspector:${params.get("src") || "default"}`,
  };
}

export function createCanvasInspector(options) {
  const config = {
    width: 1280,
    height: 1707,
    exportWidth: 1280,
    dual: false,
    variants: [],
    variantLabels: [],
    variantParam: "variant",
    frameParam: "frame",
    frames: 0,
    rebuildSelectors: [],
    canvases: "",
    storage: "css-canvas-inspector",
    ...options,
  };

  const slots = [
    {
      index: 0,
      iframe: byId("coverFrame"),
      stage: byId("stage0"),
      slot: byId("slot0"),
      label: byId("stageLabel0"),
      doc: null,
      variant: "",
      pendingSelect: "",
    },
    {
      index: 1,
      iframe: byId("compareFrame"),
      stage: byId("stage1"),
      slot: byId("slot1"),
      label: byId("stageLabel1"),
      doc: null,
      variant: "",
      pendingSelect: "",
    },
  ];

  const stageSpace = byId("stageSpace");
  const stageRow = byId("stageRow");
  const frameSelect = byId("frameSelect");
  const frameControl = byId("frameControl");
  const variantSwitch = byId("variantSwitch");
  const canvasModeSwitch = byId("canvasModeSwitch");
  const zoomLabel = byId("zoomLabel");
  const zoomRange = byId("zoomRange");
  const canvasHint = byId("canvasHint");
  const loadError = byId("loadError");
  const loadErrorText = byId("loadErrorText");
  const selectionName = byId("selectionName");
  const selectionPath = byId("selectionPath");
  const activeCanvasSelect = byId("activeCanvasSelect");
  const elementSelect = byId("elementSelect");
  const inspectorFields = byId("inspectorFields");
  const resetSelected = byId("resetSelected");
  const deleteSelectedButton = byId("deleteSelected");
  const pageControl = byId("pageControl");
  const pageSelect = byId("pageSelect");
  const textSection = byId("textSection");
  const textNodeField = byId("textNodeField");
  const textNodeSelect = byId("textNodeSelect");
  const textValue = byId("textValue");
  const textHint = byId("textHint");
  const positionHint = byId("positionHint");
  const undoButton = byId("undoButton");
  const redoButton = byId("redoButton");
  const downloadCanvasButton = byId("downloadCanvas");

  const selectedClass = "__canvas_inspector_selected";
  const hoverClass = "__canvas_inspector_hover";
  const histories = new Map();
  const dualAvailable = config.variants.length > 1;

  let currentVariant = config.variants[0] || "";
  let currentFrame = 0;
  let dualMode = dualAvailable && Boolean(config.dual);
  let zoomMode = "fit";
  let zoomPercent = 100;
  let activeIndex = 0;
  let selected = null;
  let selectedPath = "";
  let selectedTextIndex = 0;
  let editableTextNodes = [];
  let positionMode = "relative";
  let sourceDocument = null;
  let sourceFrame = slots[0].iframe;
  let canvasNodes = [];
  let currentCanvasIndex = 0;
  let activeWidth = config.width;
  let activeHeight = config.height;
  let canvasesMode = false;
  let overrides = {};
  let editSession = null;
  let loadToken = 0;

  function variantForSlot(index) {
    if (!dualAvailable) return index === 0 ? currentVariant : "";
    return config.variants[index] || config.variants[0] || "";
  }

  function storageKey(variant = currentVariant) {
    return `${config.storage}:${variant || "default"}`;
  }

  function loadOverridesFor(variant) {
    try {
      return JSON.parse(localStorage.getItem(storageKey(variant)) || "{}");
    } catch {
      return {};
    }
  }

  function saveOverrides() {
    const data = JSON.stringify(overrides);
    if (data === "{}") localStorage.removeItem(storageKey());
    else localStorage.setItem(storageKey(), data);
    byId("applyStatus").textContent = `已保存 · ${new Date().toLocaleTimeString()}`;
  }

  function historyFor(variant = currentVariant) {
    const key = variant || "default";
    if (!histories.has(key)) histories.set(key, { undo: [], redo: [] });
    return histories.get(key);
  }

  function updateHistoryButtons() {
    const history = historyFor();
    undoButton.disabled = history.undo.length === 0;
    redoButton.disabled = history.redo.length === 0;
  }

  function mutateOverrides(mutator) {
    const before = JSON.stringify(overrides);
    mutator();
    const after = JSON.stringify(overrides);
    if (before === after) return false;

    const history = historyFor();
    const snapshot = editSession?.snapshot || before;
    if (!editSession?.recorded && history.undo.at(-1) !== snapshot) {
      history.undo.push(snapshot);
      if (history.undo.length > 100) history.undo.shift();
    }
    if (editSession) editSession.recorded = true;
    history.redo = [];
    saveOverrides();
    updateHistoryButtons();
    return true;
  }

  function sourceUrlForSlot(index) {
    const url = new URL(config.src, document.baseURI);
    const variant = variantForSlot(index);
    if (variant) url.searchParams.set(config.variantParam, variant);
    if (config.frames > 0) url.searchParams.set(config.frameParam, String(currentFrame));
    return url;
  }

  function elementPath(element, doc) {
    const parts = [];
    let node = element;
    while (node && node !== doc.body) {
      const parent = node.parentElement;
      if (!parent) break;
      const index = Array.from(parent.children).indexOf(node) + 1;
      parts.unshift(`${node.tagName.toLowerCase()}:nth-child(${index})`);
      node = parent;
    }
    return parts.join(" > ");
  }

  function elementLabel(element) {
    const classes = Array.from(element.classList)
      .filter((name) => !name.startsWith("__canvas_inspector_"))
      .slice(0, 2)
      .map((name) => `.${name}`)
      .join("");
    return `${element.tagName.toLowerCase()}${classes}`;
  }

  function px(value) {
    return Number.parseFloat(value) || 0;
  }

  function round(value) {
    return Math.round(value * 10) / 10;
  }

  function rgbToHex(value) {
    const match = value.match(/rgba?\((\d+)[,\s]+(\d+)[,\s]+(\d+)/);
    if (!match) return "#000000";
    return `#${match
      .slice(1, 4)
      .map((part) => Number(part).toString(16).padStart(2, "0"))
      .join("")}`;
  }

  function setInput(id, value) {
    byId(id).value = value;
  }

  function directTextNodes(element) {
    if (!element) return [];
    return Array.from(element.childNodes).filter(
      (node) => node.nodeType === 3 && node.data.trim() !== "",
    );
  }

  function injectEditorStyle(doc) {
    if (doc.querySelector("#__canvas_inspector_style")) return;
    const style = doc.createElement("style");
    style.id = "__canvas_inspector_style";
    style.textContent = `
      .${hoverClass} { outline: 1px dashed rgba(239,85,60,.65) !important; outline-offset: 1px !important; }
      .${selectedClass} { outline: 2px solid #ef553c !important; outline-offset: 2px !important; }
    `;
    doc.head.appendChild(style);
  }

  function applyOverrides(doc, variant) {
    const changes = loadOverridesFor(variant);
    Object.entries(changes).forEach(([path, change]) => {
      const element = doc.body.querySelector(path);
      if (!element) return;
      if (change.deleted) {
        element.remove();
        return;
      }
      Object.entries(change.styles || {}).forEach(([property, value]) => {
        element.style.setProperty(property, value);
      });

      const nodes = directTextNodes(element);
      Object.entries(change.textNodes || {}).forEach(([index, text]) => {
        const node = nodes[Number(index)];
        if (node) node.data = text;
      });
      if (typeof change.text === "string" && element.children.length === 0) {
        element.textContent = change.text;
      }
    });
  }

  function clearSelectionClasses() {
    slots.forEach((slot) => {
      slot.doc
        ?.querySelectorAll(`.${selectedClass}, .${hoverClass}`)
        .forEach((node) => node.classList.remove(selectedClass, hoverClass));
    });
  }

  function setSelectedClasses(element) {
    clearSelectionClasses();
    if (element) element.classList.add(selectedClass);
  }

  function setModeButtons(mode) {
    positionMode = mode;
    document.querySelectorAll("[data-position-mode]").forEach((button) => {
      button.classList.toggle("active", button.dataset.positionMode === mode);
    });
    positionHint.textContent =
      mode === "absolute"
        ? "X / Y 以作品左上角为 0,0，并切换为绝对定位。"
        : "X / Y 是相对原位置的微调，不会打乱其他元素。";
  }

  function setInspectorEnabled(enabled) {
    inspectorFields.disabled = !enabled;
    resetSelected.disabled = !enabled;
    deleteSelectedButton.disabled = !enabled;
  }

  function clearInspector() {
    selected = null;
    selectedPath = "";
    editableTextNodes = [];
    selectedTextIndex = 0;
    setSelectedClasses(null);
    selectionName.textContent = "未选择";
    selectionPath.textContent = "点击画布或从上方选择元素";
    elementSelect.value = "";
    textSection.hidden = true;
    textNodeField.hidden = true;
    textNodeSelect.replaceChildren();
    textValue.value = "";
    textValue.disabled = true;
    textHint.hidden = true;
    setModeButtons("relative");
    setInspectorEnabled(false);
    byId("applyStatus").textContent = "选中元素后可编辑。";
  }

  function renderTextEditor(element, change) {
    textSection.hidden = false;
    editableTextNodes = directTextNodes(element);
    selectedTextIndex = 0;

    if (editableTextNodes.length === 0) {
      textNodeField.hidden = true;
      textValue.value = "";
      textValue.disabled = true;
      textHint.hidden = false;
      return;
    }

    textHint.hidden = true;
    textValue.disabled = false;
    textNodeSelect.replaceChildren();
    editableTextNodes.forEach((node, index) => {
      const option = document.createElement("option");
      option.value = String(index);
      const preview = node.data.trim().replace(/\s+/g, " ").slice(0, 28);
      option.textContent = `${index + 1}. ${preview || "空白"}`;
      textNodeSelect.appendChild(option);
    });
    textNodeField.hidden = editableTextNodes.length <= 1;
    const stored = change.textNodes?.[0];
    textValue.value = typeof stored === "string" ? stored : editableTextNodes[0].data;
  }

  function refreshElementSelect() {
    elementSelect.replaceChildren();
    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = sourceDocument ? "选择画布元素…" : "画布尚未加载";
    elementSelect.appendChild(placeholder);
    if (!sourceDocument) return;

    Array.from(sourceDocument.body.querySelectorAll("*"))
      .filter((element) => {
        if (element.matches("script, style, template, path, defs, br, i")) return false;
        if (canvasesMode && !canvasNodes[currentCanvasIndex]?.contains(element)) return false;
        const style = element.ownerDocument.defaultView.getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        if (
          style.display === "none" ||
          style.visibility === "hidden" ||
          Number(style.opacity) === 0 ||
          rect.width < 1 ||
          rect.height < 1
        ) {
          return false;
        }
        return (
          Boolean(element.id) ||
          element.classList.length > 0 ||
          directTextNodes(element).length > 0
        );
      })
      .slice(0, 250)
      .forEach((element) => {
        const option = document.createElement("option");
        option.value = elementPath(element, sourceDocument);
        const text = directTextNodes(element)
          .map((node) => node.data)
          .join(" ")
          .trim()
          .replace(/\s+/g, " ")
          .slice(0, 28);
        option.textContent = `${elementLabel(element)}${text ? ` — ${text}` : ""}`;
        elementSelect.appendChild(option);
      });

    elementSelect.value = selectedPath;
  }

  function select(element) {
    if (
      !element ||
      element === sourceDocument?.documentElement ||
      element === sourceDocument?.body
    ) {
      return;
    }

    setSelectedClasses(element);
    selected = element;
    selectedPath = elementPath(element, sourceDocument);
    const style = element.ownerDocument.defaultView.getComputedStyle(element);
    const change = overrides[selectedPath] || {};
    const inlineAbsolute =
      element.style.position === "absolute" && Boolean(element.style.left || element.style.top);
    setModeButtons(change.mode || (inlineAbsolute ? "absolute" : "relative"));
    setInspectorEnabled(true);

    selectionName.textContent = elementLabel(element);
    selectionPath.textContent = selectedPath;
    elementSelect.value = selectedPath;
    renderTextEditor(element, change);

    if (positionMode === "absolute") {
      const rect = element.getBoundingClientRect();
      setInput("xValue", Math.round(rect.left));
      setInput("yValue", Math.round(rect.top));
    } else {
      const translate = change.styles?.translate || element.style.translate || "0px 0px";
      const [x = "0px", y = "0px"] = translate.split(/\s+/);
      setInput("xValue", px(x));
      setInput("yValue", px(y));
    }

    setInput("widthValue", Math.round(px(style.width)));
    setInput("heightValue", Math.round(px(style.height)));
    setInput("zIndex", style.zIndex === "auto" ? "" : style.zIndex);
    setInput("fontSize", px(style.fontSize));
    setInput("fontWeight", style.fontWeight);
    setInput("lineHeight", Math.round(px(style.lineHeight)));
    setInput("letterSpacing", round(px(style.letterSpacing)));
    byId("colorValue").value = rgbToHex(style.color);
    const align = ["left", "center", "right"].includes(style.textAlign)
      ? style.textAlign
      : "left";
    byId("textAlign").value = align;

    ["Top", "Right", "Bottom", "Left"].forEach((side) => {
      setInput(`margin${side}`, Math.round(px(style[`margin${side}`])));
      setInput(`padding${side}`, Math.round(px(style[`padding${side}`])));
    });
    byId("advancedCss").value = "";
    byId("applyStatus").textContent = "修改自动保存在本浏览器。";
  }

  function setStyle(property, value) {
    if (!selected) return;
    const changed = mutateOverrides(() => {
      if (value === "") selected.style.removeProperty(property);
      else selected.style.setProperty(property, value);

      overrides[selectedPath] ||= {};
      overrides[selectedPath].styles ||= {};
      if (value === "") delete overrides[selectedPath].styles[property];
      else overrides[selectedPath].styles[property] = value;
    });
    return changed;
  }

  function setAbsolutePosition(x, y) {
    if (!selected || positionMode !== "absolute") return;
    mutateOverrides(() => {
      selected.style.setProperty("position", "absolute");
      selected.style.removeProperty("translate");
      const parent = selected.offsetParent || sourceDocument.body;
      const parentRect = parent.getBoundingClientRect();
      const style = sourceDocument.defaultView.getComputedStyle(selected);
      const left = x - (parentRect.left + parent.clientLeft) - px(style.marginLeft);
      const top = y - (parentRect.top + parent.clientTop) - px(style.marginTop);
      selected.style.setProperty("left", `${left}px`);
      selected.style.setProperty("top", `${top}px`);

      overrides[selectedPath] ||= {};
      overrides[selectedPath].mode = "absolute";
      overrides[selectedPath].styles ||= {};
      delete overrides[selectedPath].styles.translate;
      Object.assign(overrides[selectedPath].styles, {
        position: "absolute",
        left: `${left}px`,
        top: `${top}px`,
      });
    });
  }

  function setTranslate(x, y) {
    const value = x === 0 && y === 0 ? "" : `${x}px ${y}px`;
    setStyle("translate", value);
  }

  function switchPositionMode(mode) {
    if (!selected) return;
    setModeButtons(mode);
    mutateOverrides(() => {
      overrides[selectedPath] ||= {};
      overrides[selectedPath].mode = mode;
    });

    if (mode === "absolute") {
      const rect = selected.getBoundingClientRect();
      setInput("xValue", Math.round(rect.left));
      setInput("yValue", Math.round(rect.top));
      setAbsolutePosition(rect.left, rect.top);
      return;
    }

    mutateOverrides(() => {
      ["position", "left", "top"].forEach((property) => {
        selected.style.removeProperty(property);
        if (overrides[selectedPath].styles) {
          delete overrides[selectedPath].styles[property];
        }
      });
    });
    const translate = overrides[selectedPath].styles?.translate || "";
    const [x = "0px", y = "0px"] = translate.split(/\s+/);
    setInput("xValue", px(x));
    setInput("yValue", px(y));
  }

  function bindNumber(id, property, unit = "px") {
    const input = byId(id);
    input.addEventListener("input", (event) => {
      const value = event.target.value.trim();
      if (value === "" || value === "-" || value === ".") return;
      setStyle(property, `${value}${unit}`);
    });
  }

  function activateFrame(index) {
    if (index === 1 && !dualMode) return;
    const record = slots[index];
    if (!record) return;
    activeIndex = index;
    currentVariant = variantForSlot(index);
    sourceFrame = record.iframe;
    sourceDocument = record.doc;
    overrides = loadOverridesFor(currentVariant);

    slots.forEach((slot) => slot.slot.classList.toggle("active", slot.index === index));
    activeCanvasSelect.value = String(index);
    clearInspector();
    refreshElementSelect();
    updateHistoryButtons();

    const label = config.variantLabels[index] || (currentVariant ? currentVariant.toUpperCase() : "");
    canvasHint.textContent = dualMode
      ? `当前编辑画布 ${index + 1}${label ? ` · ${label}` : ""}；点击另一画布可切换`
      : "点击画布中的文字或图形进行选择";
  }

  function canvasNodeLabel(node, index) {
    const id = node.id ? `#${node.id}` : "";
    return `页 ${index + 1} · ${node.tagName.toLowerCase()}${id}`;
  }

  function injectCanvasesFillStyle(doc) {
    if (!config.canvases) return;
    if (doc.querySelector("#__canvas_inspector_canvases_style")) return;
    const style = doc.createElement("style");
    style.id = "__canvas_inspector_canvases_style";
    style.textContent = `
      html, body { margin: 0 !important; padding: 0 !important; overflow: hidden !important; }
      body > * { margin: 0 !important; padding: 0 !important; gap: 0 !important; }
    `;
    doc.head.appendChild(style);
  }

  function initCanvasNodes(doc) {
    const previousIndex = currentCanvasIndex;
    canvasNodes = [];
    currentCanvasIndex = 0;
    if (!config.canvases) {
      canvasesMode = false;
      pageControl.hidden = true;
      activeWidth = config.width;
      activeHeight = config.height;
      return;
    }
    canvasNodes = Array.from(doc.body.querySelectorAll(config.canvases));
    canvasesMode = canvasNodes.length > 0;
    pageControl.hidden = !canvasesMode;
    if (!canvasesMode) {
      activeWidth = config.width;
      activeHeight = config.height;
      return;
    }
    injectCanvasesFillStyle(doc);
    pageSelect.replaceChildren();
    canvasNodes.forEach((node, index) => {
      const option = document.createElement("option");
      option.value = String(index);
      option.textContent = canvasNodeLabel(node, index);
      pageSelect.appendChild(option);
    });
    showCanvasNode(
      previousIndex < canvasNodes.length ? previousIndex : 0,
      doc,
    );
  }

  function showCanvasNode(index, doc = sourceDocument) {
    if (!canvasesMode || !doc) return;
    if (index >= canvasNodes.length) index = Math.max(0, canvasNodes.length - 1);
    currentCanvasIndex = index;
    canvasNodes.forEach((node, idx) => {
      node.style.display = idx === index ? "" : "none";
    });
    const node = canvasNodes[index];
    activeWidth = Math.max(1, Math.round(node.offsetWidth || config.width));
    activeHeight = Math.max(1, Math.round(node.offsetHeight || config.height));
    pageSelect.value = String(index);
    byId("toolMeta").textContent = `${activeWidth} × ${activeHeight} · ${canvasNodes.length} 页`;
    document.documentElement.style.setProperty("--canvas-width", `${activeWidth}px`);
    document.documentElement.style.setProperty("--canvas-height", `${activeHeight}px`);
    clearInspector();
    refreshElementSelect();
    zoomMode = "fit";
    updateScale();
    canvasHint.textContent = `画布页 ${index + 1} / ${canvasNodes.length} · 点击文字或图形进行选择`;
  }

  function deleteSelected() {
    if (!selected || !selectedPath) return;
    if (canvasesMode && canvasNodes.includes(selected)) {
      byId("applyStatus").textContent = "画布容器本身不可删除，请选择画布内的元素。";
      return;
    }
    const path = selectedPath;
    const element = selected;
    editSession = null;
    mutateOverrides(() => {
      overrides[path] ||= {};
      overrides[path].deleted = true;
      element.remove();
    });
    clearInspector();
    refreshElementSelect();
    byId("applyStatus").textContent = "元素已删除（Ctrl/Cmd+Z 撤销，重置此元素可恢复）。";
  }

  function showLoadError(message) {
    loadErrorText.textContent = message;
    loadError.hidden = false;
    downloadCanvasButton.disabled = true;
    byId("downloadHtml").disabled = true;
    byId("resetAll").disabled = true;
  }

  async function validateUrl(url) {
    try {
      const response = await fetch(url, { cache: "no-store" });
      if (!response.ok) return `加载失败：HTTP ${response.status}`;
      return "";
    } catch (error) {
      return `加载失败：${error.message}`;
    }
  }

  async function reloadFrame(record, pathToSelect = "") {
    record.pendingSelect = pathToSelect;
    record.variant = variantForSlot(record.index);
    const url = sourceUrlForSlot(record.index);
    const error = await validateUrl(url);
    if (error) {
      showLoadError(`${error} · ${url.pathname}`);
      return false;
    }
    loadError.hidden = true;
    record.iframe.src = url.href;
    return true;
  }

  async function reloadVisibleFrames() {
    const token = ++loadToken;
    const visible = dualMode ? slots : [slots[0]];
    zoomLabel.textContent = "LOADING";
    const errors = await Promise.all(
      visible.map(async (record) => {
        record.variant = variantForSlot(record.index);
        return validateUrl(sourceUrlForSlot(record.index));
      }),
    );
    if (token !== loadToken) return;
    const firstError = errors.find(Boolean);
    if (firstError) {
      showLoadError(firstError);
      zoomLabel.textContent = "ERROR";
      return;
    }

    loadError.hidden = true;
    downloadCanvasButton.disabled = false;
    byId("downloadHtml").disabled = false;
    byId("resetAll").disabled = false;
    visible.forEach((record) => {
      record.iframe.src = sourceUrlForSlot(record.index).href;
    });
  }

  function fitScale() {
    const rect = stageSpace.getBoundingClientRect();
    const horizontal = dualMode
      ? (rect.width - 88) / 2
      : Math.max(1, rect.width - 64);
    const vertical = Math.max(1, rect.height - 62);
    return Math.max(
      0.05,
      Math.min(horizontal / activeWidth, vertical / activeHeight),
    );
  }

  function updateScale(preserveCenter = false) {
    const previousWidth = Math.max(1, stageSpace.scrollWidth);
    const previousHeight = Math.max(1, stageSpace.scrollHeight);
    const centerX = (stageSpace.scrollLeft + stageSpace.clientWidth / 2) / previousWidth;
    const centerY = (stageSpace.scrollTop + stageSpace.clientHeight / 2) / previousHeight;
    const visible = dualMode ? slots : [slots[0]];
    const scale = zoomMode === "fit" ? fitScale() : zoomPercent / 100;

    visible.forEach((record) => {
      record.stage.style.width = `${activeWidth * scale}px`;
      record.stage.style.height = `${activeHeight * scale}px`;
      record.iframe.style.transform = `scale(${scale})`;
    });
    const percent = Math.round(scale * 100);
    zoomRange.value = String(Math.min(300, Math.max(5, percent)));
    zoomLabel.textContent = zoomMode === "fit" ? `FIT ${percent}%` : `${percent}%`;

    if (preserveCenter) {
      requestAnimationFrame(() => {
        stageSpace.scrollLeft =
          centerX * stageSpace.scrollWidth - stageSpace.clientWidth / 2;
        stageSpace.scrollTop =
          centerY * stageSpace.scrollHeight - stageSpace.clientHeight / 2;
      });
    }
  }

  function setZoom(percent, mode = "custom") {
    zoomMode = mode;
    zoomPercent = Math.min(300, Math.max(5, percent));
    updateScale(true);
  }

  function updateCanvasControls() {
    document.body.classList.toggle("dual-canvas", dualMode);
    slots[1].slot.hidden = !dualMode;
    canvasModeSwitch.hidden = !dualAvailable;
    variantSwitch.hidden = dualMode || config.variants.length < 2;
    document.querySelectorAll("[data-canvas-mode]").forEach((button) => {
      button.classList.toggle("active", (button.dataset.canvasMode === "dual") === dualMode);
    });

    activeCanvasSelect.replaceChildren();
    slots.forEach((record) => {
      if (record.index === 1 && !dualMode) return;
      const option = document.createElement("option");
      option.value = String(record.index);
      const label =
        config.variantLabels[record.index] ||
        (config.variants[record.index] ? config.variants[record.index].toUpperCase() : "");
      option.textContent = `画布 ${record.index + 1}${label ? ` · ${label}` : ""}`;
      activeCanvasSelect.appendChild(option);
    });
    activeCanvasSelect.value = String(activeIndex);

    slots.forEach((record) => {
      const label =
        config.variantLabels[record.index] ||
        (config.variants[record.index] ? config.variants[record.index].toUpperCase() : "");
      record.label.textContent = label || `画布 ${record.index + 1}`;
    });
  }

  function setupToolbar() {
    byId("toolName").textContent = config.name || "CSS Canvas Inspector";
    byId("toolMeta").textContent = `${config.width} × ${config.height} · CSS`;
    byId("exportWidth").value = String(config.exportWidth || 1280);
    const syncExportFields = () => {
      const animated = byId("exportFormat").value === "webp" && config.frames > 1;
      byId("frameTimingField").hidden = !animated;
      byId("frameHoldField").hidden = !animated;
    };
    byId("exportFormat").addEventListener("change", syncExportFields);
    syncExportFields();
    document.documentElement.style.setProperty("--canvas-width", `${config.width}px`);
    document.documentElement.style.setProperty("--canvas-height", `${config.height}px`);

    if (config.variants.length > 1) {
      variantSwitch.hidden = false;
      config.variants.forEach((variant, index) => {
        const button = document.createElement("button");
        button.type = "button";
        button.dataset.variant = variant;
        button.classList.toggle("active", variant === currentVariant);
        button.textContent = config.variantLabels[index] || variant.toUpperCase();
        button.addEventListener("click", () => {
          if (dualMode) {
            const target = config.variants.indexOf(variant);
            if (target >= 0 && target < 2) activateFrame(target);
            return;
          }
          currentVariant = variant;
          activeIndex = 0;
          variantSwitch.querySelectorAll("button").forEach((item) => {
            item.classList.toggle("active", item === button);
          });
          activateFrame(0);
          reloadVisibleFrames();
        });
        variantSwitch.appendChild(button);
      });
    }

    canvasModeSwitch.hidden = !dualAvailable;
    document.querySelectorAll("[data-canvas-mode]").forEach((button) => {
      button.addEventListener("click", () => {
        dualMode = button.dataset.canvasMode === "dual";
        zoomMode = "fit";
        activeIndex = dualMode ? Math.max(0, config.variants.indexOf(currentVariant)) : 0;
        if (activeIndex > 1) activeIndex = 0;
        currentVariant = variantForSlot(activeIndex);
        activateFrame(activeIndex);
        updateCanvasControls();
        updateScale();
        reloadVisibleFrames();
      });
    });

    if (config.frames > 1) {
      frameControl.hidden = false;
      for (let index = 0; index < config.frames; index += 1) {
        const option = document.createElement("option");
        option.value = String(index);
        option.textContent = `${index + 1} / ${config.frames}`;
        frameSelect.appendChild(option);
      }
      frameSelect.addEventListener("change", () => {
        currentFrame = Number(frameSelect.value);
        reloadVisibleFrames();
      });
    }
  }

  function beginEditSession() {
    if (!editSession) {
      editSession = { snapshot: JSON.stringify(overrides), recorded: false };
    }
  }

  function bindInspector() {
    inspectorFields.addEventListener("focusin", (event) => {
      if (event.target.matches("input, select, textarea")) beginEditSession();
    });
    inspectorFields.addEventListener("focusout", (event) => {
      if (event.target.matches("input, select, textarea")) editSession = null;
    });

    document.querySelectorAll("[data-position-mode]").forEach((button) => {
      button.addEventListener("click", () => {
        if (selected) switchPositionMode(button.dataset.positionMode);
      });
    });

    const xInput = byId("xValue");
    const yInput = byId("yValue");
    const updatePosition = () => {
      if (!selected) return;
      if (xInput.value.trim() === "" || yInput.value.trim() === "") return;
      const x = xInput.value === "" ? 0 : Number(xInput.value);
      const y = yInput.value === "" ? 0 : Number(yInput.value);
      if (!Number.isFinite(x) || !Number.isFinite(y)) return;
      if (positionMode === "absolute") setAbsolutePosition(x, y);
      else setTranslate(x, y);
    };
    xInput.addEventListener("input", updatePosition);
    yInput.addEventListener("input", updatePosition);

    bindNumber("widthValue", "width");
    bindNumber("heightValue", "height");
    bindNumber("zIndex", "z-index", "");
    bindNumber("fontSize", "font-size");
    bindNumber("fontWeight", "font-weight", "");
    bindNumber("lineHeight", "line-height");
    bindNumber("letterSpacing", "letter-spacing");
    bindNumber("marginTop", "margin-top");
    bindNumber("marginRight", "margin-right");
    bindNumber("marginBottom", "margin-bottom");
    bindNumber("marginLeft", "margin-left");
    bindNumber("paddingTop", "padding-top");
    bindNumber("paddingRight", "padding-right");
    bindNumber("paddingBottom", "padding-bottom");
    bindNumber("paddingLeft", "padding-left");

    byId("colorValue").addEventListener("input", (event) => {
      setStyle("color", event.target.value);
    });
    byId("textAlign").addEventListener("change", (event) => {
      setStyle("text-align", event.target.value);
    });

    textNodeSelect.addEventListener("change", () => {
      selectedTextIndex = Number(textNodeSelect.value) || 0;
      const node = editableTextNodes[selectedTextIndex];
      textValue.value = node?.data || "";
    });

    textValue.addEventListener("input", () => {
      if (!selected || editableTextNodes.length === 0) return;
      const node = editableTextNodes[selectedTextIndex];
      if (!node) return;
      const text = textValue.value;
      mutateOverrides(() => {
        node.data = text;
        overrides[selectedPath] ||= {};
        overrides[selectedPath].textNodes ||= {};
        overrides[selectedPath].textNodes[selectedTextIndex] = text;
      });
    });

    elementSelect.addEventListener("change", () => {
      const path = elementSelect.value;
      const target = path ? sourceDocument?.body.querySelector(path) : null;
      if (target) select(target);
      else clearInspector();
    });

    activeCanvasSelect.addEventListener("change", () => {
      activateFrame(Number(activeCanvasSelect.value));
    });

    pageSelect.addEventListener("change", () => {
      showCanvasNode(Number(pageSelect.value) || 0);
    });

    deleteSelectedButton.addEventListener("click", deleteSelected);

    byId("applyCss").addEventListener("click", () => {
      if (!selected) return;
      beginEditSession();
      const parsed = sourceDocument.createElement("div");
      parsed.style.cssText = byId("advancedCss").value;
      Array.from(parsed.style).forEach((property) => {
        setStyle(property, parsed.style.getPropertyValue(property));
      });
      editSession = null;
      byId("applyStatus").textContent = "高级 CSS 已应用。";
    });

    resetSelected.addEventListener("click", () => {
      if (!selectedPath) return;
      const path = selectedPath;
      editSession = null;
      mutateOverrides(() => {
        delete overrides[path];
      });
      clearInspector();
      reloadFrame(slots[activeIndex], path);
    });

    byId("resetAll").addEventListener("click", () => {
      const suffix = currentVariant ? ` ${currentVariant.toUpperCase()}` : "";
      if (!confirm(`重置当前方案${suffix}的全部修改？`)) return;
      editSession = null;
      mutateOverrides(() => {
        overrides = {};
      });
      clearInspector();
      reloadVisibleFrames();
    });

    function undo() {
      const history = historyFor();
      if (history.undo.length === 0) return;
      const path = selectedPath;
      history.redo.push(JSON.stringify(overrides));
      overrides = JSON.parse(history.undo.pop());
      saveOverrides();
      clearInspector();
      updateHistoryButtons();
      reloadFrame(slots[activeIndex], path);
    }

    function redo() {
      const history = historyFor();
      if (history.redo.length === 0) return;
      const path = selectedPath;
      history.undo.push(JSON.stringify(overrides));
      overrides = JSON.parse(history.redo.pop());
      saveOverrides();
      clearInspector();
      updateHistoryButtons();
      reloadFrame(slots[activeIndex], path);
    }

    undoButton.addEventListener("click", undo);
    redoButton.addEventListener("click", redo);
    addEventListener("keydown", (event) => {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "z") return;
      if (event.target.matches("input, textarea, select")) return;
      event.preventDefault();
      if (event.shiftKey) redo();
      else undo();
    });

    byId("downloadHtml").addEventListener("click", async () => {
      if (!sourceDocument) return;
      const clone = sourceDocument.documentElement.cloneNode(true);
      clone
        .querySelectorAll(`.${selectedClass}, .${hoverClass}`)
        .forEach((node) => node.classList.remove(selectedClass, hoverClass));
      clone.querySelector("#__canvas_inspector_style")?.remove();
      clone.querySelector("#__canvas_inspector_canvases_style")?.remove();

      config.rebuildSelectors.forEach((selector) => {
        clone.querySelectorAll(selector).forEach((node) => node.replaceChildren());
      });
      if (canvasesMode && config.canvases) {
        clone
          .querySelectorAll(config.canvases)
          .forEach((node) => node.style.removeProperty("display"));
      }
      if (currentVariant) {
        clone
          .querySelector("body")
          ?.setAttribute(`data-${config.variantParam}`, currentVariant);
      }

      const documentUrl = sourceFrame.contentWindow.location.href;
      for (const link of Array.from(clone.querySelectorAll('link[rel~="stylesheet"][href]'))) {
        try {
          const assetUrl = new URL(link.getAttribute("href"), documentUrl);
          const content = await fetch(assetUrl).then((response) => response.text());
          const style = sourceDocument.createElement("style");
          style.textContent = content;
          link.replaceWith(style);
        } catch {
          // Leave cross-origin styles linked.
        }
      }
      for (const script of Array.from(clone.querySelectorAll("script[src]"))) {
        try {
          const assetUrl = new URL(script.getAttribute("src"), documentUrl);
          const content = await fetch(assetUrl).then((response) => response.text());
          const inlineScript = sourceDocument.createElement("script");
          if (script.type) inlineScript.type = script.type;
          inlineScript.textContent = content;
          script.replaceWith(inlineScript);
        } catch {
          // Leave cross-origin scripts linked.
        }
      }

      const html = `<!doctype html>\n${clone.outerHTML}`;
      const blobUrl = URL.createObjectURL(
        new Blob([html], { type: "text/html;charset=utf-8" }),
      );
      const link = document.createElement("a");
      link.href = blobUrl;
      link.download = `${fileSlug()}-${currentVariant || "edited"}${canvasesMode ? `-full-deck` : ""}.html`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
    });

    byId("zoomOut").addEventListener("click", () => setZoom((zoomMode === "fit" ? fitScale() * 100 : zoomPercent) - 10));
    byId("zoomIn").addEventListener("click", () => setZoom((zoomMode === "fit" ? fitScale() * 100 : zoomPercent) + 10));
    byId("zoomFit").addEventListener("click", () => {
      zoomMode = "fit";
      updateScale();
      stageSpace.scrollTo({ left: 0, top: 0 });
    });
    byId("zoomActual").addEventListener("click", () => setZoom(100));
    zoomRange.addEventListener("input", () => setZoom(Number(zoomRange.value)));
    stageSpace.addEventListener(
      "wheel",
      (event) => {
        if (!(event.ctrlKey || event.metaKey)) return;
        event.preventDefault();
        const current = zoomMode === "fit" ? fitScale() * 100 : zoomPercent;
        setZoom(current + (event.deltaY < 0 ? 5 : -5));
      },
      { passive: false },
    );

    function exportCaptureTarget() {
      if (canvasesMode) return canvasNodes[currentCanvasIndex];
      const body = sourceDocument.body;
      const visibleChildren = Array.from(body.children).filter(
        (node) => node.tagName !== "SCRIPT" && node.tagName !== "STYLE",
      );
      if (visibleChildren.length === 1) return visibleChildren[0];
      return body;
    }

    async function withCaptureStyle(target, run) {
      const style = sourceDocument.createElement("style");
      style.id = "__canvas_inspector_capture_style";
      style.textContent = cssTextForDocument(sourceDocument);
      sourceDocument.head.appendChild(style);
      const restores = [target, ...target.querySelectorAll("*")].map(useRenderableBackground);
      try {
        return await run();
      } finally {
        restores.forEach((restore) => restore());
        style.remove();
      }
    }

    async function renderExportCanvas(target, captureWidth, captureHeight, requestedWidth, background) {
      const scale = requestedWidth / captureWidth;
      const rendered = await window.html2canvas(target, {
          backgroundColor: background,
          width: captureWidth,
          height: captureHeight,
          windowWidth: captureWidth,
          windowHeight: captureHeight,
          scrollX: 0,
          scrollY: 0,
          scale,
          useCORS: true,
          logging: false,
          onclone: (clonedDocument) => {
            const base = clonedDocument.createElement("base");
            base.href = sourceFrame.contentWindow.location.href;
            clonedDocument.head.prepend(base);
          },
        });
      const exportCanvas = document.createElement("canvas");
      exportCanvas.width = requestedWidth;
      exportCanvas.height = Math.round(captureHeight * scale);
      const context = exportCanvas.getContext("2d");
      if (background) {
        context.fillStyle = background;
        context.fillRect(0, 0, exportCanvas.width, exportCanvas.height);
      }
      context.drawImage(rendered, 0, 0, exportCanvas.width, exportCanvas.height);
      return exportCanvas;
    }

    function downloadBlob(blob, extension, pageSuffix = canvasesMode ? `-p${currentCanvasIndex + 1}` : "") {
      const blobUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = blobUrl;
      link.download = `${fileSlug()}-${currentVariant || "canvas"}${pageSuffix}.${extension}`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
    }

    function waitForFrameLoad(record, timeout = 20000) {
      return new Promise((resolve) => {
        let timer = 0;
        const done = () => {
          record.iframe.removeEventListener("load", done);
          clearTimeout(timer);
          resolve();
        };
        record.iframe.addEventListener("load", done);
        timer = setTimeout(done, timeout);
      });
    }

    async function showFrame(index, record = slots[activeIndex]) {
      currentFrame = index;
      const loaded = waitForFrameLoad(record);
      record.iframe.src = sourceUrlForSlot(record.index).href;
      await loaded;
      const doc = record.iframe.contentDocument;
      if (!doc?.body || doc.title === "Error response") throw new Error("画布不可访问");
      record.doc = doc;
      sourceDocument = doc;
      sourceFrame = record.iframe;
      await doc.fonts?.ready;
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    }

    async function exportAnimatedBlob(requestedWidth, captureWidth, captureHeight, duration, hold) {
      const record = slots[activeIndex];
      const previousFrame = currentFrame;
      const previousDocument = sourceDocument;
      const previousSourceFrame = sourceFrame;
      const blobs = [];
      try {
        for (let index = 0; index < config.frames; index += 1) {
          downloadCanvasButton.textContent = `逐帧导出 ${index + 1}/${config.frames}…`;
          await showFrame(index, record);
          if (!sourceDocument) throw new Error("画布不可访问");
          const target = exportCaptureTarget();
          const canvas = await withCaptureStyle(target, () =>
            renderExportCanvas(target, captureWidth, captureHeight, requestedWidth, "#ffffff"),
          );
          const blob = await new Promise((resolve) =>
            canvas.toBlob(resolve, "image/webp", 0.92),
          );
          if (!blob) throw new Error("浏览器未能编码 WebP 帧");
          blobs.push(blob);
        }
        downloadCanvasButton.textContent = "合成 WebP…";
        const blob = await encodeAnimatedWebp(blobs, {
          width: requestedWidth,
          height: Math.round((captureHeight * requestedWidth) / captureWidth),
          duration,
          hold,
          loop: 0,
          onProgress: (done, total) => {
            downloadCanvasButton.textContent = `合成 WebP ${done}/${total}…`;
          },
        });
        const identical =
          blobs.length > 1 && blobs.every((item) => item.size === blobs[0].size);
        return { blob, identical };
      } finally {
        currentFrame = previousFrame;
        sourceDocument = previousDocument;
        sourceFrame = previousSourceFrame;
        if (frameSelect.options.length) frameSelect.value = String(previousFrame);
        await reloadVisibleFrames();
      }
    }

    downloadCanvasButton.addEventListener("click", async () => {
      if (!sourceDocument || typeof window.html2canvas !== "function") return;
      const format = byId("exportFormat").value;
      const requestedWidth = Math.max(1, Math.round(Number(byId("exportWidth").value) || 1280));
      const captureWidth = canvasesMode ? activeWidth : config.width;
      const captureHeight = canvasesMode ? activeHeight : config.height;
      const animate = format === "webp" && config.frames > 1;
      if (animate && canvasesMode) {
        byId("applyStatus").textContent = "动画 WebP 不支持多画布模式，请改用 JPG/PNG。";
        return;
      }
      const exportHeight = Math.round((captureHeight * requestedWidth) / captureWidth);
      const previousSelected = selected;
      downloadCanvasButton.disabled = true;
      downloadCanvasButton.textContent = animate ? "逐帧导出…" : "导出中…";
      setSelectedClasses(null);

      try {
        if (animate) {
          const duration = Math.max(20, Math.round(Number(byId("frameDuration").value) || 80));
          const hold = Math.max(0, Math.round(Number(byId("frameHold").value) || 0));
          const { blob, identical } = await exportAnimatedBlob(
            requestedWidth,
            captureWidth,
            captureHeight,
            duration,
            hold,
          );
          downloadBlob(blob, "webp");
          const canvasLabel = dualMode ? ` · ${currentVariant.toUpperCase()} 画布` : "";
          const warning = identical ? " · ⚠ 各帧内容相同，页面可能未响应帧参数" : "";
          byId("applyStatus").textContent =
            `已下载 WebP 动画${canvasLabel} · ${config.frames} 帧 · ${requestedWidth}×${exportHeight} · ${(blob.size / 1048576).toFixed(2)} MB${warning}`;
        } else {
          const target = exportCaptureTarget();
          const background = format === "png" ? null : "#ffffff";
          const blob = await withCaptureStyle(target, async () => {
            await sourceDocument.fonts?.ready;
            const canvas = await renderExportCanvas(
              target,
              captureWidth,
              captureHeight,
              requestedWidth,
              background,
            );
            return new Promise((resolve) =>
              canvas.toBlob(resolve, `image/${format}`, format === "jpg" ? 0.95 : 0.92),
            );
          });
          if (!blob) throw new Error("浏览器未能生成图片");
          downloadBlob(blob, format);
          byId("applyStatus").textContent =
            `已下载 ${format.toUpperCase()} · ${requestedWidth}×${exportHeight}${canvasesMode ? ` · 第 ${currentCanvasIndex + 1} 页` : ""}`;
        }
      } catch (error) {
        byId("applyStatus").textContent = `导出失败：${error.message}`;
      } finally {
        if (previousSelected) setSelectedClasses(previousSelected);
        downloadCanvasButton.disabled = false;
        downloadCanvasButton.textContent = "下载当前画布";
      }
    });

    addEventListener("resize", updateScale);
  }

  function fileSlug() {
    return (config.name || "canvas")
      .toLowerCase()
      .replace(/[^a-z0-9\u4e00-\u9fff]+/g, "-")
      .replace(/^-|-$/g, "") || "canvas";
  }

  function cssTextForDocument(doc) {
    return Array.from(doc.styleSheets)
      .map((sheet) => {
        try {
          return Array.from(sheet.cssRules)
            .map((rule) => rule.cssText)
            .join("\n");
        } catch {
          return "";
        }
      })
      .filter(Boolean)
      .join("\n");
  }

  function splitCssLayers(value) {
    const layers = [];
    let depth = 0;
    let start = 0;
    for (let index = 0; index < value.length; index += 1) {
      if (value[index] === "(") depth += 1;
      if (value[index] === ")") depth = Math.max(0, depth - 1);
      if (value[index] === "," && depth === 0) {
        layers.push(value.slice(start, index).trim());
        start = index + 1;
      }
    }
    layers.push(value.slice(start).trim());
    return layers.filter(Boolean);
  }

  function linearDirection(value) {
    const text = value.trim().toLowerCase();
    const angle = /^(-?[\d.]+)deg$/.exec(text);
    if (angle) {
      const radians = (parseFloat(angle[1]) * Math.PI) / 180;
      return [Math.sin(radians), -Math.cos(radians)];
    }
    const diagonal = Math.SQRT1_2;
    const corners = {
      "to top": [0, -1],
      "to bottom": [0, 1],
      "to left": [-1, 0],
      "to right": [1, 0],
      "to top right": [diagonal, -diagonal],
      "to right top": [diagonal, -diagonal],
      "to top left": [-diagonal, -diagonal],
      "to left top": [-diagonal, -diagonal],
      "to bottom right": [diagonal, diagonal],
      "to right bottom": [diagonal, diagonal],
      "to bottom left": [-diagonal, diagonal],
      "to left bottom": [-diagonal, diagonal],
    };
    return corners[text] || null;
  }

  function parseCssColor(text) {
    const canvas = document.createElement("canvas");
    canvas.width = 1;
    canvas.height = 1;
    const context = canvas.getContext("2d");
    context.fillStyle = "#010203";
    context.fillStyle = text;
    if (context.fillStyle === "#010203" && text.trim() !== "#010203") {
      context.fillStyle = "#010203";
      context.fillRect(0, 0, 1, 1);
      return null;
    }
    context.fillRect(0, 0, 1, 1);
    return Array.from(context.getImageData(0, 0, 1, 1).data);
  }

  function writeGradientColor(stops, offset, data, index) {
    let left = stops[0];
    for (let position = 1; position < stops.length; position += 1) {
      const right = stops[position];
      if (offset <= right.position) {
        const span = right.position - left.position;
        if (span <= 0) {
          data[index] = right.rgba[0];
          data[index + 1] = right.rgba[1];
          data[index + 2] = right.rgba[2];
          data[index + 3] = right.rgba[3];
          return;
        }
        const ratio = (offset - left.position) / span;
        data[index] = left.rgba[0] + (right.rgba[0] - left.rgba[0]) * ratio;
        data[index + 1] = left.rgba[1] + (right.rgba[1] - left.rgba[1]) * ratio;
        data[index + 2] = left.rgba[2] + (right.rgba[2] - left.rgba[2]) * ratio;
        data[index + 3] = left.rgba[3] + (right.rgba[3] - left.rgba[3]) * ratio;
        return;
      }
      left = right;
    }
    data[index] = left.rgba[0];
    data[index + 1] = left.rgba[1];
    data[index + 2] = left.rgba[2];
    data[index + 3] = left.rgba[3];
  }

  const gradientCache = new Map();

  function rasterizeRepeatingLinear(layer, width, height) {
    const w = Math.max(1, Math.round(width));
    const h = Math.max(1, Math.round(height));
    const cacheKey = `${w}x${h}|${layer}`;
    if (gradientCache.has(cacheKey)) return gradientCache.get(cacheKey);
    const inner = layer.slice(layer.indexOf("(") + 1, layer.lastIndexOf(")"));
    const parts = splitCssLayers(inner);
    if (parts.length < 2) return null;
    const direction = linearDirection(parts[0]);
    if (direction) parts.shift();
    const [dx, dy] = direction || [0, 1];
    const line = Math.abs(w * dx) + Math.abs(h * dy);
    if (!(line > 0)) return null;

    const stops = [];
    for (const part of parts) {
      const tokens = part.trim().split(/\s+/);
      const positions = [];
      while (tokens.length > 1 && /^-?[\d.]+(px|%)?$/.test(tokens.at(-1))) {
        positions.unshift(tokens.pop());
      }
      const rgba = tokens.length ? parseCssColor(tokens.join(" ")) : null;
      if (!rgba) return null;
      if (!positions.length) {
        stops.push({ position: null, rgba });
        continue;
      }
      for (const raw of positions) {
        stops.push({
          position: raw.endsWith("%") ? (parseFloat(raw) / 100) * line : parseFloat(raw),
          rgba,
        });
      }
    }
    if (stops.length < 2) return null;
    if (stops[0].position == null) stops[0].position = 0;
    for (let index = 1; index < stops.length; index += 1) {
      if (stops[index].position == null) stops[index].position = stops[index - 1].position;
    }
    const period = stops.at(-1).position;
    if (!(period > 0)) return null;

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const context = canvas.getContext("2d");
    const image = context.createImageData(w, h);
    const data = image.data;
    const half = line / 2;
    for (let y = 0; y < h; y += 1) {
      for (let x = 0; x < w; x += 1) {
        const projected = (x + 0.5 - w / 2) * dx + (y + 0.5 - h / 2) * dy + half;
        const offset = ((projected % period) + period) % period;
        writeGradientColor(stops, offset, data, (y * w + x) * 4);
      }
    }
    context.putImageData(image, 0, 0);
    const dataUrl = canvas.toDataURL("image/png");
    if (gradientCache.size > 32) gradientCache.clear();
    gradientCache.set(cacheKey, dataUrl);
    return dataUrl;
  }

  function useRenderableBackground(element) {
    const style = element.style;
    const original = {
      backgroundImage: style.backgroundImage,
      backgroundSize: style.backgroundSize,
      backgroundRepeat: style.backgroundRepeat,
      backgroundPosition: style.backgroundPosition,
    };
    const restore = () => Object.assign(style, original);
    const layers = splitCssLayers(
      element.ownerDocument.defaultView.getComputedStyle(element).backgroundImage,
    );
    const repeated = layers.filter((layer) => /^repeating-linear-gradient\(/i.test(layer));
    const unsupported = /^(?:repeating-(?:linear|radial|conic)|radial|conic)-gradient\(/i;
    const supported = layers.filter((layer) => !unsupported.test(layer));

    if (supported.length === 0 && repeated.length === 1) {
      const rect = element.getBoundingClientRect();
      const dataUrl = rasterizeRepeatingLinear(repeated[0], rect.width, rect.height);
      if (dataUrl) {
        style.backgroundImage = `url(${dataUrl})`;
        style.backgroundSize = `${rect.width}px ${rect.height}px`;
        style.backgroundRepeat = "no-repeat";
        style.backgroundPosition = "0 0";
      }
      return restore;
    }

    if (supported.length > 0 && supported.length < layers.length) {
      style.backgroundImage = supported.join(", ");
    }
    return restore;
  }

  function nudgeSelected(dx, dy) {
    if (!selected) return;
    if (positionMode === "absolute") {
      const rect = selected.getBoundingClientRect();
      setInput("xValue", Math.round(rect.left + dx));
      setInput("yValue", Math.round(rect.top + dy));
      setAbsolutePosition(rect.left + dx, rect.top + dy);
      return;
    }
    const translate = overrides[selectedPath]?.styles?.translate || "0px 0px";
    const [rawX = "0px", rawY = "0px"] = translate.split(/\s+/);
    const x = px(rawX) + dx;
    const y = px(rawY) + dy;
    setInput("xValue", x);
    setInput("yValue", y);
    setTranslate(x, y);
  }

  function bindFrame(record) {
    record.iframe.addEventListener("load", () => {
      try {
        const doc = record.iframe.contentDocument;
        if (!doc?.body) throw new Error("画布不可访问");
        if (doc.title === "Error response") throw new Error("源文件不存在");
        record.doc = doc;
        if (record.index === activeIndex) sourceDocument = doc;
      } catch (error) {
        showLoadError(error.message);
        return;
      }

      injectEditorStyle(record.doc);
      applyOverrides(record.doc, record.variant);
      if (record.index === activeIndex) {
        sourceDocument = record.doc;
        overrides = loadOverridesFor(currentVariant);
        initCanvasNodes(record.doc);
      }
      updateScale();
      downloadCanvasButton.disabled = false;
      byId("downloadHtml").disabled = false;
      byId("resetAll").disabled = false;

      record.doc.addEventListener(
        "click",
        (event) => {
          event.preventDefault();
          event.stopPropagation();
          activateFrame(record.index);
          select(event.target);
          record.iframe.focus();
        },
        true,
      );
      record.doc.addEventListener("mouseover", (event) => {
        if (event.target === record.doc.body || event.target === selected) return;
        event.target.classList.add(hoverClass);
      });
      record.doc.addEventListener("mouseout", (event) => {
        event.target.classList.remove(hoverClass);
      });
      record.doc.addEventListener("keydown", (event) => {
        if (event.key === "Delete" || event.key === "Backspace") {
          if (selected) {
            event.preventDefault();
            deleteSelected();
          }
          return;
        }
        if (!["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)) return;
        if (!selected) return;
        event.preventDefault();
        const step = event.shiftKey ? 10 : 1;
        if (event.key === "ArrowLeft") nudgeSelected(-step, 0);
        if (event.key === "ArrowRight") nudgeSelected(step, 0);
        if (event.key === "ArrowUp") nudgeSelected(0, -step);
        if (event.key === "ArrowDown") nudgeSelected(0, step);
      });

      if (record.pendingSelect) {
        const previous = record.doc.body.querySelector(record.pendingSelect);
        record.pendingSelect = "";
        if (previous) {
          activateFrame(record.index);
          if (canvasesMode) {
            const pageIndex = canvasNodes.findIndex((node) => node.contains(previous));
            if (pageIndex >= 0 && pageIndex !== currentCanvasIndex) {
              showCanvasNode(pageIndex, record.doc);
            }
          }
          select(previous);
        }
      }
    });
    record.slot.addEventListener("click", (event) => {
      if (event.target === record.iframe) return;
      activateFrame(record.index);
    });
  }

  setupToolbar();
  bindInspector();
  slots.forEach(bindFrame);
  activateFrame(dualMode ? Math.min(activeIndex, 1) : 0);
  updateCanvasControls();
  setInspectorEnabled(false);
  updateHistoryButtons();
  reloadVisibleFrames();

  return {
    reload: reloadVisibleFrames,
    getSelectedElement: () => selected,
    getActiveCanvas: () => activeIndex,
  };
}

createCanvasInspector(readUrlConfig());
