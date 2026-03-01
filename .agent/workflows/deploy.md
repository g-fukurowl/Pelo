---
description: How to deploy Pelo to Google Apps Script
---

# Deployment Workflow

This project uses `clasp` to manage and deploy code to Google Apps Script.

## Prerequisites
- `node` and `npm` installed.
- `@google/clasp` installed globally (`npm install -g @google/clasp`).
- Logged in to clasp (`clasp login`).

## Steps

### 1. Push Code to GAS
To upload your local changes to the GAS project:
```bash
clasp push
```

### 2. Open GAS Editor (Optional)
To verify the code in the browser:
```bash
clasp open
```

### 3. Deploy a version
To create a new deployment version:
```bash
clasp deploy
```
