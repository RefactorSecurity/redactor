(function (global) {
  const COMMON_WORDS_URL = "src/assets/dictionary/words.txt";
  let commonWordsPromise = null;

  function createUnicodeRegex(pattern, flags, fallback) {
    try {
      return new RegExp(pattern, flags);
    } catch (e) {
      return fallback;
    }
  }

  const WORD_SPLIT_REGEX = createUnicodeRegex(
    "([^\\p{L}\\p{N}_]+)",
    "u",
    /(\W+)/
  );
  const WORD_CHARS_REGEX = createUnicodeRegex(
    "^[\\p{L}\\p{N}_]+$",
    "u",
    /^\w+$/
  );
  const LETTER_DETECTOR_REGEX = createUnicodeRegex("\\p{L}", "u", /[A-Za-z]/i);

  function isLetter(char) {
    if (!char) return false;
    LETTER_DETECTOR_REGEX.lastIndex = 0;
    return LETTER_DETECTOR_REGEX.test(char);
  }

  function countLetters(value) {
    if (!value) return 0;
    let count = 0;
    for (const char of value) {
      if (isLetter(char)) count++;
    }
    return count;
  }

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

  function normalizeFieldKey(value) {
    if (typeof value !== "string") return "";
    return value.trim().toLowerCase();
  }

  function slugifyFieldKey(value) {
    if (!value) return "";
    return value.replace(/[^a-z0-9]+/g, "");
  }

  function buildProtectedFieldsSet(fields = []) {
    const set = new Set();
    fields.forEach((field) => {
      const normalized = normalizeFieldKey(field);
      if (!normalized) return;
      set.add(normalized);
      const slug = slugifyFieldKey(normalized);
      if (slug && slug !== normalized) {
        set.add(slug);
      }
    });
    return set;
  }

  function getCsvColumnAlias(index) {
    return `column${index + 1}`;
  }

  function isProtectedCsvColumn(columnName, columnIndex, redactor) {
    if (!redactor?.isProtectedField) return false;
    if (typeof columnName === "string" && columnName.trim()) {
      if (redactor.isProtectedField(columnName)) {
        return true;
      }
    }
    return redactor.isProtectedField(getCsvColumnAlias(columnIndex));
  }

  function createJsonNumberContext(text = "") {
    const literals = extractJsonNumberLiterals(text);
    let index = 0;
    return {
      nextNumberLiteral() {
        if (index >= literals.length) return null;
        return literals[index++];
      },
    };
  }

  function extractJsonNumberLiterals(text = "") {
    const literals = [];
    let i = 0;
    let inString = false;
    let escaping = false;
    while (i < text.length) {
      const char = text[i];
      if (inString) {
        if (escaping) {
          escaping = false;
        } else if (char === "\\") {
          escaping = true;
        } else if (char === '"') {
          inString = false;
        }
        i++;
        continue;
      }
      if (char === '"') {
        inString = true;
        i++;
        continue;
      }
      if (char === "-" || isDigit(char)) {
        const literalInfo = readJsonNumberLiteral(text, i);
        if (literalInfo) {
          literals.push(literalInfo.literal);
          i = literalInfo.end;
          continue;
        }
      }
      i++;
    }
    return literals;
  }

  function readJsonNumberLiteral(text, startIndex) {
    const length = text.length;
    let i = startIndex;
    if (text[i] === "-") {
      i++;
    }
    if (i >= length || !isDigit(text[i])) return null;
    if (text[i] === "0") {
      i++;
    } else {
      while (i < length && isDigit(text[i])) i++;
    }
    if (text[i] === ".") {
      i++;
      if (i >= length || !isDigit(text[i])) return null;
      while (i < length && isDigit(text[i])) i++;
    }
    if (text[i] === "e" || text[i] === "E") {
      i++;
      if (text[i] === "+" || text[i] === "-") {
        i++;
      }
      if (i >= length || !isDigit(text[i])) return null;
      while (i < length && isDigit(text[i])) i++;
    }
    return { literal: text.slice(startIndex, i), end: i };
  }

  function isDigit(char) {
    return char >= "0" && char <= "9";
  }

  function parseNumberComponents(numStr) {
    const trimmed = String(numStr).trim();
    const match = trimmed.match(
      /^(-?)(0|[1-9]\d*)(?:\.(\d+))?(?:([eE])([+-]?)(\d+))?$/
    );
    if (!match) return null;
    return {
      original: trimmed,
      sign: match[1] || "",
      intPart: match[2] || "0",
      fraction: match[3] || "",
      exponentChar: match[4] || "",
      exponentSign: match[5] || "",
      exponentDigits: match[6] || "",
    };
  }

  function randomizeDigitSequence(length, options = {}) {
    if (!length) return "";
    const { disallowLeadingZero = false } = options;
    let result = "";
    for (let i = 0; i < length; i++) {
      const pool =
        i === 0 && disallowLeadingZero ? "123456789" : "0123456789";
      result += pool[Math.floor(Math.random() * pool.length)];
    }
    return result;
  }

  function buildRandomizedNumberLiteral(components) {
    const hasNonZeroLeading =
      components.intPart.length > 1 && components.intPart[0] !== "0";
    const randomizedInt = randomizeDigitSequence(
      components.intPart.length,
      {
        disallowLeadingZero: hasNonZeroLeading,
      }
    );
    const randomizedFraction = randomizeDigitSequence(
      components.fraction.length
    );
    const randomizedExponent = randomizeDigitSequence(
      components.exponentDigits.length
    );
    let literal = `${components.sign}${randomizedInt || "0"}`;
    if (components.fraction.length) {
      literal += `.${randomizedFraction}`;
    }
    if (components.exponentChar) {
      literal += `${components.exponentChar}${components.exponentSign}${randomizedExponent}`;
    }
    return literal;
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

  function redactJsonResult(
    text,
    currentRedactor,
    jsonSettings = {}
  ) {
    const data = JSON.parse(text);
    const shouldSort = Boolean(jsonSettings.sortKeysAlphabetically);
    const numberContext = createJsonNumberContext(text);
    const formattedInput = JSON.stringify(
      shouldSort ? sortObjectKeys(data) : data,
      null,
      2
    );
    const redactedBase = redactJsonStructure(
      data,
      currentRedactor,
      null,
      numberContext
    );
    const redactedForOutput = shouldSort
      ? sortObjectKeys(redactedBase)
      : redactedBase;
    const finalString = JSON.stringify(redactedForOutput, null, 2);
    return { input: formattedInput, output: finalString, format: "JSON" };
  }

  const YAML_DUMP_OPTIONS = {
    noArrayIndent: true,
    quotingType: '"',
    forceQuotes: true,
  };

  function redactYamlResult(text, currentRedactor) {
    const data = jsyaml.load(text);
    const redacted = redactJsonStructure(data, currentRedactor);
    const redactedYaml = jsyaml.dump(redacted, YAML_DUMP_OPTIONS);
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
    let preservedDeclaration = "";
    const declMatch = workingText.match(/^\s*(<\?xml[^>]*\?>\s*)/i);
    if (declMatch) {
      preservedDeclaration = declMatch[1];
      workingText = workingText.slice(declMatch[0].length);
    }
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
    const formattedOutput = formatXmlDocument(xmlDoc);
    return {
      input: preservedDeclaration + preservedDocType + formattedInput,
      output: preservedDeclaration + preservedDocType + formattedOutput,
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
        redactedValue = String(primitive);
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
        if (isProtectedCsvColumn(columnName, colIndex, currentRedactor)) {
          return cell;
        }
        const primitive = currentRedactor.redactPrimitive(
          String(cell ?? "")
        );
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

  function redactBodyContent(
    bodyText,
    currentRedactor,
    contentType = "",
    rawContentType = ""
  ) {
    if (!bodyText) return "";

    const runJsonRedaction = () => {
      const redacted = redactJsonStructure(
        JSON.parse(bodyText),
        currentRedactor,
        null,
        createJsonNumberContext(bodyText)
      );
      return JSON.stringify(redacted, null, 2);
    };
    const runYamlRedaction = () => {
      const redacted = redactJsonStructure(
        jsyaml.load(bodyText),
        currentRedactor
      );
      return jsyaml.dump(redacted, YAML_DUMP_OPTIONS);
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
      return new XMLSerializer().serializeToString(xmlDoc);
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
          redactedValue = String(p);
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
    if (mainContentType.startsWith("multipart/form-data")) {
      const boundary = extractBoundary(rawContentType);
      if (!boundary) {
        return runPlainTextRedaction();
      }
      try {
        return redactMultipartFormData(bodyText, currentRedactor, boundary);
      } catch (e) {
        return runPlainTextRedaction();
      }
    }

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
    redactionSettings = currentRedactor?.settings || {},
    jsonSettings = {}
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
    let rawContentType = "";
    const contentTypeHeader = headerLinesOnly.find((h) =>
      h.toLowerCase().startsWith("content-type:")
    );
    if (contentTypeHeader) {
      rawContentType = contentTypeHeader.split(":")[1].trim();
      contentType = rawContentType.split(";")[0].trim();
    }

    if (
      contentType.includes("json") ||
      (!contentType && body.trim().startsWith("{"))
    ) {
      try {
        const bodyJson = JSON.parse(body);
        const processedJson = jsonSettings.sortKeysAlphabetically
          ? sortObjectKeys(bodyJson)
          : bodyJson;
        const prettifiedBody = JSON.stringify(processedJson, null, 2);
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
                ? redactedValue
                : String(redactedValue)
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
        if (lowerKey === "content-disposition") {
          return formatContentDisposition(value, currentRedactor);
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
      contentType,
      rawContentType
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

  function extractBoundary(contentTypeValue = "") {
    if (!contentTypeValue) return "";
    const match = contentTypeValue.match(/boundary="?([^";]+)"?/i);
    return match ? match[1] : "";
  }

  function redactMultipartFormData(bodyText, currentRedactor, boundary) {
    if (!boundary) throw new Error("Missing multipart boundary.");
    const boundaryMarker = `--${boundary}`;
    const rawSegments = bodyText.split(boundaryMarker);
    const processedParts = [];
    rawSegments.forEach((segment) => {
      if (!segment) return;
      const trimmed = segment.trim();
      if (!trimmed || trimmed === "--") return;
      let workingPart = segment.replace(/^\r?\n/, "");
      workingPart = workingPart.replace(/\r?\n$/, "");
      if (!workingPart.trim()) return;
      let headerSplit = workingPart.indexOf("\r\n\r\n");
      let dividerLength = 4;
      if (headerSplit === -1) {
        headerSplit = workingPart.indexOf("\n\n");
        dividerLength = 2;
      }
      if (headerSplit === -1) {
        processedParts.push(workingPart.trim());
        return;
      }
      const separator = workingPart.slice(headerSplit, headerSplit + dividerLength);
      const headerSection = workingPart.slice(0, headerSplit);
      const bodySection = workingPart.slice(headerSplit + dividerLength);
      const headerLines = headerSection.split(/\r?\n/);
      let cdIndex = -1;
      let cdValue = "";
      let partContentType = "";
      headerLines.forEach((line, idx) => {
        const match = line.match(/^([^:]+):\s*(.*)$/);
        if (!match) return;
        const key = match[1].trim();
        const lowerKey = key.toLowerCase();
        const value = match[2].trim();
        if (lowerKey === "content-disposition") {
          cdIndex = idx;
          cdValue = value;
        } else if (lowerKey === "content-type") {
          partContentType = value;
        }
        headerLines[idx] = `${key}: ${value}`;
      });
      const hasFilename = /filename=/i.test(cdValue);
      const fieldName = extractContentDispositionParameter(cdValue, "name");
      let redactedParamNameValue;
      const shouldRedactParamName =
        Boolean(fieldName) &&
        currentRedactor.settings.redactParamNames &&
        !currentRedactor.isProtectedField(fieldName);
      if (shouldRedactParamName) {
        redactedParamNameValue = currentRedactor.redactString(fieldName);
      }
      let redactedBody = bodySection;
      if (hasFilename) {
        redactedBody = redactMultipartFileBody(
          bodySection,
          currentRedactor,
          partContentType
        );
      } else {
        const plainRedaction = redactPlainTextResult(
          bodySection || "",
          currentRedactor
        );
        redactedBody = plainRedaction.output;
      }
      if (
        cdIndex !== -1 &&
        (hasFilename || typeof redactedParamNameValue !== "undefined")
      ) {
        headerLines[cdIndex] = formatContentDisposition(
          cdValue,
          currentRedactor,
          {
            forceFilenameRedaction: hasFilename,
            redactedParamNameValue,
          }
        );
      }
      processedParts.push(
        `${headerLines.join("\r\n")}${separator}${redactedBody}`
      );
    });
    if (!processedParts.length) return bodyText;
    const rebuiltParts = processedParts
      .map((part) => `${boundaryMarker}\r\n${part}`)
      .join("\r\n");
    return `${rebuiltParts}\r\n${boundaryMarker}--`;
  }


  function redactMultipartFileBody(
    bodyText,
    currentRedactor,
    contentTypeValue = ""
  ) {
    const normalizedType = contentTypeValue
      ? contentTypeValue.split(";")[0].trim()
      : "";
    if (
      normalizedType &&
      normalizedType.startsWith("multipart/")
    ) {
      return bodyText;
    }
    try {
      if (normalizedType) {
        return redactBodyContent(
          bodyText,
          currentRedactor,
          normalizedType,
          contentTypeValue
        );
      }
      return redactBodyContent(bodyText, currentRedactor, "");
    } catch (e) {
      return bodyText
        .split("\n")
        .map((line) => currentRedactor.redactString(line))
        .join("\n");
    }
  }

  function extractContentDispositionParameter(
    value = "",
    parameter = ""
  ) {
    if (!value || !parameter) return "";
    const safeParameter = parameter.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(
      `${safeParameter}\\s*=\\s*(?:"([^"]+)"|([^;]+))`,
      "i"
    );
    const match = value.match(regex);
    if (!match) return "";
    return (match[1] || match[2] || "").trim();
  }

  function formatContentDisposition(
    value,
    currentRedactor,
    options = {}
  ) {
    const parts = value.split(";");
    if (!parts.length) return `Content-Disposition: ${value}`;
    const normalized = parts[0].trim().toLowerCase();
    const forceFilenameRedaction = Boolean(
      options.forceFilenameRedaction
    );
    const updatedParts = parts.map((part) => part.trim());
    const hasRedactedParamNameValue =
      Object.prototype.hasOwnProperty.call(
        options,
        "redactedParamNameValue"
      );
    let modified = false;
    if (hasRedactedParamNameValue) {
      const namePartIndex = updatedParts.findIndex((part) =>
        part.toLowerCase().startsWith("name=")
      );
      if (namePartIndex !== -1) {
        updatedParts[namePartIndex] = `name="${
          options.redactedParamNameValue || ""
        }"`;
        modified = true;
      }
    }
    if (!forceFilenameRedaction && normalized !== "attachment") {
      return modified
        ? `Content-Disposition: ${updatedParts.join("; ")}`
        : `Content-Disposition: ${value}`;
    }
    const filenamePartIndex = updatedParts.findIndex((part) =>
      part.toLowerCase().startsWith("filename=")
    );
    if (filenamePartIndex === -1) {
      return modified
        ? `Content-Disposition: ${updatedParts.join("; ")}`
        : `Content-Disposition: ${value}`;
    }
    const originalPart = updatedParts[filenamePartIndex];
    const match = originalPart.match(/filename=(?:"([^"]+)"|([^;]+))/i);
    if (!match) {
      return modified
        ? `Content-Disposition: ${updatedParts.join("; ")}`
        : `Content-Disposition: ${value}`;
    }
    const originalFilename = match[1] || match[2];
    const lastDot = originalFilename.lastIndexOf(".");
    const extension =
      lastDot !== -1 ? originalFilename.slice(lastDot) : "";
    const fakeBase = currentRedactor.redactString(
      lastDot !== -1
        ? originalFilename.slice(0, lastDot)
        : originalFilename
    );
    const placeholder = `${fakeBase}${extension}`;
    updatedParts[filenamePartIndex] = `filename="${placeholder}"`;
    return `Content-Disposition: ${updatedParts.join("; ")}`;
  }
  function computeRedactionResult(
    format,
    text,
    trimmedText,
    currentRedactor,
    redactionSettings,
    preferenceSettings = {}
  ) {
    const effectiveSettings =
      redactionSettings || currentRedactor?.settings || {};
    const jsonSettings = preferenceSettings.json || {};
    const normalizedFormat = normalizeFormatKey(format);
    switch (normalizedFormat) {
      case "HTTP Request":
      case "HTTP Response":
        return redactHttpResult(
          text,
          currentRedactor,
          effectiveSettings,
          jsonSettings
        );
      case "JSON":
        return redactJsonResult(
          trimmedText,
          currentRedactor,
          jsonSettings
        );
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

  function redactJsonStructure(
    value,
    currentRedactor,
    key = null,
    context = null
  ) {
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
    if (typeof value === "number") {
      const literal =
        typeof context?.nextNumberLiteral === "function"
          ? context.nextNumberLiteral()
          : null;
      const source =
        (!Number.isFinite(value) && literal) || String(value);
      return currentRedactor.redactNumber(source);
    }
    if (typeof value === "string") {
      return currentRedactor.redactPrimitive(value);
    }
    if (Array.isArray(value))
      return value.map((item) =>
        redactJsonStructure(item, currentRedactor, null, context)
      );
    if (typeof value === "object")
      return Object.entries(value).reduce(
        (acc, [k, v]) => ({
          ...acc,
          [k]: redactJsonStructure(v, currentRedactor, k, context),
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
      this.wordMap = this.constructor.buildWordMap();
      this.ignoredWordsSet = new Set(
        (this.settings.ignoredWords || []).map((w) => w.toLowerCase())
      );
      this.protectedFieldsSet = buildProtectedFieldsSet(
        this.settings.protectedFields || []
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
      const components = parseNumberComponents(numStr);
      if (!components) {
        return this.redactString(String(numStr));
      }
      const literal = buildRandomizedNumberLiteral(components);
      const parsed = Number(literal);
      const isFloatLike =
        components.fraction.length > 0 || Boolean(components.exponentChar);
      if (Number.isFinite(parsed)) {
        if (isFloatLike) return parsed;
        if (Number.isSafeInteger(parsed)) return parsed;
      }
      return literal;
    }

    redactString(original) {
      const parts = original.split(WORD_SPLIT_REGEX);
      return parts
        .map((part) => {
          if (this.ignoredWordsSet.has(part.toLowerCase())) {
            return part;
          }
          if (!WORD_CHARS_REGEX.test(part)) return part;

          const letterCount = countLetters(part);
          const wordList =
            letterCount > 0 ? this.wordMap[letterCount] || [] : [];
          if (wordList.length) {
            const newWord =
              wordList[Math.floor(Math.random() * wordList.length)];
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
        if (digits.includes(char)) {
          redacted += digits[Math.floor(Math.random() * digits.length)];
          continue;
        }
        if (isLetter(char)) {
          const lowerChar = char.toLowerCase();
          const upperChar = char.toUpperCase();
          const hasDistinctCase = lowerChar !== upperChar;
          const useUpperCase =
            hasDistinctCase && char === upperChar && char !== lowerChar;
          const pool = useUpperCase ? upper : lower;
          redacted += pool[Math.floor(Math.random() * pool.length)];
        } else {
          redacted += char;
        }
      }
      return redacted;
    }

    isProtectedField(fieldName) {
      if (typeof fieldName !== "string") return false;
      const normalized = normalizeFieldKey(fieldName);
      if (!normalized) return false;
      if (this.protectedFieldsSet.has(normalized)) return true;
      const slug = slugifyFieldKey(normalized);
      if (slug && this.protectedFieldsSet.has(slug)) return true;
      return false;
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
