(function (global) {
  const COMMON_WORDS_URL = "src/assets/dictionary/words.txt";
  let commonWordsPromise = null;

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

  function sortObjectKeys(obj) {
    if (typeof obj !== "object" || obj === null) return obj;
    if (Array.isArray(obj)) return obj.map(sortObjectKeys);
    return Object.keys(obj)
      .sort()
      .reduce(
        (res, k) => ({
          ...res,
          [k]: sortObjectKeys(obj[k]),
        }),
        {}
      );
  }

  function parseCsv(text) {
    const rows = [];
    let current = "";
    let row = [];
    let inQuotes = false;

    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      if (inQuotes) {
        if (char === '"') {
          if (text[i + 1] === '"') {
            current += '"';
            i++;
          } else {
            inQuotes = false;
          }
        } else {
          current += char;
        }
        continue;
      }

      if (char === '"') {
        inQuotes = true;
        continue;
      }
      if (char === ",") {
        row.push(current);
        current = "";
        continue;
      }
      if (char === "\r" || char === "\n") {
        if (char === "\r" && text[i + 1] === "\n") i++;
        row.push(current);
        rows.push(row);
        row = [];
        current = "";
        continue;
      }
      current += char;
    }

    if (inQuotes) {
      throw new Error("Unterminated quoted field.");
    }

    row.push(current);
    rows.push(row);
    return rows;
  }

  function stringifyCsv(rows) {
    return rows
      .map((row) => {
        const safeRow = Array.isArray(row) ? row : [row];
        return safeRow
          .map((value = "") => {
            const stringValue =
              value === null || value === undefined ? "" : String(value);
            if (/["\r\n,]/.test(stringValue)) {
              return `"${stringValue.replace(/"/g, '""')}"`;
            }
            return stringValue;
          })
          .join(",");
      })
      .join("\n");
  }

  function redactPlainTextResult(text, currentRedactor) {
    if (!currentRedactor) {
      throw new Error("Redaction engine instance required.");
    }
    const redactedText = text
      .split("\n")
      .map((line) => currentRedactor.redactString(line))
      .join("\n");
    return { input: text, output: redactedText, format: "Plain Text" };
  }

  function redactJsonResult(text, currentRedactor) {
    const data = JSON.parse(text);
    const sorted = sortObjectKeys(data);
    const formattedInput = JSON.stringify(sorted, null, 2);
    const redacted = redactJsonStructure(sorted, currentRedactor);
    const redactedString = JSON.stringify(redacted, null, 2);
    const finalString = redactedString.replace(
      new RegExp(
        `"${currentRedactor.floatPlaceholderPrefix}([-.0-9]+)"`,
        "g"
      ),
      (m, n) => n
    );
    return { input: formattedInput, output: finalString, format: "JSON" };
  }

  function redactYamlResult(text, currentRedactor) {
    const data = jsyaml.load(text);
    const redacted = redactJsonStructure(data, currentRedactor);
    const redactedYaml = jsyaml.dump(redacted, { noArrayIndent: true });
    return { input: text, output: redactedYaml, format: "YAML" };
  }

  function formatXmlDocument(xmlNode) {
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
      const isClosing = node.startsWith("/");
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

  function redactXmlResult(text, currentRedactor) {
    const parser = new DOMParser();
    let workingText = text;
    let preservedDocType = "";
    if (/^\s*<!DOCTYPE[\s\S]+?>/i.test(workingText)) {
      const docTypeMatch = workingText.match(/^\s*<!DOCTYPE[\s\S]+?>\s*/i);
      if (docTypeMatch) {
        preservedDocType = docTypeMatch[0];
        workingText = workingText.slice(docTypeMatch[0].length);
      }
    }
    let xmlDoc = parser.parseFromString(workingText, "application/xml");
    if (xmlDoc.getElementsByTagName("parsererror").length) {
      xmlDoc = parser.parseFromString(workingText, "text/html");
    }
    if (!xmlDoc || !xmlDoc.documentElement) {
      throw new Error("XML parsing error.");
    }

    function traverseAndRedact(node) {
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
      node.childNodes.forEach(traverseAndRedact);
    }

    const formattedInput = formatXmlDocument(xmlDoc.cloneNode(true));
    traverseAndRedact(xmlDoc.documentElement);
    const formattedOutput = formatXmlDocument(xmlDoc).replace(
      new RegExp(currentRedactor.floatPlaceholderPrefix, "g"),
      ""
    );
    return {
      input: preservedDocType + formattedInput,
      output: preservedDocType + formattedOutput,
      format: "XML",
    };
  }

  function redactFormUrlEncodedResult(
    text,
    currentRedactor,
    redactionSettings = currentRedactor?.settings || {}
  ) {
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
      const isProtected = currentRedactor.isProtectedField(key);
      const redactedKey =
        !isProtected && redactionSettings.redactParamNames
          ? currentRedactor.redactString(key)
          : key;
      let redactedValue;
      if (isProtected) {
        redactedValue = value;
      } else if (
        currentRedactor.settings.redactCsrf &&
        key.toLowerCase().includes("csrf")
      ) {
        redactedValue = currentRedactor.redactString(value);
      } else {
        const primitive = currentRedactor.redactPrimitive(value);
        redactedValue =
          typeof primitive === "string" &&
          primitive.startsWith(currentRedactor.floatPlaceholderPrefix)
            ? primitive.substring(
                currentRedactor.floatPlaceholderPrefix.length
              )
            : String(primitive);
      }
      redactedParams.append(redactedKey, redactedValue);
    }
    const formatParams = (p) => p.toString();
    return {
      input: formatParams(params),
      output: formatParams(redactedParams),
      format: "Form URL-Encoded",
    };
  }

  function redactCsvContent(text, currentRedactor) {
    const rows = parseCsv(text);
    const hasAnyStructuredRow = rows.some(
      (row) => Array.isArray(row) && row.length > 0
    );
    if (!rows.length || !hasAnyStructuredRow) {
      throw new Error("Not a valid CSV document.");
    }
    const treatFirstRowAsHeader =
      currentRedactor?.settings?.csvHasHeader !== false;
    const headerRow = treatFirstRowAsHeader ? rows[0] : null;
    const redactedRows = [];
    const startIndex = treatFirstRowAsHeader ? 1 : 0;
    if (treatFirstRowAsHeader && Array.isArray(headerRow)) {
      redactedRows.push(headerRow.slice());
    }
    for (let i = startIndex; i < rows.length; i++) {
      const row = rows[i];
      if (!Array.isArray(row)) {
        redactedRows.push(row);
        continue;
      }
      const hasValues = row.some(
        (cell) => cell !== undefined && String(cell ?? "").trim() !== ""
      );
      if (!hasValues) {
        redactedRows.push(row.slice());
        continue;
      }
      const redactedRow = row.map((cell, colIndex) => {
        const columnName = headerRow?.[colIndex] ?? "";
        if (currentRedactor.isProtectedField(columnName)) {
          return cell;
        }
        const primitive = currentRedactor.redactPrimitive(
          String(cell ?? "")
        );
        if (
          typeof primitive === "string" &&
          primitive.startsWith(currentRedactor.floatPlaceholderPrefix)
        ) {
          return primitive.slice(
            currentRedactor.floatPlaceholderPrefix.length
          );
        }
        return typeof primitive === "string"
          ? primitive
          : String(primitive);
      });
      redactedRows.push(redactedRow);
    }
    return stringifyCsv(redactedRows);
  }

  function redactCsvResult(text, currentRedactor, formatLabel = "CSV") {
    const redactedOutput = redactCsvContent(text, currentRedactor);
    return {
      input: text,
      output: redactedOutput,
      format: formatLabel || "CSV",
    };
  }

  function redactBodyContent(bodyText, currentRedactor, contentType = "") {
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
    const runCsvRedaction = () => {
      return redactCsvContent(bodyText, currentRedactor);
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
      "text/csv": runCsvRedaction,
      "application/csv": runCsvRedaction,
    };

    if (contentMap[mainContentType]) {
      try {
        return contentMap[mainContentType]();
      } catch (e) {
        return runPlainTextRedaction();
      }
    }

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
    try {
      return runCsvRedaction();
    } catch (e) {}

    return runPlainTextRedaction();
  }

  function redactHttpResult(
    text,
    currentRedactor,
    redactionSettings = currentRedactor?.settings || {}
  ) {
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
      } catch (e) {}
    }

    let redactedStartLine;
    if (reqMatch) {
      let pathAndQuery = reqMatch[2];
      const [path, queryString] = pathAndQuery.split("?");
      let redactedQuery = "";

      if (queryString) {
        if (redactionSettings.redactQueryString) {
          const params = new URLSearchParams(queryString);
          const redactedParams = new URLSearchParams();
          for (const [key, value] of params) {
            const isProtected = currentRedactor.isProtectedField(key);
            const redactedKey =
              !isProtected && redactionSettings.redactParamNames
                ? currentRedactor.redactString(key)
                : key;
            const redactedValue = isProtected
              ? value
              : currentRedactor.redactPrimitive(value);
            redactedParams.append(
              redactedKey,
              typeof redactedValue === "string"
                ? redactedValue.replace(
                    currentRedactor.floatPlaceholderPrefix,
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

      const redactedPath = redactionSettings.redactUrlPath
        ? currentRedactor.redactString(path)
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
        if (currentRedactor.isProtectedField(key)) {
          return headerLine;
        }

        if (
          redactionSettings.redactCookies &&
          (lowerKey === "cookie" || lowerKey === "set-cookie")
        ) {
          const redactedCookieValue = value
            .split(";")
            .map((cookiePair) => {
              const trimmedPair = cookiePair.trim();
              const separatorIndex = trimmedPair.indexOf("=");
              if (separatorIndex === -1) return trimmedPair;

              const cookieName = trimmedPair
                .substring(0, separatorIndex)
                .trim();
              const cookieValue = trimmedPair.substring(
                separatorIndex + 1
              );
              if (currentRedactor.isProtectedField(cookieName)) {
                return trimmedPair;
              }
              return `${cookieName}=${currentRedactor.redactString(
                cookieValue
              )}`;
            })
            .join("; ");
          return `${key}: ${redactedCookieValue}`;
        }

        if (
          redactionSettings.redactCookies &&
          (lowerKey === "authorization" ||
            lowerKey === "proxy-authorization")
        ) {
          return `${key}: ${currentRedactor.redactString(value)}`;
        }
        if (lowerKey === "host") {
          if (!redactionSettings.redactHost) return headerLine;
          return `${key}: ${currentRedactor.redactString(value)}`;
        }
        const csrfHeaderNames = [
          "x-csrf-token",
          "x-xsrf-token",
          "csrf-token",
        ];
        if (
          redactionSettings.redactCsrf &&
          csrfHeaderNames.includes(lowerKey)
        ) {
          return `${key}: ${currentRedactor.redactString(value)}`;
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

        return `${key}: ${currentRedactor.redactString(value)}`;
      })
      .join("\n");

    const redactedBody = redactBodyContent(
      body,
      currentRedactor,
      contentType
    );
    const finalRedacted = `${redactedStartLine}\n${redactedHeaders}${
      body ? "\n\n" + redactedBody : ""
    }`;

    return {
      input: formattedInput,
      output: finalRedacted,
      format: reqMatch ? "HTTP Request" : "HTTP Response",
    };
  }

  function computeRedactionResult(
    format,
    text,
    trimmedText,
    currentRedactor,
    redactionSettings
  ) {
    const effectiveSettings =
      redactionSettings || currentRedactor?.settings || {};
    const normalizedFormat = normalizeFormatKey(format);
    switch (normalizedFormat) {
      case "HTTP Request":
      case "HTTP Response":
        return redactHttpResult(text, currentRedactor, effectiveSettings);
      case "JSON":
        return redactJsonResult(trimmedText, currentRedactor);
      case "XML":
        return redactXmlResult(text, currentRedactor);
      case "YAML":
        return redactYamlResult(text, currentRedactor);
      case "CSV":
        return redactCsvResult(text, currentRedactor, format || "CSV");
      case "Form URL-Encoded":
        return redactFormUrlEncodedResult(
          text,
          currentRedactor,
          effectiveSettings
        );
      default:
        return redactPlainTextResult(text, currentRedactor);
    }
  }

  function isLikelyCsv(text) {
    const rows = parseCsv(text);
    const meaningfulRows = rows.filter(
      (row) =>
        Array.isArray(row) &&
        row.some((cell) => String(cell ?? "").trim() !== "")
    );
    if (meaningfulRows.length < 2) return false;
    const expectedColumns = meaningfulRows[0].length;
    if (expectedColumns < 2) return false;
    return meaningfulRows.every((row) => row.length === expectedColumns);
  }

  function getCsvFormatLabel(hasHeader) {
    return hasHeader === false ? "CSV (no titles)" : "CSV (with titles)";
  }

  function normalizeFormatKey(format) {
    if (typeof format !== "string") return "";
    if (format.startsWith("CSV")) return "CSV";
    return format;
  }

  function redactJsonStructure(value, currentRedactor, key = null) {
    if (value === null) return null;
    if (
      typeof key === "string" &&
      currentRedactor?.isProtectedField?.(key)
    ) {
      return value;
    }
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
      );
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

  function detectFormat(text, options = {}) {
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

    try {
      if (isLikelyCsv(trimmedText)) {
        const hasHeaderSetting =
          options.csvHasHeader === undefined
            ? true
            : Boolean(options.csvHasHeader);
        return getCsvFormatLabel(hasHeaderSetting);
      }
    } catch (e) {}

    return "Plain Text";
  }

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
      const now = Date.now();
      const parsed = Date.parse(originalDate);
      const isValidDate = !isNaN(parsed);
      const pad = (n) => String(n).padStart(2, "0");

      let targetDate = new Date();
      let includeTime = originalDate.includes("T");
      let tzSuffix = originalDate.endsWith("Z") ? "Z" : "";

      if (isValidDate) {
        const diffMs = parsed - now;
        const absDiff = Math.abs(diffMs);
        const preserveSign = (value) =>
          diffMs >= 0
            ? Math.max(value, 5 * 1000)
            : Math.min(value, -5 * 1000);
        let newDiff = diffMs;
        if (absDiff < 60 * 1000) {
          const jitter =
            (Math.random() - 0.5) * 60 * 60 * 1000; // +/-30 min
          newDiff = preserveSign(diffMs + jitter);
        } else if (absDiff < 60 * 60 * 1000) {
          const ratio = 0.5 + Math.random() * 0.8; // 0.5 - 1.3
          newDiff = preserveSign(diffMs * ratio);
        } else if (absDiff < 24 * 60 * 60 * 1000) {
          const ratio = 0.6 + Math.random() * 0.6; // 0.6 - 1.2
          newDiff = preserveSign(diffMs * ratio);
        } else if (absDiff < 365 * 24 * 60 * 60 * 1000) {
          const ratio = 0.7 + Math.random() * 0.8; // 0.7 - 1.5
          newDiff = preserveSign(diffMs * ratio);
        } else {
          const ratio = 0.8 + Math.random() * 1.0; // 0.8 - 1.8
          newDiff = preserveSign(diffMs * ratio);
        }
        targetDate = new Date(now + newDiff);
      } else {
        const randomYear = Math.floor(Math.random() * 60) + 1980;
        const randomMonth = Math.floor(Math.random() * 12);
        const daysInMonth = new Date(
          randomYear,
          randomMonth + 1,
          0
        ).getDate();
        const randomDay = Math.floor(Math.random() * daysInMonth) + 1;
        targetDate = new Date(Date.UTC(randomYear, randomMonth, randomDay));
        includeTime = originalDate.includes("T");
        tzSuffix = originalDate.endsWith("Z") ? "Z" : "";
      }

      if (includeTime) {
        let isoString = new Date(targetDate).toISOString();
        if (!tzSuffix) {
          isoString = isoString.slice(0, -1);
        }
        return isoString;
      } else if (/^\d{4}/.test(originalDate)) {
        const separator = originalDate.charAt(4);
        return `${targetDate.getUTCFullYear()}${separator}${pad(
          targetDate.getUTCMonth() + 1
        )}${separator}${pad(targetDate.getUTCDate())}`;
      } else {
        const separator = originalDate.charAt(2);
        return `${pad(targetDate.getUTCDate())}${separator}${pad(
          targetDate.getUTCMonth() + 1
        )}${separator}${targetDate.getUTCFullYear()}`;
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

          const pureLetters = part.replace(/[^A-Za-z]/g, "");
          if (pureLetters.length >= 3 && this.wordMap[pureLetters.length]) {
            const newWord =
              this.wordMap[pureLetters.length][
                Math.floor(
                  Math.random() * this.wordMap[pureLetters.length].length
                )
              ];
            return this.preserveCase(part, newWord);
          } else {
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

  global.RedactorCore = {
    fetchCommonWords,
    ensureCommonWordsLoaded,
    detectFormat,
    computeRedactionResult,
    redactPlainTextResult,
    RedactionEngine,
  };
})(typeof window !== "undefined" ? window : globalThis);
