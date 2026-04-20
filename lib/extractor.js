const cheerio = require("cheerio");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");

const execFileAsync = promisify(execFile);

const HEADER_SELECTORS = [
  "header[role='banner']",
  "header.site-header",
  "header.header",
  "header",
  "#header",
  ".site-header",
  ".header",
  ".header-wrapper",
  ".siteHeader",
  ".header-logo",
];

const HERO_PRIMARY_SELECTORS = [
  ".heroCarousel",
  ".hero-carousel",
  "#heroCarousel",
  ".homepage-carousel",
  ".homeCarousel",
  ".heroBanner",
  ".hero-banner",
  ".slideshow",
  "[class*='heroCarousel']",
  "[class*='hero-banner']",
  "section[class*='hero']",
];

const HERO_FALLBACK_SELECTORS = [
  "[data-slick]",
  ".slick-slider",
  ".carousel",
  ".hero",
  ".banner-carousel",
];

const SLIDE_SELECTORS = [
  ".heroCarousel-slide",
  ".slick-slide",
  ".carousel-item",
  ".slide",
  ".hero-slide",
  ".banner-slide",
];

const INTERACTIVE_HEADER_SELECTORS = [
  "a",
  "button",
  "[role='button']",
  ".dropdown",
  ".dropdown-menu",
  ".navPages-action-moreIcon",
];

async function analyzeMarketplace(inputUrl) {
  const normalizedUrl = normalizeUrl(inputUrl);
  const { html, sourceUrl } = await fetchHtml(normalizedUrl);
  const $ = cheerio.load(html, { decodeEntities: false });

  stampDocumentOrder($);

  const notes = [];
  const fontUrls = collectGoogleFonts($, sourceUrl);
  const stylesheetCandidates = collectStylesheets($, sourceUrl);
  const primaryStylesheet = pickPrimaryStylesheet(stylesheetCandidates);

  if (!primaryStylesheet) {
    notes.push("No obvious primary stylesheet was detected. Add the site CSS manually before opening the pen.");
  }

  const headerMatch = selectBestElement($, HEADER_SELECTORS, scoreHeader);
  const heroMatch =
    selectBestElement($, HERO_PRIMARY_SELECTORS, (el) =>
      scoreHero($, el, headerMatch?.order ?? -1),
    ) ||
    selectBestElement($, HERO_FALLBACK_SELECTORS, (el) =>
      scoreHero($, el, headerMatch?.order ?? -1),
    );

  if (!headerMatch) {
    notes.push("No strong header match was found. The generated pen will only include the hero section.");
  }

  if (!heroMatch) {
    const error = new Error("No hero carousel or banner block was detected.");
    error.statusCode = 422;
    error.userMessage =
      "I couldn’t find a likely hero carousel on that page. The site may use unusual markup, so we’ll probably need to tune the extraction selectors for it.";
    throw error;
  }

  const headerHtml = headerMatch ? prepareHeaderMarkup($, headerMatch.element, sourceUrl) : "";
  const heroHtml = prepareHeroMarkup($, heroMatch.element, sourceUrl, notes);
  const prototypeHtml = buildPrototypeHtml(sourceUrl, headerHtml, heroHtml);
  const prototypeCss = buildPrototypeCss();
  const prototypeJs = buildPrototypeJs();
  const externalCssUrls = [primaryStylesheet, ...fontUrls].filter(Boolean);

  if (fontUrls.length) {
    notes.push(`Detected ${fontUrls.length} Google Font link${fontUrls.length === 1 ? "" : "s"} and added them to the pen.`);
  }

  if (stylesheetCandidates.length > 1) {
    const alternates = stylesheetCandidates
      .filter((href) => href !== primaryStylesheet)
      .slice(0, 3);

    if (alternates.length) {
      notes.push(`Alternate stylesheet candidates: ${alternates.join(", ")}`);
    }
  }

  const title = buildPenTitle(sourceUrl);
  const description = `Generated from ${sourceUrl} for BigCommerce banner prototyping.`;
  const codepenPayload = buildCodepenPayload({
    title,
    description,
    html: prototypeHtml,
    css: prototypeCss,
    js: prototypeJs,
    cssExternal: externalCssUrls,
  });

  return {
    sourceUrl,
    title,
    description,
    headerFound: Boolean(headerMatch),
    heroSelectorUsed: heroMatch.selector,
    externalCssUrls,
    fontUrls,
    primaryStylesheet,
    notes,
    html: prototypeHtml,
    css: prototypeCss,
    js: prototypeJs,
    codepenPayload,
    codepenEndpoint: "https://codepen.io/cpe/pen/define",
  };
}

