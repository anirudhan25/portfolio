<script lang="ts">
  import { goto } from "$app/navigation";
  import { onMount, onDestroy } from "svelte";

  type Message = { role: "user" | "assistant"; content: string };

  let input = $state("");
  let response = $state("");
  let responseTitle = $state("");
  let navPhrase = $state("");
  let loading = $state(false);
  let history: Message[] = $state([]);
  let morphChar = $state("_");
  let isNavigating = $state(false);
  let isListening = $state(false);
  let speechSupported = $state(false);

  // Non-reactive: recognition instance, silence timer, accumulated final transcript
  let recognition: any = null;
  let silenceTimer: ReturnType<typeof setTimeout> | null = null;
  let finalTranscript = "";

  const MORPH_CHARS =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%&?_—";
  const NAV_RE = /\[NAV:(\/[a-z]*)\]/;
  const NAV_PHRASES = ["Let me show you.", "I'll show you now."];

  const PLACEHOLDERS: Record<string, string> = {
    "My Projects": "Ask me about what I've been working on...",
    Examples: "Ask me to show you my projects...",
    "More About Me": "Write a question to the diary.",
    Experience: "Ask about my experience.",
    "Skills & Tools": "What's in your tech stack?",
    Education: "Ask about my studies.",
    "Just Exploring": "Write to the diary...",
  };
  const PLACEHOLDER_ENTRIES = Object.entries(PLACEHOLDERS);

  let placeholderIdx = $state(0);
  let placeholderFading = $state(false);
  let responseFading = $state(false);
  let navPhraseFading = $state(false);
  let fadeTimer: ReturnType<typeof setTimeout> | null = null;

  let inputHistory: string[] = [];
  let historyIndex = -1;
  let inputDraft = "";

  let responseEl: HTMLParagraphElement | undefined = $state(undefined);

  $effect(() => {
    if (response && responseEl) {
      responseEl.scrollIntoView({ behavior: "smooth", block: "end" });
    }
  });

  $effect(() => {
    const id = setInterval(async () => {
      placeholderFading = true;
      await new Promise((r) => setTimeout(r, 500));
      placeholderIdx = (placeholderIdx + 1) % PLACEHOLDER_ENTRIES.length;
      placeholderFading = false;
    }, 5000);
    return () => clearInterval(id);
  });

  $effect(() => {
    if (!loading) {
      morphChar = "_";
      return;
    }
    const id = setInterval(() => {
      morphChar = MORPH_CHARS[Math.floor(Math.random() * MORPH_CHARS.length)];
    }, 90);
    return () => clearInterval(id);
  });

  function stopListening() {
    isListening = false;
    if (silenceTimer !== null) {
      clearTimeout(silenceTimer);
      silenceTimer = null;
    }
    recognition?.stop();
    finalTranscript = "";
  }

  function startListening() {
    if (!recognition) return;
    finalTranscript = "";
    input = "";
    isListening = true;
    try {
      recognition.start();
    } catch {
      // already started
    }
  }

  function toggleListening() {
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  }

  onMount(() => {
    const SR =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;
    if (!SR) return;
    speechSupported = true;

    recognition = new SR();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    recognition.onresult = (event: any) => {
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          finalTranscript += event.results[i][0].transcript;
        } else {
          interim += event.results[i][0].transcript;
        }
      }
      input = finalTranscript + interim;

      if (silenceTimer !== null) clearTimeout(silenceTimer);
      silenceTimer = setTimeout(() => {
        silenceTimer = null;
        stopListening();
        submit();
      }, 3000);
    };

    recognition.onerror = (event: any) => {
      if (event.error !== "no-speech") stopListening();
    };

    recognition.onend = () => {
      // Restart only if we haven't explicitly stopped (isListening still true)
      if (isListening) {
        try {
          recognition.start();
        } catch {
          /* ignore */
        }
      }
    };
  });

  onDestroy(() => {
    if (silenceTimer !== null) clearTimeout(silenceTimer);
    if (recognition && isListening) {
      isListening = false;
      recognition.stop();
    }
  });

  async function triggerNavigation(destination: string) {
    isNavigating = true;
    navPhraseFading = false;
    navPhrase = NAV_PHRASES[Math.floor(Math.random() * NAV_PHRASES.length)];
    await new Promise((r) => setTimeout(r, 1500));
    navPhraseFading = true;
    await new Promise((r) => setTimeout(r, 800));
    goto(destination);
  }

  async function submit() {
    const query = input.trim();
    if (!query || loading) return;
    if (isListening) stopListening();
    inputHistory.push(query);
    historyIndex = -1;
    inputDraft = "";
    if (fadeTimer !== null) {
      clearTimeout(fadeTimer);
      fadeTimer = null;
    }
    responseFading = false;
    navPhraseFading = false;
    input = "";
    response = "";
    responseTitle = "";
    navPhrase = "";

    loading = true;
    history = [...history, { role: "user", content: query }];

    const abort = new AbortController();
    const timeout = setTimeout(() => abort.abort(), 20000);

    let res: Response;
    try {
      res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history }),
        signal: abort.signal,
      });
    } catch {
      clearTimeout(timeout);
      loading = false;
      response = "No response.\n Check your connection and try again.";
      return;
    }

    clearTimeout(timeout);
    loading = false;

    if (!res.ok || !res.body) {
      response = "I'm tired of writing, but you can explore on your own.";
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let accumulated = "";
    let navigating = false;
    let finished = false;

    while (!finished) {
      const { done, value } = await reader.read();
      if (done) break;

      const lines = decoder.decode(value, { stream: true }).split("\n");
      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const raw = line.slice(6).trim();
        if (raw === "[DONE]") {
          finished = true;
          break;
        }

        try {
          const parsed = JSON.parse(raw);
          if (parsed.error) {
            response = "Something went wrong — try again.";
            finished = true;
            break;
          }
          if (parsed.navigate) {
            navigating = true;
            finished = true;
            triggerNavigation(parsed.navigate);
            break;
          }
          if (parsed.text !== undefined) {
            accumulated += parsed.text;
            if (parsed.title && !responseTitle) {
              responseTitle = parsed.title;
            }
            const navMatch = accumulated.match(NAV_RE);
            if (navMatch) {
              navigating = true;
              finished = true;
              triggerNavigation(navMatch[1]);
              break;
            }
            response = accumulated.replace(/\[NAV[^\]]*$/, "").trimEnd();
          }
        } catch {
          /* partial chunk */
        }
      }
    }

    if (!navigating && accumulated) {
      history = [...history, { role: "assistant", content: accumulated }];
      fadeTimer = setTimeout(() => {
        responseFading = true;
        setTimeout(() => {
          response = "";
          responseTitle = "";
          responseFading = false;
        }, 1500);
      }, 15000);
    }
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (isListening) stopListening();
      submit();
      return;
    }
    if (e.key === "ArrowUp" && inputHistory.length > 0) {
      e.preventDefault();
      if (historyIndex === -1) inputDraft = input;
      historyIndex = Math.min(historyIndex + 1, inputHistory.length - 1);
      input = inputHistory[inputHistory.length - 1 - historyIndex];
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (historyIndex <= 0) {
        historyIndex = -1;
        input = inputDraft;
      } else {
        historyIndex--;
        input = inputHistory[inputHistory.length - 1 - historyIndex];
      }
    }
  }
