<h1 align="center">
    <img src="src/images/logo.svg" height="48" alt="logo">
</h1>

Redactor is a browser-based utility for redacting sensitive data across formats—HTTP requests and responses, configuration files, and more—so that confidential details stay private. It lets you sanitize payloads before sharing them with AI assistants like ChatGPT or Gemini so you can keep the structure that matters without leaking sensitive information. Paste any payload into the left editor, click **Redact**, and the right editor produces a structure-preserving version with sensitive information replaced by realistic placeholders.

Use it instantly at [redactor.sh](https://redactor.sh), or clone this repository and self-host it with `python3 -m http.server`, `php -S localhost:8000`, or any static file server if you prefer running it locally/offline.

## Key Features

- **Multi-format support** – Automatically detects JSON, XML/HTML, YAML, CSV, HTTP requests/responses, form-encoded payloads, and plain text; applies format-aware redaction rules.
- **Rich editor experience** – Dual CodeMirror panes with syntax highlighting, synchronized scrolling, and split-view resizing.
- **Customizable privacy controls** – Toggle URL-path, host, query, param-name, cookie, CSRF, CSV header handling, and header redaction; maintain ignore lists and protected fields (including CSV columns or column1/column2 aliases) that stay untouched across formats.
- **Theme & UI options** – Light/dark theme toggle, syntax-highlighting control, tabbed workspace with rename/close, scrollable tab bar, and responsive layout.
- **Data ingress** – Load bundled samples, open local files, or paste directly. Tabs keep per-input state (raw/redacted text and detected format).
- **Data egress** – Copy to clipboard, save a single redaction, or use **Bulk Save** to generate multiple redacted variants in one ZIP.
- **Offline-friendly & backend-free** – All logic runs entirely in the browser; no backend services or network calls beyond the CDN-loaded libraries.

## Tech Stack

- Vanilla HTML/CSS/JS + Tailwind CSS CDN
- CodeMirror 5 for editor panes
- JS-YAML & DOMParser for structured formats
- JSZip for bulk ZIP exports

Redactor is designed for local, on-device workflows so sensitive payloads never leave your machine. Feel free to adapt the UI or redaction rules to fit your team’s policies.