async function fetchHtml(url) {
  try {
    const response = await fetch(url, {
      redirect: "follow",
      headers: {
        "user-agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123 Safari/537.36",
        accept: "text/html,application/xhtml+xml",
      },
    });

    if (!response.ok) {
      const error = new Error(`The site responded with ${response.status}.`);
      error.statusCode = response.status;
      error.userMessage = `The site responded with ${response.status}. Try opening the URL directly to confirm it is public and reachable.`;
      throw error;
    }

    return {
      html: await response.text(),
      sourceUrl: response.url,
    };
  } catch (error) {
    if (error.statusCode) {
      throw error;
    }

    return fetchHtmlWithCurl(url);
  }
}

async function fetchHtmlWithCurl(url) {
  const marker = "__BANNER_PROTO_META__";

  try {
    const { stdout } = await execFileAsync(
      "curl",
      [
        "-sSL",
        "--compressed",
        "-A",
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123 Safari/537.36",
        "-H",
        "Accept: text/html,application/xhtml+xml",
        "-w",
        `\n${marker}STATUS:%{http_code}\n${marker}URL:%{url_effective}\n`,
        url,
      ],
      { maxBuffer: 20 * 1024 * 1024 },
    );

    const statusMatch = stdout.match(new RegExp(`${marker}STATUS:(\\d{3})`));
    const urlMatch = stdout.match(new RegExp(`${marker}URL:(.+)`));
    const html = stdout.replace(new RegExp(`\\n${marker}STATUS:[\\s\\S]*$`), "");
    const status = Number(statusMatch?.[1] || 0);
    const finalUrl = String(urlMatch?.[1] || url).trim();

    if (!status || status >= 400) {
      const fetchError = new Error(`The site responded with ${status || "an unknown status"}.`);
      fetchError.statusCode = status || 500;
      fetchError.userMessage = `The site responded with ${status || "an unknown status"}. Try opening the URL directly to confirm it is public and reachable.`;
      throw fetchError;
    }

    return {
      html,
      sourceUrl: finalUrl,
    };
  } catch (error) {
    if (error.statusCode) {
      throw error;
    }

    const fetchError = new Error("Unable to load that site.");
    fetchError.statusCode = 502;
    fetchError.userMessage =
      "I couldn’t reach that site from the generator. Confirm the homepage is public and not blocked by bot protection.";
    throw fetchError;
  }
}

function normalizeUrl(inputUrl) {
  const candidate = /^https?:\/\//i.test(inputUrl) ? inputUrl : `https://${inputUrl}`;

  try {
    const url = new URL(candidate);

    if (!/^https?:$/i.test(url.protocol)) {
      throw new Error("Only http and https URLs are supported.");
    }

    return url.toString();
  } catch {
    const error = new Error("That URL does not look valid.");
    error.statusCode = 400;
    error.userMessage = "Enter a full homepage URL like https://example.com.";
    throw error;
  }
}

function stampDocumentOrder($) {
  $("body *").each((index, element) => {
    element.__protoOrder = index;
  });
}

function collectGoogleFonts($, sourceUrl) {
  const fontUrls = new Set();

  $("link[href]").each((_, element) => {
    const href = absolutizeUrl($(element).attr("href"), sourceUrl);

    if (href && /fonts\.googleapis\.com/i.test(href)) {
      fontUrls.add(href);
    }
  });

  return [...fontUrls];
}

function collectStylesheets($, sourceUrl) {
  const stylesheets = new Map();

  $("link[href]").each((_, element) => {
    const rel = String($(element).attr("rel") || "").toLowerCase();
    const href = absolutizeUrl($(element).attr("href"), sourceUrl);

    if (!href || !rel.includes("stylesheet")) {
      return;
    }

    if (/fonts\.googleapis\.com/i.test(href)) {
      return;
    }

    stylesheets.set(href, scoreStylesheet(href, sourceUrl));
  });

  return [...stylesheets.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([href]) => href);
}

function pickPrimaryStylesheet(stylesheetCandidates) {
  return stylesheetCandidates[0] || "";
}

