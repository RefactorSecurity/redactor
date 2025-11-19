const persistedSettings =
  JSON.parse(localStorage.getItem("redactorSettings")) || {};
const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
const initialDarkMode =
  persistedSettings.ui?.useDarkTheme ??
  (persistedSettings.ui?.useDarkTheme === undefined ? prefersDark : false);

function setRootTheme(isDark) {
  document.documentElement.classList.toggle("dark", Boolean(isDark));
  document.body?.classList.toggle("dark", Boolean(isDark));
}

setRootTheme(initialDarkMode);

document.addEventListener("DOMContentLoaded", () => {
  const core = globalThis.RedactorCore;
  if (!core) {
    console.error("RedactorCore is not available.");
    return;
  }
  const {
    detectFormat,
    computeRedactionResult,
    redactPlainTextResult,
    RedactionEngine,
    fetchCommonWords,
    ensureCommonWordsLoaded,
  } = core;

  const redactButton = document.getElementById("redact-button");
  const errorToast = document.getElementById("error-toast");
  const errorMessageEl = document.getElementById("error-message");
  const detectedFormatLabel = document.getElementById("detected-format");
  const tabsContainer = document.getElementById("tabs-container");
  const inputLoadingOverlay = document.getElementById(
    "input-loading-overlay"
  );
  const inputEditorWrapper = document.getElementById(
    "input-editor-wrapper"
  );
  const inputDropOverlay = document.getElementById("input-drop-overlay");
  const scrollLeftButton = document.getElementById("scroll-left-button");
  const scrollRightButton = document.getElementById(
    "scroll-right-button"
  );
  const copyButton = document.getElementById("copy-button");
  const saveButton = document.getElementById("save-button");
  const bulkSaveButton = document.getElementById("bulk-save-button");
  const mobileRedactButtonSlot = document.getElementById(
    "mobile-redact-button-slot"
  );
  const desktopRedactButtonSlot = document.getElementById(
    "desktop-redact-button-slot"
  );
  const bulkSaveModal = document.getElementById("bulk-save-modal");
  const bulkSaveCountInput = document.getElementById("bulk-save-count");
  const bulkSaveStatus = document.getElementById("bulk-save-status");
  const bulkSaveCancel = document.getElementById("bulk-save-cancel");
  const bulkSaveConfirm = document.getElementById("bulk-save-confirm");
  const fileConfirmationModal = document.getElementById(
    "file-confirmation-modal"
  );
  const fileConfirmationMessage = document.getElementById(
    "file-confirmation-message"
  );
  const fileConfirmationFileName = document.getElementById(
    "file-confirmation-file-name"
  );
  const fileConfirmationWarnings = document.getElementById(
    "file-confirmation-warnings"
  );
  const fileConfirmationCancel = document.getElementById(
    "file-confirmation-cancel"
  );
  const fileConfirmationConfirm = document.getElementById(
    "file-confirmation-confirm"
  );
  const fileConfirmationClose = document.getElementById(
    "file-confirmation-close"
  );
  const openFileButton = document.getElementById("open-file-button");
  const clearInputButton = document.getElementById("clear-input-button");
  const openFileMenu = document.getElementById("open-file-menu");
  const exampleFilesList = document.getElementById("example-files-list");
  const chooseLocalFileButton = document.getElementById(
    "choose-local-file-button"
  );
  const localFileInput = document.getElementById("local-file-input");
  const themeToggleButton = document.getElementById("theme-toggle-button");
  const settingsUnsavedIndicator = document.getElementById(
    "settings-unsaved-indicator"
  );
  const settingsTabButtons = document.querySelectorAll(
    "[data-settings-tab]"
  );
  const settingsTabPanels = document.querySelectorAll(
    "[data-settings-panel]"
  );
  const settingsSaveButton = document.getElementById(
    "settings-save-button"
  );
  const settingsCancelButton = document.getElementById(
    "settings-cancel-button"
  );

  const navigatorPlatform =
    navigator.userAgentData?.platform || navigator.platform || "";
  const isMacPlatform = /mac/i.test(navigatorPlatform);

  let redactShortcutTooltip;
  let tooltipVisible = false;
  const shortcutLabel = isMacPlatform ? "Cmd + Enter" : "Ctrl + Enter";
  const tooltipText = `Redact (${shortcutLabel})`;

  if (typeof document !== "undefined") {
    redactShortcutTooltip = document.createElement("div");
    redactShortcutTooltip.id = "redact-shortcut-tooltip";
    redactShortcutTooltip.className = "shortcut-tooltip";
    redactShortcutTooltip.setAttribute("role", "tooltip");
    redactShortcutTooltip.textContent = tooltipText;
    document.body.appendChild(redactShortcutTooltip);
  }

  function positionRedactTooltip() {
    if (!redactButton || !redactShortcutTooltip) return;
    const rect = redactButton.getBoundingClientRect();
    const tooltipWidth = redactShortcutTooltip.offsetWidth;
    const tooltipHeight = redactShortcutTooltip.offsetHeight;
    const scrollX = window.scrollX || window.pageXOffset;
    const scrollY = window.scrollY || window.pageYOffset;
    const clampedLeft = Math.min(
      Math.max(
        scrollX + rect.left + rect.width / 2 - tooltipWidth / 2,
        scrollX + 8
      ),
      scrollX + window.innerWidth - tooltipWidth - 8
    );
    let top = scrollY + rect.top - tooltipHeight - 12;
    if (top < scrollY + 8) {
      top = scrollY + rect.bottom + 12;
    }
    redactShortcutTooltip.style.left = `${clampedLeft}px`;
    redactShortcutTooltip.style.top = `${top}px`;
  }

  function showRedactTooltip() {
    if (!redactButton || !redactShortcutTooltip) return;
    positionRedactTooltip();
    redactShortcutTooltip.classList.add("visible");
    tooltipVisible = true;
  }

  function hideRedactTooltip() {
    if (!redactShortcutTooltip) return;
    redactShortcutTooltip.classList.remove("visible");
    tooltipVisible = false;
  }

  if (redactButton) {
    redactButton.title = tooltipText;
    redactButton.setAttribute("aria-label", tooltipText);
    redactButton.addEventListener("mouseenter", showRedactTooltip);
    redactButton.addEventListener("mouseleave", hideRedactTooltip);
    redactButton.addEventListener("focus", showRedactTooltip);
    redactButton.addEventListener("blur", hideRedactTooltip);
    window.addEventListener("scroll", () => {
      if (tooltipVisible) positionRedactTooltip();
    });
    window.addEventListener("resize", () => {
      if (tooltipVisible) positionRedactTooltip();
    });
  }

  // Settings Modal Elements
  const settingsButton = document.getElementById("settings-button");
  const settingsModal = document.getElementById("settings-modal");
  const closeSettingsButton = document.getElementById(
    "close-settings-button"
  );
  const settingRedactUrlPath = document.getElementById(
    "setting-redact-url-path"
  );
  const settingRedactHost = document.getElementById("setting-redact-host");
  const settingRedactQueryString = document.getElementById(
    "setting-redact-query-string"
  );
  const settingRedactParamNames = document.getElementById(
    "setting-redact-param-names"
  );
  const settingRedactCookies = document.getElementById(
    "setting-redact-cookies"
  );
  const settingRedactCsrf = document.getElementById(
    "setting-redact-csrf"
  );
  const settingIgnoredWords = document.getElementById(
    "setting-ignored-words"
  );
  const settingProtectedFields = document.getElementById(
    "setting-protected-fields"
  );
  const settingJsonSortKeys = document.getElementById(
    "setting-json-sort-keys"
  );
  const settingCsvWithHeader = document.getElementById(
    "setting-csv-with-header"
  );
  const settingCsvNoHeader = document.getElementById(
    "setting-csv-no-header"
  );
  const settingDarkTheme = document.getElementById("setting-dark-theme");
  const settingSyntaxHighlight = document.getElementById(
    "setting-syntax-highlight"
  );
  const CSV_MODE_NAME = "csv";
  const FORM_MODE_NAME = "form-urlencoded";
  const LARGE_FILE_CONFIRMATION_BYTES = 100 * 1024;
  const SUSPICIOUS_OFFICE_MIME_TYPES = new Set([
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.ms-powerpoint",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ]);
  let pendingFileConfirmationResolve = null;

  function ensureCsvModeRegistered() {
    if (
      typeof CodeMirror === "undefined" ||
      typeof CodeMirror.defineSimpleMode !== "function"
    )
      return;
    if (CodeMirror.modes?.[CSV_MODE_NAME]) return;
    CodeMirror.defineSimpleMode(CSV_MODE_NAME, {
      start: [
        {
          regex: /"(?:[^"]|"")*"?/,
          token: "string",
        },
        {
          regex: /-?\d+(?:\.\d+)?/,
          token: "number",
        },
        {
          regex: /,/,
          token: "punctuation",
        },
        {
          regex: /\s+/,
          token: null,
        },
        {
          regex: /[^\s",][^,"]*/,
          token: "atom",
        },
      ],
      meta: {
        lineComment: "",
      },
    });
    CodeMirror.defineMIME("text/csv", CSV_MODE_NAME);
  }

  function ensureFormModeRegistered() {
    if (
      typeof CodeMirror === "undefined" ||
      typeof CodeMirror.defineSimpleMode !== "function"
    )
      return;
    if (CodeMirror.modes?.[FORM_MODE_NAME]) return;
    CodeMirror.defineSimpleMode(FORM_MODE_NAME, {
      start: [
        {
          regex: /[^=&\s]+/,
          token: "attribute",
          next: "afterKey",
        },
        {
          regex: /&/,
          token: "punctuation",
        },
        {
          regex: /\s+/,
          token: null,
        },
      ],
      afterKey: [
        {
          regex: /=/,
          token: "operator",
          next: "value",
        },
        {
          regex: /&/,
          token: "punctuation",
          next: "start",
        },
        {
          regex: /\s+/,
          token: null,
        },
        {
          regex: /[^=&\s]+/,
          token: "attribute",
        },
      ],
      value: [
        {
          regex: /[^&]+/,
          token: "string",
          next: "start",
        },
        {
          regex: /&/,
          token: "punctuation",
          next: "start",
        },
      ],
      meta: {
        lineComment: "",
      },
    });
    CodeMirror.defineMIME("application/x-www-form-urlencoded", FORM_MODE_NAME);
  }

  ensureCsvModeRegistered();
  ensureFormModeRegistered();

  // --- CodeMirror Editors ---
  const createEditor = (el, options) =>
    CodeMirror(el, {
      lineNumbers: true,
      lineWrapping: true,
      ...options,
    });

  const inputEditor = createEditor(
    document.getElementById("input-editor"),
    {
      theme: document.documentElement.classList.contains("dark")
        ? "material-darker"
        : "eclipse",
      placeholder:
        "Type, paste, or drag-and-drop JSON, XML, YAML, CSV, form-URL-encoded, HTTP, or plain text data to redact...",
    }
  );
  const outputEditor = createEditor(
    document.getElementById("output-editor"),
    {
      theme: document.documentElement.classList.contains("dark")
        ? "material-darker"
        : "eclipse",
      readOnly: true,
    }
  );

  // --- State Management ---
  let tabsState = [];
  let activeTabId = null;
  let tabCounter = 0;
  let autoNameCounter = 0;
  let draggedTabId = null;
  let settings = {};
  let stagedSettings = null;
  let isSettingsModalOpen = false;
  let settingsBeforeModal = null;
  const getFormatKey = (format) =>
    (format || "Unknown").trim() || "Unknown";
  const nextAutoNameIndex = () => {
    autoNameCounter += 1;
    return autoNameCounter;
  };
  let syntaxUpdateTimer;
  const MAX_BULK_FILES = 50;
  const EXAMPLE_FILES = [
    { label: "Sample JSON", file: "example.json" },
    { label: "Sample XML", file: "example.xml" },
    { label: "Sample CSV", file: "example.csv" },
    { label: "Sample YAML", file: "example.yaml" },
    { label: "HTTP GET (no query string)", file: "get_no_query.http" },
    { label: "HTTP GET (with query string)", file: "get_with_query.http" },
    { label: "HTTP GET (with cookies)", file: "get_with_cookies.http" },
    { label: "HTTP GET (with CSRF)", file: "get_with_csrf.http" },
    { label: "HTTP POST (form data)", file: "post_form.http" },
    { label: "HTTP POST (JSON)", file: "post_json.http" },
    { label: "HTTP POST (no query string)", file: "post_no_query.http" },
    { label: "HTTP POST (with query string)", file: "post_with_query.http" },
    { label: "HTTP POST (XML)", file: "post_xml.http" },
    { label: "HTTP POST (multi-part)", file: "post_multipart.http" },
    { label: "HTTP Response (JSON)", file: "response_json.http" },
    { label: "HTTP Response (CSV)", file: "response_csv.http" },
    { label: "Query Parameters Sample", file: "query.txt" },
  ];

  const defaultSettings = {
    redaction: {
      redactUrlPath: false,
      redactHost: true,
      redactQueryString: true,
      redactParamNames: false,
      redactCookies: true,
      redactCsrf: true,
      csvHasHeader: true,
      ignoredWords: [],
      protectedFields: [],
    },
    json: {
      sortKeysAlphabetically: false,
    },
    ui: {
      useDarkTheme: window.matchMedia("(prefers-color-scheme: dark)")
        .matches,
      syntaxHighlight: true,
    },
  };

  const cloneSettings = (source) =>
    JSON.parse(JSON.stringify(source || {}));

  const parseCommaSeparatedList = (value = "") =>
    value
      .split(",")
      .map((item) => item.trim())
      .filter((item) => item.length > 0);

  function renderThemeToggleIcon(isDark) {
    if (!themeToggleButton) return;
    const sunIcon = `
      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="5"></circle>
        <line x1="12" y1="1" x2="12" y2="3"></line>
        <line x1="12" y1="21" x2="12" y2="23"></line>
        <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
        <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
        <line x1="1" y1="12" x2="3" y2="12"></line>
        <line x1="21" y1="12" x2="23" y2="12"></line>
        <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line>
        <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>
      </svg>
    `;
    const moonIcon = `
      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M12 3a9 9 0 1 0 9 9 7 7 0 0 1-9-9z"></path>
      </svg>
    `;
    themeToggleButton.innerHTML = isDark ? sunIcon : moonIcon;
    themeToggleButton.title = isDark
      ? "Switch to light theme"
      : "Switch to dark theme";
  }

  function applySettingsToInputs(sourceSettings) {
    if (!sourceSettings) return;
    const data = sourceSettings.redaction;
    const jsonPrefs =
      sourceSettings.json || defaultSettings.json;
    const uiPrefs = sourceSettings.ui;
    settingRedactUrlPath.checked = data.redactUrlPath;
    settingRedactHost.checked = data.redactHost;
    settingRedactQueryString.checked = data.redactQueryString;
    settingRedactParamNames.checked = data.redactParamNames;
    settingRedactCookies.checked = data.redactCookies;
    settingRedactCsrf.checked = data.redactCsrf;
    settingIgnoredWords.value = data.ignoredWords.join(", ");
    settingProtectedFields.value = data.protectedFields.join(", ");
    if (settingJsonSortKeys)
      settingJsonSortKeys.checked = Boolean(
        jsonPrefs.sortKeysAlphabetically
      );
    const csvHasHeader =
      data.csvHasHeader === undefined ? true : Boolean(data.csvHasHeader);
    if (settingCsvWithHeader) settingCsvWithHeader.checked = csvHasHeader;
    if (settingCsvNoHeader) settingCsvNoHeader.checked = !csvHasHeader;
    settingDarkTheme.checked = uiPrefs.useDarkTheme;
    settingSyntaxHighlight.checked = uiPrefs.syntaxHighlight;
  }

  function updateStagedSettings(mutator) {
    if (!isSettingsModalOpen) return;
    if (!stagedSettings) {
      stagedSettings = cloneSettings(settings);
    }
    mutator(stagedSettings);
    updateUnsavedIndicator();
  }

  function isSettingsDirty() {
    if (!stagedSettings || !settingsBeforeModal) return false;
    return JSON.stringify(stagedSettings) !== JSON.stringify(settingsBeforeModal);
  }

  function updateUnsavedIndicator() {
    if (!settingsUnsavedIndicator) return;
    const isDirty = isSettingsDirty();
    settingsUnsavedIndicator.classList.toggle("hidden", !isDirty);
  }

  function populateExampleFiles() {
    if (!exampleFilesList) return;
    exampleFilesList.innerHTML = "";
    EXAMPLE_FILES.forEach(({ label, file }) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className =
        "w-full text-left px-4 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors duration-150";
      button.textContent = label;
      button.addEventListener("click", () => {
        closeOpenFileMenu();
        loadExampleFile(file, label);
      });
      exampleFilesList.appendChild(button);
    });
  }

  function toggleOpenFileMenu() {
    if (!openFileMenu) return;
    openFileMenu.classList.toggle("hidden");
  }

  function closeOpenFileMenu() {
    if (!openFileMenu) return;
    openFileMenu.classList.add("hidden");
  }

  function setInputEditorLoading(isLoading) {
    if (!inputLoadingOverlay) return;
    inputLoadingOverlay.classList.toggle("hidden", !isLoading);
    inputLoadingOverlay.setAttribute(
      "aria-busy",
      isLoading ? "true" : "false"
    );
  }

  function setInputDropState(isActive) {
    if (inputEditorWrapper) {
      inputEditorWrapper.classList.toggle("drag-over", Boolean(isActive));
    }
    if (inputDropOverlay) {
      inputDropOverlay.classList.toggle("hidden", !isActive);
    }
  }

  function loadExampleFile(fileName, label) {
    setInputEditorLoading(true);
    fetch(`src/assets/examples/${fileName}`)
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Unable to load ${fileName}`);
        }
        return response.text();
      })
      .then((content) => {
        loadContentIntoEditor(content, label || fileName);
      })
      .catch((error) => {
        console.error("Example load failed:", error);
        showError("Could not load the selected example file.");
      })
      .finally(() => {
        setInputEditorLoading(false);
      });
  }

  function collectFileImportWarnings(file) {
    const warnings = [];
    if (!file) return warnings;
    if (
      typeof file.size === "number" &&
      file.size > LARGE_FILE_CONFIRMATION_BYTES
    ) {
      const kbSize = (file.size / 1024).toFixed(1);
      warnings.push(`The file is ${kbSize} KB which may be slow to load.`);
    }
    const mimeType = (file.type || "").toLowerCase();
    if (mimeType) {
      const isImage = mimeType.startsWith("image/");
      const isSvg = mimeType === "image/svg+xml";
      if (isImage && !isSvg) {
        warnings.push(`The file appears to be an image (${mimeType}).`);
      } else if (mimeType === "application/pdf") {
        warnings.push("The file appears to be a PDF document.");
      } else if (SUSPICIOUS_OFFICE_MIME_TYPES.has(mimeType)) {
        warnings.push("The file appears to be an Office document.");
      }
    }
    return warnings;
  }

  function showFileConfirmationModal({ fileName, warnings, summary }) {
    if (!fileConfirmationModal) return;
    if (fileConfirmationFileName) {
      fileConfirmationFileName.textContent = fileName || "Selected file";
    }
    if (fileConfirmationMessage) {
      fileConfirmationMessage.textContent =
        summary ||
        "We noticed potential issues with this file. Make sure you trust it before importing.";
    }
    if (fileConfirmationWarnings) {
      fileConfirmationWarnings.innerHTML = "";
      warnings.forEach((warning) => {
        const li = document.createElement("li");
        li.textContent = warning;
        fileConfirmationWarnings.appendChild(li);
      });
    }
    fileConfirmationModal.classList.remove("hidden");
  }

  function hideFileConfirmationModal() {
    if (!fileConfirmationModal) return;
    fileConfirmationModal.classList.add("hidden");
    if (fileConfirmationWarnings) {
      fileConfirmationWarnings.innerHTML = "";
    }
    if (fileConfirmationFileName) {
      fileConfirmationFileName.textContent = "";
    }
  }

  function settleFileConfirmationModal(decision) {
    hideFileConfirmationModal();
    if (typeof pendingFileConfirmationResolve === "function") {
      pendingFileConfirmationResolve(Boolean(decision));
      pendingFileConfirmationResolve = null;
    }
  }

  function cancelFileConfirmationModal() {
    settleFileConfirmationModal(false);
  }

  function confirmFileImportIfNeeded(file) {
    const warnings = collectFileImportWarnings(file);
    if (!warnings.length) return Promise.resolve(true);
    const fileLabel = file?.name ? `"${file.name}"` : "the selected file";
    if (!fileConfirmationModal) {
      const fallbackMessage = [
        `Import ${fileLabel}?`,
        "",
        ...warnings,
        "",
        "Do you want to continue?",
      ].join("\n");
      return Promise.resolve(window.confirm(fallbackMessage));
    }
    return new Promise((resolve) => {
      if (pendingFileConfirmationResolve) {
        settleFileConfirmationModal(false);
      }
      pendingFileConfirmationResolve = resolve;
      showFileConfirmationModal({
        fileName: file?.name || "Selected file",
        warnings,
        summary: `We noticed potential issues with ${fileLabel}. Make sure you trust this file before importing it.`,
      });
    });
  }

  function importFileIntoInputEditor(file, { onComplete } = {}) {
    if (!file) return;
    const reader = new FileReader();
    setInputEditorLoading(true);
    const finalize = () => {
      if (typeof onComplete === "function") {
        try {
          onComplete();
        } catch (error) {
          console.error("Cleanup after file import failed:", error);
        }
      }
      setInputEditorLoading(false);
    };
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      loadContentIntoEditor(result, file.name || "");
      finalize();
    };
    reader.onerror = () => {
      console.error("File read error:", reader.error);
      showError("Failed to read the selected file.");
      finalize();
    };
    reader.readAsText(file);
  }

  async function handleLocalFileSelection(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    const shouldImport = await confirmFileImportIfNeeded(file);
    if (!shouldImport) {
      if (localFileInput) localFileInput.value = "";
      return;
    }
    importFileIntoInputEditor(file, {
      onComplete: () => {
        if (localFileInput) localFileInput.value = "";
      },
    });
  }

  function setupInputDragAndDrop() {
    if (!inputEditorWrapper) return;
    let dragCounter = 0;
    const containsFiles = (event) => {
      const dt = event.dataTransfer;
      if (!dt) return false;
      if (dt.types) {
        if (typeof dt.types.includes === "function") {
          if (dt.types.includes("Files")) return true;
        } else if (typeof dt.types.contains === "function") {
          if (dt.types.contains("Files")) return true;
        }
      }
      if (dt.items && dt.items.length) {
        for (let i = 0; i < dt.items.length; i += 1) {
          if (dt.items[i].kind === "file") return true;
        }
      }
      return Boolean(dt.files && dt.files.length);
    };

    const resetDragState = () => {
      dragCounter = 0;
      setInputDropState(false);
    };

    inputEditorWrapper.addEventListener("dragenter", (event) => {
      if (!containsFiles(event)) return;
      event.preventDefault();
      dragCounter += 1;
      setInputDropState(true);
    });

    inputEditorWrapper.addEventListener("dragover", (event) => {
      if (!containsFiles(event)) return;
      event.preventDefault();
      const dt = event.dataTransfer;
      if (dt) dt.dropEffect = "copy";
    });

    inputEditorWrapper.addEventListener("dragleave", (event) => {
      if (!containsFiles(event)) return;
      if (
        event.relatedTarget &&
        inputEditorWrapper.contains(event.relatedTarget)
      ) {
        return;
      }
      event.preventDefault();
      dragCounter = Math.max(0, dragCounter - 1);
      if (dragCounter === 0) {
        setInputDropState(false);
      }
    });

    inputEditorWrapper.addEventListener("drop", async (event) => {
      if (!containsFiles(event)) return;
      event.preventDefault();
      const file = event.dataTransfer?.files?.[0];
      resetDragState();
      closeOpenFileMenu();
      if (!file) return;
      const shouldImport = await confirmFileImportIfNeeded(file);
      if (shouldImport) {
        importFileIntoInputEditor(file);
      }
    });
  }

  function loadContentIntoEditor(content, sourceLabel = "") {
    const activeTab = tabsState.find((t) => t.id === activeTabId);
    if (!activeTab) return;
    activeTab.input = content;
    activeTab.output = "";
    const detected = detectFormat(content, settings?.redaction || {});
    activeTab.format = detected;
    if (sourceLabel) {
      activeTab.name = sourceLabel;
      activeTab.isNameManual = true;
    }
    activeTab.autoNameFormat = null;
    activeTab.autoNameIndex = null;
    inputEditor.setValue(content);
    outputEditor.setValue("");
    detectedFormatLabel.textContent = detected;
    renderTabs();
    renderContent();
  }

  function clearInputEditorContents() {
    const activeTab = tabsState.find((t) => t.id === activeTabId);
    if (!activeTab) return;
    const editorsWereEmpty =
      !inputEditor.getValue().length && !outputEditor.getValue().length;
    activeTab.input = "";
    activeTab.output = "";
    activeTab.format = "Plain Text";
    inputEditor.setValue("");
    inputEditor.clearHistory();
    outputEditor.setValue("");
    detectedFormatLabel.textContent = "Plain Text";
    if (!editorsWereEmpty) {
      renderTabs();
      renderContent();
    }
  }

  function getExtensionForFormat(format) {
    const normalizedFormat =
      typeof format === "string" && format.startsWith("CSV")
        ? "CSV"
        : format;
    const formatToExtension = {
      JSON: "json",
      XML: "xml",
      YAML: "yaml",
      CSV: "csv",
      "HTTP Request": "http",
      "HTTP Response": "http",
      "Form URL-Encoded": "txt",
      "Plain Text": "txt",
    };
    return formatToExtension[normalizedFormat] || "txt";
  }

  function getSettingsTabForFormat(format = "") {
    if (!format) return null;
    const normalized = format.toLowerCase();
    if (normalized === "json") return "json";
    if (normalized.startsWith("csv")) return "csv";
    if (normalized.startsWith("http")) return "http";
    if (normalized.includes("form url")) return "http";
    return null;
  }

  function getSuggestedFilename() {
    const activeTab = tabsState.find((t) => t.id === activeTabId);
    const format =
      activeTab?.format ||
      detectFormat(inputEditor.getValue(), settings?.redaction || {});
    const extension = getExtensionForFormat(format);
    const baseName = (activeTab?.name || "redacted")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "_")
      .replace(/[^\w.-]/g, "");
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    return `${baseName || "redacted"}-${timestamp}.${extension}`;
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    setTimeout(() => {
      URL.revokeObjectURL(url);
      document.body.removeChild(link);
    }, 0);
  }

  function saveOutputToFile() {
    const content = outputEditor.getValue();
    if (!content) {
      showError("No redacted output to save yet.");
      return;
    }
    const filename = getSuggestedFilename();
    const blob = new Blob([content], {
      type: "text/plain;charset=utf-8",
    });
    downloadBlob(blob, filename);
  }

  function getBulkFilename(format, index) {
    const extension = getExtensionForFormat(format);
    const slug = (format || "redacted")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "") || "redacted";
    const paddedIndex = String(index).padStart(2, "0");
    return `${slug}-${paddedIndex}.${extension}`;
  }

  function getBulkZipFilename(count) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    return `redactions-${count}-${timestamp}.zip`;
  }

  function openBulkSaveModal() {
    if (!bulkSaveModal) return;
    if (bulkSaveStatus) bulkSaveStatus.textContent = "";
    if (bulkSaveCountInput) {
      bulkSaveCountInput.value = bulkSaveCountInput.value || "5";
      setTimeout(() => bulkSaveCountInput.focus(), 0);
    }
    bulkSaveModal.classList.remove("hidden");
  }

  function closeBulkSaveModal() {
    if (!bulkSaveModal) return;
    bulkSaveModal.classList.add("hidden");
    if (bulkSaveStatus) bulkSaveStatus.textContent = "";
  }

  async function generateBulkZip(count) {
    if (typeof JSZip === "undefined") {
      throw new Error("Bulk export unavailable. JSZip failed to load.");
    }
    const text = inputEditor.getValue();
    const trimmedText = text.trim();
    if (!trimmedText) {
      throw new Error("Provide input data before generating redactions.");
    }
    await ensureCommonWordsLoaded();
    const format = detectFormat(text, settings?.redaction || {});
    const zip = new JSZip();
    for (let i = 0; i < count; i++) {
      const tempRedactor = new RedactionEngine(settings.redaction);
      const result = computeRedactionResult(
        format,
        text,
        trimmedText,
        tempRedactor,
        settings.redaction,
        settings
      );
      const filename = getBulkFilename(result.format || format, i + 1);
      zip.file(filename, result.output || "");
      if (bulkSaveStatus)
        bulkSaveStatus.textContent = `Generated ${i + 1} of ${count}`;
    }
    const blob = await zip.generateAsync({ type: "blob" });
    downloadBlob(blob, getBulkZipFilename(count));
  }

  async function handleBulkSaveGeneration() {
    const desiredCount = parseInt(bulkSaveCountInput?.value || "0", 10);
    if (
      Number.isNaN(desiredCount) ||
      desiredCount < 1 ||
      desiredCount > MAX_BULK_FILES
    ) {
      if (bulkSaveStatus)
        bulkSaveStatus.textContent = `Enter a value between 1 and ${MAX_BULK_FILES}.`;
      return;
    }
    if (bulkSaveConfirm) bulkSaveConfirm.disabled = true;
    if (bulkSaveCancel) bulkSaveCancel.disabled = true;
    if (bulkSaveStatus) bulkSaveStatus.textContent = "Generating files...";
    try {
      await generateBulkZip(desiredCount);
      closeBulkSaveModal();
    } catch (error) {
      console.error("Bulk redaction failed:", error);
      const message =
        error?.message || "Failed to generate bulk redactions.";
      if (bulkSaveStatus) bulkSaveStatus.textContent = message;
      showError(message);
    } finally {
      if (bulkSaveConfirm) bulkSaveConfirm.disabled = false;
      if (bulkSaveCancel) bulkSaveCancel.disabled = false;
    }
  }

  function saveSettings() {
    localStorage.setItem("redactorSettings", JSON.stringify(settings));
  }

  function loadSettings() {
    const saved = JSON.parse(localStorage.getItem("redactorSettings"));
    const savedRedaction = saved?.redaction || {};
    const savedJson = saved?.json || {};
    if (!Array.isArray(savedRedaction.ignoredWords)) {
      savedRedaction.ignoredWords = [];
    }
    if (!Array.isArray(savedRedaction.protectedFields)) {
      savedRedaction.protectedFields = [];
    }
    settings = {
      redaction: { ...defaultSettings.redaction, ...savedRedaction },
      json: { ...defaultSettings.json, ...savedJson },
      ui: { ...defaultSettings.ui, ...saved?.ui },
    };
    applySettingsToInputs(settings);
    setRootTheme(settings.ui.useDarkTheme);
  }

  function refreshCsvFormatLabels() {
    if (!Array.isArray(tabsState) || tabsState.length === 0) return;
    const detectOptions = settings?.redaction || {};
    tabsState.forEach((tab) => {
      if (
        !tab ||
        typeof tab.format !== "string" ||
        !tab.format.startsWith("CSV")
      )
        return;
      const newFormat = detectFormat(tab.input || "", detectOptions);
      if (newFormat) {
        tab.format = newFormat;
      }
    });
  }

  function setActiveSettingsTab(tabName = "general") {
    if (!settingsTabButtons.length || !settingsTabPanels.length) return;
    settingsTabButtons.forEach((button) => {
      const isActive = button.dataset.settingsTab === tabName;
      button.classList.toggle("active", isActive);
      button.setAttribute("aria-selected", isActive);
      button.tabIndex = isActive ? 0 : -1;
    });
    settingsTabPanels.forEach((panel) => {
      const isActive = panel.dataset.settingsPanel === tabName;
      panel.classList.toggle("active", isActive);
      panel.hidden = !isActive;
    });
  }

  function openSettingsModal(initialTab = "general") {
    if (isSettingsModalOpen) {
      setActiveSettingsTab(initialTab);
      settingsModal.classList.remove("hidden");
      return;
    }
    settingsBeforeModal = cloneSettings(settings);
    stagedSettings = cloneSettings(settings);
    applySettingsToInputs(stagedSettings);
    setActiveSettingsTab(initialTab);
    isSettingsModalOpen = true;
    updateUnsavedIndicator();
    settingsModal.classList.remove("hidden");
  }

  function closeSettingsModal(applyChanges = false) {
    if (applyChanges && stagedSettings) {
      const csvSettingChanged =
        settingsBeforeModal?.redaction?.csvHasHeader !==
        stagedSettings.redaction?.csvHasHeader;
      settings = cloneSettings(stagedSettings);
      saveSettings();
      updateTheme(settings.ui.useDarkTheme);
      if (csvSettingChanged) {
        refreshCsvFormatLabels();
      }
      renderContent();
    } else {
      if (settingsBeforeModal) {
        settings = cloneSettings(settingsBeforeModal);
        applySettingsToInputs(settings);
      }
      updateTheme(settings.ui.useDarkTheme);
      renderContent();
    }
    stagedSettings = null;
    settingsBeforeModal = null;
    isSettingsModalOpen = false;
    updateUnsavedIndicator();
    settingsModal.classList.add("hidden");
  }

  // --- Tab Management ---
  function createNewTab() {
    tabCounter++;
    const newTab = {
      id: Date.now(),
      name: `Untitled ${tabCounter}`,
      isNameManual: false,
      autoNameFormat: null,
      autoNameIndex: null,
      input: "",
      output: "",
      format: "Plain Text",
    };
    tabsState.push(newTab);
    return newTab;
  }

  function switchTab(tabId) {
    if (activeTabId === tabId) return;
    activeTabId = tabId;
    render();
  }

  function closeTab(tabId) {
    const tabIndex = tabsState.findIndex((t) => t.id === tabId);
    if (tabIndex === -1) return;
    tabsState.splice(tabIndex, 1);
    if (tabsState.length === 0) {
      const newTab = createNewTab();
      activeTabId = newTab.id;
    } else if (activeTabId === tabId) {
      activeTabId = tabsState[Math.max(0, tabIndex - 1)].id;
    }
    render();
  }

  function reorderTabs(draggedId, targetId, insertAfter = false) {
    if (draggedId === targetId) return;
    const draggedIndex = tabsState.findIndex((t) => t.id === draggedId);
    if (draggedIndex === -1) return;
    const [draggedTab] = tabsState.splice(draggedIndex, 1);
    if (targetId == null) {
      tabsState.push(draggedTab);
    } else {
      let targetIndex = tabsState.findIndex((t) => t.id === targetId);
      if (targetIndex === -1) {
        tabsState.push(draggedTab);
      } else {
        if (insertAfter) targetIndex += 1;
        tabsState.splice(targetIndex, 0, draggedTab);
      }
    }
    renderTabs();
  }

  function clearTabDragIndicators() {
    tabsContainer
      .querySelectorAll(".tab-drag-over")
      .forEach((el) => el.classList.remove("tab-drag-over"));
  }

  function render() {
    renderTabs();
    renderContent();
  }

  function renderTabs() {
    tabsContainer.innerHTML = "";
    tabsState.forEach((tab) => {
      const isActive = tab.id === activeTabId;
      const tabEl = document.createElement("div");
      tabEl.dataset.tabId = tab.id;
      tabEl.className = `flex-shrink-0 flex items-center cursor-pointer border-r border-t border-gray-300 dark:border-gray-700 px-2 py-1.5 rounded-t-md mt-2 ${isActive
        ? "bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
        : "bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-300 dark:hover:bg-gray-600"
        }`;
      const dragHandle = document.createElement("span");
      dragHandle.textContent = "⋮⋮";
      dragHandle.title = "Drag tab";
      dragHandle.setAttribute("role", "presentation");
      dragHandle.setAttribute("draggable", "true");
      dragHandle.className =
        "tab-drag-handle px-1 mr-1 text-gray-500 dark:text-gray-300 select-none";
      const titleEl = document.createElement("span");
      titleEl.textContent = tab.name;
      titleEl.className = "tab-title px-2";
      const closeBtn = document.createElement("button");
      closeBtn.textContent = "×";
      closeBtn.className =
        "ml-2 w-5 h-5 flex items-center justify-center rounded-full hover:bg-red-500 hover:text-white";
      tabEl.appendChild(dragHandle);
      tabEl.appendChild(titleEl);
      tabEl.appendChild(closeBtn);
      tabsContainer.appendChild(tabEl);
    });
    const addButtonEl = document.createElement("button");
    addButtonEl.id = "add-tab-button";
    addButtonEl.className =
      "flex-shrink-0 ml-1 mt-2 px-3 py-2 text-xl text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-t-md transition-colors duration-150";
    addButtonEl.textContent = "+";
    tabsContainer.appendChild(addButtonEl);
    setTimeout(checkTabOverflow, 0);
  }

  function getCodeMirrorMode(format) {
    if (!settings.ui.syntaxHighlight) return "text/plain";
    if (format === "JSON") return { name: "javascript", json: true };
    if (format === "XML") return "xml";
    if (format === "YAML") return "yaml";
    if (format?.startsWith?.("HTTP")) return "http";
    if (format?.startsWith?.("CSV")) return CSV_MODE_NAME;
    if (format === "Form URL-Encoded") return FORM_MODE_NAME;
    return "text/plain";
  }

  function renderContent() {
    const activeTab = tabsState.find((t) => t.id === activeTabId);
    if (!activeTab) return;

    if (inputEditor.getValue() !== activeTab.input) {
      inputEditor.setValue(activeTab.input);
    }
    if (outputEditor.getValue() !== activeTab.output) {
      outputEditor.setValue(activeTab.output);
    }

    const mode = getCodeMirrorMode(activeTab.format);
    const currentMode = inputEditor.getOption("mode");

    const modesAreEqual =
      JSON.stringify(currentMode) === JSON.stringify(mode);

    if (!modesAreEqual) {
      inputEditor.setOption("mode", mode);
      outputEditor.setOption("mode", mode);
    }
    inputEditor.setOption("lineNumbers", settings.ui.syntaxHighlight);
    outputEditor.setOption("lineNumbers", settings.ui.syntaxHighlight);

    detectedFormatLabel.textContent = activeTab.format || "Plain Text";
    setTimeout(() => {
      inputEditor.refresh();
      outputEditor.refresh();
    }, 1);
  }

  function checkTabOverflow() {
    const hasOverflow =
      tabsContainer.scrollWidth > tabsContainer.clientWidth;
    scrollLeftButton.classList.toggle("hidden", !hasOverflow);
    scrollRightButton.classList.toggle("hidden", !hasOverflow);
    if (hasOverflow) updateScrollButtonStates();
  }

  function updateScrollButtonStates() {
    const atStart = tabsContainer.scrollLeft < 1;
    const atEnd =
      tabsContainer.scrollLeft + tabsContainer.clientWidth >=
      tabsContainer.scrollWidth - 1;
    scrollLeftButton.disabled = atStart;
    scrollRightButton.disabled = atEnd;
    scrollLeftButton.classList.toggle("opacity-50", atStart);
    scrollRightButton.classList.toggle("opacity-50", atEnd);
  }


  // --- Format-Specific Handlers ---
  let redactor;
  let toastTimeout;

  // --- Event Dispatcher ---
  function showError(message) {
    errorMessageEl.textContent = message;
    errorToast.classList.remove("hidden");
    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(
      () => errorToast.classList.add("hidden"),
      3000
    );
  }

  async function handleRedaction() {
    try {
      await ensureCommonWordsLoaded();
    } catch (error) {
      console.error("Dictionary load failed:", error);
      showError("Unable to load word list. Please try again.");
      return;
    }
    const activeTab = tabsState.find((t) => t.id === activeTabId);
    if (!activeTab) return;

    const text = inputEditor.getValue();
    activeTab.input = text;
    const trimmedText = text.trim();

    if (!trimmedText) {
      updateActiveTabData({ input: "", output: "", format: "" });
      renderContent();
      return;
    }

    const format = detectFormat(text, settings?.redaction || {});

    try {
      redactor = new RedactionEngine(settings.redaction);
      const result = computeRedactionResult(
        format,
        text,
        trimmedText,
        redactor,
        settings.redaction,
        settings
      );
      updateActiveTabData(result);
    } catch (e) {
      console.error("Redaction Error:", e);
      showError(`Failed to process as ${format || "Plain Text"}.`);
      updateActiveTabData(redactPlainTextResult(text, redactor));
    }

    render();
  }

  function updateActiveTabData(data) {
    const activeTab = tabsState.find((t) => t.id === activeTabId);
    if (!activeTab) return;
    Object.assign(activeTab, data);
    if (!activeTab.format) {
      activeTab.format = "Plain Text";
    }
    if (!data.format || activeTab.isNameManual) return;
    const formatKey = getFormatKey(data.format);
    if (activeTab.autoNameFormat === formatKey) return;
    const index = nextAutoNameIndex();
    activeTab.autoNameFormat = formatKey;
    activeTab.autoNameIndex = index;
    activeTab.name = `${formatKey} ${index}`;
  }

  // --- Initial Setup and Event Listeners ---
  function updateTheme(isDark) {
    setRootTheme(isDark);
    const newTheme = isDark ? "material-darker" : "eclipse";
    inputEditor.setOption("theme", newTheme);
    outputEditor.setOption("theme", newTheme);
    renderThemeToggleIcon(isDark);
  }

  settingsTabButtons.forEach((button) => {
    button.addEventListener("click", () =>
      setActiveSettingsTab(button.dataset.settingsTab || "general")
    );
  });
  themeToggleButton?.addEventListener("click", () => {
    const newValue = !settings.ui.useDarkTheme;
    settings.ui.useDarkTheme = newValue;
    saveSettings();
    updateTheme(newValue);
    if (stagedSettings) {
      stagedSettings.ui.useDarkTheme = newValue;
      settingDarkTheme.checked = newValue;
      updateUnsavedIndicator();
    }
  });

  settingsButton.addEventListener("click", () =>
    openSettingsModal("general")
  );

  function openSettingsForCurrentFormat() {
    const activeTab = tabsState.find((t) => t.id === activeTabId);
    const activeFormat =
      activeTab?.format || detectedFormatLabel.textContent || "";
    const tabName = getSettingsTabForFormat(activeFormat);
    if (!tabName) return;
    openSettingsModal(tabName);
  }

  if (detectedFormatLabel) {
    detectedFormatLabel.addEventListener("click", () => {
      openSettingsForCurrentFormat();
    });
    detectedFormatLabel.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        openSettingsForCurrentFormat();
      }
    });
  }
  closeSettingsButton.addEventListener("click", () =>
    closeSettingsModal(false)
  );
  settingsModal.addEventListener("click", (e) => {
    if (e.target === settingsModal) closeSettingsModal(false);
  });
  settingsSaveButton?.addEventListener("click", (e) => {
    e.preventDefault();
    closeSettingsModal(true);
  });
  settingsCancelButton?.addEventListener("click", (e) => {
    e.preventDefault();
    closeSettingsModal(false);
  });

  // Settings Listeners
  settingRedactUrlPath.addEventListener("change", (e) => {
    updateStagedSettings(
      (draft) => (draft.redaction.redactUrlPath = e.target.checked)
    );
  });
  settingRedactHost.addEventListener("change", (e) => {
    updateStagedSettings(
      (draft) => (draft.redaction.redactHost = e.target.checked)
    );
  });
  settingRedactQueryString.addEventListener("change", (e) => {
    updateStagedSettings(
      (draft) => (draft.redaction.redactQueryString = e.target.checked)
    );
  });
  settingRedactParamNames.addEventListener("change", (e) => {
    updateStagedSettings(
      (draft) => (draft.redaction.redactParamNames = e.target.checked)
    );
  });
  settingRedactCookies.addEventListener("change", (e) => {
    updateStagedSettings(
      (draft) => (draft.redaction.redactCookies = e.target.checked)
    );
  });
  settingRedactCsrf.addEventListener("change", (e) => {
    updateStagedSettings(
      (draft) => (draft.redaction.redactCsrf = e.target.checked)
    );
  });
  settingIgnoredWords.addEventListener("input", (e) => {
    updateStagedSettings(
      (draft) =>
      (draft.redaction.ignoredWords = parseCommaSeparatedList(
        e.target.value
      ))
    );
  });
  settingProtectedFields.addEventListener("input", (e) => {
    updateStagedSettings(
      (draft) =>
        (draft.redaction.protectedFields = parseCommaSeparatedList(
          e.target.value
        ))
    );
  });
  settingJsonSortKeys?.addEventListener("change", (e) => {
    const { checked } = e.target;
    updateStagedSettings((draft) => {
      if (!draft.json) draft.json = { ...defaultSettings.json };
      draft.json.sortKeysAlphabetically = checked;
    });
  });
  settingCsvWithHeader.addEventListener("change", (e) => {
    if (!e.target.checked) return;
    updateStagedSettings(
      (draft) => (draft.redaction.csvHasHeader = true)
    );
  });
  settingCsvNoHeader.addEventListener("change", (e) => {
    if (!e.target.checked) return;
    updateStagedSettings(
      (draft) => (draft.redaction.csvHasHeader = false)
    );
  });
  settingDarkTheme.addEventListener("change", (e) => {
    const newValue = e.target.checked;
    updateStagedSettings((draft) => (draft.ui.useDarkTheme = newValue));
    settings.ui.useDarkTheme = newValue;
    updateTheme(newValue);
  });
  settingSyntaxHighlight.addEventListener("change", (e) => {
    const newValue = e.target.checked;
    updateStagedSettings((draft) => (draft.ui.syntaxHighlight = newValue));
    settings.ui.syntaxHighlight = newValue;
    renderContent();
  });

  if (bulkSaveButton && bulkSaveModal) {
    bulkSaveButton.addEventListener("click", () => {
      if (!inputEditor.getValue().trim()) {
        showError("Provide input data before generating bulk redactions.");
        return;
      }
      openBulkSaveModal();
    });
    bulkSaveCancel?.addEventListener("click", closeBulkSaveModal);
    bulkSaveConfirm?.addEventListener("click", handleBulkSaveGeneration);
    bulkSaveModal.addEventListener("click", (e) => {
      if (e.target === bulkSaveModal) closeBulkSaveModal();
    });
  }

  if (fileConfirmationModal) {
    fileConfirmationCancel?.addEventListener("click", (e) => {
      e.preventDefault();
      cancelFileConfirmationModal();
    });
    fileConfirmationClose?.addEventListener("click", (e) => {
      e.preventDefault();
      cancelFileConfirmationModal();
    });
    fileConfirmationConfirm?.addEventListener("click", (e) => {
      e.preventDefault();
      settleFileConfirmationModal(true);
    });
    fileConfirmationModal.addEventListener("click", (e) => {
      if (e.target === fileConfirmationModal) {
        cancelFileConfirmationModal();
      }
    });
  }

  if (openFileButton && openFileMenu) {
    openFileButton.addEventListener("click", (e) => {
      e.stopPropagation();
      toggleOpenFileMenu();
    });
    openFileMenu.addEventListener("click", (e) => e.stopPropagation());
    document.addEventListener("click", (e) => {
      if (openFileMenu.classList.contains("hidden")) return;
      if (
        !openFileMenu.contains(e.target) &&
        e.target !== openFileButton &&
        !openFileButton.contains(e.target)
      ) {
        closeOpenFileMenu();
      }
    });
  }
  if (chooseLocalFileButton && localFileInput) {
    chooseLocalFileButton.addEventListener("click", () => {
      closeOpenFileMenu();
      localFileInput.click();
    });
    localFileInput.addEventListener("change", handleLocalFileSelection);
  }

  setupInputDragAndDrop();

  clearInputButton?.addEventListener("click", () => {
    clearInputEditorContents();
    closeOpenFileMenu();
  });

  tabsContainer.addEventListener("click", (e) => {
    if (
      e.target.id === "add-tab-button" ||
      e.target.closest("#add-tab-button")
    ) {
      const newTab = createNewTab();
      switchTab(newTab.id);
      return;
    }
    const tabEl = e.target.closest("[data-tab-id]");
    if (!tabEl) return;
    const tabId = Number(tabEl.dataset.tabId);
    if (e.target.tagName === "BUTTON") {
      e.stopPropagation();
      closeTab(tabId);
    } else {
      switchTab(tabId);
    }
  });

  tabsContainer.addEventListener("dblclick", (e) => {
    const titleEl = e.target.closest(".tab-title");
    if (!titleEl) return;
    const tabEl = titleEl.closest("[data-tab-id]");
    const tabId = Number(tabEl.dataset.tabId);
    const tab = tabsState.find((t) => t.id === tabId);
    const input = document.createElement("input");
    input.type = "text";
    input.value = tab.name;
    input.className =
      "bg-gray-300 dark:bg-gray-600 text-gray-900 dark:text-white outline-none rounded px-2 w-full";
    titleEl.replaceWith(input);
    input.focus();
    input.select();
    const finishEditing = () => {
      const newName = input.value.trim();
      if (newName) {
        tab.name = newName;
        tab.isNameManual = true;
      }
      input.replaceWith(titleEl);
      renderTabs();
    };
    input.addEventListener("blur", finishEditing);
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") input.blur();
    });
  });

  tabsContainer.addEventListener("dragstart", (e) => {
    const dragHandle = e.target.closest(".tab-drag-handle");
    if (!dragHandle) return;
    const tabEl = dragHandle.closest("[data-tab-id]");
    if (!tabEl) return;
    draggedTabId = Number(tabEl.dataset.tabId);
    const dt = e.dataTransfer;
    if (dt) {
      dt.effectAllowed = "move";
      dt.setData("text/plain", String(draggedTabId));
    }
    tabEl.classList.add("tab-dragging");
  });

  tabsContainer.addEventListener("dragover", (e) => {
    if (draggedTabId === null) return;
    const tabEl = e.target.closest("[data-tab-id]");
    e.preventDefault();
    if (!tabEl || Number(tabEl.dataset.tabId) === draggedTabId) {
      clearTabDragIndicators();
      return;
    }
    clearTabDragIndicators();
    tabEl.classList.add("tab-drag-over");
    const dt = e.dataTransfer;
    if (dt) dt.dropEffect = "move";
  });

  tabsContainer.addEventListener("drop", (e) => {
    if (draggedTabId === null) return;
    e.preventDefault();
    const tabEl = e.target.closest("[data-tab-id]");
    if (tabEl) {
      const targetId = Number(tabEl.dataset.tabId);
      if (targetId !== draggedTabId) {
        const rect = tabEl.getBoundingClientRect();
        const insertAfter = e.clientX > rect.left + rect.width / 2;
        reorderTabs(draggedTabId, targetId, insertAfter);
      }
    } else {
      reorderTabs(draggedTabId, null, true);
    }
    clearTabDragIndicators();
    tabsContainer
      .querySelectorAll(".tab-dragging")
      .forEach((el) => el.classList.remove("tab-dragging"));
    draggedTabId = null;
  });

  tabsContainer.addEventListener("dragend", () => {
    clearTabDragIndicators();
    tabsContainer
      .querySelectorAll(".tab-dragging")
      .forEach((el) => el.classList.remove("tab-dragging"));
    draggedTabId = null;
  });

  inputEditor.on("change", (instance) => {
    const text = instance.getValue();
    const activeTab = tabsState.find((t) => t.id === activeTabId);
    if (activeTab) {
      activeTab.input = text;
    }

    // Debounce syntax highlighting update
    clearTimeout(syntaxUpdateTimer);
    syntaxUpdateTimer = setTimeout(() => {
      const format = detectFormat(text, settings?.redaction || {});
      const activeTab = tabsState.find((t) => t.id === activeTabId);
      if (activeTab && activeTab.format !== format) {
        activeTab.format = format;
        render();
      }
    }, 500);
  });

  if (saveButton) {
    saveButton.addEventListener("click", saveOutputToFile);
  }
  copyButton.addEventListener("click", (e) => {
    const textToCopy = outputEditor.getValue();
    if (!textToCopy) return;
    const tempTextArea = document.createElement("textarea");
    tempTextArea.value = textToCopy;
    document.body.appendChild(tempTextArea);
    tempTextArea.select();
    try {
      document.execCommand("copy");
      const originalIcon = copyButton.innerHTML;
      copyButton.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-green-400"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
      setTimeout(() => {
        copyButton.innerHTML = originalIcon;
      }, 1500);
    } catch (err) {
      console.error("Fallback: Oops, unable to copy", err);
      showError("Could not copy to clipboard.");
    }
    document.body.removeChild(tempTextArea);
  });

  redactButton.addEventListener("click", handleRedaction);

  document.addEventListener("keydown", (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      redactButton.click();
    } else if (
      e.key === "Escape" &&
      !bulkSaveModal?.classList.contains("hidden")
    ) {
      closeBulkSaveModal();
    } else if (
      e.key === "Escape" &&
      !settingsModal.classList.contains("hidden")
    ) {
      closeSettingsModal(false);
    } else if (
      e.key === "Escape" &&
      !fileConfirmationModal?.classList.contains("hidden")
    ) {
      cancelFileConfirmationModal();
    }
  });

  // --- Synchronized Scrolling ---
  let isSyncing = false;
  function syncScroll(source, target) {
    if (!isSyncing) {
      isSyncing = true;
      const sourceInfo = source.getScrollInfo();
      target.scrollTo(sourceInfo.left, sourceInfo.top);
      isSyncing = false;
    }
  }
  inputEditor.on("scroll", () => syncScroll(inputEditor, outputEditor));
  outputEditor.on("scroll", () => syncScroll(outputEditor, inputEditor));

  // --- Splitter Logic ---
  const splitter = document.getElementById("splitter"),
    leftPanel = document.getElementById("left-panel"),
    rightPanel = document.getElementById("right-panel"),
    container = document.getElementById("container"),
    mobileLayoutMediaQuery = window.matchMedia("(max-width: 767px)");
  let isDragging = false;
  let userHasAdjustedSplitter = false;
  let storedDesktopWidths = null;

  const isMobileLayout = () => mobileLayoutMediaQuery.matches;

  function relocateRedactButton() {
    if (!redactButton) return;
    const targetSlot = isMobileLayout()
      ? mobileRedactButtonSlot
      : desktopRedactButtonSlot;
    if (targetSlot && redactButton.parentElement !== targetSlot) {
      targetSlot.appendChild(redactButton);
    }
  }

  function storeCurrentWidths() {
    storedDesktopWidths = {
      left: leftPanel.style.width,
      right: rightPanel.style.width,
    };
  }

  function resetPanelsForMobile() {
    if (!storedDesktopWidths) {
      storeCurrentWidths();
    }
    leftPanel.style.width = "";
    rightPanel.style.width = "";
  }

  function restorePanelsAfterMobile() {
    if (!storedDesktopWidths) return;
    leftPanel.style.width = storedDesktopWidths.left;
    rightPanel.style.width = storedDesktopWidths.right;
    storedDesktopWidths = null;
  }

  function handleLayoutChange() {
    if (isMobileLayout()) {
      resetPanelsForMobile();
    } else {
      restorePanelsAfterMobile();
    }
    inputEditor.refresh();
    outputEditor.refresh();
    relocateRedactButton();
  }

  if (typeof mobileLayoutMediaQuery.addEventListener === "function") {
    mobileLayoutMediaQuery.addEventListener("change", handleLayoutChange);
  } else {
    mobileLayoutMediaQuery.addListener(handleLayoutChange);
  }
  handleLayoutChange();

  splitter.addEventListener("mousedown", (event) => {
    if (isMobileLayout()) return;
    isDragging = true;
    event.preventDefault();
  });
  document.addEventListener("mouseup", () => {
    if (isDragging) {
      isDragging = false;
      inputEditor.refresh();
      outputEditor.refresh();
    }
  });
  document.addEventListener("mousemove", (e) => {
    if (!isDragging || isMobileLayout()) return;
    e.preventDefault();
    const containerRect = container.getBoundingClientRect();
    const newLeftWidth = e.clientX - containerRect.left;
    if (
      newLeftWidth > 100 &&
      newLeftWidth < container.clientWidth - 100
    ) {
      const newLeftPercent = (newLeftWidth / container.clientWidth) * 100;
      leftPanel.style.width = `${newLeftPercent}%`;
      rightPanel.style.width = `${100 - newLeftPercent}%`;
      userHasAdjustedSplitter = true;
    }
  });

  splitter.addEventListener("dblclick", () => {
    if (isMobileLayout() || !userHasAdjustedSplitter) return;
    leftPanel.style.width = "50%";
    rightPanel.style.width = "50%";
    userHasAdjustedSplitter = false;
    inputEditor.refresh();
    outputEditor.refresh();
  });

  // --- Tab Scrolling ---
  scrollLeftButton.addEventListener("click", () => {
    tabsContainer.scrollBy({ left: -200, behavior: "smooth" });
  });
  scrollRightButton.addEventListener("click", () => {
    tabsContainer.scrollBy({ left: 200, behavior: "smooth" });
  });
  tabsContainer.addEventListener("scroll", updateScrollButtonStates);
  new ResizeObserver(checkTabOverflow).observe(tabsContainer);
  window.addEventListener("resize", checkTabOverflow);

  // --- Initialize First Tab & Settings ---
  setActiveSettingsTab("general");
  populateExampleFiles();
  loadSettings();
  updateTheme(settings.ui.useDarkTheme);
  const firstTab = createNewTab();
  activeTabId = firstTab.id;
  fetchCommonWords().catch((error) =>
    console.error("Failed to preload word list:", error)
  );
  render();
});
