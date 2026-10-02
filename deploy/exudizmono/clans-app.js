"use strict";
const $ = (id) => document.getElementById(id),
  esc = (v) =>
    String(v ?? "").replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
let jwt = null,
  me = null,
  tag = null,
  page = 1,
  signed = false,
  confirmation = null,
  mutationBusy = false,
  detailSequence = 0;
async function api(path, { method = "GET", body } = {}) {
  const r = await fetch("/backend" + path, {
    method,
    headers: {
      Accept: "application/json",
      ...(jwt ? { Authorization: "Bearer " + jwt } : {}),
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(15000),
  });
  const b = await r.json();
  if (!r.ok) throw Error(b.error || b.message || "Request failed");
  return b;
}
function status(message, error = false) {
  $("status").textContent = message;
  $("status").className = "status" + (error ? " danger" : "");
}
async function account() {
  const auth = await api("/auth/refresh", { method: "POST" });
  jwt = auth.jwt;
  me = await api("/users/@me");
  signed = Object.keys(me.user).length > 0;
  $("identity").textContent =
    (signed ? "Signed in" : "Guest") + " · Player ID " + me.player.publicId;
  $("notice").innerHTML = signed
    ? ""
    : '<a href="/">Sign in on the game</a> to create, join or manage clans. Steam sign-in is available.';
  $("create-fields").disabled = !signed;
  renderMine();
}
function renderMine() {
  $("mine").innerHTML = me.player.clans?.length
    ? me.player.clans
        .map(
          (c) =>
            `<div class="card"><h3>[${esc(c.tag)}] ${esc(c.name)}</h3><small>${esc(c.role)} · ${c.memberCount} members</small><div class="actions"><button data-open="${esc(c.tag)}">Open clan</button></div></div>`,
        )
        .join("")
    : "<p>You haven’t joined a clan yet.</p>";
  $("pending").innerHTML = me.player.clanRequests?.length
    ? me.player.clanRequests
        .map(
          (c) =>
            `<div class="card">[${esc(c.tag)}] ${esc(c.name)} <button data-action="requests/withdraw" data-tag="${esc(c.tag)}">Withdraw request</button></div>`,
        )
        .join("")
    : "<p>No pending requests.</p>";
}
async function browse(append = false) {
  const b = await api(
    "/clans?" +
      new URLSearchParams({
        page: String(page),
        limit: "20",
        search: $("query").value.trim(),
      }),
  );
  const html = b.results
    .map(
      (c) =>
        `<div class="card"><h3>[${esc(c.tag)}] ${esc(c.name)}</h3><p>${esc(c.description)}</p><small>${c.memberCount} members · ${c.isOpen ? "Open membership" : "Approval required"}</small><div class="actions"><button data-open="${esc(c.tag)}">View clan</button></div></div>`,
    )
    .join("");
  if (append) $("browse").insertAdjacentHTML("beforeend", html);
  else $("browse").innerHTML = html || "<p>No clans found.</p>";
  $("more").hidden = page * 20 >= b.total;
}
async function detail(value) {
  const seq = ++detailSequence;
  tag = value;
  const [c, members] = await Promise.all([
    api("/clans/" + encodeURIComponent(value)),
    api("/clans/" + value + "/members?limit=100"),
  ]);
  if (seq !== detailSequence) return;
  const mine = me.player.clans?.find((c) => c.tag === tag),
    role = mine?.role,
    leader = role === "leader",
    manager = leader || role === "officer";
  const [requests, bans] = manager
    ? await Promise.all([
        api("/clans/" + tag + "/requests?limit=100"),
        api("/clans/" + tag + "/bans?limit=100"),
      ])
    : [{ results: [] }, { results: [] }];
  if (seq !== detailSequence) return;
  $("details").hidden = false;
  $("details").innerHTML =
    `<div class="row"><h2>[${esc(c.tag)}] ${esc(c.name)}</h2><span class="badge">${role ? esc(role) : "Visitor"}</span></div><p>${esc(c.description)}</p><p>${c.isOpen ? "Open membership" : "Join requests require approval"} · ${c.memberCount} members</p>${c.discordUrl ? `<a href="${esc(c.discordUrl)}" target="_blank" rel="noopener noreferrer">Clan Discord</a>` : ""}<div class="actions">${signed && !role ? '<button data-action="join">' + (c.isOpen ? "Join clan" : "Request to join") + "</button>" : ""}${role && role !== "leader" ? '<button data-action="leave" class="danger">Leave clan</button>' : ""}${leader ? '<button data-action="disband" class="danger">Disband clan</button>' : ""}<a href="/#modal=clan&clan=${encodeURIComponent(tag)}">View in game</a></div><h3>Members</h3><div class="scroll"><table><thead><tr><th>Player</th><th>Role</th><th>Actions</th></tr></thead><tbody>${members.results.map((m) => `<tr><td>${esc(m.username || m.publicId)}<br><small>${esc(m.publicId)}</small></td><td>${esc(m.role)}</td><td><div class="actions">${leader && m.role === "member" ? `<button data-action="promote" data-target="${esc(m.publicId)}">Promote to officer</button>` : ""}${leader && m.role === "officer" ? `<button data-action="demote" data-target="${esc(m.publicId)}">Demote</button>` : ""}${leader && m.role !== "leader" ? `<button data-action="transfer" data-target="${esc(m.publicId)}">Transfer leadership</button>` : ""}${manager && m.publicId !== me.player.publicId && m.role !== "leader" && (leader || m.role === "member") ? `<button data-action="kick" data-target="${esc(m.publicId)}">Remove</button><button data-action="ban" data-target="${esc(m.publicId)}" class="danger">Ban</button>` : ""}</div></td></tr>`).join("")}</tbody></table></div>${manager ? `<h3>Join requests</h3>${requests.results.length ? requests.results.map((r) => `<div class="card">${esc(r.username || r.publicId)}<div class="actions"><button data-action="requests/approve" data-target="${esc(r.publicId)}">Approve</button><button data-action="requests/deny" data-target="${esc(r.publicId)}">Decline</button></div></div>`).join("") : "<p>No pending requests.</p>"}<h3>Banned players</h3>${bans.results.length ? bans.results.map((b) => `<div class="card">${esc(b.username || b.publicId)}<p>${esc(b.reason || "No reason given")}</p><button data-action="unban" data-target="${esc(b.publicId)}">Unban</button></div>`).join("") : "<p>No banned players.</p>"}` : ""}${leader ? `<h3>Clan settings</h3><form id="settings"><label>Name<input name="name" maxlength="35" required value="${esc(c.name)}"></label><label>Description<textarea name="description" maxlength="200">${esc(c.description)}</textarea></label><label>Discord invite<input name="discordUrl" type="url" value="${esc(c.discordUrl || "")}" placeholder="https://discord.gg/..."></label><label><input name="isOpen" type="checkbox" ${c.isOpen ? "checked" : ""}> Anyone can join</label><button>Save settings</button></form>` : ""}`;
  if (leader)
    $("settings").onsubmit = (e) => {
      e.preventDefault();
      const f = e.target.elements;
      mutate(
        () =>
          api("/clans/" + tag, {
            method: "PATCH",
            body: {
              name: f.name.value,
              description: f.description.value,
              discordUrl: f.discordUrl.value,
              isOpen: f.isOpen.checked,
            },
          }),
        "Clan settings saved.",
      );
    };
}
async function mutate(fn, message) {
  if (mutationBusy) return;
  mutationBusy = true;
  document.querySelectorAll("button").forEach((b) => (b.disabled = true));
  try {
    await account();
    if (!signed) throw Error("Sign in before managing clans");
    await fn();
    status(message);
    await account();
    await browse();
    if (tag) {
      try {
        await detail(tag);
      } catch {
        tag = null;
        $("details").hidden = true;
      }
    }
  } catch (e) {
    status(e.message, true);
  } finally {
    mutationBusy = false;
    document.querySelectorAll("button").forEach((b) => (b.disabled = false));
    $("create-fields").disabled = !signed;
  }
}
function confirmAction(message, fn) {
  $("confirmation-text").textContent = message;
  confirmation = fn;
  $("confirmation").showModal();
}
$("confirm-no").onclick = () => {
  $("confirmation").close();
  confirmation = null;
};
$("confirm-yes").onclick = () => {
  const fn = confirmation;
  confirmation = null;
  $("confirmation").close();
  if (fn) fn();
};
document.addEventListener("click", (e) => {
  if (mutationBusy) return;
  const open = e.target.closest("[data-open]");
  if (open) {
    detail(open.dataset.open)
      .then(() => $("details").scrollIntoView({ behavior: "smooth" }))
      .catch((e) => status(e.message, true));
    return;
  }
  const b = e.target.closest("[data-action]");
  if (!b) return;
  const action = b.dataset.action,
    target = b.dataset.target,
    selectedTag = b.dataset.tag || tag;
  const run = () =>
    mutate(
      () =>
        api(
          "/clans/" + selectedTag + (action === "disband" ? "" : "/" + action),
          {
            method: action === "disband" ? "DELETE" : "POST",
            ...(target ? { body: { targetPublicId: target } } : {}),
          },
        ),
      "Clan updated.",
    );
  if (["disband", "transfer", "ban", "kick", "leave"].includes(action))
    confirmAction(
      action === "disband"
        ? "Disband this clan? It will disappear from the public directory and members’ clan lists."
        : action === "transfer"
          ? "Transfer leadership to this member? You will become an officer."
          : "Confirm " + action + " for this clan?",
      run,
    );
  else run();
});
$("create").onsubmit = (e) => {
  e.preventDefault();
  const f = e.target.elements;
  mutate(async () => {
    const c = await api("/clans", {
      method: "POST",
      body: {
        name: f.name.value,
        tag: f.tag.value,
        description: f.description.value,
        isOpen: f.isOpen.checked,
      },
    });
    tag = c.tag;
    e.target.reset();
  }, "Clan created.");
};
$("search").onsubmit = (e) => {
  e.preventDefault();
  page = 1;
  browse().catch((e) => status(e.message, true));
};
$("more").onclick = () => {
  page++;
  browse(true).catch((e) => {
    page--;
    status(e.message, true);
  });
};
(async () => {
  try {
    await account();
    await browse();
  } catch (e) {
    status(e.message, true);
  }
})();