function scoreStylesheet(href, sourceUrl) {
  let score = 0;

  try {
    const url = new URL(href);
    const source = new URL(sourceUrl);
    const pathname = url.pathname.toLowerCase();

    if (url.hostname === source.hostname) {
      score += 5;
    }

    if (/theme|styles|style|main|app|optimized|assets/i.test(pathname)) {
      score += 4;
    }

    if (/carousel|slick|font|icon|print|critical/i.test(pathname)) {
      score -= 1;
    }

    if (pathname.endsWith(".css")) {
      score += 2;
    }

    if (url.search) {
      score += 1;
    }
  } catch {
    score -= 5;
  }

  return score;
}

function selectBestElement($, selectors, scoreFn) {
  const seen = new Set();
  const matches = [];

  selectors.forEach((selector) => {
    $(selector).each((_, element) => {
      if (seen.has(element)) {
        return;
      }

      seen.add(element);
      matches.push({
        element,
        selector,
        score: scoreFn(element),
        order: element.__protoOrder ?? Number.MAX_SAFE_INTEGER,
      });
    });
  });

  matches.sort((a, b) => {
    if (b.score !== a.score) {
      return b.score - a.score;
    }

    return a.order - b.order;
  });

  return matches[0] || null;
}

function scoreHeader(element) {
  const attribs = element.attribs || {};
  const className = String(attribs.class || "");
  const id = String(attribs.id || "");
  const text = getTextLength(element);
  const links = countChildren(element, "a");
  const images = countChildren(element, "img");

  let score = 0;

  if (element.name === "header") {
    score += 6;
  }

  if (/header|site-header|masthead|banner/i.test(className) || /header/i.test(id)) {
    score += 4;
  }

  if (attribs.role === "banner") {
    score += 3;
  }

  score += Math.min(links, 8);
  score += Math.min(images, 3) * 2;

  if (text < 25) {
    score -= 1;
  }

  if (text > 1400) {
    score -= 3;
  }

  return score;
}

function scoreHero($, element, headerOrder) {
  const attribs = element.attribs || {};
  const className = String(attribs.class || "");
  const id = String(attribs.id || "");
  const html = $.html(element);
  const text = $(element).text().trim().length;
  const order = element.__protoOrder ?? Number.MAX_SAFE_INTEGER;
  const imageCount = $(element).find("img").length;
  const slideCount = countSlideCandidates($, element);

  let score = 0;

  if (/hero/i.test(className) || /hero/i.test(id)) {
    score += 12;
  }

  if (/banner/i.test(className) || /banner/i.test(id)) {
    score += 6;
  }

  if (/carousel|slide|slick/i.test(className) || /carousel/i.test(id)) {
    score += 3;
  }

  if (attribs["data-slick"]) {
    score += 4;
  }

  if (/slick-slide|heroCarousel-slide|carousel-item|slide/.test(html)) {
    score += 5;
  }

  score += imageCount * 1.5;
  score += slideCount * 2;

  if (text > 20) {
    score += 2;
  }

  if (order > headerOrder) {
    score += 3;
  }

  if ($(element).closest("footer").length) {
    score -= 10;
  }

  if (/product|featured|brand|category|testimonial|blog/i.test(className) || /product|featured|brand|category/i.test(id)) {
    score -= 10;
  }

  return score;
}

function countSlideCandidates($, element) {
  let count = 0;

  SLIDE_SELECTORS.forEach((selector) => {
    count = Math.max(count, $(element).find(selector).length);
  });

  return count;
}

function countChildren(element, tagName) {
  let count = 0;

  walkElements(element, (node) => {
    if (node.name === tagName) {
      count += 1;
    }
  });

  return count;
}

function getTextLength(element) {
  let length = 0;

  walkElements(element, (node) => {
    if (node.type === "text") {
      length += String(node.data || "").trim().length;
    }
  });

  return length;
}

function walkElements(element, visitor) {
  visitor(element);

  (element.children || []).forEach((child) => {
    walkElements(child, visitor);
  });
}

function prepareHeaderMarkup($, element, sourceUrl) {
  const fragment = cheerio.load($.html(element), { decodeEntities: false }, false);

  cleanFragment(fragment, sourceUrl);
  fragment(INTERACTIVE_HEADER_SELECTORS.join(",")).attr("tabindex", "-1");

  return serializeFragmentMarkup(fragment);
}

