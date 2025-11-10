document.addEventListener("DOMContentLoaded", () => {
  const redactButton = document.getElementById("redact-button");
  const errorToast = document.getElementById("error-toast");
  const errorMessageEl = document.getElementById("error-message");
  const detectedFormatLabel = document.getElementById("detected-format");
  const tabsContainer = document.getElementById("tabs-container");
  const scrollLeftButton = document.getElementById("scroll-left-button");
  const scrollRightButton = document.getElementById(
    "scroll-right-button"
  );
  const copyButton = document.getElementById("copy-button");
  const saveButton = document.getElementById("save-button");
  const openFileButton = document.getElementById("open-file-button");
  const openFileMenu = document.getElementById("open-file-menu");
  const exampleFilesList = document.getElementById("example-files-list");
  const chooseLocalFileButton = document.getElementById(
    "choose-local-file-button"
  );
  const localFileInput = document.getElementById("local-file-input");

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
  const settingDarkTheme = document.getElementById("setting-dark-theme");
  const settingSyntaxHighlight = document.getElementById(
    "setting-syntax-highlight"
  );

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
        "Paste JSON, XML, YAML, Form URL-Encoded, HTTP, or plain text data below...",
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
  let settings = {};
  let syntaxUpdateTimer;
  const COMMON_WORDS_URL = "words.txt";
  let commonWordsPromise = null;
  const EXAMPLE_FILES = [
    { label: "Sample JSON", file: "example.json" },
    { label: "Sample XML", file: "example.xml" },
    { label: "Sample YAML", file: "example.yaml" },
    { label: "HTTP GET (no query)", file: "get_no_query.http" },
    { label: "HTTP GET (with query)", file: "get_with_query.http" },
    { label: "HTTP GET (with cookies)", file: "get_with_cookies.http" },
    { label: "HTTP GET (with CSRF)", file: "get_with_csrf.http" },
    { label: "HTTP POST (form data)", file: "post_form.http" },
    { label: "HTTP POST (JSON)", file: "post_json.http" },
    { label: "HTTP POST (no query)", file: "post_no_query.http" },
    { label: "HTTP POST (with query)", file: "post_with_query.http" },
    { label: "HTTP POST (XML)", file: "post_xml.http" },
    { label: "HTTP Response Sample", file: "response_example.http" },
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
      ignoredWords: [],
      protectedFields: [],
    },
    ui: {
      useDarkTheme: window.matchMedia("(prefers-color-scheme: dark)")
        .matches,
      syntaxHighlight: true,
    },
  };

  function fetchCommonWords() {
    if (!commonWordsPromise) {
      commonWordsPromise = fetch(COMMON_WORDS_URL)
        .then((response) => {
          if (!response.ok) {
            throw new Error("Failed to load dictionary");
          }
          return response.text();
        })
        .then((text) =>
          text
            .split(/\r?\n/)
            .map((word) => word.trim())
            .filter(Boolean)
        )
        .then((words) => {
          RedactionEngine.commonWords = words;
          return words;
        })
        .catch((error) => {
          commonWordsPromise = null;
          throw error;
        });
    }
    return commonWordsPromise;
  }

  async function ensureCommonWordsLoaded() {
    if (RedactionEngine.commonWords?.length) return;
    await fetchCommonWords();
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

  function loadExampleFile(fileName, label) {
    fetch(`examples/${fileName}`)
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
      });
  }

  function handleLocalFileSelection(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      loadContentIntoEditor(reader.result || "", file.name);
      localFileInput.value = "";
    };
    reader.onerror = () => {
      console.error("File read error:", reader.error);
      showError("Failed to read the selected file.");
      localFileInput.value = "";
    };
    reader.readAsText(file);
  }

  function loadContentIntoEditor(content, sourceLabel = "") {
    const activeTab = tabsState.find((t) => t.id === activeTabId);
    if (!activeTab) return;
    activeTab.input = content;
    activeTab.output = "";
    const detected = detectFormat(content);
    activeTab.format = detected;
    if (sourceLabel) {
      activeTab.name = sourceLabel;
      activeTab.originalName = sourceLabel;
    }
    inputEditor.setValue(content);
    outputEditor.setValue("");
    detectedFormatLabel.textContent = detected;
    renderTabs();
    renderContent();
  }

  function getSuggestedFilename() {
    const activeTab = tabsState.find((t) => t.id === activeTabId);
    const format = activeTab?.format || detectFormat(inputEditor.getValue());
    const formatToExtension = {
      JSON: "json",
      XML: "xml",
      YAML: "yaml",
      "HTTP Request": "http",
      "HTTP Response": "http",
      "Form URL-Encoded": "txt",
      "Plain Text": "txt",
    };
    const extension = formatToExtension[format] || "txt";
    const baseName = (activeTab?.name || "redacted")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "_")
      .replace(/[^\w.-]/g, "");
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    return `${baseName || "redacted"}-${timestamp}.${extension}`;
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

  function saveSettings() {
    localStorage.setItem("redactorSettings", JSON.stringify(settings));
  }

  function loadSettings() {
    const saved = JSON.parse(localStorage.getItem("redactorSettings"));
    const savedRedaction = saved?.redaction || {};
    if (!Array.isArray(savedRedaction.ignoredWords)) {
      savedRedaction.ignoredWords = [];
    }
    if (!Array.isArray(savedRedaction.protectedFields)) {
      savedRedaction.protectedFields = [];
    }
    settings = {
      redaction: { ...defaultSettings.redaction, ...savedRedaction },
      ui: { ...defaultSettings.ui, ...saved?.ui },
    };
    settingRedactUrlPath.checked = settings.redaction.redactUrlPath;
    settingRedactHost.checked = settings.redaction.redactHost;
    settingRedactQueryString.checked =
      settings.redaction.redactQueryString;
    settingRedactParamNames.checked = settings.redaction.redactParamNames;
    settingRedactCookies.checked = settings.redaction.redactCookies;
    settingRedactCsrf.checked = settings.redaction.redactCsrf;
    settingIgnoredWords.value =
      settings.redaction.ignoredWords.join(", ");
    settingProtectedFields.value =
      settings.redaction.protectedFields.join(", ");
    settingDarkTheme.checked = settings.ui.useDarkTheme;
    settingSyntaxHighlight.checked = settings.ui.syntaxHighlight;
  }

  // --- Tab Management ---
  function createNewTab() {
    tabCounter++;
    const newTab = {
      id: Date.now(),
      name: `Untitled ${tabCounter}`,
      originalName: `Untitled ${tabCounter}`,
      input: "",
      output: "",
      format: "",
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
      tabEl.className = `flex-shrink-0 flex items-center cursor-pointer border-r border-t border-gray-300 dark:border-gray-700 p-2 rounded-t-md mt-2 ${
        isActive
          ? "bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
          : "bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-300 dark:hover:bg-gray-600"
      }`;
      const titleEl = document.createElement("span");
      titleEl.textContent = tab.name;
      titleEl.className = "px-2";
      const closeBtn = document.createElement("button");
      closeBtn.textContent = "×";
      closeBtn.className =
        "ml-2 w-5 h-5 flex items-center justify-center rounded-full hover:bg-red-500 hover:text-white";
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
    if (format.startsWith("HTTP")) return "http";
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

    detectedFormatLabel.textContent = activeTab.format;
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

  // --- Redaction Engine ---
  class RedactionEngine {
    constructor(settings = {}) {
      this.settings = { ...settings };
      this.floatPlaceholderPrefix = "__REDACTED_FLOAT_PLACEHOLDER__:";
      this.wordMap = this.constructor.buildWordMap();
      this.ignoredWordsSet = new Set(
        (this.settings.ignoredWords || []).map((w) => w.toLowerCase())
      );
      this.protectedFieldsSet = new Set(
        (this.settings.protectedFields || []).map((field) =>
          field.toLowerCase()
        )
      );
    }

    static buildWordMap() {
      const map = {};
      const commonWords = this.commonWords || [];
      for (const word of commonWords) {
        const length = word.length;
        if (!map[length]) map[length] = [];
        map[length].push(word);
      }
      return map;
    }

    redactPrimitive(valueStr) {
      const trimmed = valueStr.trim();
      if (trimmed === "true" || trimmed === "false")
        return Math.random() < 0.5;

      const uuidRegex =
        /^[a-f\d]{8}-[a-f\d]{4}-[1-5][a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i;
      if (uuidRegex.test(trimmed)) {
        return crypto.randomUUID();
      }

      const isoDateRegex =
        /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d+)?Z?)?$/;
      const commonDateRegex = /^\d{2}[-\/.]\d{2}[-\/.]\d{4}$/;

      if (isoDateRegex.test(trimmed) || commonDateRegex.test(trimmed)) {
        return this.generateRandomDate(trimmed);
      }

      if (
        !isNaN(trimmed) &&
        trimmed !== "" &&
        !isNaN(parseFloat(trimmed))
      )
        return this.redactNumber(trimmed);
      return this.redactString(valueStr);
    }

    generateRandomDate(originalDate) {
      const randomYear = Math.floor(Math.random() * 60) + 1980; // Year between 1980-2039
      const randomMonth = Math.floor(Math.random() * 12); // 0-11
      const daysInMonth = new Date(
        randomYear,
        randomMonth + 1,
        0
      ).getDate();
      const randomDay = Math.floor(Math.random() * daysInMonth) + 1;
      const date = new Date(Date.UTC(randomYear, randomMonth, randomDay));

      const pad = (n) => String(n).padStart(2, "0");

      if (originalDate.includes("T")) {
        const randomHour = Math.floor(Math.random() * 24);
        const randomMinute = Math.floor(Math.random() * 60);
        const randomSecond = Math.floor(Math.random() * 60);
        date.setUTCHours(randomHour, randomMinute, randomSecond);
        let isoString = date.toISOString();
        if (!originalDate.endsWith("Z")) {
          isoString = isoString.slice(0, -1);
        }
        return isoString;
      } else if (/^\d{4}/.test(originalDate)) {
        const separator = originalDate.charAt(4);
        return `${date.getUTCFullYear()}${separator}${pad(
          date.getUTCMonth() + 1
        )}${separator}${pad(date.getUTCDate())}`;
      } else {
        const separator = originalDate.charAt(2);
        return `${pad(date.getUTCDate())}${separator}${pad(
          date.getUTCMonth() + 1
        )}${separator}${date.getUTCFullYear()}`;
      }
    }

    redactNumber(numStr) {
      const isFloat = String(numStr).includes(".");
      let redactedStr = "";
      const digits = "0123456789";
      for (const char of String(numStr)) {
        if (digits.includes(char)) {
          redactedStr +=
            digits[Math.floor(Math.random() * digits.length)];
        } else {
          redactedStr += char;
        }
      }
      if (isFloat) {
        const originalDecimalPlaces = (String(numStr).split(".")[1] || "")
          .length;
        let [intPart, decPart = ""] = redactedStr.split(".");
        while (decPart.length < originalDecimalPlaces) decPart += "0";
        redactedStr =
          intPart + "." + decPart.slice(0, originalDecimalPlaces);
        return this.floatPlaceholderPrefix + redactedStr;
      } else {
        return parseInt(redactedStr, 10);
      }
    }

    redactString(original) {
      const parts = original.split(/(\W+)/);
      return parts
        .map((part) => {
          if (this.ignoredWordsSet.has(part.toLowerCase())) {
            return part;
          }
          if (!/^\w+$/.test(part)) return part;

          const isAlphabetic = /^[a-zA-Z]+$/.test(part);
          if (isAlphabetic && this.wordMap[part.length]) {
            const newWord =
              this.wordMap[part.length][
                Math.floor(
                  Math.random() * this.wordMap[part.length].length
                )
              ];
            return this.preserveCase(part, newWord);
          } else {
            // Fallback if not alphabetic OR no same-length dictionary word exists
            return this.generateRandomString(part);
          }
        })
        .join("");
    }

    preserveCase(original, newWord) {
      if (original === original.toUpperCase())
        return newWord.toUpperCase();
      if (
        original.length > 0 &&
        original[0] === original[0].toUpperCase()
      ) {
        const isTitleCase =
          original.slice(1) === original.slice(1).toLowerCase();
        if (isTitleCase)
          return (
            newWord.charAt(0).toUpperCase() +
            newWord.slice(1).toLowerCase()
          );
        return newWord.toUpperCase();
      }
      return newWord.toLowerCase();
    }

    generateRandomString(original) {
      const upper = "ABCDEFGHIJKLMNOPQRSTUVWXYZ",
        lower = "abcdefghijklmnopqrstuvwxyz",
        digits = "0123456789";
      let redacted = "";
      for (const char of original) {
        if (upper.includes(char))
          redacted += upper[Math.floor(Math.random() * upper.length)];
        else if (lower.includes(char))
          redacted += lower[Math.floor(Math.random() * lower.length)];
        else if (digits.includes(char))
          redacted += digits[Math.floor(Math.random() * digits.length)];
        else redacted += char;
      }
      return redacted;
    }

    isProtectedField(fieldName) {
      if (typeof fieldName !== "string") return false;
      const normalized = fieldName.trim().toLowerCase();
      if (!normalized) return false;
      return this.protectedFieldsSet.has(normalized);
    }

    static commonWords = [];
  }

  // --- Format-Specific Handlers ---
  let redactor;
  let toastTimeout;

  function redactJsonStructure(value, currentRedactor, key = null) {
    if (value === null) return null;
    if (
      typeof key === "string" &&
      currentRedactor?.isProtectedField?.(key)
    ) {
      return value;
    }
    // CSRF check for any value type
    if (currentRedactor.settings.redactCsrf && typeof key === "string") {
      const lowerKey = key.toLowerCase();
      if (lowerKey.includes("csrf") || lowerKey.includes("xsrf")) {
        return currentRedactor.redactString(String(value));
      }
    }
    if (typeof value === "boolean") return Math.random() < 0.5;
    if (typeof value === "number")
      return currentRedactor.redactNumber(String(value));
    if (typeof value === "string") {
      return currentRedactor.redactPrimitive(value);
    }
    if (Array.isArray(value))
      return value.map((item) =>
        redactJsonStructure(item, currentRedactor)
      ); // key is null
    if (typeof value === "object")
      return Object.entries(value).reduce(
        (acc, [k, v]) => ({
          ...acc,
          [k]: redactJsonStructure(v, currentRedactor, k),
        }),
        {}
      );
    return value;
  }

  function handleJson(text) {
    const data = JSON.parse(text);
    const sorted = sortObjectKeys(data);
    const formattedInput = JSON.stringify(sorted, null, 2);
    const redacted = redactJsonStructure(sorted, redactor);
    const redactedString = JSON.stringify(redacted, null, 2);
    const finalString = redactedString.replace(
      new RegExp(`"${redactor.floatPlaceholderPrefix}([-.0-9]+)"`, "g"),
      (m, n) => n
    );
    updateActiveTabData({
      input: formattedInput,
      output: finalString,
      format: "JSON",
    });
    function sortObjectKeys(obj) {
      if (typeof obj !== "object" || obj === null) return obj;
      if (Array.isArray(obj)) return obj.map(sortObjectKeys);
      return Object.keys(obj)
        .sort()
        .reduce(
          (res, k) => ({ ...res, [k]: sortObjectKeys(obj[k]) }),
          {}
        );
    }
  }

  function handleYaml(text) {
    const data = jsyaml.load(text);
    const redacted = redactJsonStructure(data, redactor);
    const redactedYaml = jsyaml.dump(redacted, { noArrayIndent: true });
    updateActiveTabData({
      input: text,
      output: redactedYaml,
      format: "YAML",
    });
  }

  function handleXml(text) {
    const parser = new DOMParser();
    let workingText = text;
    let preservedDocType = "";
    if (/^\s*<!DOCTYPE[\s\S]+?>/i.test(workingText)) {
      const docTypeMatch = workingText.match(
        /^\s*<!DOCTYPE[\s\S]+?>\s*/i
      );
      if (docTypeMatch) {
        preservedDocType = docTypeMatch[0];
        workingText = workingText.slice(docTypeMatch[0].length);
      }
    }
    let xmlDoc = parser.parseFromString(
      workingText,
      "application/xml"
    );
    if (xmlDoc.getElementsByTagName("parsererror").length) {
      xmlDoc = parser.parseFromString(workingText, "text/html");
    }
    if (!xmlDoc || !xmlDoc.documentElement) {
      throw new Error("XML parsing error.");
    }
    const formattedInput = formatXml(xmlDoc);
    traverseAndRedact(xmlDoc.documentElement);
    const formattedOutput = formatXml(xmlDoc);
    const finalOutput = formattedOutput.replace(
      new RegExp(redactor.floatPlaceholderPrefix, "g"),
      ""
    );
    updateActiveTabData({
      input: preservedDocType + formattedInput,
      output: preservedDocType + finalOutput,
      format: "XML",
    });
    function traverseAndRedact(node) {
      if (
        node.nodeType === 3 &&
        node.nodeValue.trim() &&
        !redactor.isProtectedField(node.parentNode?.nodeName)
      ) {
        node.nodeValue = redactor.redactPrimitive(node.nodeValue);
      }
      if (node.attributes) {
        Array.from(node.attributes).forEach((attr) => {
          if (redactor.isProtectedField(attr.name)) return;
          attr.value = redactor.redactPrimitive(attr.value);
        });
      }
      node.childNodes.forEach(traverseAndRedact);
    }
    function formatXml(xmlNode) {
      const serializer = new XMLSerializer();
      const xmlString = serializer.serializeToString(xmlNode);
      let contentString = xmlString;
      let declaration = "";
      const declMatch = xmlString.match(/(<\?xml[^>]*\?>\s*)/);
      if (declMatch) {
        declaration = declMatch[0];
        contentString = xmlString.substring(declaration.length);
      }
      let formatted = "",
        indent = "";
      const tab = "  ";
      const parts = contentString.split(/>\s*</);
      if (parts.length === 1 && !declaration) return xmlString;
      parts.forEach((node, index) => {
        let isClosing = node.startsWith("/");
        if (isClosing) indent = indent.substring(tab.length);
        let padding = indent;
        if (index > 0) padding = "\n" + indent;
        let reconstructedNode =
          index === 0
            ? node + ">"
            : index === parts.length - 1
            ? "<" + node
            : "<" + node + ">";
        if (reconstructedNode.trim())
          formatted += padding + reconstructedNode;
        if (
          !isClosing &&
          !node.endsWith("/") &&
          !reconstructedNode.includes("</")
        )
          indent += tab;
      });
      return declaration + formatted;
    }
  }

  function handleFormUrlEncoded(text) {
    const trimmedText = text.trim();
    if (
      !text.includes("=") ||
      trimmedText.startsWith("{") ||
      trimmedText.startsWith("<") ||
      trimmedText.startsWith("HTTP/")
    ) {
      throw new Error("Not an application/x-www-form-urlencoded string.");
    }
    const params = new URLSearchParams(text);
    if (Array.from(params.keys()).length === 0) {
      throw new Error("No valid parameters found.");
    }
    const redactedParams = new URLSearchParams();
    for (const [key, value] of params.entries()) {
      const isProtected = redactor.isProtectedField(key);
      const redactedKey =
        !isProtected && settings.redaction.redactParamNames
          ? redactor.redactString(key)
          : key;
      let redactedValue;
      if (isProtected) {
        redactedValue = value;
      } else if (
        redactor.settings.redactCsrf &&
        key.toLowerCase().includes("csrf")
      ) {
        redactedValue = redactor.redactString(value);
      } else {
        const primitive = redactor.redactPrimitive(value);
        redactedValue =
          typeof primitive === "string" &&
          primitive.startsWith(redactor.floatPlaceholderPrefix)
            ? primitive.substring(redactor.floatPlaceholderPrefix.length)
            : String(primitive);
      }
      redactedParams.append(redactedKey, redactedValue);
    }
    const formatParams = (p) => p.toString();
    updateActiveTabData({
      input: formatParams(params),
      output: formatParams(redactedParams),
      format: "Form URL-Encoded",
    });
  }

  function handleHttp(text) {
    const lines = text.split(/\r?\n/);
    const firstLine = lines[0].trim();
    const reqRegex =
      /^(GET|POST|PUT|DELETE|PATCH|HEAD|OPTIONS|TRACE|CONNECT)\s+(.+)\s+HTTP\/[12](\.\d)?$/;
    const resRegex = /^HTTP\/[12](\.\d)?\s+(\d{3})\s+(.*)$/;
    const reqMatch = firstLine.match(reqRegex);
    const resMatch = firstLine.match(resRegex);
    if (!reqMatch && !resMatch)
      throw new Error("Not an HTTP request or response.");

    let headerEndIndex = lines.findIndex((line) => line.trim() === "");
    if (headerEndIndex === -1) headerEndIndex = lines.length;
    const headerLinesOnly = lines.slice(1, headerEndIndex);
    const headerBlock = lines.slice(0, headerEndIndex).join("\n");
    const body = lines.slice(headerEndIndex + 1).join("\n");
    let formattedInput = text;

    let contentType = "";
    const contentTypeHeader = headerLinesOnly.find((h) =>
      h.toLowerCase().startsWith("content-type:")
    );
    if (contentTypeHeader) {
      contentType = contentTypeHeader.split(":")[1].trim().split(";")[0];
    }

    // Check if the body is JSON and prettify it for the input display
    if (
      contentType.includes("json") ||
      (!contentType && body.trim().startsWith("{"))
    ) {
      try {
        const bodyJson = JSON.parse(body);
        const sorted = sortObjectKeys(bodyJson);
        const prettifiedBody = JSON.stringify(sorted, null, 2);
        if (body !== prettifiedBody) {
          formattedInput = headerBlock + "\n\n" + prettifiedBody;
        }
      } catch (e) {
        // Body is not valid JSON, do nothing to the input
      }
    }

    let redactedStartLine;
    if (reqMatch) {
      let pathAndQuery = reqMatch[2];
      const [path, queryString] = pathAndQuery.split("?");
      let redactedQuery = "";

      if (queryString) {
        if (settings.redaction.redactQueryString) {
          const params = new URLSearchParams(queryString);
          const redactedParams = new URLSearchParams();
          for (const [key, value] of params) {
            const isProtected = redactor.isProtectedField(key);
            const redactedKey =
              !isProtected && settings.redaction.redactParamNames
                ? redactor.redactString(key)
                : key;
            const redactedValue = isProtected
              ? value
              : redactor.redactPrimitive(value);
            redactedParams.append(
              redactedKey,
              typeof redactedValue === "string"
                ? redactedValue.replace(
                    redactor.floatPlaceholderPrefix,
                    ""
                  )
                : redactedValue
            );
          }
          redactedQuery = "?" + redactedParams.toString();
        } else {
          redactedQuery = "?" + queryString;
        }
      }

      const redactedPath = settings.redaction.redactUrlPath
        ? redactor.redactString(path)
        : path;
      pathAndQuery = redactedPath + redactedQuery;

      redactedStartLine = `${reqMatch[1]} ${pathAndQuery} HTTP/1.1`;
    } else {
      redactedStartLine = firstLine;
    }

    const redactedHeaders = headerLinesOnly
      .map((headerLine) => {
        const parts = headerLine.split(/:\s*(.*)/s);
        if (parts.length < 2) return headerLine;
        const key = parts[0];
        const value = parts[1] || "";
        const lowerKey = key.toLowerCase();
        if (redactor.isProtectedField(key)) {
          return headerLine;
        }

        if (
          settings.redaction.redactCookies &&
          (lowerKey === "cookie" || lowerKey === "set-cookie")
        ) {
          const redactedCookieValue = value
            .split(";")
            .map((cookiePair) => {
              const trimmedPair = cookiePair.trim();
              const separatorIndex = trimmedPair.indexOf("=");
              if (separatorIndex === -1) return trimmedPair; // Attribute without value like "HttpOnly"

              const cookieName = trimmedPair
                .substring(0, separatorIndex)
                .trim();
              const cookieValue = trimmedPair.substring(
                separatorIndex + 1
              );
              if (redactor.isProtectedField(cookieName)) {
                return trimmedPair;
              }
              return `${cookieName}=${redactor.redactString(cookieValue)}`;
            })
            .join("; ");
          return `${key}: ${redactedCookieValue}`;
        }

        if (
          settings.redaction.redactCookies &&
          (lowerKey === "authorization" ||
            lowerKey === "proxy-authorization")
        ) {
          return `${key}: ${redactor.redactString(value)}`;
        }
        if (lowerKey === "host") {
          if (!settings.redaction.redactHost) return headerLine;
          return `${key}: ${redactor.redactString(value)}`;
        }
        const csrfHeaderNames = [
          "x-csrf-token",
          "x-xsrf-token",
          "csrf-token",
        ];
        if (
          settings.redaction.redactCsrf &&
          csrfHeaderNames.includes(lowerKey)
        ) {
          return `${key}: ${redactor.redactString(value)}`;
        }
        const safeHeaders = [
          "content-type",
          "content-length",
          "connection",
          "accept",
          "user-agent",
          "date",
          "server",
          "accept-encoding",
          "accept-language",
        ];
        if (safeHeaders.includes(lowerKey)) return headerLine;

        return `${key}: ${redactor.redactString(value)}`;
      })
      .join("\n");

    const redactedBody = redactBodyContent(body, redactor, contentType);
    const finalRedacted = `${redactedStartLine}\n${redactedHeaders}${
      body ? "\n\n" + redactedBody : ""
    }`;

    updateActiveTabData({
      input: formattedInput,
      output: finalRedacted,
      format: reqMatch ? "HTTP Request" : "HTTP Response",
    });

    function sortObjectKeys(obj) {
      if (typeof obj !== "object" || obj === null) return obj;
      if (Array.isArray(obj)) return obj.map(sortObjectKeys);
      return Object.keys(obj)
        .sort()
        .reduce(
          (res, k) => ({ ...res, [k]: sortObjectKeys(obj[k]) }),
          {}
        );
    }
  }

  function redactBodyContent(
    bodyText,
    currentRedactor,
    contentType = ""
  ) {
    if (!bodyText) return "";

    const runJsonRedaction = () => {
      const redacted = redactJsonStructure(
        JSON.parse(bodyText),
        currentRedactor
      );
      const redactedString = JSON.stringify(redacted, null, 2);
      return redactedString.replace(
        new RegExp(
          `"${currentRedactor.floatPlaceholderPrefix}([-.0-9]+)"`,
          "g"
        ),
        (m, n) => n
      );
    };
    const runYamlRedaction = () => {
      const redacted = redactJsonStructure(
        jsyaml.load(bodyText),
        currentRedactor
      );
      return jsyaml.dump(redacted, { noArrayIndent: true });
    };
    const runXmlRedaction = () => {
      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(bodyText, "application/xml");
      if (xmlDoc.getElementsByTagName("parsererror").length > 0)
        throw new Error();
      function traverse(node) {
        if (
          node.nodeType === 3 &&
          node.nodeValue.trim() &&
          !currentRedactor.isProtectedField(node.parentNode?.nodeName)
        ) {
          node.nodeValue = currentRedactor.redactPrimitive(node.nodeValue);
        }
        if (node.attributes) {
          Array.from(node.attributes).forEach((attr) => {
            if (currentRedactor.isProtectedField(attr.name)) return;
            attr.value = currentRedactor.redactPrimitive(attr.value);
          });
        }
        node.childNodes.forEach(traverse);
      }
      traverse(xmlDoc.documentElement);
      const serializedXml = new XMLSerializer().serializeToString(xmlDoc);
      return serializedXml.replace(
        new RegExp(currentRedactor.floatPlaceholderPrefix, "g"),
        ""
      );
    };
    const runFormUrlEncodedRedaction = () => {
      if (!bodyText.includes("=")) throw new Error();
      const params = new URLSearchParams(bodyText);
      if (Array.from(params.keys()).length === 0) throw new Error();
      const redactedParams = new URLSearchParams();
      for (const [key, value] of params.entries()) {
        const isProtected = currentRedactor.isProtectedField(key);
        let redactedValue;
        const redactedKey =
          !isProtected && currentRedactor.settings.redactParamNames
            ? currentRedactor.redactString(key)
            : key;
        if (isProtected) {
          redactedValue = value;
        } else if (
          currentRedactor.settings.redactCsrf &&
          key.toLowerCase().includes("csrf")
        ) {
          redactedValue = currentRedactor.redactString(value);
        } else {
          const p = currentRedactor.redactPrimitive(value);
          redactedValue =
            typeof p === "string" &&
            p.startsWith(currentRedactor.floatPlaceholderPrefix)
              ? p.substring(currentRedactor.floatPlaceholderPrefix.length)
              : String(p);
        }
        redactedParams.append(redactedKey, redactedValue);
      }
      return redactedParams.toString();
    };
    const runPlainTextRedaction = () => {
      return bodyText
        .split("\n")
        .map((line) => currentRedactor.redactString(line))
        .join("\n");
    };

    const mainContentType = contentType.split(";")[0].trim();

    const contentMap = {
      "application/json": runJsonRedaction,
      "application/xml": runXmlRedaction,
      "text/xml": runXmlRedaction,
      "application/x-www-form-urlencoded": runFormUrlEncodedRedaction,
      "application/yaml": runYamlRedaction,
      "text/yaml": runYamlRedaction,
    };

    if (contentMap[mainContentType]) {
      try {
        return contentMap[mainContentType]();
      } catch (e) {
        // Fallback if parsing fails despite content-type header
        return runPlainTextRedaction();
      }
    }

    // Fallback detection if content-type is missing or not recognized
    try {
      return runJsonRedaction();
    } catch (e) {}
    try {
      return runYamlRedaction();
    } catch (e) {}
    try {
      return runXmlRedaction();
    } catch (e) {}
    try {
      return runFormUrlEncodedRedaction();
    } catch (e) {}

    return runPlainTextRedaction();
  }

  function handlePlainText(text) {
    const redactedText = text
      .split("\n")
      .map((line) => redactor.redactString(line))
      .join("\n");
    updateActiveTabData({ output: redactedText, format: "Plain Text" });
  }

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
    redactor = new RedactionEngine(settings.redaction);
    const activeTab = tabsState.find((t) => t.id === activeTabId);
    if (!activeTab) return;

    const text = inputEditor.getValue();
    activeTab.input = text;
    const trimmedText = text.trim();

    if (!trimmedText) {
      updateActiveTabData({ output: "", format: "" });
      renderContent();
      return;
    }

    const format = detectFormat(text);
    activeTab.format = format;

    try {
      switch (format) {
        case "HTTP Request":
        case "HTTP Response":
          handleHttp(text);
          break;
        case "JSON":
          handleJson(trimmedText);
          break;
        case "XML":
          handleXml(trimmedText);
          break;
        case "YAML":
          handleYaml(trimmedText);
          break;
        case "Form URL-Encoded":
          handleFormUrlEncoded(trimmedText);
          break;
        default:
          handlePlainText(text);
      }
    } catch (e) {
      console.error("Redaction Error:", e);
      showError(`Failed to process as ${format}.`);
      handlePlainText(text); // Fallback to plain text on error
    }

    render();
  }

  function updateActiveTabData(data) {
    const activeTab = tabsState.find((t) => t.id === activeTabId);
    if (activeTab) {
      Object.assign(activeTab, data);
      if (activeTab.originalName && data.format) {
        const tabNumber = activeTab.originalName.split(" ")[1] || "";
        let baseName = data.format.startsWith("HTTP")
          ? data.format
          : data.format.split(" ")[0];
        activeTab.name = `${baseName} ${tabNumber}`.trim();
      }
    }
  }

  function detectFormat(text) {
    const trimmedText = text.trim();
    if (!trimmedText) return "";
    const normalizedText = trimmedText.replace(/^\uFEFF/, "");

    try {
      const firstLine = normalizedText.split(/\r?\n/)[0].trim();
      const reqRegex =
        /^(GET|POST|PUT|DELETE|PATCH|HEAD|OPTIONS|TRACE|CONNECT)\s+(.+)\s+HTTP\/[12](\.\d)?$/;
      const resRegex = /^HTTP\/[12](\.\d)?\s+(\d{3})\s+(.*)$/;
      if (reqRegex.test(firstLine)) return "HTTP Request";
      if (resRegex.test(firstLine)) return "HTTP Response";
    } catch (e) {}

    if (/^<!doctype\b/i.test(normalizedText)) {
      return "XML";
    }

    try {
      JSON.parse(trimmedText);
      return "JSON";
    } catch (e) {}

    try {
      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(
        normalizedText,
        "application/xml"
      );
      if (xmlDoc.getElementsByTagName("parsererror").length > 0)
        throw new Error();
      return "XML";
    } catch (e) {}

    try {
      // More specific YAML check: must contain a colon or a dash at the start of a line
      if (!/:\s|\n\s*-/.test(text)) throw new Error();
      const doc = jsyaml.load(text);
      if (
        typeof doc === "object" &&
        doc !== null &&
        Object.keys(doc).length > 0
      )
        return "YAML";
      if (Array.isArray(doc) && doc.length > 0) return "YAML";
    } catch (e) {}

    try {
      if (
        !trimmedText.includes("=") ||
        trimmedText.startsWith("{") ||
        trimmedText.startsWith("<") ||
        trimmedText.startsWith("HTTP/")
      ) {
        throw new Error();
      }
      const params = new URLSearchParams(trimmedText);
      if (Array.from(params.keys()).length === 0) throw new Error();
      return "Form URL-Encoded";
    } catch (e) {}

    return "Plain Text";
  }

  // --- Initial Setup and Event Listeners ---
  function updateTheme(isDark) {
    document.documentElement.classList.toggle("dark", isDark);
    const newTheme = isDark ? "material-darker" : "eclipse";
    inputEditor.setOption("theme", newTheme);
    outputEditor.setOption("theme", newTheme);
  }

  settingsButton.addEventListener("click", () =>
    settingsModal.classList.remove("hidden")
  );
  closeSettingsButton.addEventListener("click", () =>
    settingsModal.classList.add("hidden")
  );
  settingsModal.addEventListener("click", (e) => {
    if (e.target === settingsModal) settingsModal.classList.add("hidden");
  });

  // Settings Listeners
  settingRedactUrlPath.addEventListener("change", (e) => {
    settings.redaction.redactUrlPath = e.target.checked;
    saveSettings();
  });
  settingRedactHost.addEventListener("change", (e) => {
    settings.redaction.redactHost = e.target.checked;
    saveSettings();
  });
  settingRedactQueryString.addEventListener("change", (e) => {
    settings.redaction.redactQueryString = e.target.checked;
    saveSettings();
  });
  settingRedactParamNames.addEventListener("change", (e) => {
    settings.redaction.redactParamNames = e.target.checked;
    saveSettings();
  });
  settingRedactCookies.addEventListener("change", (e) => {
    settings.redaction.redactCookies = e.target.checked;
    saveSettings();
  });
  settingRedactCsrf.addEventListener("change", (e) => {
    settings.redaction.redactCsrf = e.target.checked;
    saveSettings();
  });
  settingIgnoredWords.addEventListener("input", (e) => {
    settings.redaction.ignoredWords = e.target.value
      .split(",")
      .map((word) => word.trim())
      .filter((word) => word.length > 0);
    saveSettings();
  });
  settingProtectedFields.addEventListener("input", (e) => {
    settings.redaction.protectedFields = e.target.value
      .split(",")
      .map((field) => field.trim())
      .filter((field) => field.length > 0);
    saveSettings();
  });
  settingDarkTheme.addEventListener("change", (e) => {
    settings.ui.useDarkTheme = e.target.checked;
    updateTheme(settings.ui.useDarkTheme);
    saveSettings();
  });
  settingSyntaxHighlight.addEventListener("change", (e) => {
    settings.ui.syntaxHighlight = e.target.checked;
    saveSettings();
    renderContent(); // Re-render to apply syntax highlighting change immediately
  });

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
    const titleEl = e.target.closest("span");
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
        tab.originalName = null;
      }
      input.replaceWith(titleEl);
      renderTabs();
    };
    input.addEventListener("blur", finishEditing);
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") input.blur();
    });
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
      const format = detectFormat(text);
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
    container = document.getElementById("container");
  let isDragging = false;
  splitter.addEventListener("mousedown", () => (isDragging = true));
  document.addEventListener("mouseup", () => {
    if (isDragging) {
      isDragging = false;
      inputEditor.refresh();
      outputEditor.refresh();
    }
  });
  document.addEventListener("mousemove", (e) => {
    if (!isDragging) return;
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
    }
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
