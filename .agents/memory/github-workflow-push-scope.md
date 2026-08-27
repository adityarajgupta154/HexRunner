---
name: GitHub workflow push scope
description: Credential requirements when Git updates include files under .github/workflows.
---

GitHub credentials that can write repository contents may still be unable to update a branch when the pushed commits create or modify workflow files.

**Why:** GitHub enforces separate workflow-write permission. Repository-scoped OAuth access can upload Git objects successfully yet reject the final ref update, and reconnecting the same integration does not necessarily add that permission.

**How to apply:** For pushes containing workflow changes, use Replit's secure secret flow with a short-lived token that has repository contents and workflow write access. Never paste or persist the token in project files, and remove the temporary secret after the push.