function prepareHeroMarkup($, element, sourceUrl, notes) {
  const fragment = cheerio.load($.html(element), { decodeEntities: false }, false);

  cleanFragment(fragment, sourceUrl);
  fragment(".slick-cloned, .slick-arrow, .slick-dots, script, noscript, style").remove();

  const root = firstRenderableElement(fragment);

  if (!root) {
    return "";
  }

  const bestSlideSelector = findBestSlideSelector(fragment, root);

  if (bestSlideSelector) {
    unwrapSlideWrapperAnchors(fragment, root, bestSlideSelector);

    const slides = fragment(root).find(bestSlideSelector).filter((_, slide) => {
      const className = String(slide.attribs?.class || "");
      return !/slick-cloned/i.test(className);
    });

    if (slides.length > 1) {
      notes.push(`Detected ${slides.length} slides and preserved them for manual proofing screenshots.`);
    }

    const carouselContainer = findPrototypeCarouselContainer(fragment, root, slides);

    if (carouselContainer?.length) {
      carouselContainer.attr("data-prototype-carousel", "true");
      carouselContainer.removeAttr("data-slick");
      ensurePrototypeNavigation(carouselContainer);
    }

    slides.each((index, slide) => {
      const currentSlide = fragment(slide);
      unwrapFullSlideAnchor(fragment, currentSlide);
      currentSlide.attr("data-prototype-slide", String(index));
      currentSlide.attr("data-prototype-active", index === 0 ? "true" : "false");
      currentSlide.attr("aria-hidden", index === 0 ? "false" : "true");

      if (index === 0) {
        currentSlide.addClass("slick-active slick-current");
        currentSlide.removeAttr("hidden");
      } else {
        currentSlide.removeClass("slick-active slick-current");
        currentSlide.attr("hidden", "");
      }
    });
  }

  fragment("[data-slick]").each((_, node) => {
    fragment(node).removeAttr("data-slick");
  });

  return serializeFragmentMarkup(fragment);
}

function cleanFragment(fragment, sourceUrl) {
  fragment("script, noscript, style").remove();

  fragment("[src]").each((_, node) => {
    fragment(node).attr("src", absolutizeUrl(fragment(node).attr("src"), sourceUrl));
  });

  fragment("[href]").each((_, node) => {
    fragment(node).attr("href", absolutizeUrl(fragment(node).attr("href"), sourceUrl));
  });

  fragment("[poster]").each((_, node) => {
    fragment(node).attr("poster", absolutizeUrl(fragment(node).attr("poster"), sourceUrl));
  });

  fragment("[data-src]").each((_, node) => {
    fragment(node).attr("data-src", absolutizeUrl(fragment(node).attr("data-src"), sourceUrl));
  });

  fragment("[srcset]").each((_, node) => {
    fragment(node).attr("srcset", absolutizeSrcset(fragment(node).attr("srcset"), sourceUrl));
  });

  fragment("[style]").each((_, node) => {
    fragment(node).attr("style", absolutizeStyleUrls(fragment(node).attr("style"), sourceUrl));
  });
}

function firstRenderableElement(fragment) {
  return fragment.root().children().toArray().find((node) => node.type === "tag") || null;
}

function findBestSlideSelector(fragment, root) {
  const counts = SLIDE_SELECTORS.map((selector) => ({
    selector,
    count: fragment(root).find(selector).length,
  })).filter((entry) => entry.count > 0);

  counts.sort((a, b) => b.count - a.count);
  return counts[0]?.selector || "";
}

function findPrototypeCarouselContainer(fragment, root, slides) {
  const sliderHost = fragment(root).find("[data-slick]").first();

  if (sliderHost.length) {
    return sliderHost;
  }

  const firstSlide = slides.first();
  const slickList = firstSlide.closest(".slick-list");

  if (slickList.length) {
    return slickList.parent();
  }

  const heroCarousel = firstSlide.closest(".heroCarousel, .hero-carousel, [class*='heroCarousel']");

  if (heroCarousel.length) {
    return heroCarousel;
  }

  return fragment(root);
}

function ensurePrototypeNavigation(carouselContainer) {
  const existingNavigation = carouselContainer.next(".cp-proof-navigation");

  if (existingNavigation.length) {
    return;
  }

  carouselContainer.after(
    `<div class="cp-proof-navigation" data-prototype-nav="true">
      <div class="cp-proof-arrows" data-prototype-arrows="true"></div>
      <div class="cp-proof-dots" data-prototype-dots="true"></div>
    </div>`,
  );
}

