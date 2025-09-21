// ...existing code...
(() => {
    // --- EMBEDDED TOOLS (fallback) ---
    const toolsData = [
        { "name": "Most Popular", "slug": "most-popular", "tools": [ { "name": "ChatGPT (OpenAI)", "description": "The quintessential AI chatbot for drafting, ideation, and summarization.", "link": "https://chat.openai.com/", "tags": ["Freemium", "LLM"], "iconUrl": "https://upload.wikimedia.org/wikipedia/commons/0/04/ChatGPT_logo.svg" }, { "name": "Gemini (Google)", "description": "Google's powerful, multimodal AI model integrated across its ecosystem.", "link": "https://gemini.google.com/", "tags": ["Freemium", "Multimodal"], "iconUrl": "https://upload.wikimedia.org/wikipedia/commons/8/8a/Google_Gemini_logo.svg" }, { "name": "GitHub Copilot", "description": "An AI pair programmer that offers autocomplete-style suggestions as you code.", "link": "https://github.com/features/copilot", "tags": ["Subscription", "Code"], "iconUrl": "https://upload.wikimedia.org/wikipedia/commons/thumb/4/44/GitHub_Copilot_logo.svg/1200px-GitHub_Copilot_logo.svg.png" } ] },
        { "name": "Language & Chat", "slug": "language-chat", "tools": [ { "name": "ChatGPT (OpenAI)", "description": "The quintessential AI chatbot for drafting, ideation, and summarization.", "link": "https://chat.openai.com/", "tags": ["Freemium", "LLM"], "iconUrl": "https://upload.wikimedia.org/wikipedia/commons/0/04/ChatGPT_logo.svg" }, { "name": "Gemini (Google)", "description": "Google's powerful, multimodal AI model integrated across its ecosystem.", "link": "https://gemini.google.com/", "tags": ["Freemium", "Multimodal"], "iconUrl": "https://upload.wikimedia.org/wikipedia/commons/8/8a/Google_Gemini_logo.svg" }, { "name": "Claude (Anthropic)", "description": "A safety-focused AI assistant known for its large context window and thoughtful responses.", "link": "https://claude.ai/", "tags": ["Freemium", "LLM"], "iconUrl": "https://pbs.twimg.com/profile_images/1679549573978877952/x-3245fA_400x400.jpg" }, { "name": "DeepL", "description": "A highly accurate AI-powered translation service known for its natural-sounding output.", "link": "https://www.deepl.com/translator", "tags": ["Freemium", "Translation"], "iconUrl": "https://static.deepl.com/img/logo/deepl-logo-blue.svg" } ] },
        { "name": "Image Generation", "slug": "image-generation", "tools": [ { "name": "Midjourney", "description": "A premier text-to-image AI that creates stunning, artistic visuals from prompts.", "link": "https://www.midjourney.com/", "tags": ["Paid", "Text-to-Image"], "iconUrl": "https://media.dev.to/cdn-cgi/image/width=1000,height=1000,fit=cover,gravity=auto,format=auto/https%3A%2F%2Fdev-to-uploads.s3.amazonaws.com%2Fuploads%2Farticles%2Fz1a8m29el33hpwscvl24.png" }, { "name": "Stable Diffusion", "description": "A powerful, open-source image generation model that can be run locally.", "link": "https://stability.ai/", "tags": ["Open Source", "Text-to-Image"], "iconUrl": "https://upload.wikimedia.org/wikipedia/commons/thumb/b/b3/Stable_Diffusion_logo.svg/1200px-Stable_Diffusion_logo.svg.png" }, { "name": "DALL-E 3 (OpenAI)", "description": "OpenAI's advanced image generation model, integrated into ChatGPT Plus.", "link": "https://openai.com/dall-e-3", "tags": ["Subscription", "Text-to-Image"], "iconUrl": "https://upload.wikimedia.org/wikipedia/commons/thumb/a/a6/DALL-E_logo.svg/1200px-DALL-E_logo.svg.png" } ] },
        { "name": "Video Tools", "slug": "video-tools", "tools": [ { "name": "Runway", "description": "An all-in-one suite for AI-powered video creation and editing.", "link": "https://runwayml.com/", "tags": ["Freemium", "Video Generation"], "iconUrl": "https://media.licdn.com/dms/image/C4D0BAQG0C5b0g-f_vA/company-logo_200_200/0/1677520033123/runwayml_logo?e=2147483647&v=beta&t=H_L_D-qj5s9c-Q2a7b1c3d4e5f6g7h8i" } ] },
        { "name": "Code Assistance", "slug": "code-assistance", "tools": [ { "name": "GitHub Copilot", "description": "An AI pair programmer that offers autocomplete-style suggestions as you code.", "link": "https://github.com/features/copilot", "tags": ["Subscription", "Code"], "iconUrl": "https://upload.wikimedia.org/wikipedia/commons/thumb/4/44/GitHub_Copilot_logo.svg/1200px-GitHub_Copilot_logo.svg.png" } ] },
        { "name": "Audio & Music", "slug": "audio-music", "tools": [ { "name": "ElevenLabs", "description": "Best-in-class AI for generating realistic text-to-speech and voice clones.", "link": "https://elevenlabs.io/", "tags": ["Freemium", "Text-to-Speech"], "iconUrl": "https://pbs.twimg.com/profile_images/1731688753233924096/iEV8sRTG_400x400.jpg" } ] }
    ];

    // --- UTILITIES ---
    function escapeHtml(s){ return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,"&#39;"); }
    function el(html){ const d = document.createElement('div'); d.innerHTML = html.trim(); return d.firstChild; }

    // --- MODAL HTML & CSS (injected) ---
    // ...existing code...
const modalCSS = `
.pe-modal-overlay { position: fixed; inset:0; background: rgba(15,23,42,0.06); backdrop-filter: blur(6px) saturate(115%); display:flex; align-items:center; justify-content:center; z-index:9999; opacity:0; pointer-events:none; transition:opacity .18s ease; }
.pe-modal-overlay.pe-visible { opacity:1; pointer-events:auto; }

.pe-modal { width:96%; max-width:920px; border-radius:14px; padding:20px; background: linear-gradient(180deg,#ffffff 0%, #f3f6fa 100%); box-shadow:0 18px 60px rgba(15,23,42,0.12); border:1px solid rgba(15,23,42,0.08); color:#0f1724; font-family:Inter,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial; }

.pe-header { display:flex; gap:12px; align-items:center; justify-content:space-between; margin-bottom:14px; }
.pe-title { display:flex; gap:12px; align-items:center; }
.pe-title h3 { margin:0; font-size:18px; font-weight:700; color:#071023; }
.pe-sub { color:#475569; font-size:13px; margin-top:2px; }
.pe-close { background:transparent; border:0; color:#475569; font-size:20px; cursor:pointer; }

.pe-grid { display:grid; grid-template-columns:1fr; gap:16px; }
@media(min-width:880px){ .pe-grid{ grid-template-columns: 1fr 380px; } }

.pe-input { width:100%; min-height:140px; resize:vertical; padding:14px; border-radius:12px; border:1px solid rgba(15,23,42,0.06); background: #ffffff; color:#0b1724; font-size:14px; box-shadow: inset 0 1px 0 rgba(16,24,40,0.02); }

.pe-controls { display:flex; gap:8px; align-items:center; margin-top:8px; flex-wrap:wrap; }
.pe-mode { display:flex; gap:8px; background:rgba(15,23,42,0.04); padding:6px; border-radius:999px; border:1px solid rgba(15,23,42,0.06); }
.pe-mode button { background:transparent; color:#0f1724; padding:8px 10px; border-radius:999px; border:0; cursor:pointer; font-weight:600; font-size:13px; }
.pe-mode button.pe-active { background:linear-gradient(90deg,#7c3aed 0%, #06b6d4 100%); box-shadow:0 10px 26px rgba(92,33,180,0.12); color:#fff; }

.pe-btn { padding:10px 14px; background:linear-gradient(90deg,#7c3aed,#5b21b6); color:#fff; border-radius:10px; border:0; cursor:pointer; font-weight:700; }
.pe-ghost { background:transparent; border:1px solid rgba(15,23,42,0.06); color:#0b1724; padding:8px 12px; border-radius:10px; cursor:pointer; }

.pe-enhanced { background:#fbfdff; padding:12px; border-radius:10px; border:1px solid rgba(15,23,42,0.06); color:#0b1724; font-size:14px; white-space:pre-wrap; max-height:280px; overflow:auto; box-shadow: 0 10px 30px rgba(15,23,42,0.06); }

.pe-tools { display:flex; flex-direction:column; gap:12px; max-height:460px; overflow:auto; padding-right:6px; }
.pe-tool { display:flex; gap:12px; align-items:flex-start; padding:12px; border-radius:12px; background:#ffffff; border:1px solid rgba(15,23,42,0.06); box-shadow: 0 10px 28px rgba(16,24,40,0.04); }
.pe-tool .icon { width:48px; height:48px; border-radius:10px; background:linear-gradient(135deg,#eef2ff,#f0f9ff); display:flex;align-items:center;justify-content:center;font-weight:700;color:#334155; font-size:16px; flex-shrink:0; }
.pe-tool .meta { flex:1; }
.pe-tool .name { display:flex; gap:8px; align-items:center; font-weight:700; color:#071023; }
.pe-tool .desc { color:#475569; font-size:13px; margin-top:6px; line-height:1.35; }

.pe-tags { display:flex; gap:6px; margin-top:8px; flex-wrap:wrap; }
.pe-tag { padding:6px 8px; border-radius:999px; background:rgba(124,58,237,0.12); color:#4b2a86; font-size:12px; border:1px solid rgba(124,58,237,0.10); }

.pe-why { margin-top:8px; display:flex; gap:8px; flex-wrap:wrap; }
.pe-why .kw { background:rgba(124,58,237,0.12); padding:6px 8px; border-radius:8px; color:#4b2a86; font-size:12px; border:1px solid rgba(124,58,237,0.10); }

.pe-empty { color:#64748b; text-align:center; padding:18px 8px; }
`;
    const modalHTML = `
    <div class="pe-modal-overlay" id="pe-modal-overlay" aria-hidden="true">
      <div class="pe-modal" role="dialog" aria-modal="true" aria-labelledby="pe-title">
        <div class="pe-header">
          <div class="pe-title">
            <span style="font-size:20px">✨</span>
            <div>
              <h3 id="pe-title">Prompt Studio</h3>
              <div class="pe-sub">Enhance your prompt and discover the ideal AI tools for the job.</div>
            </div>
          </div>
          <div>
            <button class="pe-ghost" id="pe-open-sample" title="Insert sample">Sample</button>
            <button class="pe-close" id="pe-close-btn" aria-label="Close">&times;</button>
          </div>
        </div>

        <div class="pe-grid">
          <div>
            <label class="text-sm" style="color:#9fb0df; font-weight:600">1) Enter your basic prompt</label>
            <textarea id="pe-input" class="pe-input" placeholder="e.g., write a neutral news blurb about a tech launch"></textarea>

            <div class="pe-controls">
              <div class="pe-mode" role="tablist" aria-label="Enhancement mode" id="pe-mode">
                <button data-mode="fast" class="">Fast</button>
                <button data-mode="smart" class="pe-active">Balanced</button>
                <button data-mode="think" class="">Think</button>
              </div>

              <select id="pe-tool-select" style="background:transparent; border-radius:10px; padding:8px; color:#dfeeff; border:1px solid rgba(255,255,255,0.04);">
                <option value="">Automatic tool suggestion</option>
              </select>

              <button class="pe-btn" id="pe-enhance-btn">Enhance & Recommend</button>
              <button class="pe-ghost" id="pe-clear-btn">Clear</button>
            </div>

            <div id="pe-output-section" style="margin-top:12px; display:none;">
              <label class="text-sm" style="color:#9fb0df; font-weight:600">2) Enhanced prompt</label>
              <div class="pe-enhanced" id="pe-enhanced">
                <div style="display:flex; justify-content:space-between; align-items:center;">
                  <div style="font-weight:700">Enhanced</div>
                  <div style="display:flex; gap:8px;">
                    <button class="pe-ghost" id="pe-copy-btn" title="Copy enhanced prompt">Copy</button>
                  </div>
                </div>
                <div id="pe-enhanced-text" style="margin-top:10px; white-space:pre-wrap; font-size:14px;"></div>
              </div>
            </div>
          </div>

          <div>
            <label class="text-sm" style="color:#9fb0df; font-weight:600; display:block">Recommended tools</label>
            <div class="pe-tools" id="pe-tools">
              <div class="pe-empty">Recommendations will appear here after enhancement.</div>
            </div>
          </div>
        </div>
      </div>
    </div>
    `;

    // --- INJECT UI ---
    function inject() {
        if (document.getElementById('pe-modal-overlay')) return;
        const styleEl = document.createElement('style');
        styleEl.id = 'pe-style';
        styleEl.textContent = modalCSS;
        document.head.appendChild(styleEl);

        const wrapper = document.createElement('div');
        wrapper.innerHTML = modalHTML;
        document.body.appendChild(wrapper);

        // floating toggle button fallback
        if (!document.getElementById('prompt-enhancer-btn-container')) {
            const fb = document.createElement('button');
            fb.id = 'pe-floating-btn';
            fb.textContent = '✨ Prompt Studio';
            fb.style.position = 'fixed';
            fb.style.right = '20px';
            fb.style.bottom = '20px';
            fb.style.zIndex = '9998';
            fb.style.padding = '10px 14px';
            fb.style.borderRadius = '10px';
            fb.style.background = 'linear-gradient(90deg,#7c3aed,#5b21b6)';
            fb.style.color = '#fff';
            fb.style.border = '0';
            fb.style.cursor = 'pointer';
            document.body.appendChild(fb);
            fb.addEventListener('click', () => showModal(true));
        }
    }

    // --- CORE LOGIC: prompt enhancement and matching ---
    function inferIntent(raw) {
        const lr = raw.toLowerCase();
        if (lr.match(/\b(image|logo|illustration|design|photo|generate an image|picture of)\b/)) return 'image';
        if (lr.match(/\b(video|animation|mp4|render|clip of)\b/)) return 'video';
        if (lr.match(/\b(code|script|function|debug|javascript|python)\b/)) return 'code';
        return 'text';
    }

    function generateEnhancedPrompt(raw, mode = 'smart') {
        const intent = inferIntent(raw);
        const toneMatch = raw.match(/\b(formal|informal|professional|casual|playful|friendly|technical)\b/i);
        const tone = toneMatch ? toneMatch[0] : 'neutral professional';
        const modeNotes = {
            fast: 'Keep it direct and concise.',
            smart: 'Balance creativity and clarity; include constraints and example structure.',
            think: 'Request multi-step reasoning, alternatives and examples.'
        };
        const modeNote = modeNotes[mode] || modeNotes.smart;

        const parts = [];
        if (intent === 'image') {
            parts.push(`Task: Create a single, high-quality image.`);
            parts.push(`Brief: ${raw.trim()}`);
            parts.push(`Style: specify artistic style (e.g., photorealistic, cinematic, vector), color palette, lighting, and mood.`);
            parts.push(`Composition: camera angle, focal length, subject placement, and any elements to emphasize/avoid.`);
            parts.push(`Constraints: avoid copyrighted characters; keep it commercially usable.`);
        } else if (intent === 'video') {
            parts.push(`Task: Create a short video concept / script.`);
            parts.push(`Brief: ${raw.trim()}`);
            parts.push(`Output: storyboard of 3–5 shots with timing, camera directions and recommended audio style.`);
            parts.push(`Constraints: total runtime target, aspect ratio, and elements to avoid.`);
        } else if (intent === 'code') {
            parts.push(`Task: Write or debug code.`);
            parts.push(`Request: ${raw.trim()}`);
            parts.push(`Output: provide runnable code block, explanations, and tests/examples where applicable.`);
            parts.push(`Constraints: language (if unspecified, choose a widely-used modern language).`);
        } else {
            parts.push(`Task: Produce a clear text response.`);
            parts.push(`Request: ${raw.trim()}`);
            parts.push(`Tone: ${tone}.`);
            parts.push(`Output: if structured output is needed (list, table, JSON), specify it explicitly; otherwise provide a concise, actionable response with examples (max 3).`);
            parts.push(`Constraints: be accurate, avoid filler, and include short examples when helpful.`);
        }
        parts.push(`Mode note: ${modeNote}`);
        return parts.join('\n\n');
    }

    function extractKeywords(text) {
        if (!text) return [];
        const stop = new Set(['the','and','for','with','that','this','from','your','please','provide','create','using','a','an','to','of','in','on','as','is','it','be','by','it','please','write','generate','create']);
        const words = (text||'').toLowerCase().match(/\b[a-z0-9]{3,}\b/g) || [];
        return Array.from(new Set(words.filter(w => !stop.has(w)))).slice(0, 40);
    }

    async function recommendToolForPrompt(enhancedPrompt, maxResults = 5) {
        // prefer window.db if present (index.html data), otherwise fallback to embedded toolsData
        let allTools = [];
        try {
            if (Array.isArray(window.db) && window.db.length) {
                allTools = window.db.flatMap(d => (d.tools || []).map(t => ({ ...t, domain: d.name })));
            }
        } catch (e) {}
        if (!allTools.length) {
            allTools = toolsData.flatMap(d => (d.tools || []).map(t => ({ ...t, domain: d.name })));
        }

        const keywords = extractKeywords(enhancedPrompt);
        const text = (enhancedPrompt||'').toLowerCase();

        const scored = allTools.map(t => {
            const name = (t.name||'').toLowerCase();
            const desc = (t.description||'').toLowerCase();
            const tags = (t.tags||[]).map(x => (x||'').toLowerCase());
            let score = 0;
            const why = new Set();

            tags.forEach(tag => {
                keywords.forEach(k => {
                    if (tag.includes(k) || k.includes(tag)) { score += 5; why.add(tag); }
                });
            });

            keywords.forEach(k => {
                if (name.includes(k)) { score += 3; why.add(k); }
                if (desc.includes(k)) { score += 1; why.add(k); }
            });

            // small fuzzy boost for exact tag presence in prompt text
            tags.forEach(tag => { if (text.includes(tag)) { score += 2; why.add(tag); } });

            return { tool: t, score, why: Array.from(why).slice(0,6) };
        }).filter(x => x.score > 0);

        scored.sort((a,b) => b.score - a.score);
        // ensure we at least return some items even if score 0 (use top by desc length)
        if (!scored.length) {
            const fallback = allTools.slice(0, maxResults).map(t => ({ tool:t, score:0, why:[] }));
            return fallback;
        }
        return scored.slice(0, maxResults);
    }

    // --- RENDERING ---
    function renderTools(list) {
        const container = document.getElementById('pe-tools');
        if (!container) return;
        if (!list || !list.length) {
            container.innerHTML = `<div class="pe-empty">No strong match found. Try a more specific prompt.</div>`;
            return;
        }
        container.innerHTML = list.map(item => {
            const t = item.tool;
            const why = (item.why || []).map(k => `<span class="pe-why kw">${escapeHtml(k)}</span>`).join('');
            const tags = (Array.isArray(t.tags) ? t.tags : []).slice(0,6).map(tag => `<span class="pe-tag">${escapeHtml(tag)}</span>`).join('');
            const placeholder = `https://placehold.co/40x40/091427/7c3aed?text=${encodeURIComponent((t.name||'?').charAt(0))}`;
            return `
            <div class="pe-tool" role="article" aria-label="${escapeHtml(t.name||'Tool')}">
              <div class="icon"><img src="${t.iconUrl||placeholder}" alt="" style="width:36px;height:36px;border-radius:8px;object-fit:cover" onerror="this.onerror=null;this.src='${placeholder}'"></div>
              <div class="meta">
                <div class="name">
                  <div>${escapeHtml(t.name||'Untitled')}</div>
                  <div style="margin-left:auto">${item.score>0?`<span class="pe-tag" style="background:rgba(124,58,237,0.12);border:1px solid rgba(124,58,237,0.12); font-weight:700">score ${item.score}</span>`:''}</div>
                </div>
                <div class="desc">${escapeHtml(t.description||'')}</div>
                <div class="pe-tags">${tags}</div>
                <div class="pe-why">${why}</div>
                <div style="margin-top:8px"><a href="${escapeHtml(t.link||'#')}" target="_blank" rel="noopener noreferrer" class="pe-ghost" style="padding:6px 10px">Open</a></div>
              </div>
            </div>`;
        }).join('');
    }

    // --- INTERACTIONS & LIFECYCLE ---
    function showModal(open = true) {
        const overlay = document.getElementById('pe-modal-overlay');
        if (!overlay) return;
        if (open) overlay.classList.add('pe-visible');
        else overlay.classList.remove('pe-visible');
    }

    function wire() {
        const overlay = document.getElementById('pe-modal-overlay');
        if (!overlay) return;
        const input = document.getElementById('pe-input');
        const closeBtn = document.getElementById('pe-close-btn');
        const enhanceBtn = document.getElementById('pe-enhance-btn');
        const clearBtn = document.getElementById('pe-clear-btn');
        const copyBtn = document.getElementById('pe-copy-btn');
        const enhancedText = document.getElementById('pe-enhanced-text');
        const outputSection = document.getElementById('pe-output-section');
        const modeWrap = document.getElementById('pe-mode');
        const modeButtons = modeWrap ? Array.from(modeWrap.querySelectorAll('button')) : [];
        const toolSelect = document.getElementById('pe-tool-select');
        const openSample = document.getElementById('pe-open-sample');
        const floatingBtn = document.getElementById('pe-floating-btn');

        let activeMode = 'smart';

        if (floatingBtn) floatingBtn.addEventListener('click', () => showModal(true));
        if (openSample) openSample.addEventListener('click', () => {
            input.value = 'Write a concise, neutral news blurb about a new product launch from a major tech company.';
        });

        modeButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                modeButtons.forEach(b => b.classList.remove('pe-active'));
                btn.classList.add('pe-active');
                activeMode = btn.dataset.mode || 'smart';
            });
        });

        closeBtn && closeBtn.addEventListener('click', () => showModal(false));
        overlay.addEventListener('click', (e) => { if (e.target === overlay) showModal(false); });

        clearBtn && clearBtn.addEventListener('click', () => {
            input.value = '';
            enhancedText.textContent = '';
            outputSection.style.display = 'none';
            document.getElementById('pe-tools').innerHTML = `<div class="pe-empty">Recommendations will appear here after enhancement.</div>`;
            if (toolSelect) toolSelect.selectedIndex = 0;
        });

        copyBtn && copyBtn.addEventListener('click', async () => {
            const text = enhancedText.textContent || '';
            if (!text) return;
            try {
                await navigator.clipboard.writeText(text);
                copyBtn.textContent = 'Copied';
                setTimeout(() => copyBtn.textContent = 'Copy', 1200);
            } catch (e) {
                console.warn('copy failed', e);
            }
        });

        enhanceBtn && enhanceBtn.addEventListener('click', async () => {
            const raw = (input.value||'').trim();
            if (!raw) {
                alert('Please enter a prompt to enhance.');
                return;
            }
            const enhanced = generateEnhancedPrompt(raw, activeMode);
            enhancedText.textContent = enhanced;
            outputSection.style.display = 'block';

            // populate tool select if empty (grouped)
            if (toolSelect && toolSelect.options.length <= 1) {
                populateToolSelect(toolSelect);
            }

            const rec = await recommendToolForPrompt(enhanced, 6);
            renderTools(rec);
        });

        // populate select on open
        overlay.addEventListener('transitionend', () => {
            if (overlay.classList.contains('pe-visible')) {
                const sel = document.getElementById('pe-tool-select');
                if (sel && sel.options.length <= 1) populateToolSelect(sel);
            }
        });
    }

    function populateToolSelect(sel) {
        if (!sel) return;
        sel.innerHTML = `<option value="">Automatic tool suggestion</option>`;
        const all = toolsData.flatMap(d => (d.tools||[]).map(t => ({ ...t, domain: d.name })));
        const byDomain = all.reduce((acc, t) => {
            (acc[t.domain] = acc[t.domain] || []).push(t);
            return acc;
        }, {});
        Object.keys(byDomain).forEach(domain => {
            const group = document.createElement('optgroup');
            group.label = domain;
            byDomain[domain].forEach(t => {
                const opt = document.createElement('option');
                opt.value = t.name;
                opt.textContent = `${t.name} · ${(t.tags||[]).slice(0,3).join(', ')}`;
                group.appendChild(opt);
            });
            sel.appendChild(group);
        });
    }

    // --- BOOTSTRAP ---
    function boot() {
        inject();
        wire();
        // show modal if user intentionally appended a param ?prompt-studio=open
        try {
            const url = new URL(location.href);
            if (url.searchParams.get('prompt-studio') === 'open') showModal(true);
        } catch(e){}
        // attach global helpers for debugging / integration
        window.PE = {
            generateEnhancedPrompt,
            recommendToolForPrompt,
            showModal,
        };
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();

})();