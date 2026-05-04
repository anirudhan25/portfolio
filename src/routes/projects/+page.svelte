<script lang="ts">
  const projects = [
    {
      name: "Chess Engine",
      desc: "I started by building a basic C++ chess engine, then kept pushing it with minimax, alpha-beta pruning, NMP, LMR, and aspiration windows until it played much stronger and searched much faster.",
      link: "https://github.com/anirudhan25/Chess",
      image: "/original/chess.jpg" /* Updated path */,
    },
    {
      name: "Home Security Camera",
      desc: "I put this together with a Raspberry Pi, Flask, OpenCV, and GCP after a break-in. I started with the camera pipeline and then added motion detection, streaming, and cloud pieces to make it useful fast.",
      link: "https://github.com/anirudhan25/HomeSecurityCamera",
      image: "/original/camera.jpg" /* Updated path */,
    },
    {
      name: "Monte Carlo Simulation",
      desc: "I started by simulating correlated GBM paths, then used Cholesky decomposition to model portfolio behavior across multiple assets.",
      link: "https://github.com/anirudhan25/MonteCarloSimulation",
      image: "/original/montecarlo.jpg" /* Updated path */,
    },
    {
      name: "Hotel Inventory Management",
      desc: "I built this inventory management app with Node, Express, MongoDB, and React.",
      link: "https://github.com/anirudhan25/StockDatabase",
      image: "/original/stock.jpg" /* Updated path */,
    },
  ];
</script>

<p class="page-num">II</p>

<header style="margin-bottom: 3rem;">
  <a href="/" class="folio-chrome">← Home</a>
  <h1 class="folio-name" style="margin-top: 1.5rem;">Projects</h1>
</header>

<div
  class="columns-1 md:columns-2 gap-10 md:gap-16"
  style="column-rule: 1px solid rgba(28, 16, 8, 0.12);"
>
  {#each projects as p}
    <article class="break-inside-avoid mb-10">
      <!-- Title -->
      <a
        href={p.link}
        target="_blank"
        rel="noopener noreferrer"
        class="block w-full clear-both group"
        style="text-decoration:none;"
      >
        <h2
          class="group-hover:opacity-60 transition-opacity"
          style="font-family:'EB Garamond',serif; font-size:1.15rem; font-weight:600; color:var(--ink); margin:0 0 0.5rem 0;"
        >
          {p.name}
        </h2>
      </a>

      <!-- Content -->
      <div class="flow-root">
        <!-- Added 'image-link' class here to target it in CSS -->
        <a
          href={p.link}
          target="_blank"
          rel="noopener noreferrer"
          class="block image-link"
        >
          <div
            class="float-left w-24 sm:w-28 mr-4 mb-2 aspect-square border overflow-hidden flex items-center justify-center transition-colors"
            style="border-color: var(--ink); background-color: rgba(28, 16, 8, 0.05);"
          >
            {#if p.image}
              <img
                src={p.image}
                alt={p.name}
                class="w-full h-full object-cover paper-image"
              />
            {:else}
              <!-- Optional fallback (subtle) -->
              <div style="font-size:0.7rem; opacity:0.4;">No image</div>
            {/if}
          </div>
        </a>

        <p
          style="font-family:'EB Garamond',serif; font-size:0.95rem; color:var(--ink-fade); margin:0; text-align: justify; line-height:1.6;"
        >
          {p.desc}
        </p>
      </div>
    </article>
  {/each}
</div>

<style>
  .paper-image {
    width: 100%;
    height: 100%;
    object-fit: cover;

    /* The vintage ink processing */
    filter: grayscale(100%) sepia(20%) contrast(0.9) brightness(0.95);
    mix-blend-mode: multiply;

    /* Smoothly animate the filter changes over half a second */
    transition:
      filter 0.5s ease,
      mix-blend-mode 0.5s ease;
  }

  /* When the user hovers over the link wrapper, remove the filters! */
  .image-link:hover .paper-image {
    filter: grayscale(0%) sepia(0%) contrast(1) brightness(1);
    mix-blend-mode: normal;
  }
</style>
