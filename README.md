# Redactor

Redactor is a browser-based utility for safely sharing sensitive data such as API logs, HTTP requests, or configuration files. Paste any payload into the left editor, click **Redact**, and the right editor produces a structure-preserving version with secrets replaced by realistic placeholders.

## Key Features

- **Multi-format support** – Automatically detects JSON, XML/HTML, YAML, CSV, HTTP requests/responses, form-encoded payloads, and plain text; applies format-aware redaction rules.
- **Rich editor experience** – Dual CodeMirror panes with syntax highlighting, synchronized scrolling, and split-view resizing.
- **Customizable privacy controls** – Toggle URL-path, host, query, param-name, cookie, CSRF, CSV header handling, and header redaction; maintain ignore lists and protected fields that stay untouched across formats.
- **Theme & UI options** – Light/dark theme toggle, syntax-highlighting control, tabbed workspace with rename/close, scrollable tab bar, and responsive layout.
- **Data ingress** – Load bundled samples, open local files, or paste directly. Tabs keep per-input state (raw/redacted text and detected format).
- **Data egress** – Copy to clipboard, save a single redaction, or use **Bulk Save** to generate multiple redacted variants in one ZIP.
- **Offline-friendly** – All logic runs client-side; no servers or network calls beyond CDN-loaded libraries.

## Getting Started

1. Open `index.html` in a modern desktop browser (Chrome, Edge, Firefox, or Safari).
2. Paste sample data, choose **Load Data → Examples**, or open your own file.
3. Adjust settings via the ⚙️ icon if you need custom redaction behavior.
4. Click **Redact** (or press `Cmd/Ctrl + Enter`) to produce sanitized output.
5. Use **Copy**, **Save**, or **Bulk Save** to share the redacted result.

> Tip: When using Bulk Save, specify how many alternative redactions you want—the app will regenerate fresh placeholders for each file and download a ZIP bundle.

## Tech Stack

- Vanilla HTML/CSS/JS + Tailwind CSS CDN
- CodeMirror 5 for editor panes
- JS-YAML & DOMParser for structured formats
- JSZip for bulk ZIP exports

Redactor is designed for local, on-device workflows so sensitive payloads never leave your machine. Feel free to adapt the UI or redaction rules to fit your team’s policies.
