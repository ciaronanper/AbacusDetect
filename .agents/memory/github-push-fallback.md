---
name: GitHub push fallback via API
description: How to push local commits to GitHub when the gitPush callback and shell git auth are both unavailable, reproducing identical commit SHAs.
---

# GitHub push fallback (repo: ciaronanper/AbacusDetect)

The `gitPush` sandbox callback can disappear (e.g. after the GitHub connection
expires), and shell `git push` has no credentials in this repl (GIT_ASKPASS is
set but unauthenticated; `gh` is logged out). Reconnecting the GitHub
integration restores API access but NOT shell git auth or (necessarily) the
callback.

**Fallback that keeps histories byte-identical:** replay each unpushed commit
through the GitHub Git Data API via `listConnections('github')[0].proxyFetch`:
blobs (base64) → tree with `base_tree` = parent's tree → commit → PATCH
`git/refs/heads/main`. Git objects are content-addressed, so if you reproduce
the exact tree, parent, author/committer (name, email, epoch date) and message,
the remote SHA equals the local SHA — then `git update-ref
refs/remotes/origin/main <sha>` locally and nothing diverges.

**The gotcha that costs an attempt:** commit messages in git objects end with a
trailing `\n`; the API uses your message verbatim, so omit it and the SHA won't
match. Verify each created SHA against the local one BEFORE patching the ref;
failed attempts only leave harmless dangling objects.

Also: remote may be behind by auto-generated commits (e.g. "Published your
App" deployment commits), so diff against the REAL remote head from
`GET /git/ref/heads/main`, not just HEAD^.
