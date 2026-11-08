
(() => {
  const template = document.getElementById("generated-card-shell");
  const linked = document.getElementById("linked-card-shell");
  for (const config of [{"key": "overview", "title": "Two ways to start falling", "titleId": "overview-title", "reply": "At the top of the toss and immediately after release, both balls have zero velocity. Gravity makes both begin falling from rest."}, {"key": "standard", "title": "At the top of a throw", "titleId": "title", "reply": "At the turning point, velocity is zero and acceleration is still 9.8 metres per second squared downward. The gate releases the second ball at that instant, so the two balls fall together."}, {"key": "deep", "title": "Why the ball seems to hang", "titleId": "deep-title", "reply": "The faster throw reaches its peak later and higher. Measuring each throw from its own top gives the same motion over the 0.20 seconds within 4.9 centimetres of the peak."}]) {
    const instance = template.content.cloneNode(true);
    const stage = instance.querySelector("[data-generated-card]");
    const slot = (name) => stage.querySelector('[data-slot="' + name + '"]');
    const prefix = "toss-" + config.key;
    stage.dataset.cardDemo = config.key;
    stage.dataset.defaultReply = config.reply;
    slot("kind").textContent = "Explanation";
    slot("title").id = config.titleId;
    slot("title").textContent = config.title;
    slot("card").setAttribute("aria-labelledby", config.titleId);
    slot("answer").append(document.getElementById("scene-content-" + config.key).content.cloneNode(true));
    const toggle = stage.querySelector(".follow-up-toggle");
    const composer = slot("composer");
    const input = slot("follow-up");
    composer.id = prefix + "-follow-up";
    input.id = composer.id + "-text";
    composer.querySelector("label").htmlFor = input.id;
    toggle.setAttribute("aria-controls", composer.id);
    toggle.hidden = false;
    slot("term-note").id = prefix + "-term-note";
    slot("term-title").id = prefix + "-term-title";
    slot("term-note").setAttribute("aria-labelledby", slot("term-title").id);

    const connector = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    connector.setAttribute("class", "branch-link");
    connector.setAttribute("aria-hidden", "true");
    connector.setAttribute("hidden", "");
    connector.append(document.createElementNS("http://www.w3.org/2000/svg", "path"));
    stage.prepend(connector);
    const child = linked.content.cloneNode(true);
    const childTitle = child.querySelector(".card-title");
    childTitle.id = prefix + "-branch-title";
    child.querySelector(".linked-card").setAttribute("aria-labelledby", childTitle.id);
    stage.append(child);
    document.getElementById("mount-" + config.key).replaceWith(instance);
  }
})();