</script>

<p class="page-num">I</p>

<!-- left margin: social links -->
<div class="margin-note margin-note--left" style="top: 15rem;">
  <a
    class="margin-link"
    href="https://github.com/anirudhan25"
    target="_blank"
    rel="noopener noreferrer">GitHub</a
  >
  <a
    class="margin-link"
    href="http://linkedin.com/in/anirudhan-vijay"
    target="_blank"
    rel="noopener noreferrer">LinkedIn</a
  >
  <svg
    width="84"
    height="24"
    viewBox="0 0 84 24"
    fill="none"
    style="margin-top:0.2rem; align-self:flex-end;"
  >
    <!-- The main squiggly line, extended to x=81 -->
    <path
      d="M 2 12 C 15 5, 35 18, 55 10 C 65 7, 75 8, 81 12"
      stroke="currentColor"
      stroke-width="1.3"
      stroke-linecap="round"
    />
    <!-- The arrowhead, moved to the new endpoint near x=81 -->
    <path
      d="M 76 7 L 81 12 L 75 16"
      stroke="currentColor"
      stroke-width="1.3"
      fill="none"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
  </svg>
  <span class="margin-desc">find my socials here for more</span>
</div>

<header
  class={isNavigating ? "nav-dissolve" : ""}
  style="margin-bottom: 3.5rem;"