function unwrapSlideWrapperAnchors(fragment, root, slideSelector) {
  fragment(root)
    .find("a")
    .each((_, anchor) => {
      const anchorNode = fragment(anchor);
      const meaningfulChildren = getMeaningfulChildren(anchorNode);

      if (meaningfulChildren.length !== 1) {
        return;
      }

      const onlyChild = meaningfulChildren[0];

      if (onlyChild.type !== "tag") {
        return;
      }

      if (!fragment(onlyChild).is(slideSelector)) {
        return;
      }

      anchorNode.replaceWith(anchorNode.html() || "");
    });
}

function unwrapFullSlideAnchor(fragment, slide) {
  if (!slide?.length) {
    return;
  }

  const parent = slide.parent();

  if (parent.is("a") && hasSingleMeaningfulChild(parent)) {
    parent.replaceWith(parent.html() || "");
  }

  if (slide.is("a")) {
    slide.replaceWith(slide.html() || "");
    return;
  }

  const directChildren = getMeaningfulChildren(slide);

  if (directChildren.length !== 1) {
    return;
  }

  const onlyChild = directChildren[0];

  if (onlyChild.type !== "tag" || onlyChild.name !== "a") {
    return;
  }

  fragment(onlyChild).replaceWith(fragment(onlyChild).html() || "");
}

function getMeaningfulChildren(node) {
  return node.contents().toArray().filter((child) => {
    if (child.type === "text") {
      return String(child.data || "").trim().length > 0;
    }

    return child.type === "tag";
  });
}

function hasSingleMeaningfulChild(node) {
  return getMeaningfulChildren(node).length === 1;
}

