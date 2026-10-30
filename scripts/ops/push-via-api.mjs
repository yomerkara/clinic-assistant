// Publishes the local history through GitHub's Git Data API.
//
// Some networks allow HTTPS to api.github.com but reset git's own
// `git-receive-pack` POST, which makes `git push` impossible. This walks the
// commits in order, uploads each one's blobs, builds its tree and creates the
// commit object, then moves the branch ref. Commit messages, authors and dates
// are preserved, so the result matches what a push would have produced.
//
// Credentials come from the git credential helper; the token is never printed.
import { execFileSync } from "node:child_process";

const repo = process.argv[2];
const branch = process.argv[3] ?? "main";
if (!repo?.includes("/")) {
  console.error("Usage: push-via-api.mjs <owner/repo> [branch]");
  process.exit(1);
}

const token = execFileSync("git", ["credential", "fill"], {
  input: "protocol=https\nhost=github.com\n\n",
  encoding: "utf8",
})
  .split("\n")
  .find((line) => line.startsWith("password="))
  ?.slice("password=".length);
if (!token) {
  console.error("No stored github.com credential found.");
  process.exit(1);
}

const git = (args, encoding = "utf8") =>
  execFileSync("git", args, { encoding, maxBuffer: 1024 * 1024 * 256 });

async function api(path, { method = "GET", body } = {}) {
  for (let attempt = 1; ; attempt += 1) {
    const response = await fetch(`https://api.github.com${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(120000),
    });
    if (response.status === 403 || response.status === 429 || response.status >= 500) {
      if (attempt >= 5) throw new Error(`${method} ${path} -> ${response.status}`);
      const wait = Number(response.headers.get("retry-after") ?? attempt * 3);
      await new Promise((r) => setTimeout(r, wait * 1000));
      continue;
    }
    const text = await response.text();
    if (!response.ok) throw new Error(`${method} ${path} -> ${response.status} ${text.slice(0, 200)}`);
    return text ? JSON.parse(text) : null;
  }
}

const commits = git(["rev-list", "--reverse", "HEAD"]).trim().split("\n");
console.log(`${commits.length} commit will be published to ${repo} (${branch}).`);

// The Git Data API refuses to create objects in a repository with no commits,
// so an empty repository gets one bootstrap commit through the Contents API.
// The real history replaces it when the branch ref is force-updated below.
const branches = await api(`/repos/${repo}/branches`);
if (!branches.length) {
  await api(`/repos/${repo}/contents/.bootstrap`, {
    method: "PUT",
    body: {
      message: "Depoyu başlat (gerçek geçmişle değiştirilecek)",
      content: Buffer.from("bootstrap\n").toString("base64"),
      branch,
    },
  });
  console.log("  bootstrap commit created on an empty repository");
}

// Blobs are content-addressed, so the same file in several commits is uploaded once.
const uploaded = new Map();
async function blobFor(objectSha) {
  if (uploaded.has(objectSha)) return uploaded.get(objectSha);
  const content = git(["cat-file", "blob", objectSha], "buffer").toString("base64");
  const blob = await api(`/repos/${repo}/git/blobs`, {
    method: "POST",
    body: { content, encoding: "base64" },
  });
  uploaded.set(objectSha, blob.sha);
  return blob.sha;
}

function entriesOf(commit) {
  return git(["ls-tree", "-r", commit])
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [meta, path] = line.split("\t");
      const [mode, type, sha] = meta.split(/\s+/);
      return { path, mode, type, sha };
    })
    .filter((entry) => entry.type === "blob");
}

let parent = null;
for (const [index, commit] of commits.entries()) {
  const subject = git(["log", "-1", "--format=%s", commit]).trim();
  const message = git(["log", "-1", "--format=%B", commit]).replace(/\s+$/, "");
  const entries = entriesOf(commit);
  let created = 0;
  const tree = [];
  for (const entry of entries) {
    const before = uploaded.size;
    const sha = await blobFor(entry.sha);
    if (uploaded.size > before) created += 1;
    tree.push({ path: entry.path, mode: entry.mode, type: "blob", sha });
  }
  // The tree is sent whole rather than as a diff, so a mistake cannot leave a
  // stale file behind from an earlier commit.
  const built = await api(`/repos/${repo}/git/trees`, {
    method: "POST",
    body: { tree },
  });
  const author = {
    name: git(["log", "-1", "--format=%an", commit]).trim(),
    email: git(["log", "-1", "--format=%ae", commit]).trim(),
    date: git(["log", "-1", "--format=%aI", commit]).trim(),
  };
  const object = await api(`/repos/${repo}/git/commits`, {
    method: "POST",
    body: {
      message,
      tree: built.sha,
      parents: parent ? [parent] : [],
      author,
      committer: author,
    },
  });
  parent = object.sha;
  console.log(
    `  ${index + 1}/${commits.length} ${subject.slice(0, 56)} — ${entries.length} files, ${created} new blobs`,
  );
}

const ref = `refs/heads/${branch}`;
const existing = await api(`/repos/${repo}/git/matching-refs/heads/${branch}`);
if (existing.length)
  await api(`/repos/${repo}/git/${ref}`, {
    method: "PATCH",
    body: { sha: parent, force: true },
  });
else
  await api(`/repos/${repo}/git/refs`, {
    method: "POST",
    body: { ref, sha: parent },
  });
console.log(`${branch} -> ${parent}`);