>
  <h1 class="folio-name">Anirudhan Vijay</h1>
  <div
    class="mobile-only"
    style="gap:2rem; margin-top:0.4rem; justify-content:center;"
  >
    <a
      class="folio-contact"
      href="https://github.com/anirudhan25"
      target="_blank"
      rel="noopener noreferrer">GitHub</a
    >
    <a
      class="folio-contact"
      href="http://linkedin.com/in/anirudhan-vijay"
      target="_blank"
      rel="noopener noreferrer">LinkedIn</a
    >
  </div>
</header>

<div style="position: relative;">
  <p class="folio-intro" style="margin-bottom: 2rem;">
    I build things. Sometimes they're chess engines, sometimes they're security
    cameras, sometimes they're this. Ask the diary anything, or <span
      class="handline">explore on your own</span
    >.
  </p>
  <div
    class="margin-note margin-note--right"
    // style="bottom: 0.4rem; top: auto;"
  >
    <a class="margin-link" href="/projects">Projects</a>
    <a class="margin-link" href="/blog">Blog</a>
    <span class="margin-desc">check out my other work & writing</span>
    <span class="page-count">page 1 of 3</span>
  </div>
</div>

<nav class="folio-nav mobile-only" style="margin-bottom: 3.5rem;">
  <a href="/projects">Projects</a>
  <a href="/blog">Blog</a>
</nav>

{#if loading || response || responseTitle || navPhrase}
  <div style="margin-top: 2rem; margin-bottom: 2.5rem;">
    {#if loading}
      <span class="morph-char">{morphChar}</span>
    {:else}
      {#if responseTitle}
        <p class="response-title {responseFading ? 'fading' : ''}">
          {responseTitle}
        </p>
      {/if}
      {#if response}
        <p
          class="diary-response {responseFading ? 'fading' : ''}"
          bind:this={responseEl}
        >
          {response}
        </p>
      {/if}
      {#if navPhrase}
        <p class="nav-phrase {navPhraseFading ? 'fading' : ''}">{navPhrase}</p>
      {/if}
    {/if}
  </div>
{/if}

<div class="placeholder-input-wrapper {isNavigating ? 'nav-dissolve' : ''}">
  <p
    class="placeholder-heading {placeholderFading
      ? 'placeholder-heading--fading'
      : ''} {input ? 'placeholder-heading--hidden' : ''}"
  >
    {PLACEHOLDER_ENTRIES[placeholderIdx][0]}
  </p>
  <textarea
    class="diary-input {placeholderFading ? 'placeholder-fade' : ''}"
    rows="1"
    maxlength={150}
    placeholder={PLACEHOLDER_ENTRIES[placeholderIdx][1]}
    bind:value={input}
    onkeydown={onKeydown}
  ></textarea>
  {#if input.length > 100}
    <span class="char-counter {input.length > 140 ? 'char-counter--warning' : ''}">
      {150 - input.length}
    </span>
  {/if}
</div>

{#if speechSupported}
  <button
    class="mic-btn {isListening ? 'mic-btn--listening' : ''}"
    onclick={toggleListening}
    aria-label={isListening ? "Stop listening" : "Start voice input"}
  >
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="32"
      height="32"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.5"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <rect x="9" y="2" width="6" height="11" rx="3" />
      <path d="M5 10a7 7 0 0 0 14 0" />
      <line x1="12" y1="17" x2="12" y2="21" />
      <line x1="9" y1="21" x2="15" y2="21" />
    </svg>
  </button>
{/if}
