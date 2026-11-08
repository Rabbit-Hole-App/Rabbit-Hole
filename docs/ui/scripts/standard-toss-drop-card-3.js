
(() => {
  function setupCard(stage) {
    const wrap = stage.querySelector(".card-wrap");
    const reading = stage.querySelector(".explain-card > .reading");
    const composer = stage.querySelector(".composer");
    const followUp = composer.querySelector("input");
    const followUpToggle = stage.querySelector(".follow-up-toggle");
    const send = composer.querySelector(".send");
    const suggestions = stage.querySelector(".suggestions");
    const parentThread = stage.querySelector(".parent-thread");
    const branchCard = stage.querySelector(".linked-card");
    const branchTitle = branchCard.querySelector(".card-title");
    const branchLink = stage.querySelector(".branch-link");
    const termNote = stage.querySelector(".term-note");
    const diveDeeper = termNote.querySelector("button");
    let activeTerm = null;

    function drawBranchLink() {
      if (branchCard.hidden) return;
      const viewport = stage.getBoundingClientRect();
      if (!viewport.width || !viewport.height) return;
      const parent = wrap.getBoundingClientRect();
      const child = branchCard.getBoundingClientRect();
      const startX = parent.right - viewport.left;
      const startY = parent.top + parent.height / 2 - viewport.top;
      const endX = child.left + child.width / 2 - viewport.left;
      const endY = child.top - viewport.top;
      const gutterX = Math.min(viewport.width - 6, startX + 13);
      const approachY = endY - 16;
      const bend = 5;
      const path = [
        "M", startX, startY,
        "H", gutterX - bend,
        "Q", gutterX, startY, gutterX, startY + bend,
        "V", approachY - bend,
        "Q", gutterX, approachY, gutterX - bend, approachY,
        "H", endX + bend,
        "Q", endX, approachY, endX, approachY + bend,
        "V", endY
      ].join(" ");
      branchLink.setAttribute("viewBox", "0 0 " + viewport.width + " " + viewport.height);
      branchLink.querySelector("path").setAttribute("d", path);
      branchLink.removeAttribute("hidden");
    }

    function updateSend() {
      send.disabled = !followUp.value.trim();
    }

    function openFollowUp() {
      composer.hidden = false;
      followUpToggle.setAttribute("aria-expanded", "true");
      updateSend();
      followUp.focus();
      drawBranchLink();
    }

    function closeFollowUp() {
      if (composer.hidden) return;
      composer.hidden = true;
      followUpToggle.setAttribute("aria-expanded", "false");
      drawBranchLink();
    }

    function addReply(thread, answer, question = "") {
      const turn = document.createElement("div");
      turn.className = "turn";
      if (question) {
        const message = document.createElement("p");
        message.className = "question-message";
        message.textContent = question;
        turn.append(message);
      }
      const reply = document.createElement("p");
      reply.className = "reply-message";
      reply.setAttribute("aria-live", "polite");
      reply.setAttribute("aria-busy", "true");
      reply.textContent = "Replying…";
      turn.append(reply);
      thread.append(turn);
      setTimeout(() => {
        const atEnd = reading.scrollHeight - reading.scrollTop - reading.clientHeight < 32;
        reply.textContent = answer;
        reply.removeAttribute("aria-busy");
        if (thread === parentThread && atEnd) reading.scrollTop = reading.scrollHeight;
        drawBranchLink();
      }, 260);
      return reply;
    }

    function ask(question, answer, destination) {
      suggestions.hidden = true;
      followUp.value = "";
      updateSend();
      closeFollowUp();
      if (destination === "branch") {
        branchTitle.textContent = question;
        branchCard.hidden = false;
        wrap.querySelector(".connector-right").setAttribute("data-linked", "");
        addReply(branchCard.querySelector(".thread"), answer);
        drawBranchLink();
        branchTitle.focus({ preventScroll: true });
        branchCard.scrollIntoView?.({ block: "nearest" });
      } else {
        const reply = addReply(parentThread, answer, question);
        reading.scrollTop = reading.scrollHeight;
        reply.tabIndex = -1;
        reply.focus({ preventScroll: true });
      }
    }

    suggestions.addEventListener("click", event => {
      const action = event.target.closest("[data-ask]");
      if (!action || suggestions.hidden) return;
      const row = action.closest(".suggestion-row");
      ask(row.querySelector(".question-copy").textContent.trim(), row.dataset.answer, action.dataset.ask);
    });

    followUpToggle.addEventListener("click", () => {
      if (composer.hidden) openFollowUp();
      else closeFollowUp();
    });
    followUp.addEventListener("input", updateSend);
    composer.addEventListener("submit", event => {
      event.preventDefault();
      const question = followUp.value.trim();
      if (question) ask(question, stage.dataset.defaultReply, "here");
    });
    document.addEventListener("pointerdown", event => {
      if (!composer.contains(event.target) && !followUpToggle.contains(event.target)) closeFollowUp();
    });

    function closeTerm() {
      if (!activeTerm) return;
      activeTerm.setAttribute("aria-expanded", "false");
      activeTerm = null;
      termNote.hidden = true;
    }

    stage.querySelectorAll(".term").forEach(button => {
      button.addEventListener("click", event => {
        const wasOpen = activeTerm === button;
        closeTerm();
        if (wasOpen) return;
        activeTerm = button;
        button.setAttribute("aria-expanded", "true");
        termNote.querySelector("strong").textContent = button.textContent;
        termNote.querySelector("p").textContent = button.dataset.definition;
        termNote.hidden = false;
        const frame = wrap.getBoundingClientRect();
        const anchor = button.getBoundingClientRect();
        const maxLeft = frame.width - termNote.offsetWidth - 12;
        termNote.style.left = Math.max(12, Math.min(anchor.left - frame.left, maxLeft)) + "px";
        termNote.style.top = anchor.bottom - frame.top + 7 + "px";
        if (event.detail === 0) diveDeeper.focus({ preventScroll: true });
      });
    });

    diveDeeper.addEventListener("click", () => {
      if (!activeTerm) return;
      followUp.value = "What does “" + activeTerm.textContent + "” mean in this example?";
      closeTerm();
      openFollowUp();
    });
    reading.addEventListener("scroll", closeTerm, { passive: true });
    document.addEventListener("click", event => {
      if (activeTerm && !termNote.contains(event.target) && !event.target.closest(".term")) closeTerm();
    });
    document.addEventListener("keydown", event => {
      if (event.key !== "Escape") return;
      if (activeTerm) {
        const opener = activeTerm;
        closeTerm();
        opener.focus({ preventScroll: true });
      } else if (!composer.hidden) {
        closeFollowUp();
        followUpToggle.focus({ preventScroll: true });
      }
    });

    if (typeof ResizeObserver === "function") {
      const observer = new ResizeObserver(drawBranchLink);
      observer.observe(stage);
    }
    const startScroll = Number(stage.dataset.startScroll);
    if (startScroll > 0) requestAnimationFrame(() => { reading.scrollTop = startScroll; });
  }

  document.querySelectorAll("[data-card-demo]").forEach(setupCard);
})();