function absolutizeUrl(value, sourceUrl) {
  if (!value) {
    return "";
  }

  if (/^(data:|mailto:|tel:|javascript:|#)/i.test(value)) {
    return value;
  }

  try {
    return new URL(value, sourceUrl).toString();
  } catch {
    return value;
  }
}

function absolutizeSrcset(srcset, sourceUrl) {
  if (!srcset) {
    return "";
  }

  return srcset
    .split(",")
    .map((entry) => {
      const trimmed = entry.trim();

      if (!trimmed) {
        return trimmed;
      }

      const [url, descriptor] = trimmed.split(/\s+/, 2);
      const absolute = absolutizeUrl(url, sourceUrl);
      return descriptor ? `${absolute} ${descriptor}` : absolute;
    })
    .join(", ");
}

function absolutizeStyleUrls(styleValue, sourceUrl) {
  if (!styleValue) {
    return "";
  }

  return styleValue.replace(/url\((['"]?)(.*?)\1\)/gi, (_, quote, assetUrl) => {
    const absolute = absolutizeUrl(assetUrl, sourceUrl);
    return `url(${quote}${absolute}${quote})`;
  });
}

function serializeFragmentMarkup(fragment) {
  return normalizeSerializedMarkup(fragment.root().html().trim());
}

function normalizeSerializedMarkup(markup) {
  return markup.replace(/&quot;/g, '"').replace(/&#34;/g, '"');
}

function buildPrototypeHtml(sourceUrl, headerHtml, heroHtml) {
  return `<!-- Generated from ${sourceUrl} -->
<div class="cp-banner-prototype" data-source-url="${escapeAttribute(sourceUrl)}">
  ${headerHtml || ""}
  ${heroHtml}
</div>`;
}

function buildPrototypeCss() {
  return `/* Local prototype helpers */
html {
  background: #fff;
}

body {
  min-height: 100vh;
  margin: 0;
  background: #fff;
}

.cp-banner-prototype {
  overflow: hidden;
  background: #fff;
}

.cp-banner-prototype .slick-list,
.cp-banner-prototype .slick-track {
  transform: none !important;
}

.cp-banner-prototype .cp-proof-navigation,
.cp-banner-prototype .cp-proof-nav {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 14px;
  margin-top: 14px;
}

.cp-banner-prototype .cp-proof-arrows {
  display: flex;
  align-items: center;
  gap: 10px;
}

.cp-banner-prototype .cp-proof-dots {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.cp-banner-prototype .cp-proof-arrow,
.cp-banner-prototype .cp-proof-dot {
  border: 0;
  padding: 0;
  font: inherit;
  cursor: pointer;
}

.cp-banner-prototype .cp-proof-arrow {
  display: grid;
  place-items: center;
  width: 42px;
  height: 42px;
  border-radius: 999px;
  color: #13212f;
  background: rgba(255, 255, 255, 0.92);
  box-shadow: 0 8px 24px rgba(19, 33, 47, 0.18);
}

.cp-banner-prototype .cp-proof-dots {
  padding: 8px 12px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.92);
  box-shadow: 0 8px 24px rgba(19, 33, 47, 0.14);
}

.cp-banner-prototype .cp-proof-dot {
  width: 10px;
  height: 10px;
  border-radius: 999px;
  background: rgba(19, 33, 47, 0.28);
}

.cp-banner-prototype .cp-proof-dot.is-active {
  background: rgba(19, 33, 47, 0.9);
}
`;
}

function buildPrototypeJs() {
  return `(() => {
  const root = document.querySelector(".cp-banner-prototype");
  if (!root) return;

  const header = root.querySelector("header, .site-header, #header, .header");
  if (header) {
    header.style.pointerEvents = "none";
    header.querySelectorAll("*").forEach((node) => {
      node.style.pointerEvents = "none";
    });
  }

  root.querySelectorAll(".slick-cloned").forEach((node) => node.remove());

  const slider = root.querySelector("[data-prototype-carousel='true']");
  const slides = Array.from(root.querySelectorAll("[data-prototype-slide]"));
  const nav = root.querySelector("[data-prototype-nav='true']");

  if (!slider || slides.length === 0) return;

  let activeIndex = Math.max(
    0,
    slides.findIndex((slide) => slide.getAttribute("data-prototype-active") === "true")
  );

  const setActiveSlide = (nextIndex) => {
    activeIndex = (nextIndex + slides.length) % slides.length;

    slides.forEach((slide, index) => {
      const isActive = index === activeIndex;
      slide.classList.remove("slick-cloned");
      slide.toggleAttribute("hidden", !isActive);
      slide.setAttribute("data-prototype-active", isActive ? "true" : "false");
      slide.setAttribute("aria-hidden", isActive ? "false" : "true");
      slide.classList.toggle("slick-active", isActive);
      slide.classList.toggle("slick-current", isActive);
    });

    root.querySelectorAll(".cp-proof-dot").forEach((dot, index) => {
      dot.classList.toggle("is-active", index === activeIndex);
      dot.setAttribute("aria-current", index === activeIndex ? "true" : "false");
    });
  };

  if (slides.length === 1) {
    setActiveSlide(activeIndex);
    return;
  }

  const fallbackNav = nav || document.createElement("div");
  fallbackNav.className = "cp-proof-navigation";

  const previousButton = document.createElement("button");
  previousButton.type = "button";
  previousButton.className = "cp-proof-arrow cp-proof-arrow-prev";
  previousButton.setAttribute("aria-label", "Previous slide");
  previousButton.textContent = "←";
  previousButton.addEventListener("click", () => setActiveSlide(activeIndex - 1));

  const nextButton = document.createElement("button");
  nextButton.type = "button";
  nextButton.className = "cp-proof-arrow cp-proof-arrow-next";
  nextButton.setAttribute("aria-label", "Next slide");
  nextButton.textContent = "→";
  nextButton.addEventListener("click", () => setActiveSlide(activeIndex + 1));

  const arrows = fallbackNav.querySelector("[data-prototype-arrows='true']") || document.createElement("div");
  arrows.className = "cp-proof-arrows";
  arrows.replaceChildren(previousButton, nextButton);

  const dots = fallbackNav.querySelector("[data-prototype-dots='true']") || document.createElement("div");
  dots.className = "cp-proof-dots";
  dots.replaceChildren();

  slides.forEach((_, index) => {
    const dot = document.createElement("button");
    dot.type = "button";
    dot.className = "cp-proof-dot";
    dot.setAttribute("aria-label", "Go to slide " + (index + 1));
    dot.addEventListener("click", () => setActiveSlide(index));
    dots.appendChild(dot);
  });

  if (!arrows.parentNode) {
    fallbackNav.appendChild(arrows);
  }

  if (!dots.parentNode) {
    fallbackNav.appendChild(dots);
  }

  if (!nav) {
    slider.after(fallbackNav);
  }

  setActiveSlide(activeIndex);
})();`;
}

function buildPenTitle(sourceUrl) {
  const url = new URL(sourceUrl);
  return `${url.hostname.replace(/^www\./, "")} banner prototype`;
}

function buildCodepenPayload({ title, description, html, css, js, cssExternal }) {
  return JSON.stringify({
    title,
    description,
    private: false,
    html,
    css,
    js,
    css_external: cssExternal.join(";"),
    css_pre_processor: "none",
    js_pre_processor: "none",
    layout: "left",
  });
}

function escapeAttribute(value) {
  return String(value).replace(/'/g, "&quot;");
}

module.exports = {
  analyzeMarketplace,
};
